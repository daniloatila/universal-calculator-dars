mod analysis;
mod import;
mod pipeline;
mod workbook;

use crate::{Computation, Exactness, MathError, Request, proof_response};
use num_rational::BigRational;
use num_traits::Zero;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

type Checked<T> = Result<T, MathError>;
const MAX_FILE: usize = 16 * 1024 * 1024;
const MAX_ROWS: usize = 200_000;
const MAX_COLUMNS: usize = 64;
const MAX_CELLS: usize = 1_200_000;
const MAX_FIELD: usize = 4096;
const REFERENCE: &str = "https://www.rfc-editor.org/rfc/rfc4180";

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum Kind {
    #[default]
    Text,
    Integer,
    Decimal,
    Boolean,
    Date,
    Time,
}

#[derive(Clone, Copy, Debug, Default, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
enum Origin {
    #[default]
    Stored,
    Empty,
    Null,
    Absent,
    Invalid,
    Formula,
    CachedFormula,
    IsoDate,
    DateSerial1900,
    DateSerial1904,
    Error,
}

#[derive(Clone, Debug, Serialize, Ord, PartialOrd, Eq, PartialEq)]
struct Cell {
    value: String,
    origin: Origin,
    #[serde(skip_serializing_if = "Option::is_none")]
    formula: Option<String>,
}
impl Cell {
    fn new(value: &str, origin: Origin) -> Checked<Self> {
        if value.len() > MAX_FIELD {
            return Err(MathError::Limit);
        }
        Ok(Self {
            value: value.to_owned(),
            origin,
            formula: None,
        })
    }
    fn stored(value: &str) -> Checked<Self> {
        Self::new(
            value,
            if value.is_empty() {
                Origin::Empty
            } else {
                Origin::Stored
            },
        )
    }
    fn missing(&self) -> bool {
        matches!(self.origin, Origin::Null | Origin::Absent | Origin::Empty)
    }
    fn usable(&self) -> bool {
        matches!(
            self.origin,
            Origin::Stored | Origin::CachedFormula | Origin::IsoDate
        )
    }
}

