use super::*;
use std::cmp::Ordering;

#[derive(Deserialize, Serialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub(super) enum Step {
    Filter {
        column: String,
        compare: Compare,
        value: String,
    },
    Sort {
        column: String,
        #[serde(default)]
        descending: bool,
    },
    Select {
        columns: Vec<String>,
    },
    Rename {
        column: String,
        name: String,
    },
    Cast {
        column: String,
        kind: Kind,
    },
    DropMissing {
        column: String,
    },
    FillMissing {
        column: String,
        value: String,
    },
    Deduplicate {
        columns: Vec<String>,
    },
    Group {
        by: String,
        column: String,
        aggregate: Aggregate,
        name: String,
    },
    Calculate {
        left: Operand,
        operator: Operator,
        right: Operand,
        name: String,
    },
    Text {
        column: String,
        transform: TextOp,
        name: String,
    },
    Join {
        column: String,
        name: String,
        lookup: Vec<[String; 2]>,
        mode: JoinMode,
    },
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum Compare {
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum Aggregate {
    Count,
    Sum,
    Mean,
    Min,
    Max,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum Operator {
    Add,
    Subtract,
    Multiply,
    Divide,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum TextOp {
    Trim,
    Lowercase,
    Uppercase,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum JoinMode {
    Inner,
    Left,
}
#[derive(Deserialize, Serialize)]
#[serde(untagged, deny_unknown_fields)]
pub(super) enum Operand {
    Column { column: String },
    Constant { constant: String },
}

fn column_indices(t: &Table, names: &[String]) -> Checked<Vec<usize>> {
    if names.is_empty()
        || names.len() > MAX_COLUMNS
        || names.iter().collect::<BTreeSet<_>>().len() != names.len()
    {
        return Err(MathError::InvalidInput);
    }
    names.iter().map(|k| t.index(k)).collect()
}
fn new_name(t: &Table, name: &str) -> Checked<()> {
    if name.trim().is_empty() || !crate::valid_text(name, 128) || t.index(name).is_ok() {
        return Err(MathError::InvalidInput);
    }
    Ok(())
}
fn append(t: &mut Table, name: &str, kind: Kind) -> Checked<()> {
    new_name(t, name)?;
    if t.columns.len() >= MAX_COLUMNS || (t.columns.len() + 1) * t.rows.len() > MAX_CELLS {
        return Err(MathError::Limit);
    }
    t.columns.push(Column {
        name: name.into(),
        kind,
    });
    Ok(())
}
fn bounded(r: BigRational) -> Checked<BigRational> {
    if r.numer().bits().max(r.denom().bits()) > 4096 {
        Err(MathError::Limit)
    } else {
        Ok(r)
    }
}
fn numeric(k: Kind) -> bool {
    matches!(k, Kind::Integer | Kind::Decimal)
}
enum Source {
    Column(usize),
    Constant(BigRational),
}
impl Source {
    fn resolve(o: &Operand, t: &Table, d: Decimal) -> Checked<Self> {
        match o {
            Operand::Constant { constant } => Ok(Self::Constant(number(constant, d)?)),
            Operand::Column { column } => {
                let i = t.index(column)?;
                if !numeric(t.columns[i].kind) {
                    return Err(MathError::Domain);
                }
                Ok(Self::Column(i))
            }
        }
    }
    fn get(&self, row: &[Cell], d: Decimal) -> Checked<Option<BigRational>> {
        match self {
            Self::Constant(r) => Ok(Some(r.clone())),
            Self::Column(i) if row[*i].usable() => Ok(Some(number(&row[*i].value, d)?)),
            _ => Ok(None),
        }
    }
}
#[derive(Ord, PartialOrd, Eq, PartialEq)]
enum Key {
    Missing(Origin),
    Number(BigRational),
    Text(String),
}
fn key(c: &Cell, k: Kind, d: Decimal) -> Checked<Key> {
    if !c.usable() {
        Ok(Key::Missing(c.origin))
    } else if numeric(k) {
        Ok(Key::Number(number(&c.value, d)?))
    } else {
        Ok(Key::Text(c.value.clone()))
    }
}
fn run(t: &mut Table, step: &Step, d: Decimal) -> Checked<()> {
    match step {
        Step::Select { columns } => {
            let indices = column_indices(t, columns)?;
            t.columns = indices.iter().map(|i| t.columns[*i].clone()).collect();
            for row in &mut t.rows {
                *row = indices.iter().map(|i| row[*i].clone()).collect();
            }
        }
        Step::Rename { column, name } => {
            new_name(t, name)?;
            let i = t.index(column)?;
            t.columns[i].name = name.clone();
        }
        Step::Cast { column, kind } => cast(t, column, *kind, d)?,
        Step::DropMissing { column } => {
            let i = t.index(column)?;
            t.rows.retain(|r| !r[i].missing());
        }
        Step::FillMissing { column, value } => {
            let i = t.index(column)?;
            let replacement = Cell::stored(value)?;
            if !valid_type(value, t.columns[i].kind, d) {
                return Err(MathError::Domain);
            }
            for r in &mut t.rows {
                if r[i].missing() {
                    r[i] = replacement.clone();
                }
            }
        }
        Step::Filter {
            column,
            compare,
            value,
        } => {
            let i = t.index(column)?;
            let k = t.columns[i].kind;
            let rhs = key(&Cell::stored(value)?, k, d)?;
            let mut kept = Vec::new();
            for row in t.rows.drain(..) {
                if !row[i].usable() {
                    continue;
                }
                let order = key(&row[i], k, d)?.cmp(&rhs);
                let take = match compare {
                    Compare::Eq => order.is_eq(),
                    Compare::Ne => !order.is_eq(),
                    Compare::Lt => order.is_lt(),
                    Compare::Le => order.is_le(),
                    Compare::Gt => order.is_gt(),
                    Compare::Ge => order.is_ge(),
                };
                if take {
                    kept.push(row)
                }
            }
            t.rows = kept;
        }
        Step::Sort { column, descending } => {
            let i = t.index(column)?;
            let k = t.columns[i].kind;
            let mut keyed = t
                .rows
                .drain(..)
                .map(|r| Ok((key(&r[i], k, d)?, r)))
                .collect::<Checked<Vec<_>>>()?;
            keyed.sort_by(|a, b| {
                if *descending {
                    b.0.cmp(&a.0)
                } else {
                    a.0.cmp(&b.0)
                }
            });
            t.rows = keyed.into_iter().map(|(_, r)| r).collect();
        }
        Step::Deduplicate { columns } => {
            let indices = column_indices(t, columns)?;
            let mut seen = BTreeSet::new();
            t.rows.retain(|row| {
                seen.insert(indices.iter().map(|i| row[*i].clone()).collect::<Vec<_>>())
            });
        }
        Step::Calculate {
            left,
            operator,
            right,
            name,
        } => {
            let a = Source::resolve(left, t, d)?;
            let b = Source::resolve(right, t, d)?;
            append(t, name, Kind::Decimal)?;
            for row in &mut t.rows {
                let value = match (a.get(row, d)?, b.get(row, d)?) {
                    (Some(x), Some(y)) => {
                        if matches!(operator, Operator::Divide) && y.is_zero() {
                            Cell::new("", Origin::Invalid)?
                        } else {
                            let calculated = match operator {
                                Operator::Add => x + y,
                                Operator::Subtract => x - y,
                                Operator::Multiply => x * y,
                                Operator::Divide => x / y,
                            };
                            Cell::stored(&bounded(calculated)?.to_string())?
                        }
                    }
                    _ => {
                        let invalid = [&a, &b].iter().any(|source| match source {
                            Source::Column(i) => !row[*i].usable() && !row[*i].missing(),
                            Source::Constant(_) => false,
                        });
                        Cell::new(
                            "",
                            if invalid {
                                Origin::Invalid
                            } else {
                                Origin::Null
                            },
                        )?
                    }
                };
                row.push(value);
            }
        }
        Step::Text {
            column,
            transform,
            name,
        } => {
            let i = t.index(column)?;
            append(t, name, Kind::Text)?;
            for row in &mut t.rows {
                let v = &row[i];
                let cell = if v.usable() {
                    Cell::stored(&match transform {
                        TextOp::Trim => v.value.trim().to_owned(),
                        TextOp::Lowercase => v.value.to_lowercase(),
                        TextOp::Uppercase => v.value.to_uppercase(),
                    })?
                } else {
                    v.clone()
                };
                row.push(cell);
            }
        }
        Step::Join {
            column,
            name,
            lookup,
            mode,
        } => {
            let i = t.index(column)?;
            let mut map = BTreeMap::new();
            if lookup.len() > 1024 {
                return Err(MathError::Limit);
            }
            for [k, v] in lookup {
                if map.insert(k, Cell::stored(v)?).is_some() {
                    return Err(MathError::InvalidInput);
                }
            }
            append(t, name, Kind::Text)?;
            t.rows.retain_mut(|r| {
                if let Some(c) = r[i].usable().then(|| map.get(&r[i].value)).flatten() {
                    r.push(c.clone());
                    true
                } else if matches!(mode, JoinMode::Left) {
                    r.push(Cell {
                        value: String::new(),
                        origin: Origin::Absent,
                        formula: None,
                    });
                    true
                } else {
                    false
                }
            });
        }
        Step::Group {
            by,
            column,
            aggregate,
            name,
        } => {
            let b = t.index(by)?;
            let i = t.index(column)?;
            if name == by || name.trim().is_empty() || !crate::valid_text(name, 128) {
                return Err(MathError::InvalidInput);
            }
            if !matches!(aggregate, Aggregate::Count) && !numeric(t.columns[i].kind) {
                return Err(MathError::Domain);
            }
            let mut groups = BTreeMap::<Cell, (usize, BigRational)>::new();
            for row in &t.rows {
                let (n, val) = groups
                    .entry(row[b].clone())
                    .or_insert_with(|| (0, BigRational::zero()));
                if row[i].usable() {
                    if !matches!(aggregate, Aggregate::Count) {
                        let x = number(&row[i].value, d)?;
                        match aggregate {
                            Aggregate::Min if *n == 0 || x.cmp(val) == Ordering::Less => *val = x,
                            Aggregate::Max if *n == 0 || x.cmp(val) == Ordering::Greater => {
                                *val = x
                            }
                            Aggregate::Mean | Aggregate::Sum => {
                                *val += x;
                                if val.numer().bits().max(val.denom().bits()) > 4096 {
                                    return Err(MathError::Limit);
                                }
                            }
                            _ => (),
                        }
                    }
                    *n += 1;
                }
            }
            t.columns = vec![
                t.columns[b].clone(),
                Column {
                    name: name.clone(),
                    kind: if matches!(aggregate, Aggregate::Count) {
                        Kind::Integer
                    } else {
                        Kind::Decimal
                    },
                },
            ];
            t.rows = groups
                .into_iter()
                .map(|(k, (n, v))| {
                    let cell = match aggregate {
                        Aggregate::Count => Cell::stored(&n.to_string())?,
                        _ if n == 0 => Cell::new("", Origin::Null)?,
                        Aggregate::Mean => {
                            Cell::stored(&(v / num_bigint::BigInt::from(n)).to_string())?
                        }
                        _ => Cell::stored(&v.to_string())?,
                    };
                    Ok(vec![k, cell])
                })
                .collect::<Checked<_>>()?;
        }
    }
    Ok(())
}
pub(super) fn apply(t: &mut Table, c: &Config) -> Checked<Vec<Value>> {
    let mut trace = Vec::new();
    let mut work = 0;
    for (index, step) in c.steps.iter().enumerate() {
        let before = t.rows.len();
        work += before * t.columns.len();
        if work > 12_000_000 {
            return Err(MathError::Limit);
        }
        run(t, step, c.decimal)?;
        trace.push(json!({"index":index,"operation":serde_json::to_value(step).map_err(|_|MathError::InvalidInput)?["op"],"input_rows":before,"output_rows":t.rows.len(),"reduced_rows":before.saturating_sub(t.rows.len())}));
    }
    Ok(trace)
}
