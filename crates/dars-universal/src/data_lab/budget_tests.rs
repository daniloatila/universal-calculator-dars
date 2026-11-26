use super::*;

fn settings(limit: usize, steps: Value) -> String {
    json!({"resource_budget_bytes":limit,"steps":steps}).to_string()
}

fn admitted(bytes: &[u8], limit: usize, steps: Value) -> Dataset {
    Dataset::open(bytes, &settings(limit, steps)).expect("ordinary fixture is within budget")
}

fn insufficient(bytes: &[u8], limit: usize, steps: Value) {
    assert_eq!(
        Dataset::open(bytes, &settings(limit, steps)).err(),
        Some(MathError::ResourceBudget)
    );
}

#[test]
fn validates_input_limit_and_preserves_canonical_replay_admission() {
    let cfg = r#"{"resource_budget_bytes":65536}"#;
    let framed = max_input_bytes(cfg).unwrap();
    assert!((8 * 1024..11 * 1024).contains(&framed));
    assert_eq!(
        max_input_bytes(r#"{"resource_budget_bytes":65535}"#),
        Err(MathError::Limit)
    );
    let input = b"ref,value\r\n0007,plain\r\n";
    let table = Dataset::open(input, cfg).unwrap();
    let proof: Value = serde_json::from_str(&table.proof().unwrap()).unwrap();
    let descriptor: Value =
        serde_json::from_str(proof["proof"]["normalized"].as_str().unwrap()).unwrap();
    let replay = descriptor["configuration"].to_string();
    assert_eq!(max_input_bytes(&replay).unwrap(), framed);
    assert_eq!(
        Dataset::open(input, &replay).unwrap().proof().unwrap(),
        table.proof().unwrap()
    );
}

#[test]
fn rejects_fill_and_join_before_appending_many_repeated_ordinary_texts() {
    let input = format!(
        "id,note\n{}",
        (0..12).map(|i| format!("room-{i},\n")).collect::<String>()
    );
    let value = "A scheduled check for the engineering lab. ".repeat(9);
    let baseline = admitted(input.as_bytes(), 64 * 1024, json!([]));
    let fill = json!([{"op":"fill_missing","column":"note","value":value}]);
    insufficient(input.as_bytes(), 64 * 1024, fill.clone());
    let replacement = admitted(input.as_bytes(), 128 * 1024, fill);
    assert_eq!(replacement.table.rows[0][1].value, value);

    let same_id = format!("id,note\n{}", "west,open\n".repeat(26));
    let lookup = json!([{"op":"join","column":"id","name":"description","mode":"left","lookup":[["west", value]]}]);
    admitted(same_id.as_bytes(), 64 * 1024, json!([]));
    insufficient(same_id.as_bytes(), 64 * 1024, lookup.clone());
    let joined = admitted(same_id.as_bytes(), 128 * 1024, lookup);
    assert_eq!(joined.table.rows.len(), 26);
    assert_eq!(joined.table.rows[25][2].value, value);
    assert_eq!(baseline.table.rows[0][1].origin, Origin::Empty);
}

#[test]
fn charges_cumulative_table_growth_and_casing_output_without_changing_result() {
    let label = "Engenharia İ́ ".repeat(7);
    let input = format!("label\n{}", format!("{label}\n").repeat(18));
    let lower = json!({"op":"text","column":"label","transform":"lowercase","name":"normalized"});
    let other = json!({"op":"text","column":"label","transform":"uppercase","name":"alternate"});
    let steps = json!([lower, other]);
    let both = admitted(input.as_bytes(), 128 * 1024, steps.clone());
    let high: Value = serde_json::from_str(&both.resource_diagnostics()).unwrap();
    let limit = high["stage_estimated_high_water_bytes"]["transform"]
        .as_u64()
        .unwrap() as usize
        - 64;
    assert!(limit >= 64 * 1024);
    let single = admitted(input.as_bytes(), limit, json!([lower]));
    assert_eq!(single.table.rows[0][1].value, label.to_lowercase());
    insufficient(input.as_bytes(), limit, steps);
    assert_eq!(both.table.rows[17][2].value, label.to_uppercase());
}

#[test]
fn keeps_dataset_recoverable_after_page_and_export_allocation_refusals() {
    let note = "This sample is a local record for the spring schedule. ".repeat(2);
    let input = format!("note\n{}", format!("{note}\n").repeat(28));
    let low = admitted(input.as_bytes(), 82 * 1024, json!([]));
    assert_eq!(low.page(0, 28).err(), Some(MathError::ResourceBudget));
    let view: Value = serde_json::from_str(&low.page(27, 1).unwrap()).unwrap();
    assert_eq!(view["rows"][0][0]["value"], note);
    let high = admitted(input.as_bytes(), 128 * 1024, json!([]));
    let high_csv = high.export_csv(false).unwrap();
    assert_eq!(high_csv.as_slice(), input.as_bytes());

    let constrained = admitted(input.as_bytes(), 77 * 1024, json!([]));
    assert_eq!(
        constrained.export_csv(true).err(),
        Some(MathError::ResourceBudget)
    );
    assert!(constrained.page(0, 1).is_ok());
}

#[test]
fn sort_and_analysis_require_room_for_temporary_numeric_data() {
    let input = format!(
        "reading\n{}",
        (0..44).rev().map(|n| format!("{n}\n")).collect::<String>()
    );
    let details = json!({"resource_budget_bytes":80*1024,"types":{"reading":"decimal"},"analysis":{"x":"reading"}});
    let small = Dataset::open(input.as_bytes(), &details.to_string()).unwrap();
    assert_eq!(small.proof().err(), Some(MathError::ResourceBudget));
    let sort = |limit| {
        json!({"resource_budget_bytes":limit,"types":{"reading":"decimal"},"steps":[{"op":"sort","column":"reading"}]}).to_string()
    };
    assert_eq!(
        Dataset::open(input.as_bytes(), &sort(80 * 1024)).err(),
        Some(MathError::ResourceBudget)
    );
    assert_eq!(
        Dataset::open(input.as_bytes(), &sort(128 * 1024))
            .unwrap()
            .table
            .rows[0][0]
            .value,
        "0"
    );
}

#[test]
fn grouping_charges_new_buckets_before_retaining_them() {
    let input = format!(
        "room,count\n{}",
        (0..30).map(|i| format!("room-{i},1\n")).collect::<String>()
    );
    let steps =
        json!([{"op":"group","by":"room","column":"count","aggregate":"count","name":"total"}]);
    let source = admitted(input.as_bytes(), 80 * 1024, json!([]));
    assert_eq!(source.table.rows.len(), 30);
    insufficient(input.as_bytes(), 80 * 1024, steps.clone());
    let result = admitted(input.as_bytes(), 128 * 1024, steps);
    assert_eq!(result.table.rows.len(), 30);
    assert!(result.table.rows.iter().all(|row| row[1].value == "1"));
}

#[test]
fn csv_preflight_accepts_quoted_multiline_records_and_literal_quotes() {
    let input = b"id,note\r\n007,\"first, \"\"quoted\"\"\r\nsecond\"\r\n008,\"\"\r\n";
    let dataset = admitted(input, 64 * 1024, json!([]));
    assert_eq!(dataset.table.rows[0][0].value, "007");
    assert_eq!(
        dataset.table.rows[0][1].value,
        "first, \"quoted\"\r\nsecond"
    );
    assert_eq!(dataset.table.rows[1][1].origin, Origin::Empty);
}

#[test]
fn includes_browser_responses_in_later_stage_reservations() {
    let dataset = admitted(b"note\nReady\n", 96 * 1024, json!([]));
    assert!(dataset.proof().is_ok());
    let boundary = 49 * 1024;
    dataset.reserve_browser_response(boundary).unwrap();
    dataset.reserve_browser_response(1024).unwrap();
    assert_eq!(
        dataset.reserve_browser_response(96 * 1024),
        Err(MathError::ResourceBudget)
    );
    assert_eq!(dataset.proof().err(), Some(MathError::ResourceBudget));
    assert_eq!(
        dataset.export_csv(true).err(),
        Some(MathError::ResourceBudget)
    );
    assert!(dataset.page(0, 1).is_ok());
    let diagnostic: Value = serde_json::from_str(&dataset.resource_diagnostics()).unwrap();
    assert_eq!(diagnostic["browser_response_reserve_bytes"], boundary);
    assert!(
        diagnostic["stage_estimated_high_water_bytes"]["browser_boundary"]
            .as_u64()
            .unwrap()
            > boundary as u64
    );
}

#[test]
fn workbook_charges_each_reference_to_an_ordinary_shared_note() {
    use std::io::{Cursor, Write};
    use zip::{ZipWriter, write::SimpleFileOptions};
    let note = "Planning for a local science class. ".repeat(8);
    let workbook = r#"<workbook xmlns:r="urn:test"><sheets><sheet name="Class" r:id="r1"/></sheets></workbook>"#;
    let relations = r#"<Relationships><Relationship Id="r1" Target="worksheets/data.xml" Type="urn:test/worksheet"/></Relationships>"#;
    let sheet = format!(
        r#"<worksheet><sheetData><row><c t="inlineStr"><is><t>Note</t></is></c></row>{}</sheetData></worksheet>"#,
        r#"<row><c t="s"><v>0</v></c></row>"#.repeat(20)
    );
    let strings = format!("<sst><si><t>{note}</t></si></sst>");
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    for (path, bytes) in [
        ("xl/workbook.xml", workbook),
        ("xl/_rels/workbook.xml.rels", relations),
        ("xl/worksheets/data.xml", &sheet),
        ("xl/sharedStrings.xml", &strings),
    ] {
        zip.start_file(
            path,
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored),
        )
        .unwrap();
        zip.write_all(bytes.as_bytes()).unwrap();
    }
    let bytes = zip.finish().unwrap().into_inner();
    assert!(bytes.len() < 4096);
    let config = |budget| json!({"format":"xlsx","resource_budget_bytes":budget}).to_string();
    let table = Dataset::open(&bytes, &config(256 * 1024)).unwrap();
    assert_eq!(table.table.rows.len(), 20);
    assert!(table.table.rows.iter().all(|row| row[0].value == note));
    let diagnostics: Value = serde_json::from_str(&table.resource_diagnostics()).unwrap();
    let peak = diagnostics["stage_estimated_high_water_bytes"]["import"]
        .as_u64()
        .unwrap() as usize;
    let constrained = peak - 1;
    assert!(
        constrained >= 64 * 1024 && bytes.len() < max_input_bytes(&config(constrained)).unwrap()
    );
    assert_eq!(
        Dataset::open(&bytes, &config(constrained)).err(),
        Some(MathError::ResourceBudget)
    );
    assert!(Dataset::open(&bytes, &config(peak)).is_ok());
}