#[derive(Debug, Clone, Serialize)]
struct Column {
    name: String,
    kind: Kind,
}
#[derive(Default)]
struct Table {
    columns: Vec<Column>,
    rows: Vec<Vec<Cell>>,
    sheets: Vec<String>,
    sheet: Option<String>,
}
impl Table {
    fn set_columns(&mut self, names: Vec<String>) -> Checked<()> {
        if names.is_empty() || names.len() > MAX_COLUMNS {
            return Err(MathError::Limit);
        }
        let mut seen = BTreeSet::new();
        for name in &names {
            if name.trim().is_empty()
                || name.len() > 128
                || !crate::valid_text(name, 128)
                || !seen.insert(name)
            {
                return Err(MathError::InvalidInput);
            }
        }
        self.columns = names
            .into_iter()
            .map(|name| Column {
                name,
                kind: Kind::Text,
            })
            .collect();
        Ok(())
    }
    fn push(&mut self, row: Vec<Cell>) -> Checked<()> {
        if row.len() != self.columns.len() {
            return Err(MathError::InvalidInput);
        }
        if self.rows.len() >= MAX_ROWS || (self.rows.len() + 1) * row.len() > MAX_CELLS {
            return Err(MathError::Limit);
        }
        self.rows.push(row);
        Ok(())
    }
    fn index(&self, name: &str) -> Checked<usize> {
        self.columns
            .iter()
            .position(|c| c.name == name)
            .ok_or(MathError::InvalidInput)
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Format {
    #[default]
    Csv,
    Tsv,
    Json,
    Xlsx,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Header {
    #[default]
    Present,
    Absent,
    Detect,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Encoding {
    #[default]
    Utf8,
    Latin1,
    Utf16le,
    Utf16be,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Decimal {
    #[default]
    Point,
    Comma,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
struct Config {
    format: Format,
    header: Header,
    encoding: Encoding,
    delimiter: Option<char>,
    decimal: Decimal,
    sheet: Option<String>,
    types: BTreeMap<String, Kind>,
    steps: Vec<pipeline::Step>,
    analysis: Option<analysis::Analysis>,
}

fn number(s: &str, decimal: Decimal) -> Checked<BigRational> {
    let normalized;
    let s = match decimal {
        Decimal::Point => s,
        Decimal::Comma => {
            if s.contains('.') {
                return Err(MathError::InvalidInput);
            }
            normalized = s.replace(',', ".");
            &normalized
        }
    };
    // Computed rationals are represented exactly as numerator/denominator.
    crate::converter::scalar::parse(s)
}
fn valid_type(v: &str, kind: Kind, decimal: Decimal) -> bool {
    match kind {
        Kind::Text => true,
        Kind::Integer => number(v, decimal).is_ok_and(|r| r.is_integer()),
        Kind::Decimal => number(v, decimal).is_ok(),
        Kind::Boolean => matches!(v, "true" | "false"),
        Kind::Date => {
            v.len() == 10
                && v.parse::<jiff::civil::Date>()
                    .is_ok_and(|d| d.to_string() == v)
        }
        Kind::Time => v.contains(':') && v.parse::<jiff::civil::Time>().is_ok(),
    }
}

fn cast(table: &mut Table, name: &str, kind: Kind, decimal: Decimal) -> Checked<()> {
    let index = table.index(name)?;
    for row in &mut table.rows {
        let cell = &mut row[index];
        if cell.origin == Origin::Invalid
            && !cell.value.is_empty()
            && valid_type(&cell.value, kind, decimal)
        {
            cell.origin = if cell.formula.is_some() {
                Origin::CachedFormula
            } else {
                Origin::Stored
            };
        }
        if cell.usable() && !valid_type(&cell.value, kind, decimal) {
            cell.origin = Origin::Invalid;
        }
    }
    table.columns[index].kind = kind;
    Ok(())
}

pub struct Dataset {
    table: Table,
    config: Config,
    digest: String,
    input_bytes: usize,
    source_rows: usize,
    source_columns: Vec<Column>,
    trace: Vec<Value>,
}

impl Dataset {
    pub fn open(bytes: &[u8], settings: &str) -> Checked<Self> {
        if bytes.len() > MAX_FILE || settings.len() > 16384 {
            return Err(MathError::Limit);
        }
        let config: Config = serde_json::from_str(settings).map_err(|_| MathError::InvalidInput)?;
        if config.steps.len() > 32 || config.types.len() > MAX_COLUMNS {
            return Err(MathError::Limit);
        }
        let mut table = import::read(bytes, &config)?;
        for (column, kind) in &config.types {
            cast(&mut table, column, *kind, config.decimal)?;
        }
        let source_rows = table.rows.len();
        let source_columns = table.columns.clone();
        let trace = pipeline::apply(&mut table, &config)?;
        Ok(Self {
            table,
            config,
            digest: format!("{:x}", Sha256::digest(bytes)),
            input_bytes: bytes.len(),
            source_rows,
            source_columns,
            trace,
        })
    }

    fn summary(&self) -> Checked<Value> {
        let mut summary = Vec::new();
        for (index, col) in self.table.columns.iter().enumerate() {
            let numeric = matches!(col.kind, Kind::Integer | Kind::Decimal);
            let mut sum = BigRational::zero();
            let (mut min, mut max) = (None::<BigRational>, None::<BigRational>);
            let mut origins = BTreeMap::new();
            let mut count = 0;
            for row in &self.table.rows {
                let cell = &row[index];
                *origins.entry(cell.origin).or_insert(0usize) += 1;
                if numeric && cell.usable() {
                    let n = number(&cell.value, self.config.decimal)?;
                    min = Some(min.map_or_else(|| n.clone(), |v| v.min(n.clone())));
                    max = Some(max.map_or_else(|| n.clone(), |v| v.max(n.clone())));
                    sum += n;
                    count += 1;
                    if sum.denom().bits().max(sum.numer().bits()) > 4096 {
                        return Err(MathError::Limit);
                    }
                }
            }
            let stats = if count > 0 {
                Some(
                    json!({"sum":sum.to_string(),"min":min.unwrap().to_string(),"max":max.unwrap().to_string(),"mean":(sum/num_bigint::BigInt::from(count)).to_string(),"n":count}),
                )
            } else {
                None
            };
            summary.push(json!({"column":col,"origins":origins,"statistics":stats}));
        }
        Ok(
            json!({"sha256":self.digest,"source_bytes":self.input_bytes,"source_rows":self.source_rows,"source_columns":self.source_columns,
            "rows":self.table.rows.len(),"columns":self.table.columns,"profile":summary,"analysis":analysis::report(&self.table,&self.config)?,"steps":self.trace,"sheet":self.table.sheet}),
        )
    }

    pub fn page(&self, offset: usize, length: usize) -> Checked<String> {
        if length > 100 || offset > self.table.rows.len() {
            return Err(MathError::Limit);
        }
        Ok(json!({"rows":self.table.rows.iter().skip(offset).take(length).collect::<Vec<_>>(),"total":self.table.rows.len(),
            "source_columns":self.source_columns,"columns":self.table.columns,"sheets":self.table.sheets,"sheet":self.table.sheet,"offset":offset}).to_string())
    }
    pub fn proof(&self) -> Checked<String> {
        let descriptor = json!({"sha256":self.digest,"configuration":self.config}).to_string();
        if descriptor.len() > 4096 {
            return Err(MathError::Limit);
        }
        let request = Request {
            schema: 1,
            module: "data-lab".into(),
            operation: "dataset".into(),
            input: descriptor.clone(),
            original_input: None,
            options: Map::new(),
        };
        let computation = self.computation(descriptor)?;
        Ok(proof_response(&request, 8192, computation, "data-lab/1", &[REFERENCE])?.to_string())
    }
    fn computation(&self, normalized: String) -> Checked<Computation> {
        Ok(Computation{result:self.summary()?.to_string(),exactness:Exactness::Exact,normalized,domain:"local_tabular_data", method:"Typed rows with exact rational aggregates",formula:Some("mean = sum / valid numeric count"),precision:None,tolerance:None,error_bound:None,
        constraints:vec!["Replay requires the selected source bytes matching SHA-256. Cached spreadsheet formulas may be stale. Date-formatted serials retain the workbook epoch. Missing and invalid values are counted separately.".into()],
        variables:BTreeMap::from([("sha256".into(),self.digest.clone())]),units:BTreeMap::new()})
    }
    pub fn export_csv(&self, protected: bool) -> Checked<Vec<u8>> {
        fn field(value: &str, protected: bool) -> String {
            let trimmed = value.trim_start();
            if protected
                && (trimmed.starts_with(['=', '+', '-', '@'])
                    || value.starts_with(['\t', '\r', '\n']))
            {
                format!("'{value}")
            } else {
                value.to_owned()
            }
        }
        let mut w = csv::Writer::from_writer(Vec::new());
        w.write_record(self.table.columns.iter().map(|c| field(&c.name, protected)))
            .map_err(|_| MathError::Limit)?;
        for row in &self.table.rows {
            w.write_record(row.iter().map(|c| field(&c.value, protected)))
                .map_err(|_| MathError::Limit)?;
            if w.get_ref().len() > 32 * 1024 * 1024 {
                return Err(MathError::Limit);
            }
        }
        w.into_inner().map_err(|_| MathError::Limit)
    }
}

pub(super) fn evaluate(
    op: &str,
    input: &str,
    options: &Map<String, Value>,
) -> Checked<Computation> {
    if op != "profile" {
        return Err(MathError::Unsupported);
    }
    if options.keys().any(|k| k != "configuration") {
        return Err(MathError::InvalidInput);
    }
    let settings = match options.get("configuration") {
        None => "{}",
        Some(Value::String(s)) => s,
        _ => return Err(MathError::InvalidInput),
    };
    Dataset::open(input.as_bytes(), settings)?.computation(input.to_owned())
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod workbook_tests;

#[cfg(test)]
mod contract_tests;
