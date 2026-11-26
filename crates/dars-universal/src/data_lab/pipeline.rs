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
            Self::Column(i) if row[*i].usable() => Ok(Some(row[*i].numeric(d)?)),
            _ => Ok(None),
        }
    }
}
#[derive(Ord, PartialOrd, Eq, PartialEq)]
enum Key {
    Unavailable(Origin, String),
    Number(BigRational),
    Date(jiff::civil::DateTime, u8),
    Text(String),
}
fn key(c: &Cell, k: Kind, d: Decimal) -> Checked<Key> {
    if !c.usable() {
        Ok(Key::Unavailable(c.origin, c.value.clone()))
    } else if numeric(k) {
        Ok(Key::Number(c.numeric(d)?))
    } else if k == Kind::Date {
        let (civil, basis) = c.date_key()?;
        Ok(Key::Date(civil, basis))
    } else {
        Ok(Key::Text(
            c.canonical(k, d)?.ok_or(MathError::Domain)?.into_owned(),
        ))
    }
}
impl Key {
    fn storage_bytes(&self) -> usize {
        match self {
            Self::Unavailable(_, s) | Self::Text(s) => budget::text(s.len()),
            Self::Number(r) => {
                256 + 4 * ((r.numer().bits() + r.denom().bits()) as usize).div_ceil(8)
            }
            Self::Date(_, _) => 0,
        }
    }
}
fn plan(t: &Table, step: &Step, meter: &mut Meter<'_>) -> Checked<()> {
    let rows = t.rows.len();
    match step {
        Step::Select { columns } => {
            let indices = column_indices(t, columns)?;
            meter.reserve(
                indices
                    .iter()
                    .map(|i| budget::COLUMN + budget::text(t.columns[*i].name.len()))
                    .sum(),
            )?;
            let max_clone = t
                .rows
                .iter()
                .map(|row| {
                    indices
                        .iter()
                        .map(|i| budget::cell_storage(&row[*i]))
                        .sum::<usize>()
                })
                .max()
                .unwrap_or(0);
            meter.reserve(budget::ROW + indices.len() * budget::CELL + max_clone)
        }
        Step::Rename { name, .. } => meter.reserve(budget::text(name.len())),
        Step::Cast { .. } => meter.reserve(budget::RATIONAL_SCRATCH),
        Step::DropMissing { .. } => Ok(()),
        Step::FillMissing { column, value } => {
            let i = t.index(column)?;
            let missing = t.rows.iter().filter(|row| row[i].missing()).count();
            meter.reserve((missing + 1) * budget::text(value.len()) + budget::RATIONAL_SCRATCH)
        }
        Step::Filter { column, value, .. } => {
            let i = t.index(column)?;
            let longest = t.rows.iter().map(|r| r[i].value.len()).max().unwrap_or(0);
            meter.reserve(
                rows * budget::ROW
                    + budget::text(longest)
                    + budget::text(value.len())
                    + budget::RATIONAL_SCRATCH,
            )
        }
        Step::Sort { column, .. } => {
            t.index(column)?;
            meter.reserve(rows * 384 + budget::RATIONAL_SCRATCH + budget::text(MAX_FIELD))
        }
        Step::Deduplicate { columns } => {
            let indices = column_indices(t, columns)?;
            meter.reserve(
                rows * budget::ROW
                    + 128
                    + indices.len() * 128
                    + budget::RATIONAL_SCRATCH
                    + budget::text(MAX_FIELD),
            )
        }
        Step::Group { name, .. } => meter.reserve(
            2 * budget::COLUMN
                + budget::text(name.len())
                + budget::RATIONAL_SCRATCH
                + budget::text(MAX_FIELD),
        ),
        Step::Calculate { name, .. } => meter.reserve(
            rows * budget::CELL
                + budget::COLUMN
                + budget::text(name.len())
                + budget::RATIONAL_SCRATCH,
        ),
        Step::Text { column, name, .. } => {
            let index = t.index(column)?;
            let temporary = if t
                .rows
                .iter()
                .any(|row| row[index].source_type == SourceType::Date)
            {
                budget::RATIONAL_SCRATCH
            } else {
                0
            };
            meter.reserve(
                rows * budget::CELL + budget::COLUMN + budget::text(name.len()) + temporary,
            )
        }
        Step::Join { name, lookup, .. } => {
            meter.reserve(
                rows * (budget::CELL + 16)
                    + budget::COLUMN
                    + budget::text(name.len())
                    + budget::RATIONAL_SCRATCH
                    + budget::text(MAX_FIELD),
            )?;
            for [key, value] in lookup {
                meter.reserve(256 + budget::text(key.len()) + budget::text(value.len()))?;
            }
            Ok(())
        }
    }
}

