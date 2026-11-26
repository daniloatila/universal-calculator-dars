use super::*;

fn dataset(config: Value) -> Checked<Dataset> {
    Dataset::open(
        b"id,v,tag\na,5,alpha\nb,,beta\nc,NaN,gamma\nd,2,delta\n",
        &config.to_string(),
    )
}

#[test]
fn safe_integer_math_and_missing_semantics() {
    for (op, expected) in [
        ("add", "7"),
        ("subtract", "3"),
        ("multiply", "10"),
        ("divide", "5/2"),
    ] {
        let data=dataset(json!({"types":{"v":"decimal"},"steps":[
            {"op":"calculate","left":{"column":"v"},"right":{"constant":"2"},"operator":op,"name":"out"}]})).unwrap();
        assert_eq!(data.table.rows[0][3].value, expected);
        assert_eq!(data.table.rows[1][3].origin, Origin::Null);
        assert_eq!(data.table.rows[2][3].origin, Origin::Invalid);
    }
    let data = dataset(
        json!({"types":{"v":"decimal"},"steps":[{"op":"cast","column":"v","kind":"text"}]}),
    )
    .unwrap();
    assert_eq!(data.table.rows[2][1].origin, Origin::Stored);
    assert_eq!(data.table.rows[2][1].value, "NaN");
}
#[test]
fn missing_keys_sort_and_join_without_multiplying_rows() {
    let data=dataset(json!({"steps":[{"op":"join","column":"id","name":"match","mode":"left","lookup":[["d","row"]]},
        {"op":"text","column":"match","name":"upper","transform":"uppercase"},
        {"op":"drop_missing","column":"upper"},{"op":"sort","column":"tag"}]})).unwrap();
    assert_eq!(data.table.rows.len(), 1);
    assert_eq!(data.table.rows[0][4].value, "ROW");
    let data =
        dataset(json!({"types":{"v":"decimal"},"steps":[{"op":"sort","column":"v"}]})).unwrap();
    assert_eq!(data.table.rows[3][1].value, "5");
    let result = data.summary().unwrap();
    assert_eq!(result["source_columns"][1]["kind"], "decimal");
}
#[test]
fn profile_only_and_degenerate_distributions() {
    let options = Map::from_iter([(
        "configuration".into(),
        json!("{\"types\":{\"id\":\"text\"}}"),
    )]);
    assert!(evaluate("profile", "id\nx", &options).is_ok());
    assert!(matches!(
        evaluate("other", "", &options),
        Err(MathError::Unsupported)
    ));
    for wrong in [json!({"other":0}), json!({"configuration":false})] {
        assert!(evaluate("profile", "id", wrong.as_object().unwrap()).is_err())
    }
    let zero = Dataset::open(
        b"a,b\nX,2\n",
        r#"{"types":{"a":"integer","b":"integer"},"analysis":{"x":"a","y":"b"}}"#,
    )
    .unwrap();
    assert_eq!(zero.summary().unwrap()["analysis"]["n"], 0);
    let constant = Dataset::open(
        b"a,b\n3,10\n3,8",
        r#"{"types":{"a":"integer","b":"integer"},"analysis":{"x":"a","y":"b"}}"#,
    )
    .unwrap();
    let a = &constant.summary().unwrap()["analysis"];
    assert_eq!(a["histogram"][0], 2);
    assert!(a["pearson"].is_null());
    let data = Dataset::open(
        b"a,b\n3,5\n4,4\n6,2",
        r#"{"types":{"a":"integer","b":"integer"},"analysis":{"x":"a","y":"b"}}"#,
    )
    .unwrap();
    let a = &data.summary().unwrap()["analysis"];
    assert_eq!(a["pearson"]["sign"], -1);
    assert_eq!(a["median"], "4");
}
#[test]
fn incompatible_transformation_schema_is_explicit() {
    let bad = [
        json!({"op":"select","columns":[]}),
        json!({"op":"rename","column":"v","name":"id"}),
        json!({"op":"calculate","left":{"column":"tag"},"right":{"constant":"2"},"operator":"add","name":"new"}),
        json!({"op":"group","by":"id","column":"tag","aggregate":"mean","name":"result"}),
        json!({"op":"group","by":"id","column":"v","aggregate":"count","name":"id"}),
        json!({"op":"fill_missing","column":"v","value":"oops"}),
        json!({"op":"text","column":"tag","name":"id","transform":"uppercase"}),
    ];
    for step in bad {
        assert!(dataset(json!({"types":{"v":"decimal"},"steps":[step]})).is_err());
    }
    assert!(
        dataset(json!({"analysis":{"x":"tag"}}))
            .unwrap()
            .proof()
            .is_err()
    );
}
#[test]
fn malformed_and_bounded_sources() {
    assert!(Dataset::open(b"[{\"a\":1},{\"b\":1}]", r#"{"format":"json"}"#).is_err());
    assert!(Dataset::open(b"[]", r#"{"format":"json"}"#).is_err());
    assert!(Dataset::open(&[65], r#"{"encoding":"utf16be"}"#).is_err());
    let cols = (0..65)
        .map(|n| format!("c{n}"))
        .collect::<Vec<_>>()
        .join(",");
    assert!(Dataset::open(cols.as_bytes(), "{}").is_err());
    let steps = vec![json!({"op":"sort","column":"id"}); 33];
    assert!(dataset(json!({"steps":steps})).is_err());
    assert!(Dataset::open(b"a", &" ".repeat(16385)).is_err());
    let data = Dataset::open(
        b"id\n2.0",
        r#"{"types":{"id":"decimal"},"decimal":"comma"}"#,
    )
    .unwrap();
    assert_eq!(data.table.rows[0][0].origin, Origin::Invalid);
}
