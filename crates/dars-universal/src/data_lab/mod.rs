mod analysis;
mod budget;
mod cell;
mod import;
mod pipeline;
mod workbook;

use crate::{Computation, Exactness, MathError, Request, proof_response};
use budget::{Budget, Meter, Stage};
use cell::*;
use num_rational::BigRational;
use num_traits::Zero;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json, value::RawValue};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

type Checked<T> = Result<T, MathError>;
const MAX_FILE: usize = 16 * 1024 * 1024;
const MAX_ROWS: usize = 200_000;
const MAX_COLUMNS: usize = 64;
const MAX_CELLS: usize = 1_200_000;
const MAX_FIELD: usize = 4096;
const MAX_RECIPE: usize = 4096;
const SOURCE_PROFILE_STORAGE: usize = 2048;
const REFERENCE: &str = "https://www.rfc-editor.org/rfc/rfc4180";

/// Maximum source bytes admitted for a dataset configuration before allocating an input buffer.
pub fn max_input_bytes(settings: &str) -> Result<usize, MathError> {
    let (config, normalized_length) = checked_config(settings)?;
    budget::input_limit(
        config.resource_budget_bytes,
        settings.len().max(normalized_length),
    )
}

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
    workbook_epoch: Option<Epoch>,
}
impl Table {
    fn storage_bytes(&self) -> usize {
        let rows = (self.rows.len() * budget::ROW).max(self.rows.capacity() * 32);
        rows + self
            .rows
            .iter()
            .map(|row| {
                (row.len() * budget::CELL).max(row.capacity() * 96)
                    + row.iter().map(budget::cell_storage).sum::<usize>()
            })
            .sum::<usize>()
            + column_storage(&self.columns)
            + self
                .sheets
                .iter()
                .map(|sheet| budget::COLUMN + budget::text(sheet.len()))
                .sum::<usize>()
            + self
                .sheet
                .as_ref()
                .map_or(0, |sheet| budget::text(sheet.len()))
    }

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

struct PageRows<'a> {
    rows: &'a [Vec<Cell>],
    columns: &'a [Column],
    decimal: Decimal,
}

impl Serialize for PageRows<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeSeq;
        struct Row<'a> {
            cells: &'a [Cell],
            columns: &'a [Column],
            decimal: Decimal,
        }
        impl Serialize for Row<'_> {
            fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                let mut view = serializer.serialize_seq(Some(self.cells.len()))?;
                for (cell, column) in self.cells.iter().zip(self.columns) {
                    let value = cell
                        .view(column.kind, self.decimal)
                        .map_err(|e| serde::ser::Error::custom(e.as_str()))?;
                    view.serialize_element(&value)?;
                }
                view.end()
            }
        }
        let mut view = serializer.serialize_seq(Some(self.rows.len()))?;
        for row in self.rows {
            view.serialize_element(&Row {
                cells: row,
                columns: self.columns,
                decimal: self.decimal,
            })?;
        }
        view.end()
    }
}

fn column_storage(columns: &[Column]) -> usize {
    columns
        .iter()
        .map(|column| budget::COLUMN + budget::text(column.name.len()))
        .sum()
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
    semantics_version: SemanticsVersion,
    format: Format,
    header: Header,
    encoding: Encoding,
    delimiter: Option<char>,
    decimal: Decimal,
    sheet: Option<String>,
    types: BTreeMap<String, Kind>,
    steps: Vec<pipeline::Step>,
    analysis: Option<analysis::Analysis>,
    #[serde(skip_serializing_if = "Option::is_none")]
    resource_budget_bytes: Option<usize>,
}

fn checked_config(settings: &str) -> Checked<(Config, usize)> {
    if settings.len() > budget::MAX_SETTINGS {
        return Err(MathError::Limit);
    }
    let mut config: Config = serde_json::from_str(settings).map_err(|_| MathError::InvalidInput)?;
    if config.semantics_version != SemanticsVersion::default() {
        return Err(MathError::Unsupported);
    }
    if config.steps.len() > 32 || config.types.len() > MAX_COLUMNS {
        return Err(MathError::Limit);
    }
    config.resource_budget_bytes = Some(budget::checked_limit(config.resource_budget_bytes)?);
    let normalized_length = serde_json::to_vec(&config)
        .map_err(|_| MathError::InvalidInput)?
        .len();
    if normalized_length > budget::MAX_SETTINGS {
        return Err(MathError::Limit);
    }
    Ok((config, normalized_length))
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(transparent)]
struct SemanticsVersion(u8);

