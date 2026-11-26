use super::*;
use std::io::{Cursor, Write};
use zip::{ZipWriter, write::SimpleFileOptions};

fn small_workbook(rows: &str, styles: &str) -> Vec<u8> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let workbook = r#"<workbook xmlns:r="urn:test"><workbookPr date1904="true"/><sheets><sheet name="Local" r:id="r1"/></sheets></workbook>"#;
    let rels = r#"<Relationships><Relationship Id="r1" TargetMode="Internal" Target="worksheets/data.xml" Type="urn:example/worksheet"/></Relationships>"#;
    let worksheet = format!("<worksheet><sheetData>{rows}</sheetData></worksheet>");
    for (name, content) in [
        ("xl/workbook.xml", workbook),
        ("xl/_rels/workbook.xml.rels", rels),
        ("xl/worksheets/data.xml", &worksheet),
        ("xl/styles.xml", styles),
    ] {
        zip.start_file(
            name,
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored),
        )
        .unwrap();
        zip.write_all(content.as_bytes()).unwrap();
    }
    zip.finish().unwrap().into_inner()
}
#[test]
fn styles_blank_rows_iso_and_uncached_strings() {
    let bytes = small_workbook(
        r#"<row r="1"><c t="inlineStr"><is><t>ID</t></is></c><c t="inlineStr"><is><t>When</t></is></c></row>
        <row r="3"><c t="s"><f>1+1</f></c><c s="0"><v>1.5</v></c></row>
        <row><c t="inlineStr"><is><t><![CDATA[<item>]]>&quot;&apos;&lt;&gt;&#65;</t></is></c><c t="d"><v>2024-02-29</v></c></row>"#,
        r#"<stylesheet><numFmts><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts><cellXfs><xf numFmtId="165"/></cellXfs></stylesheet>"#,
    );
    let t = Dataset::open(&bytes, r#"{"format":"xlsx"}"#).unwrap();
    assert_eq!(t.table.rows.len(), 3);
    assert_eq!(t.table.rows[0][0].origin, Origin::Absent);
    assert_eq!(t.table.rows[1][0].origin, Origin::Formula);
    assert_eq!(t.table.rows[1][1].origin, Origin::DateSerial1904);
    assert_eq!(t.table.rows[2][0].value, "<item>\"'<>A");
    assert_eq!(t.table.rows[2][1].origin, Origin::IsoDate);
    assert!(Dataset::open(&bytes, r#"{"format":"xlsx","sheet":"Missing"}"#).is_err());
    assert!(Dataset::open(&bytes[..bytes.len() - 30], r#"{"format":"xlsx"}"#).is_err());
}
#[test]
fn rejects_unsupported_and_inconsistent_sheet_records() {
    for row in [
        r#"<row r="2"><c><v>1</v></c></row>"#,
        r#"<row><c r="A2"><v>1</v></c></row>"#,
        r#"<row><c t="b"><v>7</v></c></row>"#,
        r#"<row><c t="s"><v>9</v></c></row>"#,
        r#"<row><c t="other"><v>1</v></c></row>"#,
        r#"<row><c r="A1"/><c r="A1"/></row>"#,
        r#"<row><c r="ZZZ1"><v>1</v></c></row>"#,
        r#"<row><c r="A"><v>1</v></c></row>"#,
        r#"<row r="1"><c><v>1</v></c></row><row r="1"><c><v>2</v></c></row>"#,
        r#"<row><c><v>1</v></c></row><row><c><v>2</v></c><c><v>3</v></c></row>"#,
    ] {
        let bytes = small_workbook(row, "<styles/>");
        assert!(
            Dataset::open(&bytes, r#"{"format":"xlsx","header":"absent"}"#).is_err(),
            "{row}"
        );
    }
}

#[test]
fn rejects_unsupported_xml_declarations_and_parallel_roots() {
    for styles in [
        "<!DOCTYPE styleSheet><styleSheet/>",
        "<?ready yes?><styleSheet/>",
        "<styleSheet/><styleSheet/>",
        "<styleSheet>",
        "<styleSheet><xf></styleSheet>",
    ] {
        let bytes = small_workbook("<row><c><v>1</v></c></row>", styles);
        assert!(Dataset::open(&bytes, r#"{"format":"xlsx","header":"absent"}"#).is_err());
    }
}
