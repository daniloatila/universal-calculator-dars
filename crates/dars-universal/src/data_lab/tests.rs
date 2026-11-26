use super::*;
fn table(csv: &str, options: Value) -> Dataset {
    Dataset::open(csv.as_bytes(), &options.to_string()).unwrap()
}
fn summary(t: &Dataset) -> Value {
    t.summary().unwrap()
}

#[test]
fn all_transformations_and_exact_profile() {
    let t = table(
        "id,price,cat\n001,2.10, X \n002,1.20, X \n002,1.20, X \n003,, y \n",
        json!({
        "types":{"price":"decimal"},"steps":[
        {"op":"deduplicate","columns":["id"]},{"op":"fill_missing","column":"price","value":"0"},
        {"op":"text","column":"cat","transform":"trim","name":"category"},{"op":"text","column":"category","transform":"lowercase","name":"key"},
        {"op":"calculate","left":{"column":"price"},"operator":"multiply","right":{"constant":"2"},"name":"total"},
        {"op":"sort","column":"total","descending":true},{"op":"rename","column":"total","name":"amount"},
        {"op":"select","columns":["id","amount","key"]},{"op":"join","column":"id","name":"region","lookup":[["001","North"],["002","North"]],"mode":"inner"},
        {"op":"filter","column":"amount","compare":"ge","value":"2"},{"op":"group","by":"region","column":"amount","aggregate":"sum","name":"sum"}]}),
    );
    assert_eq!(t.table.rows[0][1].value, "33/5");
    assert_eq!(summary(&t)["rows"], 1);
    assert_eq!(t.trace.len(), 11);
}
#[test]
fn exact_integers_null_empty_invalid_and_fractional_precision() {
    let t = table(
        r#"[{"a":9007199254740993,"b":null},{"a":9007199254740994,"b":""},{"a":"NaN"}]"#,
        json!({"format":"json","types":{"a":"integer"},"analysis":{"x":"a","y":"a"}}),
    );
    let s = summary(&t);
    assert_eq!(s["profile"][0]["statistics"]["sum"], "18014398509481987");
    assert_eq!(s["analysis"]["pearson"]["r_squared"], "1");
    for origin in ["null", "empty", "absent"] {
        assert_eq!(s["profile"][1]["origins"][origin], 1);
    }
    assert_eq!(s["profile"][0]["origins"]["invalid"], 1);
}
#[test]
fn notation_decoding_and_header_rules() {
    let t = Dataset::open(
        b"id;v\n001;2,50\n",
        r#"{"delimiter":";","decimal":"comma","types":{"v":"decimal"}}"#,
    )
    .unwrap();
    assert_eq!(summary(&t)["profile"][1]["statistics"]["sum"], "5/2");
    assert_eq!(t.table.rows[0][0].value, "001");
    for be in [false, true] {
        let bytes = "id\tvalue\n00\tété"
            .encode_utf16()
            .flat_map(|u| if be { u.to_be_bytes() } else { u.to_le_bytes() })
            .collect::<Vec<_>>();
        let t = Dataset::open(
            &bytes,
            &json!({"format":"tsv","encoding":if be{"utf16be"}else{"utf16le"}}).to_string(),
        )
        .unwrap();
        assert_eq!(t.table.rows[0][1].value, "été");
    }
    let t = Dataset::open(b"id\n\xe9", r#"{"encoding":"latin1"}"#).unwrap();
    assert_eq!(t.table.rows[0][0].value, "é");
    assert_eq!(
        table("1,2\n3,4", json!({"header":"detect"})).table.columns[0].name,
        "c1"
    );
    assert_eq!(
        table("a,b\n3,4", json!({"header":"detect"})).table.columns[0].name,
        "a"
    );
}
#[test]
fn manifest_binds_source_and_export_keeps_literals_explicit() {
    let t = table("id\n+123\n", json!({}));
    let proof: Value = serde_json::from_str(&t.proof().unwrap()).unwrap();
    assert_eq!(
        proof["proof"]["variables"]["sha256"],
        format!("{:x}", Sha256::digest(b"id\n+123\n"))
    );
    assert_eq!(t.export_csv(true).unwrap(), b"id\n'+123\n");
    assert_eq!(t.export_csv(false).unwrap(), b"id\n+123\n");
    assert!(t.page(2, 1).is_err());
    assert!(t.page(0, 101).is_err());
    let p: Value = serde_json::from_str(&t.page(0, 1).unwrap()).unwrap();
    assert_eq!(p["rows"][0][0]["value"], "+123");
}
#[test]
fn bounds_and_typed_errors() {
    for (data, settings) in [
        ("a,a\n1,2", "{}"),
        ("a,b\n1", "{}"),
        ("", "{}"),
        ("a", r#"{"header":"bad"}"#),
        ("[{\"v\":[1]}]", r#"{"format":"json"}"#),
        ("[{\"a\":1,\"a\":2}]", r#"{"format":"json"}"#),
        ("a\n1", r#"{"steps":[{"op":"sort","column":"missing"}]}"#),
        (
            "a\n1",
            r#"{"steps":[{"op":"join","column":"a","name":"b","mode":"inner","lookup":[["a","1"],["a","2"]]}]}"#,
        ),
        ("a\n1", r#"{"steps":[{"op":"select","columns":["a","a"]}]}"#),
        ("a", r#"{"format":"xlsx"}"#),
        ("x", r#"{"analysis":{"x":"x"},"types":{"y":"integer"}}"#),
        ("x", r#"{"delimiter":"@"}"#),
    ] {
        assert!(
            Dataset::open(data.as_bytes(), settings).is_err(),
            "{settings}"
        );
    }
    assert!(Dataset::open(&[255], "{}").is_err());
    assert!(Dataset::open(&vec![0; MAX_FILE + 1], "{}").is_err());
    assert!(Dataset::open(format!("a\n{}", "x".repeat(MAX_FIELD + 1)).as_bytes(), "{}").is_err());
}
#[test]
fn operations_handle_degeneracies() {
    let t = table(
        "v,d,t,b\n0,2024-02-29,03:01:59,true\n1,2023-02-29,99:00,maybe\n",
        json!({"types":{"v":"integer","d":"date","t":"time","b":"boolean"},
        "steps":[{"op":"calculate","left":{"constant":"1"},"operator":"divide","right":{"column":"v"},"name":"reciprocal"}]}),
    );
    let s = summary(&t);
    for i in 1..=4 {
        assert_eq!(s["profile"][i]["origins"]["invalid"], 1);
    }
    let t = table(
        "a\n0\n0\n0\n0\n10",
        json!({"types":{"a":"decimal"},"analysis":{"x":"a","y":"a"}}),
    );
    assert_eq!(summary(&t)["analysis"]["outliers"], 1);
}
