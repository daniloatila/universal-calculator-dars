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

pub(super) fn read(bytes: &[u8], c: &Config) -> Checked<Table> {
    if matches!(c.format, Format::Xlsx) {
        return workbook::read(bytes, c);
    }
    let input = text(bytes, c.encoding)?;
    if matches!(c.format, Format::Json) {
        let mut des = serde_json::Deserializer::from_str(&input);
        let mut table = Table::default();
        JsonRows(&mut table)
            .deserialize(&mut des)
            .map_err(|_| MathError::InvalidInput)?;
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
        let row = record
            .iter()
            .map(Cell::stored)
            .collect::<Checked<Vec<_>>>()?;
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

// Deserialize one row at a time. RawValue retains the source spelling of decimal and integer tokens.
struct JsonRows<'a>(&'a mut Table);
impl<'de> DeserializeSeed<'de> for JsonRows<'_> {
    type Value = ();
    fn deserialize<D: serde::Deserializer<'de>>(self, d: D) -> Result<(), D::Error> {
        d.deserialize_seq(self)
    }
}
impl<'de> Visitor<'de> for JsonRows<'_> {
    type Value = ();
    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("an array of flat records")
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<(), A::Error> {
        while let Some(row) = seq.next_element::<JsonRow>()? {
            if self.0.columns.is_empty() {
                self.0
                    .set_columns(row.0.keys().cloned().collect())
                    .map_err(|e| A::Error::custom(e.as_str()))?;
            }
            if row.0.keys().any(|k| self.0.index(k).is_err()) {
                return Err(A::Error::custom("schema mismatch"));
            }
            let mut fields = row.0;
            let cells = self
                .0
                .columns
                .iter()
                .map(|c| {
                    fields.remove(&c.name).unwrap_or(Cell {
                        value: String::new(),
                        origin: Origin::Absent,
                        formula: None,
                    })
                })
                .collect();
            self.0
                .push(cells)
                .map_err(|e| A::Error::custom(e.as_str()))?;
        }
        Ok(())
    }
}
struct JsonRow(BTreeMap<String, Cell>);
impl<'de> Deserialize<'de> for JsonRow {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct Row;
        impl<'de> Visitor<'de> for Row {
            type Value = JsonRow;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("a flat record")
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<JsonRow, A::Error> {
                let mut fields = BTreeMap::new();
                while let Some(k) = map.next_key::<String>()? {
                    if fields.len() >= MAX_COLUMNS || k.len() > 128 || fields.contains_key(&k) {
                        return Err(A::Error::custom("invalid column"));
                    }
                    let raw = map.next_value::<&RawValue>()?.get();
                    if raw.len() > MAX_FIELD * 6 {
                        return Err(A::Error::custom("cell limit"));
                    }
                    let cell = match raw.as_bytes()[0] {
                        b'{' | b'[' => return Err(A::Error::custom("nested cell")),
                        b'"' => Cell::stored(
                            &serde_json::from_str::<String>(raw).map_err(A::Error::custom)?,
                        ),
                        b'n' => Cell::new("", Origin::Null),
                        _ => Cell::stored(raw),
                    }
                    .map_err(|e| A::Error::custom(e.as_str()))?;
                    fields.insert(k, cell);
                }
                Ok(JsonRow(fields))
            }
        }
        d.deserialize_map(Row)
    }
}
