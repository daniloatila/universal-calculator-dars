use super::*;
use serde::de::{DeserializeSeed, Error as _, MapAccess, SeqAccess, Visitor};
use serde_json::value::RawValue;
use std::{borrow::Cow, fmt};

fn text(bytes: &[u8], encoding: Encoding) -> Checked<Cow<'_, str>> {
    match encoding {
        Encoding::Utf8 => {
            std::str::from_utf8(bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes))
                .map(Cow::Borrowed)
                .map_err(|_| MathError::InvalidInput)
        }
        Encoding::Latin1 => Ok(Cow::Owned(bytes.iter().map(|&c| char::from(c)).collect())),
        Encoding::Utf16le | Encoding::Utf16be => {
            let le = matches!(encoding, Encoding::Utf16le);
            let bytes = bytes
                .strip_prefix(if le { &[255, 254] } else { &[254, 255] })
                .unwrap_or(bytes);
            if !bytes.len().is_multiple_of(2) {
                return Err(MathError::InvalidInput);
            }
            let units = bytes.as_chunks::<2>().0.iter().map(|c| {
                if le {
                    u16::from_le_bytes([c[0], c[1]])
                } else {
                    u16::from_be_bytes([c[0], c[1]])
                }
            });
            char::decode_utf16(units)
                .collect::<Result<String, _>>()
                .map(Cow::Owned)
                .map_err(|_| MathError::InvalidInput)
        }
    }
}

pub(super) fn first_row(table: &mut Table, row: Vec<Cell>, header: Header) -> Checked<()> {
    let header = match header {
        Header::Present => true,
        Header::Absent => false,
        Header::Detect => {
            let mut seen = BTreeSet::new();
            row.iter().all(|c| {
                c.usable() && c.value.starts_with(char::is_alphabetic) && seen.insert(&c.value)
            })
        }
    };
    if header {
        table.set_columns(row.into_iter().map(|c| c.value).collect())
    } else {
        table.set_columns((1..=row.len()).map(|i| format!("c{i}")).collect())?;
        table.push(row)
    }
}

pub(super) fn read(bytes: &[u8], c: &Config, meter: &mut Meter<'_>) -> Checked<Table> {
    if matches!(c.format, Format::Xlsx) {
        return workbook::read(bytes, c, meter);
    }
    if !matches!(c.encoding, Encoding::Utf8) {
        meter.reserve(bytes.len() * 3)?;
    }
    let input = text(bytes, c.encoding)?;
    if matches!(c.format, Format::Json) {
        // The JSON reader may retain an input-sized scratch buffer for escaped tokens.
        meter.reserve(input.len().saturating_mul(2))?;
        let mut des = serde_json::Deserializer::from_str(&input);
        let mut table = Table::default();
        let mut exhausted = false;
        JsonRows {
            table: &mut table,
            meter,
            exhausted: &mut exhausted,
        }
        .deserialize(&mut des)
        .map_err(|_| {
            if exhausted {
                MathError::ResourceBudget
            } else {
                MathError::InvalidInput
            }
        })?;
        des.end().map_err(|_| MathError::InvalidInput)?;
        if table.columns.is_empty() {
            return Err(MathError::InvalidInput);
        }
        return Ok(table);
    }
    let delimiter = c.delimiter.unwrap_or(if matches!(c.format, Format::Tsv) {
        '\t'
    } else {
        ','
    });
    if ![',', ';', '\t', '|'].contains(&delimiter) {
        return Err(MathError::InvalidInput);
    }
    let max_record = record_extent(input.as_bytes(), delimiter as u8)?;
    meter.reserve(max_record * 3 + 8192 + MAX_COLUMNS * 32)?;
    let mut r = csv::ReaderBuilder::new()
        .delimiter(delimiter as u8)
        .has_headers(false)
        .from_reader(input.as_bytes());
    let mut table = Table::default();
    let mut record = csv::StringRecord::new();
    while r
        .read_record(&mut record)
        .map_err(|_| MathError::InvalidInput)?
    {
        if record.len() > MAX_COLUMNS {
            return Err(MathError::Limit);
        }
        meter.reserve(
            budget::ROW
                + record.len() * budget::CELL
                + record.iter().map(|s| budget::text(s.len())).sum::<usize>(),
        )?;
        let mut row = Vec::new();
        row.try_reserve_exact(record.len())
            .map_err(|_| MathError::ResourceBudget)?;
        for value in &record {
            row.push(Cell::stored(value)?);
        }
        if table.columns.is_empty() {
            first_row(&mut table, row, c.header)?
        } else {
            table.push(row)?
        }
    }
    if table.columns.is_empty() {
        return Err(MathError::InvalidInput);
    }
    Ok(table)
}

// Preflight the physical record dimensions before the CSV reader grows its record buffers.
fn record_extent(input: &[u8], delimiter: u8) -> Checked<usize> {
    let (mut quoted, mut field_start) = (false, true);
    let (mut field, mut record, mut columns, mut peak) = (0usize, 0usize, 1usize, 0usize);
    let mut bytes = input.iter().copied().peekable();
    while let Some(byte) = bytes.next() {
        record += 1;
        if quoted && byte == b'"' {
            if bytes.peek() == Some(&b'"') {
                bytes.next();
                field += 1;
                record += 1;
            } else {
                quoted = false;
            }
        } else if quoted {
            field += 1;
        } else if byte == b'"' && field_start {
            quoted = true;
            field_start = false;
        } else if byte == delimiter {
            columns += 1;
            field_start = true;
            field = 0;
        } else if matches!(byte, b'\r' | b'\n') {
            peak = peak.max(record);
            (field, record, columns, field_start) = (0, 0, 1, true);
        } else {
            field += 1;
            field_start = false;
        }
        if field > MAX_FIELD || columns > MAX_COLUMNS {
            return Err(MathError::Limit);
        }
    }
    Ok(peak.max(record))
}

