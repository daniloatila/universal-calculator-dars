use super::*;
use std::io::{Cursor, Write};
use zip::{ZipWriter, write::SimpleFileOptions};

fn small_workbook(rows: &str, styles: &str) -> Vec<u8> {
    workbook(rows, styles, true)
}

fn workbook(rows: &str, styles: &str, date1904: bool) -> Vec<u8> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let workbook = format!(
        r#"<workbook xmlns:r="urn:test"><workbookPr date1904="{date1904}"/><sheets><sheet name="Local" r:id="r1"/></sheets></workbook>"#
    );
    let rels = r#"<Relationships><Relationship Id="r1" TargetMode="Internal" Target="worksheets/data.xml" Type="urn:example/worksheet"/></Relationships>"#;
    let worksheet = format!("<worksheet><sheetData>{rows}</sheetData></worksheet>");
    for (name, content) in [
        ("xl/workbook.xml", workbook.as_str()),
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
fn direct_and_cached_dates_share_semantics_under_both_epochs() {
    let styles = r#"<stylesheet><numFmts><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="165"/></cellXfs></stylesheet>"#;
    let xml = r#"<row><c s="1"><v>61.5</v></c><c s="1"><f>60+1.5</f><v>61.5</v></c></row>
        <row><c s="1"><v>60</v></c><c s="1"><f>60</f><v>60</v></c></row>"#;
    for (date1904, epoch, expected) in [
        (false, "1900", "1900-03-01T12:00:00"),
        (true, "1904", "1904-03-02T12:00:00"),
    ] {
        let input = workbook(xml, styles, date1904);
        let dataset = Dataset::open(&input, r#"{"format":"xlsx","header":"absent","decimal":"comma","types":{"c1":"date","c2":"date"}}"#).unwrap();
        let page: Value = serde_json::from_str(&dataset.page(0, 10).unwrap()).unwrap();
        assert_eq!(page["workbook_epoch"], epoch);
        for col in [0, 1] {
            let cell = &page["rows"][0][col];
            assert_eq!(cell["value"], "61.5");
            assert_eq!(cell["source_type"], "date");
            assert_eq!(cell["canonical"], expected);
            assert_eq!(cell["workbook"]["date"]["epoch"], epoch);
            assert_eq!(cell["workbook"]["number_format_id"], 165);
            assert_eq!(
                cell["workbook"]["number_format_code"],
                "yyyy-mm-dd hh:mm:ss"
            );
        }
        assert_eq!(page["rows"][0][1]["formula"], "60+1.5");
        assert_eq!(
            page["rows"][0][1]["workbook"]["cache"],
            json!({"status":"stored","value":"61.5"})
        );
        assert_eq!(
            page["rows"][1][0]["workbook"]["date"]["status"],
            if date1904 {
                "valid"
            } else {
                "fictitious_1900_leap_day"
            }
        );
        let dataset = Dataset::open(
            &input,
            r#"{"format":"xlsx","header":"absent","steps":[
            {"op":"cast","column":"c1","kind":"text"},
            {"op":"cast","column":"c1","kind":"decimal"},
            {"op":"cast","column":"c2","kind":"decimal"}]}"#,
        )
        .unwrap();
        let result = dataset.summary().unwrap();
        assert_eq!(result["source_profile"]["formula_caches"]["stored"], 2);
        assert_eq!(result["profile"][0]["validity"]["invalid"], 2);
        assert_eq!(result["profile"][1]["validity"]["invalid"], 2);
        assert!(result["profile"][0]["statistics"].is_null());
        assert!(result["profile"][1]["statistics"].is_null());
    }
}

