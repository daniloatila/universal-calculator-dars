use super::*;
use quick_xml::{Reader, XmlVersion, events::Event};
use std::io::{Cursor, Read};
use zip::ZipArchive;

const MAX_PART: u64 = 24 * 1024 * 1024;
const MAX_EXPANDED: u64 = 48 * 1024 * 1024;
type Archive<'a> = ZipArchive<Cursor<&'a [u8]>>;
type Attrs = BTreeMap<String, String>;

fn invalid<T>(_: T) -> MathError {
    MathError::InvalidInput
}
fn archive<'a>(bytes: &'a [u8], meter: &mut Meter<'_>) -> Checked<Archive<'a>> {
    let tail = bytes.len().saturating_sub(65557);
    let end = bytes[tail..]
        .windows(4)
        .rposition(|s| s == b"PK\x05\x06")
        .ok_or(MathError::InvalidInput)?
        + tail;
    let record = bytes.get(end..end + 22).ok_or(MathError::InvalidInput)?;
    if record[4..8] != [0; 4] || u16::from_le_bytes([record[10], record[11]]) > 256 {
        return Err(MathError::Limit);
    }
    let entries = usize::from(u16::from_le_bytes([record[10], record[11]]));
    let directory = u32::from_le_bytes(
        record[12..16]
            .try_into()
            .expect("four-byte directory length"),
    ) as usize;
    if directory > bytes.len() {
        return Err(MathError::InvalidInput);
    }
    meter.reserve(entries * 768 + directory * 4)?;
    let mut zip = ZipArchive::new(Cursor::new(bytes)).map_err(invalid)?;
    if zip.len() > 256 {
        return Err(MathError::Limit);
    }
    let mut total = 0u64;
    let mut names = BTreeSet::new();
    for i in 0..zip.len() {
        let item = zip.by_index(i).map_err(invalid)?;
        let name = item.name().map_err(invalid)?;
        let folded = name.to_ascii_lowercase();
        if name.len() > 256
            || name.contains(['\\', ':', '\0'])
            || name.starts_with('/')
            || name.split('/').any(|s| s == ".." || s == ".")
            || item.enclosed_name().is_none()
            || !names.insert(folded.clone())
            || item.encrypted()
        {
            return Err(MathError::InvalidInput);
        }
        if folded.ends_with(".bin")
            || folded.starts_with("xl/externallinks/")
            || folded.starts_with("xl/embeddings/")
            || folded == "xl/connections.xml"
        {
            return Err(MathError::Unsupported);
        }
        total = total.checked_add(item.size()).ok_or(MathError::Limit)?;
        if item.size() > MAX_PART || total > MAX_EXPANDED {
            return Err(MathError::Limit);
        }
    }
    Ok(zip)
}
fn xml_part(
    zip: &mut Archive<'_>,
    name: &str,
    meter: &mut Meter<'_>,
    visit: impl FnMut(&[String], Node, &mut Meter<'_>) -> Checked<()>,
) -> Checked<()> {
    let file = zip.by_name(name).map_err(invalid)?;
    let expected = file.size();
    if expected > MAX_PART {
        return Err(MathError::Limit);
    }
    let size = expected as usize;
    let charge = 2 * size + 1 + 96 * 1024;
    meter.reserve(charge)?;
    let mut v = Vec::new();
    v.try_reserve_exact(size + 1)
        .map_err(|_| MathError::ResourceBudget)?;
    v.resize(size, 0);
    let mut file = file.take(expected + 1);
    file.read_exact(&mut v).map_err(invalid)?;
    if file.read(&mut [0u8]).map_err(invalid)? != 0 {
        return Err(MathError::Limit);
    }
    drop(file);
    xml(&v, meter, visit)?;
    drop(v);
    meter.release(charge);
    Ok(())
}

enum Node<'a> {
    Start(&'a Attrs),
    End,
    Text(&'a str),
}
fn xml(
    bytes: &[u8],
    meter: &mut Meter<'_>,
    mut visit: impl FnMut(&[String], Node, &mut Meter<'_>) -> Checked<()>,
) -> Checked<()> {
    let source = std::str::from_utf8(bytes).map_err(invalid)?;
    let mut reader = Reader::from_str(source.trim_start_matches('\u{feff}'));
    reader.config_mut().expand_empty_elements = true;
    meter.reserve(8192)?;
    let mut stack = Vec::new();
    let mut roots = 0;
    loop {
        match reader.read_event().map_err(invalid)? {
            Event::Start(tag) => {
                if stack.len() >= 32 {
                    return Err(MathError::Limit);
                }
                if stack.is_empty() {
                    roots += 1;
                    if roots > 1 {
                        return Err(MathError::InvalidInput);
                    }
                }
                let name = tag.local_name();
                if name.as_ref().len() > 128 {
                    return Err(MathError::Limit);
                }
                let mut a = Attrs::new();
                let mut attributes = 0;
                for attr in tag.attributes() {
                    let attr = attr.map_err(invalid)?;
                    if attr.value.len() > 8192 || attr.key.as_ref().len() > 128 || a.len() >= 64 {
                        return Err(MathError::Limit);
                    }
                    let charge = 192
                        + budget::text(attr.key.as_ref().len())
                        + budget::text(attr.value.len());
                    meter.reserve(charge)?;
                    attributes += charge;
                    let k = attr.key.as_ref().to_owned();
                    a.insert(
                        k,
                        attr.normalized_value(XmlVersion::Implicit1_0)
                            .map_err(invalid)?
                            .into_owned(),
                    );
                }
                stack.push(name.as_ref().to_owned());
                visit(&stack, Node::Start(&a), meter)?;
                drop(a);
                meter.release(attributes);
            }
            Event::End(_) => {
                visit(&stack, Node::End, meter)?;
                stack.pop().ok_or(MathError::InvalidInput)?;
            }
            Event::Text(t) => {
                let charge = budget::text(t.as_ref().len());
                meter.reserve(charge)?;
                visit(&stack, Node::Text(&t.xml10_content()), meter)?;
                meter.release(charge);
            }
            Event::CData(t) => {
                let charge = budget::text(t.as_ref().len());
                meter.reserve(charge)?;
                visit(&stack, Node::Text(&t.xml10_content()), meter)?;
                meter.release(charge);
            }
            Event::GeneralRef(r) => {
                let code = r.resolve_char_ref().map_err(invalid)?;
                let value = match code {
                    Some(c) => c.to_string(),
                    None => match r.as_ref() {
                        "amp" => "&",
                        "lt" => "<",
                        "gt" => ">",
                        "quot" => "\"",
                        "apos" => "'",
                        _ => return Err(MathError::InvalidInput),
                    }
                    .into(),
                };
                visit(&stack, Node::Text(&value), meter)?;
            }
            Event::DocType(_) | Event::PI(_) => return Err(MathError::Unsupported),
            Event::Eof => break,
            _ => (),
        }
    }
    if roots != 1 || !stack.is_empty() {
        return Err(MathError::InvalidInput);
    }
    meter.release(8192);
    Ok(())
}

fn last(stack: &[String]) -> &str {
    stack.last().map_or("", String::as_str)
}
fn add(dst: &mut String, s: &str, meter: &mut Meter<'_>) -> Checked<()> {
    if dst.len() + s.len() > MAX_FIELD {
        return Err(MathError::Limit);
    }
    meter.reserve(budget::text(dst.len() + s.len()) - budget::text(dst.len()))?;
    dst.push_str(s);
    Ok(())
}
fn shared_strings(zip: &mut Archive, meter: &mut Meter<'_>) -> Checked<Vec<String>> {
    if zip.index_for_name("xl/sharedStrings.xml").is_none() {
        return Ok(Vec::new());
    }
    let mut strings = Vec::new();
    let mut current = String::new();
    xml_part(zip, "xl/sharedStrings.xml", meter, |stack, node, meter| {
        match (last(stack), node) {
            ("si", Node::Start(_)) => {
                meter.release(budget::text(current.len()));
                current = String::new();
            }
            ("t", Node::Text(s))
                if stack.iter().any(|n| n == "si") && !stack.iter().any(|n| n == "rPh") =>
            {
                add(&mut current, s, meter)?
            }
            ("si", Node::End) => {
                if strings.len() >= MAX_CELLS {
                    return Err(MathError::Limit);
                }
                meter.reserve(80)?;
                strings.push(std::mem::take(&mut current));
            }
            _ => (),
        }
        Ok(())
    })?;
    Ok(strings)
}
fn styles(zip: &mut Archive, meter: &mut Meter<'_>) -> Checked<Vec<std::sync::Arc<NumberFormat>>> {
    if zip.index_for_name("xl/styles.xml").is_none() {
        return Ok(Vec::new());
    }
    let mut custom = BTreeMap::<u32, String>::new();
    let mut indices = Vec::new();
    xml_part(zip, "xl/styles.xml", meter, |stack, node, meter| {
        if let Node::Start(a) = node {
            match last(stack) {
                "numFmt" => {
                    if let (Some(id), Some(code)) = (a.get("numFmtId"), a.get("formatCode")) {
                        if custom.len() >= 4096 || code.len() > MAX_FIELD {
                            return Err(MathError::Limit);
                        }
                        meter.reserve(64 + budget::text(code.len()))?;
                        if custom
                            .insert(id.parse().map_err(invalid)?, code.clone())
                            .is_some()
                        {
                            return Err(MathError::InvalidInput);
                        }
                    }
                }
                "xf" if stack.iter().any(|n| n == "cellXfs") => {
                    if indices.len() >= 4096 {
                        return Err(MathError::Limit);
                    }
                    meter.reserve(128)?;
                    indices.push(
                        a.get("numFmtId")
                            .map_or(Ok(0), |value| value.parse::<u32>())
                            .map_err(invalid)?,
                    );
                }
                _ => (),
            }
        }
        Ok(())
    })?;
    let mut unique = BTreeMap::new();
    Ok(indices
        .into_iter()
        .map(|id| {
            unique
                .entry(id)
                .or_insert_with(|| {
                    let code = custom.remove(&id);
                    let (custom_temporal, custom_time) =
                        code.as_deref().map_or((false, false), temporal_format);
                    let temporal = matches!(id,14..=22|27..=36|45..=47|50..=58) || custom_temporal;
                    let has_time = matches!(id,18..=22|45..=47) || custom_time;
                    std::sync::Arc::new(NumberFormat {
                        id,
                        code,
                        temporal,
                        has_time,
                    })
                })
                .clone()
        })
        .collect())
}

fn temporal_format(code: &str) -> (bool, bool) {
    let (mut quoted, mut bracket, mut escaped) = (false, false, false);
    let (mut temporal, mut time) = (false, false);
    for c in code.chars() {
        if escaped {
            escaped = false;
            continue;
        }
        match c.to_ascii_lowercase() {
            '"' if !bracket => quoted = !quoted,
            '\\' | '_' | '*' if !quoted && !bracket => escaped = true,
            '[' if !quoted => bracket = true,
            ']' if !quoted => bracket = false,
            'h' | 's' if !quoted && !bracket => {
                temporal = true;
                time = true;
            }
            'y' | 'd' | 'm' if !quoted && !bracket => temporal = true,
            _ => {}
        }
    }
    (temporal, time)
}

#[derive(Default)]
struct XCell {
    column: usize,
    kind: String,
    style: Option<usize>,
    v: String,
    inline: String,
    formula: Option<String>,
    stored: bool,
}
impl XCell {
    fn read(
        self,
        shared: &[String],
        formats: &[std::sync::Arc<NumberFormat>],
        epoch: Epoch,
    ) -> Checked<Cell> {
        let cell_type = match self.kind.as_str() {
            "" | "n" => ExcelType::Number,
            "s" => ExcelType::Shared,
            "inlineStr" => ExcelType::Inline,
            "str" => ExcelType::Text,
            "b" => ExcelType::Boolean,
            "d" => ExcelType::Date,
            "e" => ExcelType::Error,
            _ => return Err(MathError::Unsupported),
        };
        let format = formats.get(self.style.unwrap_or_default()).cloned();
        let date = match cell_type {
            ExcelType::Date => Some(DateOrigin {
                representation: DateRepresentation::Iso,
                epoch,
            }),
            ExcelType::Number if format.as_ref().is_some_and(|f| f.temporal) => Some(DateOrigin {
                representation: DateRepresentation::Serial,
                epoch,
            }),
            _ => None,
        };
        let cache = self.formula.as_ref().map(|_| {
            if !self.stored {
                CacheStatus::Missing
            } else if self.v.is_empty() {
                CacheStatus::Empty
            } else if matches!(cell_type, ExcelType::Error) {
                CacheStatus::Error
            } else {
                CacheStatus::Stored
            }
        });
        let unavailable = matches!(cache, Some(CacheStatus::Missing | CacheStatus::Empty));
        let value = if unavailable {
            ""
        } else {
            match cell_type {
                ExcelType::Shared => shared
                    .get(self.v.parse::<usize>().map_err(invalid)?)
                    .ok_or(MathError::InvalidInput)?,
                ExcelType::Inline => &self.inline,
                ExcelType::Boolean => match self.v.as_str() {
                    "1" => "true",
                    "0" => "false",
                    "" => "",
                    _ => return Err(MathError::InvalidInput),
                },
                _ => &self.v,
            }
        };
        let origin = match (cell_type, cache, date) {
            (_, Some(CacheStatus::Missing | CacheStatus::Empty), _) => Origin::Formula,
            (ExcelType::Error, _, _) => Origin::Error,
            (_, _, _) if value.is_empty() => Origin::Empty,
            (_, Some(CacheStatus::Stored), _) => Origin::CachedFormula,
            (ExcelType::Date, _, _) => Origin::IsoDate,
            (_, _, Some(_)) => match epoch {
                Epoch::Excel1900 => Origin::DateSerial1900,
                Epoch::Excel1904 => Origin::DateSerial1904,
            },
            _ => Origin::Stored,
        };
        let (source_type, grammar) = match (cell_type, date, origin) {
            (_, _, Origin::Empty) => (SourceType::Empty, Grammar::Xlsx),
            (_, Some(_), _) => (SourceType::Date, Grammar::Xlsx),
            (ExcelType::Number, _, _) => (SourceType::Number, Grammar::Xlsx),
            (ExcelType::Boolean, _, _) => (SourceType::Boolean, Grammar::Xlsx),
            (ExcelType::Error, _, _) => (SourceType::Error, Grammar::Xlsx),
            _ => (SourceType::Text, Grammar::Text),
        };
        let mut cell = Cell::native(value, origin, source_type, grammar)?;
        let differing_raw_value = (self.stored && value != self.v).then_some(self.v);
        cell.formula = self.formula;
        cell.workbook = Some(Box::new(WorkbookMeta {
            cell_type,
            style_index: self.style,
            format,
            has_raw_value: self.stored,
            differing_raw_value,
            cache,
            date,
        }));
        Ok(cell)
    }
}
fn column(reference: &str) -> Checked<(usize, usize)> {
    let split = reference
        .find(|c: char| !c.is_ascii_uppercase())
        .ok_or(MathError::InvalidInput)?;
    if split == 0 || split > 3 {
        return Err(MathError::InvalidInput);
    }
    let col = reference[..split]
        .bytes()
        .fold(0usize, |n, c| n * 26 + usize::from(c - b'A') + 1);
    let row = reference[split..].parse::<usize>().map_err(invalid)?;
    if col > MAX_COLUMNS || row == 0 || row > MAX_ROWS + 1 {
        return Err(MathError::Limit);
    }
    Ok((col - 1, row))
}
pub(super) fn read(bytes: &[u8], c: &Config, meter: &mut Meter<'_>) -> Checked<Table> {
    let mut zip = archive(bytes, meter)?;
    let mut sheets = Vec::<(String, String)>::new();
    let mut epoch1904 = false;
    xml_part(&mut zip, "xl/workbook.xml", meter, |stack, node, meter| {
        if let Node::Start(a) = node {
            match last(stack) {
                "workbookPr" => {
                    epoch1904 = a.get("date1904").is_some_and(|v| v == "1" || v == "true")
                }
                "sheet" => {
                    if sheets.len() >= 128 {
                        return Err(MathError::Limit);
                    }
                    let name = a.get("name").ok_or(MathError::InvalidInput)?;
                    if name.len() > 128 || sheets.iter().any(|(s, _)| s == name) {
                        return Err(MathError::InvalidInput);
                    }
                    let id = a
                        .iter()
                        .find(|(k, _)| k.as_str() == "r:id" || k.ends_with(":id"))
                        .map(|(_, v)| v)
                        .ok_or(MathError::InvalidInput)?;
                    meter.reserve(
                        2 * budget::COLUMN + 2 * budget::text(name.len()) + budget::text(id.len()),
                    )?;
                    sheets.push((name.clone(), id.clone()));
                }
                _ => (),
            }
        }
        Ok(())
    })?;
    let (name, id) = if let Some(name) = &c.sheet {
        sheets.iter().find(|(s, _)| s == name)
    } else {
        sheets.first()
    }
    .ok_or(MathError::InvalidInput)?;
    let mut path = None;
    xml_part(
        &mut zip,
        "xl/_rels/workbook.xml.rels",
        meter,
        |stack, node, meter| {
            if let Node::Start(a) = node
                && last(stack) == "Relationship"
                && a.get("Id") == Some(id)
            {
                if path.is_some()
                    || a.get("TargetMode").is_some_and(|v| v != "Internal")
                    || !a.get("Type").is_some_and(|v| v.ends_with("/worksheet"))
                {
                    return Err(MathError::Unsupported);
                }
                let target = a.get("Target").ok_or(MathError::InvalidInput)?;
                meter.reserve(budget::text(target.len() + 3))?;
                let full = if let Some(p) = target.strip_prefix('/') {
                    p.to_owned()
                } else {
                    format!("xl/{target}")
                };
                if !full.starts_with("xl/worksheets/")
                    || !full.ends_with(".xml")
                    || full.contains("..")
                    || full.contains(['\\', ':'])
                {
                    return Err(MathError::InvalidInput);
                }
                path = Some(full);
            }
            Ok(())
        },
    )?;
    let shared = shared_strings(&mut zip, meter)?;
    let formats = styles(&mut zip, meter)?;
    let epoch = if epoch1904 {
        Epoch::Excel1904
    } else {
        Epoch::Excel1900
    };
    let mut table = Table {
        sheet: Some(name.clone()),
        workbook_epoch: Some(epoch),
        sheets: sheets.iter().map(|(s, _)| s.clone()).collect(),
        ..Default::default()
    };
    let mut cell = None::<XCell>;
    let mut row = Vec::new();
    let mut row_no = 0;
    xml_part(
        &mut zip,
        &path.ok_or(MathError::InvalidInput)?,
        meter,
        |stack, node, meter| {
            match (last(stack), node) {
                ("row", Node::Start(a)) => {
                    let next = a
                        .get("r")
                        .map_or(Ok(row_no + 1), |s| s.parse::<usize>())
                        .map_err(invalid)?;
                    if next <= row_no || next > MAX_ROWS + 1 {
                        return Err(MathError::Limit);
                    }
                    // Retain internal blank rows. Reject leading sparse offsets before the header.
                    if table.columns.is_empty() && next != 1 {
                        return Err(MathError::InvalidInput);
                    }
                    for _ in row_no + 1..next {
                        meter.reserve(budget::ROW + table.columns.len() * budget::CELL)?;
                        table.push(vec![Cell::new("", Origin::Absent)?; table.columns.len()])?;
                    }
                    meter.reserve(budget::ROW)?;
                    row_no = next;
                    row.clear();
                }
                ("c", Node::Start(a)) => {
                    let (col, n) = a.get("r").map_or(Ok((row.len(), row_no)), |r| column(r))?;
                    if n != row_no
                        || row_no == 0
                        || col < row.len()
                        || col >= MAX_COLUMNS
                        || cell.is_some()
                    {
                        return Err(MathError::InvalidInput);
                    }
                    meter.reserve(a.get("t").map_or(0, |value| budget::text(value.len())))?;
                    cell = Some(XCell {
                        column: col,
                        kind: a.get("t").cloned().unwrap_or_default(),
                        style: a
                            .get("s")
                            .map(|s| s.parse::<usize>())
                            .transpose()
                            .map_err(invalid)?,
                        ..Default::default()
                    });
                }
                ("f", Node::Start(_)) => {
                    if let Some(x) = &mut cell {
                        x.formula = Some(String::new());
                    }
                }
                ("v", Node::Start(_)) => {
                    if let Some(x) = &mut cell {
                        x.stored = true;
                    }
                }
                ("f", Node::Text(s)) => {
                    if let Some(f) = cell.as_mut().and_then(|x| x.formula.as_mut()) {
                        add(f, s, meter)?
                    }
                }
                ("v", Node::Text(s)) => {
                    if let Some(x) = &mut cell {
                        add(&mut x.v, s, meter)?
                    }
                }
                ("t", Node::Text(s)) if stack.iter().any(|n| n == "is") => {
                    if let Some(x) = &mut cell {
                        add(&mut x.inline, s, meter)?
                    }
                }
                ("c", Node::End) => {
                    let x = cell.take().ok_or(MathError::InvalidInput)?;
                    let scratch = budget::text(x.kind.len())
                        + budget::text(x.v.len())
                        + budget::text(x.inline.len())
                        + x.formula.as_ref().map_or(0, |s| budget::text(s.len()));
                    let shared_copy = if x.kind == "s" {
                        x.v.parse::<usize>()
                            .ok()
                            .and_then(|i| shared.get(i))
                            .map_or(0, |s| budget::text(s.len()))
                    } else {
                        0
                    };
                    let style_code = x
                        .style
                        .and_then(|i| formats.get(i))
                        .and_then(|f| f.code.as_ref())
                        .map_or(0, |code| budget::text(code.len()));
                    let payload = 2 * scratch + shared_copy + style_code + 512;
                    meter.reserve((x.column + 1 - row.len()) * budget::CELL + payload)?;
                    row.resize(x.column, Cell::new("", Origin::Absent)?);
                    let cell = x.read(&shared, &formats, epoch)?;
                    let stored = budget::cell_storage(&cell);
                    if stored > payload {
                        meter.reserve(stored - payload)?;
                    } else {
                        meter.release(payload - stored);
                    }
                    meter.release(scratch);
                    row.push(cell);
                }
                ("row", Node::End) => {
                    let mut r = std::mem::take(&mut row);
                    if table.columns.is_empty() {
                        meter.reserve(
                            r.iter()
                                .map(|cell| budget::COLUMN + budget::text(cell.value.len()))
                                .sum(),
                        )?;
                        import::first_row(&mut table, r, c.header)?;
                    } else {
                        if r.len() > table.columns.len() {
                            return Err(MathError::InvalidInput);
                        }
                        meter.reserve((table.columns.len() - r.len()) * budget::CELL)?;
                        r.resize(table.columns.len(), Cell::new("", Origin::Absent)?);
                        table.push(r)?;
                    }
                }
                _ => (),
            }
            Ok(())
        },
    )?;
    if table.columns.is_empty() {
        return Err(MathError::InvalidInput);
    }
    Ok(table)
}