// Deserialize one row at a time. RawValue retains the source spelling of decimal and integer tokens.
struct JsonRows<'a, 'b> {
    table: &'a mut Table,
    meter: &'a mut Meter<'b>,
    exhausted: &'a mut bool,
}
impl<'de> DeserializeSeed<'de> for JsonRows<'_, '_> {
    type Value = ();
    fn deserialize<D: serde::Deserializer<'de>>(self, d: D) -> Result<(), D::Error> {
        d.deserialize_seq(self)
    }
}
fn reserve<E: serde::de::Error>(
    meter: &mut Meter<'_>,
    exhausted: &mut bool,
    bytes: usize,
) -> Result<(), E> {
    meter.reserve(bytes).map_err(|error| {
        *exhausted = true;
        E::custom(error.as_str())
    })
}

impl<'de> Visitor<'de> for JsonRows<'_, '_> {
    type Value = ();
    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("an array of flat records")
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<(), A::Error> {
        while let Some((row, workspace)) = seq.next_element_seed(JsonRow {
            meter: self.meter,
            exhausted: self.exhausted,
        })? {
            if self.table.columns.is_empty() {
                reserve(
                    self.meter,
                    self.exhausted,
                    row.keys()
                        .map(|k| budget::COLUMN + budget::text(k.len()))
                        .sum(),
                )?;
                self.table
                    .set_columns(row.keys().cloned().collect())
                    .map_err(|e| A::Error::custom(e.as_str()))?;
            }
            if row.keys().any(|k| self.table.index(k).is_err()) {
                return Err(A::Error::custom("schema mismatch"));
            }
            reserve(
                self.meter,
                self.exhausted,
                budget::ROW
                    + self.table.columns.len() * budget::CELL
                    + row.values().map(budget::cell_storage).sum::<usize>(),
            )?;
            let mut fields = row;
            let cells = self
                .table
                .columns
                .iter()
                .map(|c| fields.remove(&c.name).unwrap_or_else(Cell::absent))
                .collect();
            self.table
                .push(cells)
                .map_err(|e| A::Error::custom(e.as_str()))?;
            self.meter.release(workspace);
        }
        Ok(())
    }
}
struct JsonRow<'a, 'b> {
    meter: &'a mut Meter<'b>,
    exhausted: &'a mut bool,
}
struct JsonColumn(String);

impl<'de> Deserialize<'de> for JsonColumn {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct ColumnVisitor;
        impl Visitor<'_> for ColumnVisitor {
            type Value = JsonColumn;
            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("a column name of at most 128 bytes")
            }
            fn visit_str<E: serde::de::Error>(self, name: &str) -> Result<JsonColumn, E> {
                if name.len() > 128 {
                    return Err(E::custom("invalid column"));
                }
                Ok(JsonColumn(name.to_owned()))
            }
        }
        d.deserialize_string(ColumnVisitor)
    }
}

impl<'de> DeserializeSeed<'de> for JsonRow<'_, '_> {
    type Value = (BTreeMap<String, Cell>, usize);
    fn deserialize<D: serde::Deserializer<'de>>(self, d: D) -> Result<Self::Value, D::Error> {
        d.deserialize_map(self)
    }
}
impl<'de> Visitor<'de> for JsonRow<'_, '_> {
    type Value = (BTreeMap<String, Cell>, usize);
    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("a flat record")
    }
    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        let mut fields = BTreeMap::new();
        let mut workspace = 0;
        while let Some(JsonColumn(k)) = map.next_key::<JsonColumn>()? {
            if fields.len() >= MAX_COLUMNS || fields.contains_key(&k) {
                return Err(A::Error::custom("invalid column"));
            }
            let raw = map.next_value::<&RawValue>()?.get();
            if raw.len() > MAX_FIELD * 6 {
                return Err(A::Error::custom("cell limit"));
            }
            let cost = budget::CELL * 2 + budget::text(k.len()) + budget::text(raw.len());
            reserve(self.meter, self.exhausted, cost)?;
            workspace += cost;
            let cell = match raw.as_bytes()[0] {
                b'{' | b'[' => return Err(A::Error::custom("nested cell")),
                b'"' => {
                    Cell::stored(&serde_json::from_str::<String>(raw).map_err(A::Error::custom)?)
                }
                b'n' => Cell::native("", Origin::Null, SourceType::Null, Grammar::Json),
                b't' | b'f' => {
                    Cell::native(raw, Origin::Stored, SourceType::Boolean, Grammar::Json)
                }
                _ => Cell::native(raw, Origin::Stored, SourceType::Number, Grammar::Json),
            }
            .map_err(|e| A::Error::custom(e.as_str()))?;
            fields.insert(k, cell);
        }
        Ok((fields, workspace))
    }
}