impl Default for SemanticsVersion {
    fn default() -> Self {
        Self(2)
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Recipe<'a> {
    sha256: &'a str,
    #[serde(default)]
    semantics_version: Option<SemanticsVersion>,
    #[serde(borrow)]
    configuration: &'a RawValue,
    #[serde(default, borrow)]
    resource_policy: Option<ResourcePolicy<'a>>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ResourcePolicy<'a> {
    model: &'a str,
    limit_bytes: usize,
}

fn checked_recipe(descriptor: &str) -> Checked<Recipe<'_>> {
    if descriptor.len() > MAX_RECIPE {
        return Err(MathError::Limit);
    }
    let recipe: Recipe<'_> =
        serde_json::from_str(descriptor).map_err(|_| MathError::InvalidInput)?;
    if recipe.semantics_version != Some(SemanticsVersion::default()) {
        return Err(MathError::Unsupported);
    }
    if recipe.sha256.len() != 64
        || !recipe
            .sha256
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(MathError::InvalidInput);
    }
    let policy = recipe
        .resource_policy
        .as_ref()
        .ok_or(MathError::InvalidInput)?;
    if policy.model != budget::MODEL {
        return Err(MathError::Unsupported);
    }
    let raw = recipe.configuration.get();
    checked_config(raw)?;
    let config: Value = serde_json::from_str(raw).map_err(|_| MathError::InvalidInput)?;
    if config.get("semantics_version") != Some(&json!(SemanticsVersion::default()))
        || config.get("resource_budget_bytes") != Some(&json!(policy.limit_bytes))
    {
        return Err(MathError::InvalidInput);
    }
    Ok(recipe)
}

