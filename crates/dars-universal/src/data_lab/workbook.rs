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
fn archive(bytes: &[u8]) -> Checked<Archive<'_>> {
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
fn part(zip: &mut Archive<'_>, name: &str) -> Checked<Vec<u8>> {
    let file = zip.by_name(name).map_err(invalid)?;
    let expected = file.size();
    if expected > MAX_PART {
        return Err(MathError::Limit);
    }
    let mut v = Vec::new();
    file.take(expected + 1)
        .read_to_end(&mut v)
        .map_err(invalid)?;
    if v.len() as u64 != expected {
        return Err(MathError::Limit);
    }
    Ok(v)
}

enum Node<'a> {
    Start(&'a Attrs),
    End,
    Text(&'a str),
}
fn xml(bytes: &[u8], mut visit: impl FnMut(&[String], Node) -> Checked<()>) -> Checked<()> {
    let source = std::str::from_utf8(bytes).map_err(invalid)?;
    let mut reader = Reader::from_str(source.trim_start_matches('\u{feff}'));
    reader.config_mut().expand_empty_elements = true;
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
                let name = tag.local_name().as_ref().to_owned();
                if name.len() > 128 {
                    return Err(MathError::Limit);
                }
                let mut a = Attrs::new();
                for attr in tag.attributes() {
                    let attr = attr.map_err(invalid)?;
                    if attr.value.len() > 8192 || a.len() >= 64 {
                        return Err(MathError::Limit);
                    }
                    let k = attr.key.as_ref().to_owned();
                    a.insert(
                        k,
                        attr.normalized_value(XmlVersion::Implicit1_0)
                            .map_err(invalid)?
                            .into_owned(),
                    );
                }
                stack.push(name);
                visit(&stack, Node::Start(&a))?;
            }
            Event::End(_) => {
                visit(&stack, Node::End)?;
                stack.pop().ok_or(MathError::InvalidInput)?;
            }
            Event::Text(t) => visit(&stack, Node::Text(&t.xml10_content()))?,
            Event::CData(t) => visit(&stack, Node::Text(&t.xml10_content()))?,
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
                visit(&stack, Node::Text(&value))?;
            }
            Event::DocType(_) | Event::PI(_) => return Err(MathError::Unsupported),
            Event::Eof => break,
            _ => (),
        }
    }
    if roots != 1 || !stack.is_empty() {
        return Err(MathError::InvalidInput);
    }
    Ok(())
}