fn run(t: &mut Table, step: &Step, d: Decimal, meter: &mut Meter<'_>) -> Checked<()> {
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
            let replacement = Cell::scalar(t.columns[i].kind, value, d)?;
            for r in &mut t.rows {
                if r[i].missing() {
                    let from_missing = r[i].origin;
                    r[i] = replacement.clone();
                    r[i].derive(DerivationOp::FillMissing, Some(from_missing), false);
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
            let rhs = key(&Cell::scalar(k, value, d)?, k, d)?;
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
                .map(|r| {
                    let key = key(&r[i], k, d)?;
                    meter.reserve(key.storage_bytes())?;
                    Ok((key, r))
                })
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
            let kinds = indices
                .iter()
                .map(|&i| t.columns[i].kind)
                .collect::<Vec<_>>();
            let mut kept = Vec::new();
            for row in t.rows.drain(..) {
                let structure = 128 + indices.len() * 128;
                meter.reserve(structure)?;
                let mut bytes = structure;
                let mut keys = Vec::with_capacity(indices.len());
                for (&i, &kind) in indices.iter().zip(&kinds) {
                    let item = key(&row[i], kind, d)?;
                    let cost = item.storage_bytes();
                    meter.reserve(cost)?;
                    bytes += cost;
                    keys.push(item);
                }
                if seen.insert(keys) {
                    kept.push(row);
                } else {
                    meter.release(bytes);
                }
            }
            t.rows = kept;
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
                let mut value = match (a.get(row, d)?, b.get(row, d)?) {
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
                            let calculated = bounded(calculated)?;
                            meter
                                .reserve(budget::text(budget::rational_text_bytes(&calculated)))?;
                            Cell::stored(&calculated.to_string())?
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
                value.derive(DerivationOp::Calculate, None, true);
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
                let mut cell = if v.usable() {
                    let text = v.text_input();
                    let projected = match transform {
                        TextOp::Trim => text.trim().len(),
                        TextOp::Lowercase => text
                            .chars()
                            .flat_map(char::to_lowercase)
                            .map(char::len_utf8)
                            .sum(),
                        TextOp::Uppercase => text
                            .chars()
                            .flat_map(char::to_uppercase)
                            .map(char::len_utf8)
                            .sum(),
                    };
                    if projected > MAX_FIELD {
                        return Err(MathError::Limit);
                    }
                    let output = budget::text(projected);
                    meter.reserve(2 * output)?;
                    let mut result = Cell::stored(&match transform {
                        TextOp::Trim => text.trim().to_owned(),
                        TextOp::Lowercase => text.to_lowercase(),
                        TextOp::Uppercase => text.to_uppercase(),
                    })?;
                    if v.source_type == SourceType::Date {
                        result.source_type = SourceType::Date;
                    }
                    meter.release(output);
                    result
                } else {
                    meter.reserve(budget::cell_storage(v))?;
                    v.clone()
                };
                cell.derive(DerivationOp::Text, None, false);
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
            let kind = t.columns[i].kind;
            let mut map = BTreeMap::new();
            if lookup.len() > 1024 {
                return Err(MathError::Limit);
            }
            for [k, v] in lookup {
                let scalar = Cell::scalar(kind, k, d)?;
                if !scalar.usable() {
                    return Err(MathError::Domain);
                }
                let key = key(&scalar, kind, d)?;
                meter.reserve(key.storage_bytes())?;
                let mut value = Cell::stored(v)?;
                value.derive(DerivationOp::Join, None, false);
                if map.insert(key, value).is_some() {
                    return Err(MathError::InvalidInput);
                }
            }
            append(t, name, Kind::Text)?;
            let mut matches = Vec::with_capacity(t.rows.len());
            for row in &t.rows {
                let matched = if row[i].usable() {
                    map.get(&key(&row[i], kind, d)?)
                } else {
                    None
                };
                if let Some(c) = matched {
                    meter.reserve(budget::cell_storage(c))?;
                }
                matches.push(matched);
            }
            let mut matches = matches.into_iter();
            t.rows.retain_mut(|r| {
                if let Some(c) = matches.next().flatten() {
                    r.push(c.clone());
                    true
                } else if matches!(mode, JoinMode::Left) {
                    let mut missing = Cell::absent();
                    missing.derive(DerivationOp::Join, None, false);
                    r.push(missing);
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
            let mut groups = BTreeMap::<Key, (Cell, usize, BigRational)>::new();
            for row in &t.rows {
                let group_key = key(&row[b], t.columns[b].kind, d)?;
                let estimate = group_key.storage_bytes();
                let (_, n, val) = match groups.entry(group_key) {
                    std::collections::btree_map::Entry::Occupied(entry) => entry.into_mut(),
                    std::collections::btree_map::Entry::Vacant(entry) => {
                        let numeric = !matches!(aggregate, Aggregate::Count);
                        meter.reserve(
                            320 + budget::ROW
                                + 3 * budget::CELL
                                + budget::cell_storage(&row[b])
                                + estimate
                                + if numeric { 12 * 1024 } else { budget::text(8) },
                        )?;
                        entry.insert((row[b].clone(), 0, BigRational::zero()))
                    }
                };
                if row[i].usable() {
                    if !matches!(aggregate, Aggregate::Count) {
                        let x = row[i].numeric(d)?;
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
                .map(|(_, (k, n, v))| {
                    let mut cell = match aggregate {
                        Aggregate::Count => Cell::stored(&n.to_string())?,
                        _ if n == 0 => Cell::new("", Origin::Null)?,
                        Aggregate::Mean => {
                            Cell::stored(&(v / num_bigint::BigInt::from(n)).to_string())?
                        }
                        _ => Cell::stored(&v.to_string())?,
                    };
                    cell.derive(DerivationOp::Group, None, true);
                    Ok(vec![k, cell])
                })
                .collect::<Checked<_>>()?;
        }
    }
    Ok(())
}
pub(super) fn apply(
    t: &mut Table,
    c: &Config,
    budget: &Budget,
    source_metadata: usize,
) -> Checked<Vec<Value>> {
    let mut trace = Vec::new();
    let mut work = 0;
    for (index, step) in c.steps.iter().enumerate() {
        let before = t.rows.len();
        work += before * t.columns.len();
        if work > 12_000_000 {
            return Err(MathError::Limit);
        }
        let content = t.storage_bytes() + source_metadata + (index + 1) * 1024;
        let mut meter = budget.stage(Stage::Transform, content)?;
        plan(t, step, &mut meter)?;
        run(t, step, c.decimal, &mut meter)?;
        budget.stage(
            Stage::Transform,
            t.storage_bytes() + source_metadata + (index + 1) * 1024,
        )?;
        trace.push(json!({"index":index,"operation":serde_json::to_value(step).map_err(|_|MathError::InvalidInput)?["op"],"input_rows":before,"output_rows":t.rows.len(),"reduced_rows":before.saturating_sub(t.rows.len())}));
    }
    Ok(trace)
}