/// Source ingress ceiling for a validated v2 replay recipe.
pub fn max_replay_input_bytes(descriptor: &str) -> Checked<usize> {
    max_input_bytes(checked_recipe(descriptor)?.configuration.get())
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
fn cast(table: &mut Table, name: &str, kind: Kind, decimal: Decimal) -> Checked<()> {
    let index = table.index(name)?;
    for row in &mut table.rows {
        row[index].interpret(kind, decimal);
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
    source_profile: SourceProfile,
    trace: Vec<Value>,
    budget: Budget,
    resident_bytes: usize,
}

#[derive(Default, Serialize)]
struct SourceProfile {
    native_types: BTreeMap<SourceType, usize>,
    notations: BTreeMap<&'static str, usize>,
    formula_caches: BTreeMap<CacheStatus, usize>,
}

impl SourceProfile {
    fn from_table(table: &Table, decimal: Decimal) -> Self {
        let mut profile = Self::default();
        for cell in table.rows.iter().flatten() {
            *profile.native_types.entry(cell.source_type).or_default() += 1;
            *profile.notations.entry(cell.notation(decimal)).or_default() += 1;
            if let Some(status) = cell.workbook.as_ref().and_then(|meta| meta.cache) {
                *profile.formula_caches.entry(status).or_default() += 1;
            }
        }
        profile
    }
}

impl Dataset {
    /// Reopen a v2 recipe against the bytes named by its SHA-256 digest.
    pub fn replay(bytes: &[u8], descriptor: &str) -> Checked<Self> {
        let recipe = checked_recipe(descriptor)?;
        if bytes.len() > MAX_FILE {
            return Err(MathError::Limit);
        }
        let settings = recipe.configuration.get();
        if bytes.len() > max_input_bytes(settings)? {
            return Err(MathError::ResourceBudget);
        }
        if format!("{:x}", Sha256::digest(bytes)) != recipe.sha256 {
            return Err(MathError::InvalidInput);
        }
        Self::open(bytes, settings)
    }

    pub fn open(bytes: &[u8], settings: &str) -> Checked<Self> {
        if bytes.len() > MAX_FILE || settings.len() > budget::MAX_SETTINGS {
            return Err(MathError::Limit);
        }
        let (config, normalized_length) = checked_config(settings)?;
        if bytes.len()
            > budget::input_limit(
                config.resource_budget_bytes,
                settings.len().max(normalized_length),
            )?
        {
            return Err(MathError::ResourceBudget);
        }
        let budget = Budget::new(config.resource_budget_bytes, bytes.len(), normalized_length)?;
        let mut table = import::read(bytes, &config, &mut budget.stage(Stage::Import, 0)?)?;
        let mut cast_meter = budget.stage(Stage::Cast, table.storage_bytes())?;
        if !config.types.is_empty() {
            cast_meter.reserve(budget::RATIONAL_SCRATCH)?;
        }
        for (column, kind) in &config.types {
            cast(&mut table, column, *kind, config.decimal)?;
        }
        let source_rows = table.rows.len();
        cast_meter.reserve(column_storage(&table.columns) + SOURCE_PROFILE_STORAGE)?;
        let source_columns = table.columns.clone();
        let source_profile = SourceProfile::from_table(&table, config.decimal);
        let source_storage = column_storage(&source_columns) + SOURCE_PROFILE_STORAGE;
        let trace = pipeline::apply(&mut table, &config, &budget, source_storage)?;
        let resident_bytes = table.storage_bytes() + source_storage + trace.len() * 1024;
        budget.stage(
            if trace.is_empty() {
                Stage::Cast
            } else {
                Stage::Transform
            },
            resident_bytes,
        )?;
        Ok(Self {
            table,
            config,
            digest: format!("{:x}", Sha256::digest(bytes)),
            input_bytes: bytes.len(),
            source_rows,
            source_columns,
            source_profile,
            trace,
            budget,
            resident_bytes,
        })
    }

    fn resident(&self) -> usize {
        self.resident_bytes
    }

    /// Highest admitted estimates for each stage, including attempts refused later.
    pub fn resource_diagnostics(&self) -> String {
        self.budget.diagnostics()
    }

    /// Includes responses still live at the browser boundary in any subsequent reservations.
    /// The total is nondecreasing until the dataset is released.
    pub fn reserve_browser_response(&self, bytes: usize) -> Checked<()> {
        self.budget.reserve_browser_response(self.resident(), bytes)
    }

    #[cfg(test)]
    fn summary(&self) -> Checked<Value> {
        self.summarize(&mut self.budget.stage(Stage::Analysis, self.resident())?)
    }

    fn summarize(&self, meter: &mut Meter<'_>) -> Checked<Value> {
        meter.reserve(self.table.columns.len() * 1536)?;
        meter.reserve(budget::RATIONAL_SCRATCH)?;
        let mut summary = Vec::new();
        for (index, col) in self.table.columns.iter().enumerate() {
            let numeric = matches!(col.kind, Kind::Integer | Kind::Decimal);
            let mut sum = BigRational::zero();
            let (mut min, mut max) = (None::<BigRational>, None::<BigRational>);
            let mut origins = BTreeMap::new();
            let mut source_types = BTreeMap::new();
            let mut validities = BTreeMap::new();
            let mut count = 0;
            for row in &self.table.rows {
                let cell = &row[index];
                *origins.entry(cell.origin).or_insert(0usize) += 1;
                *source_types.entry(cell.source_type).or_insert(0usize) += 1;
                *validities.entry(cell.validity()).or_insert(0usize) += 1;
                if numeric && cell.usable() {
                    let n = cell.numeric(self.config.decimal)?;
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
                let mean = &sum / num_bigint::BigInt::from(count);
                let min = min.expect("numeric minimum exists for a counted value");
                let max = max.expect("numeric maximum exists for a counted value");
                for estimate in [&sum, &mean, &min, &max] {
                    meter.reserve(budget::text(budget::rational_text_bytes(estimate)))?;
                }
                Some(
                    json!({"sum":sum.to_string(),"min":min.to_string(),"max":max.to_string(),"mean":mean.to_string(),"n":count}),
                )
            } else {
                None
            };
            summary.push(json!({"column":col,"origins":origins,"source_types":source_types,"validity":validities,"statistics":stats}));
        }
        Ok(
            json!({"sha256":self.digest,"source_bytes":self.input_bytes,"source_rows":self.source_rows,"source_columns":self.source_columns,
            "rows":self.table.rows.len(),"columns":self.table.columns,"profile":summary,"analysis":analysis::report(&self.table,&self.config,meter)?,"steps":self.trace,"sheet":self.table.sheet,"workbook_epoch":self.table.workbook_epoch,"source_profile":self.source_profile}),
        )
    }

    pub fn page(&self, offset: usize, length: usize) -> Checked<String> {
        if length > 100 || offset > self.table.rows.len() {
            return Err(MathError::Limit);
        }
        #[derive(Serialize)]
        struct Page<'a> {
            columns: &'a [Column],
            offset: usize,
            rows: PageRows<'a>,
            sheet: &'a Option<String>,
            sheets: &'a [String],
            source_columns: &'a [Column],
            total: usize,
            workbook_epoch: Option<Epoch>,
        }
        let total = self.table.rows.len();
        let rows = PageRows {
            rows: &self.table.rows[offset..(offset + length).min(total)],
            columns: &self.table.columns,
            decimal: self.config.decimal,
        };
        let page = Page {
            columns: &self.table.columns,
            offset,
            rows,
            sheet: &self.table.sheet,
            sheets: &self.table.sheets,
            source_columns: &self.source_columns,
            total,
            workbook_epoch: self.table.workbook_epoch,
        };
        let mut meter = self.budget.stage(Stage::Page, self.resident())?;
        if self.table.workbook_epoch.is_some()
            || self
                .table
                .columns
                .iter()
                .any(|c| !matches!(c.kind, Kind::Text | Kind::Boolean))
        {
            meter.reserve(budget::RATIONAL_SCRATCH)?;
        }
        budget::serialize(meter, budget::PAGE_MAX, &page)
    }
    pub fn proof(&self) -> Checked<String> {
        let descriptor = budget::serialize(
            self.budget.stage(Stage::Proof, self.resident())?,
            MAX_RECIPE,
            &json!({"sha256":self.digest,"semantics_version":SemanticsVersion::default(),"configuration":self.config,
            "resource_policy":ResourcePolicy{model:budget::MODEL,limit_bytes:self.budget.limit()}}),
        )?;
        let request = Request {
            schema: 1,
            module: "data-lab".into(),
            operation: "dataset".into(),
            input: descriptor.clone(),
            original_input: None,
            options: Map::new(),
        };
        let computation = self.computation(descriptor)?;
        let mut meter = self.budget.stage(Stage::Proof, self.resident())?;
        meter.reserve(4 * computation.normalized.len() + 3 * computation.result.len() + 4096)?;
        let response = proof_response(&request, 8192, computation, "data-lab/2", &[REFERENCE])?;
        budget::serialize(meter, 128 * 1024, &response)
    }
    fn computation(&self, normalized: String) -> Checked<Computation> {
        let mut meter = self.budget.stage(Stage::Analysis, self.resident())?;
        let summary = self.summarize(&mut meter)?;
        let result = budget::serialize(meter, crate::RESULT_BYTES, &summary)?;
        Ok(Computation{result,exactness:Exactness::Exact,normalized,domain:"local_tabular_data", method:"Typed rows with exact rational aggregates",formula:Some("mean = sum / valid numeric count"),precision:None,tolerance:None,error_bound:None,
        constraints:vec!["V2 replay requires source bytes matching SHA-256 and the recorded resource policy.".into(),
            "JSON and XLSX numbers use native notation. The selected decimal separator applies to text.".into(),
            "Spreadsheet formulas are represented by their stored caches. Date values retain the workbook epoch and are excluded from numeric statistics.".into(),
            "Excel's fictitious 1900 leap day has no Gregorian date. Serial fractions are rendered at nanosecond resolution.".into(),
            format!("Estimated live resource limit: {} bytes under {}.",self.budget.limit(),budget::MODEL)],
        variables:BTreeMap::from([("sha256".into(),self.digest.clone())]),units:BTreeMap::new()})
    }
    pub fn export_csv(&self, protected: bool) -> Checked<Vec<u8>> {
        fn field(value: &str, protected: bool) -> std::borrow::Cow<'_, [u8]> {
            let trimmed = value.trim_start();
            if protected
                && (trimmed.starts_with(['=', '+', '-', '@'])
                    || value.starts_with(['\t', '\r', '\n']))
            {
                format!("'{value}").into_bytes().into()
            } else {
                value.as_bytes().into()
            }
        }
        let mut meter = self.budget.stage(Stage::Export, self.resident())?;
        meter.reserve(16 * 1024)?;
        let mut output = budget::Output::new(meter, budget::EXPORT_MAX);
        let write = (|| -> Result<(), csv::Error> {
            let mut writer = csv::Writer::from_writer(&mut output);
            writer.write_record(self.table.columns.iter().map(|c| field(&c.name, protected)))?;
            for row in &self.table.rows {
                writer.write_record(row.iter().map(|c| field(&c.value, protected)))?;
            }
            writer.flush()?;
            Ok(())
        })();
        write.map_err(|_| output.fail())?;
        Ok(output.finish())
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

#[cfg(test)]
mod semantic_tests;

#[cfg(test)]
mod budget_tests;