fn last(stack: &[String]) -> &str {
    stack.last().map_or("", String::as_str)
}
fn add(dst: &mut String, s: &str) -> Checked<()> {
    if dst.len() + s.len() > MAX_FIELD {
        return Err(MathError::Limit);
    }
    dst.push_str(s);
    Ok(())
}
fn shared_strings(zip: &mut Archive) -> Checked<Vec<String>> {
    if zip.index_for_name("xl/sharedStrings.xml").is_none() {
        return Ok(Vec::new());
    }
    let mut strings = Vec::new();
    let mut current = String::new();
    xml(&part(zip, "xl/sharedStrings.xml")?, |stack, node| {
        match (last(stack), node) {
            ("si", Node::Start(_)) => current.clear(),
            ("t", Node::Text(s))
                if stack.iter().any(|n| n == "si") && !stack.iter().any(|n| n == "rPh") =>
            {
                add(&mut current, s)?
            }
            ("si", Node::End) => {
                if strings.len() >= MAX_CELLS {
                    return Err(MathError::Limit);
                }
                strings.push(std::mem::take(&mut current));
            }
            _ => (),
        }
        Ok(())
    })?;
    Ok(strings)
}
fn styles(zip: &mut Archive) -> Checked<Vec<bool>> {
    if zip.index_for_name("xl/styles.xml").is_none() {
        return Ok(Vec::new());
    }
    let mut custom = BTreeSet::<u32>::new();
    let mut dates = Vec::new();
    xml(&part(zip, "xl/styles.xml")?, |stack, node| {
        if let Node::Start(a) = node {
            match last(stack) {
                "numFmt" => {
                    if let (Some(id), Some(code)) = (a.get("numFmtId"), a.get("formatCode")) {
                        // Recognize date/time tokens outside quoted literals and escaped characters.
                        let mut literal = false;
                        let mut escape = false;
                        let mut bracket = false;
                        let has = code.chars().any(|c| {
                            if escape {
                                escape = false;
                                return false;
                            }
                            match c {
                                '\\' | '_' | '*' => {
                                    escape = true;
                                    false
                                }
                                '"' => {
                                    literal = !literal;
                                    false
                                }
                                '[' => {
                                    bracket = true;
                                    false
                                }
                                ']' => {
                                    bracket = false;
                                    false
                                }
                                _ => {
                                    !literal
                                        && !bracket
                                        && matches!(
                                            c.to_ascii_lowercase(),
                                            'y' | 'd' | 'h' | 's' | 'm'
                                        )
                                }
                            }
                        });
                        if has {
                            custom.insert(id.parse().map_err(invalid)?);
                        }
                    }
                }
                "xf" if stack.iter().any(|n| n == "cellXfs") => {
                    if dates.len() >= 4096 {
                        return Err(MathError::Limit);
                    }
                    let id = a
                        .get("numFmtId")
                        .map_or(Ok(0), |s| s.parse::<u32>())
                        .map_err(invalid)?;
                    dates
                        .push(matches!(id,14..=22|27..=36|45..=47|50..=58) || custom.contains(&id));
                }
                _ => (),
            }
        }
        Ok(())
    })?;
    Ok(dates)
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
    fn read(self, shared: &[String], dates: &[bool], epoch1904: bool) -> Checked<Cell> {
        if self.formula.is_some() && (!self.stored || self.v.is_empty()) {
            let mut unknown = Cell::new("", Origin::Formula)?;
            unknown.formula = self.formula;
            return Ok(unknown);
        }
        let mut cell = match self.kind.as_str() {
            "s" => Cell::stored(
                shared
                    .get(self.v.parse::<usize>().map_err(invalid)?)
                    .ok_or(MathError::InvalidInput)?,
            )?,
            "inlineStr" => Cell::stored(&self.inline)?,
            "b" => Cell::stored(match self.v.as_str() {
                "1" => "true",
                "0" => "false",
                _ => return Err(MathError::InvalidInput),
            })?,
            "e" => Cell::new(&self.v, Origin::Error)?,
            "d" => Cell::new(&self.v, Origin::IsoDate)?,
            "str" => Cell::stored(&self.v)?,
            "" | "n" => {
                if self.stored && self.style.is_some_and(|i| dates.get(i) == Some(&true)) {
                    Cell::new(
                        &self.v,
                        if epoch1904 {
                            Origin::DateSerial1904
                        } else {
                            Origin::DateSerial1900
                        },
                    )?
                } else {
                    Cell::stored(&self.v)?
                }
            }
            _ => return Err(MathError::Unsupported),
        };
        if let Some(f) = self.formula {
            cell.formula = Some(f);
            if cell.origin != Origin::Error {
                cell.origin = if self.stored && !self.v.is_empty() {
                    Origin::CachedFormula
                } else {
                    Origin::Formula
                };
            }
        }
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
pub(super) fn read(bytes: &[u8], c: &Config) -> Checked<Table> {
    let mut zip = archive(bytes)?;
    let mut sheets = Vec::<(String, String)>::new();
    let mut epoch1904 = false;
    xml(&part(&mut zip, "xl/workbook.xml")?, |stack, node| {
        if let Node::Start(a) = node {
            match last(stack) {
                "workbookPr" => {
                    epoch1904 = a.get("date1904").is_some_and(|v| v == "1" || v == "true")
                }
                "sheet" => {
                    if sheets.len() >= 128 {
                        return Err(MathError::Limit);
                    }
                    let name = a.get("name").ok_or(MathError::InvalidInput)?.clone();
                    if name.len() > 128 || sheets.iter().any(|(s, _)| s == &name) {
                        return Err(MathError::InvalidInput);
                    }
                    let id = a
                        .iter()
                        .find(|(k, _)| k.as_str() == "r:id" || k.ends_with(":id"))
                        .map(|(_, v)| v.clone())
                        .ok_or(MathError::InvalidInput)?;
                    sheets.push((name, id));
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
    xml(
        &part(&mut zip, "xl/_rels/workbook.xml.rels")?,
        |stack, node| {
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
    let shared = shared_strings(&mut zip)?;
    let dates = styles(&mut zip)?;
    let mut table = Table {
        sheet: Some(name.clone()),
        sheets: sheets.iter().map(|(s, _)| s.clone()).collect(),
        ..Default::default()
    };
    let mut cell = None::<XCell>;
    let mut row = Vec::new();
    let mut row_no = 0;
    xml(
        &part(&mut zip, &path.ok_or(MathError::InvalidInput)?)?,
        |stack, node| {
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
                        table.push(vec![Cell::new("", Origin::Absent)?; table.columns.len()])?;
                    }
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
                        add(f, s)?
                    }
                }
                ("v", Node::Text(s)) => {
                    if let Some(x) = &mut cell {
                        add(&mut x.v, s)?
                    }
                }
                ("t", Node::Text(s)) if stack.iter().any(|n| n == "is") => {
                    if let Some(x) = &mut cell {
                        add(&mut x.inline, s)?
                    }
                }
                ("c", Node::End) => {
                    let x = cell.take().ok_or(MathError::InvalidInput)?;
                    row.resize(x.column, Cell::new("", Origin::Absent)?);
                    row.push(x.read(&shared, &dates, epoch1904)?);
                }
                ("row", Node::End) => {
                    let mut r = std::mem::take(&mut row);
                    if table.columns.is_empty() {
                        import::first_row(&mut table, r, c.header)?;
                    } else {
                        if r.len() > table.columns.len() {
                            return Err(MathError::InvalidInput);
                        }
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