#[test]
fn worksheet_distinguishes_formula_cache_states_and_time() {
    let styles =
        r#"<stylesheet><cellXfs><xf numFmtId="0"/><xf numFmtId="21"/></cellXfs></stylesheet>"#;
    let xml = r#"<row><c><f>1+0.25</f><v>1.25</v></c></row>
        <row><c t="str"><f>"2,50"</f><v>2,50</v></c></row>
        <row><c><f>0</f></c></row><row><c><f>0</f><v/></c></row>
        <row><c t="e"><f>1/0</f><v>#DIV/0!</v></c></row>
        <row><c t="d"><v>2024-02-29T08:00:00-03:00</v></c></row>
        <row><c s="1"><v>0</v></c></row>
        <row><c s="1"><v>0.000000000000000001</v></c></row>"#;
    let input = workbook(xml, styles, false);
    let settings =
        r#"{"format":"xlsx","header":"absent","decimal":"comma","types":{"c1":"decimal"}}"#;
    let dataset = Dataset::open(&input, settings).unwrap();
    let page: Value = serde_json::from_str(&dataset.page(0, 10).unwrap()).unwrap();
    let rows = page["rows"].as_array().unwrap();
    assert_eq!(rows[0][0]["canonical"], "5/4");
    assert_eq!(rows[0][0]["notation"], "xlsx");
    assert_eq!(rows[1][0]["canonical"], "5/2");
    assert_eq!(rows[1][0]["notation"], "text_comma");
    assert_eq!(rows[2][0]["workbook"]["cache"], json!({"status":"missing"}));
    assert_eq!(
        rows[3][0]["workbook"]["cache"],
        json!({"status":"empty","value":""})
    );
    assert_eq!(
        rows[4][0]["workbook"]["cache"],
        json!({"status":"error","value":"#DIV/0!"})
    );
    assert_eq!(
        rows[5][0]["workbook"]["date"]["iso"],
        "2024-02-29T11:00:00Z"
    );
    assert_eq!(
        rows[7][0]["workbook"]["date"]["discarded_subnanosecond_precision"],
        true
    );
    assert_eq!(
        dataset.summary().unwrap()["profile"][0]["statistics"]["mean"],
        "15/8"
    );
    let timed = Dataset::open(
        &input,
        r#"{"format":"xlsx","header":"absent","types":{"c1":"time"}}"#,
    )
    .unwrap();
    let page: Value = serde_json::from_str(&timed.page(0, 10).unwrap()).unwrap();
    assert_eq!(page["rows"][5][0]["canonical"], "11:00:00");
    assert_eq!(page["rows"][6][0]["canonical"], "00:00:00");
}

#[test]
fn calendar_keys_order_normalized_instants_and_preserve_source_basis() {
    let input = workbook(
        r#"<row><c t="d"><v>2024-02-29T12:00:00.1Z</v></c><c t="str"><v>fractional</v></c></row>
           <row><c t="d"><v>2024-02-29T09:00:00-03:00</v></c><c t="str"><v>first</v></c></row>
           <row><c t="d"><v>2024-02-29T12:00:00Z</v></c><c t="str"><v>duplicate</v></c></row>
           <row><c t="d"><v>2024-02-29T12:00:00</v></c><c t="str"><v>civil</v></c></row>
           <row><c t="d"><v>2024-02-29</v></c><c t="str"><v>date</v></c></row>"#,
        "<styleSheet/>",
        false,
    );
    let config = r#"{"format":"xlsx","header":"absent","types":{"c1":"date"},"steps":[
        {"op":"deduplicate","columns":["c1"]},{"op":"sort","column":"c1"},
        {"op":"text","column":"c1","transform":"trim","name":"date_text"},
        {"op":"cast","column":"date_text","kind":"decimal"}]}"#;
    let dataset = Dataset::open(&input, config).unwrap();
    let page: Value = serde_json::from_str(&dataset.page(0, 10).unwrap()).unwrap();
    let rows = page["rows"].as_array().unwrap();
    let labels: Vec<_> = rows
        .iter()
        .map(|r| r[1]["value"].as_str().unwrap())
        .collect();
    assert_eq!(labels, ["date", "civil", "first", "fractional"]);
    assert_eq!(rows[2][0]["value"], "2024-02-29T09:00:00-03:00");
    assert_eq!(rows[2][2]["value"], "2024-02-29T12:00:00Z");
    assert_eq!(rows[2][2]["source_type"], "date");
    assert_eq!(rows[2][2]["validity"], "invalid");
}

#[test]
fn unsupported_calendar_values_preserve_literals_and_cache_presence() {
    let input = workbook(
        r#"<row><c s="1"><v>-1</v></c></row>
           <row><c s="1"><v>3000002.25</v></c></row>
           <row><c s="1"><f>1/2</f></c></row>
           <row><c t="d"><v>2024-02-29T12:00:00.12345678901</v></c></row>"#,
        r#"<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>"#,
        false,
    );
    let config = r#"{"format":"xlsx","header":"absent","types":{"c1":"date"}}"#;
    let dataset = Dataset::open(&input, config).unwrap();
    let page: Value = serde_json::from_str(&dataset.page(0, 10).unwrap()).unwrap();
    let rows = page["rows"].as_array().unwrap();
    for (index, literal) in [
        (0, "-1"),
        (1, "3000002.25"),
        (3, "2024-02-29T12:00:00.12345678901"),
    ] {
        assert_eq!(rows[index][0]["value"], literal);
        assert_eq!(rows[index][0]["workbook"]["date"]["status"], "invalid");
        assert!(rows[index][0]["canonical"].is_null());
    }
    assert_eq!(rows[2][0]["workbook"]["date"]["status"], "unavailable");
    assert_eq!(rows[2][0]["validity"], "uncached");
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
