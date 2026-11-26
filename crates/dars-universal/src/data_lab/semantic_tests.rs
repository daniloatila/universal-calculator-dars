use super::*;

fn page(dataset: &Dataset) -> Value {
    serde_json::from_str(&dataset.page(0, 100).unwrap()).unwrap()
}

fn proof(dataset: &Dataset) -> Value {
    serde_json::from_str(&dataset.proof().unwrap()).unwrap()
}

#[test]
fn native_json_and_regional_text_are_exact_across_successive_casts() {
    let input = br#"[{"code":"00017","x":1.25},{"x":"2,50"},{"x":9007199254740993e-1},
        {"x":0},{"x":""},{"x":null},{},{"x":"2.50"}]"#;
    let settings = r#"{"format":"json","decimal":"comma","types":{"x":"integer"},"steps":[
        {"op":"cast","column":"x","kind":"text"},{"op":"cast","column":"x","kind":"decimal"}]}"#;
    let dataset = Dataset::open(input, settings).unwrap();
    let rows = page(&dataset)["rows"].as_array().unwrap().clone();
    assert_eq!(rows[0][0]["canonical"], "00017");
    assert_eq!(rows[0][1]["value"], "1.25");
    assert_eq!(rows[0][1]["source_type"], "number");
    assert_eq!(rows[0][1]["canonical"], "5/4");
    assert_eq!(rows[1][1]["notation"], "text_comma");
    assert_eq!(rows[1][1]["canonical"], "5/2");
    assert_eq!(rows[2][1]["canonical"], "9007199254740993/10");
    assert_eq!(rows[3][1]["canonical"], "0");
    for (index, state) in [(4, "empty"), (5, "null"), (6, "absent"), (7, "invalid")] {
        assert_eq!(rows[index][1]["validity"], state);
        assert!(rows[index][1]["canonical"].is_null());
    }
    assert_eq!(rows[7][1]["source_origin"], "stored");
    let result = dataset.summary().unwrap();
    assert_eq!(
        result["profile"][1]["statistics"]["sum"],
        "18014398509482061/20"
    );
    assert_eq!(result["profile"][1]["statistics"]["n"], 4);
}

#[test]
fn canonical_numeric_pipeline_keys_and_derived_values_keep_separate_grammars() {
    let input = br#"[{"x":1.25},{"x":"1,250"},{"x":"2,5"},{"x":null},{"x":-2}]"#;
    let settings = r#"{"format":"json","decimal":"comma","types":{"x":"decimal"},"steps":[
        {"op":"fill_missing","column":"x","value":"3,75"},
        {"op":"filter","column":"x","compare":"ge","value":"1,25"},
        {"op":"deduplicate","columns":["x"]},
        {"op":"sort","column":"x","descending":true},
        {"op":"join","column":"x","name":"name","lookup":[["1,2500","001"],["2,50","002"]],"mode":"left"},
        {"op":"calculate","left":{"column":"x"},"operator":"divide","right":{"constant":"3"},"name":"third"}]}"#;
    let dataset = Dataset::open(input, settings).unwrap();
    let result = page(&dataset);
    let rows = result["rows"].as_array().unwrap();
    assert_eq!(rows.len(), 3);
    assert_eq!(
        rows[0][0]["derivation"],
        json!({"operation":"fill_missing","from_missing":"null"})
    );
    assert_eq!(rows[0][0]["canonical"], "15/4");
    assert_eq!(rows[0][1]["validity"], "absent");
    assert_eq!(rows[1][1]["canonical"], "002");
    assert_eq!(rows[2][1]["canonical"], "001");
    assert_eq!(rows[2][2]["canonical"], "5/12");
    assert_eq!(rows[2][2]["notation"], "canonical");
    assert_eq!(rows[2][2]["derivation"]["operation"], "calculate");
    assert_eq!(
        dataset.summary().unwrap()["profile"][2]["statistics"]["sum"],
        "5/2"
    );

    let settings = r#"{"format":"json","decimal":"comma","types":{"x":"decimal"},"steps":[
        {"op":"group","by":"x","column":"x","aggregate":"sum","name":"total"}]}"#;
    let grouped = Dataset::open(input, settings).unwrap();
    let grouped_page = page(&grouped);
    let same_key = grouped_page["rows"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row[0]["canonical"] == "5/4")
        .unwrap();
    assert_eq!(same_key[0]["value"], "1.25");
    assert_eq!(same_key[1]["canonical"], "5/2");
    assert_eq!(same_key[1]["derivation"]["operation"], "group");

    let duplicated = r#"{"format":"json","decimal":"comma","types":{"x":"decimal"},"steps":[
        {"op":"join","column":"x","name":"name","lookup":[["1,25","A"],["1,250","B"]],"mode":"left"}]}"#;
    assert!(matches!(
        Dataset::open(input, duplicated),
        Err(MathError::InvalidInput)
    ));
}

#[test]
fn canonical_v2_recipe_reproduces_proof_and_rejects_v1_and_divergence() {
    let input = br#"[{"x":1.25},{"x":"2,50"}]"#;
    let dataset = Dataset::open(
        input,
        r#"{"format":"json","decimal":"comma","types":{"x":"decimal"}}"#,
    )
    .unwrap();
    let value = proof(&dataset);
    let evidence = &value["proof"];
    assert_eq!(evidence["algorithm_version"], "data-lab/2");
    let recipe = evidence["normalized"].as_str().unwrap();
    let v2: Value = serde_json::from_str(recipe).unwrap();
    assert_eq!(v2["semantics_version"], 2);
    assert_eq!(
        v2["resource_policy"]["limit_bytes"],
        v2["configuration"]["resource_budget_bytes"]
    );
    assert_eq!(
        Dataset::replay(input, recipe).unwrap().proof().unwrap(),
        dataset.proof().unwrap()
    );
    assert!(max_replay_input_bytes(recipe).unwrap() >= input.len());
    assert!(matches!(
        Dataset::replay(b"[]", recipe),
        Err(MathError::InvalidInput)
    ));
    let legacy = json!({"sha256":v2["sha256"],"configuration":{"format":"json","decimal":"comma"}})
        .to_string();
    assert!(matches!(
        max_replay_input_bytes(&legacy),
        Err(MathError::Unsupported)
    ));
    assert!(matches!(
        Dataset::replay(input, &legacy),
        Err(MathError::Unsupported)
    ));
    let mut changed = v2;
    changed["resource_policy"]["limit_bytes"] = json!(1);
    assert!(matches!(
        Dataset::replay(input, &changed.to_string()),
        Err(MathError::InvalidInput)
    ));
}

#[test]
fn replay_rejects_incompatible_policy_and_checks_bound_before_hashing() {
    let input = b"id\n00017\n";
    let dataset = Dataset::open(input, "{}").unwrap();
    let original = proof(&dataset);
    let mut recipe: Value =
        serde_json::from_str(original["proof"]["normalized"].as_str().unwrap()).unwrap();
    recipe["sha256"] = json!("short digest");
    assert!(matches!(
        max_replay_input_bytes(&recipe.to_string()),
        Err(MathError::InvalidInput)
    ));
    recipe["sha256"] = json!(format!("{:x}", Sha256::digest(input)));
    recipe["resource_policy"]["model"] = json!("unknown-estimator");
    assert!(matches!(
        Dataset::replay(input, &recipe.to_string()),
        Err(MathError::Unsupported)
    ));
    recipe["resource_policy"]["model"] = json!(budget::MODEL);
    recipe["resource_policy"]["limit_bytes"] = json!(65536);
    recipe["configuration"]["resource_budget_bytes"] = json!(65536);
    let descriptor = recipe.to_string();
    let max_length = max_replay_input_bytes(&descriptor).unwrap();
    let oversized = vec![b'x'; max_length + 1];
    assert!(matches!(
        Dataset::replay(&oversized, &descriptor),
        Err(MathError::ResourceBudget)
    ));
    assert!(matches!(
        max_replay_input_bytes(&" ".repeat(MAX_RECIPE + 1)),
        Err(MathError::Limit)
    ));
    assert!(matches!(
        Dataset::open(input, r#"{"semantics_version":1}"#),
        Err(MathError::Unsupported)
    ));
}

#[test]
fn exact_derivation_limits_fail_explicitly_after_successful_smaller_values() {
    let input = br#"[{"active":true,"x":1e256},{"active":false,"x":false}]"#;
    let mut settings =
        json!({"format":"json","types":{"active":"boolean","x":"decimal"},"steps":[]});
    let steps = settings["steps"].as_array_mut().unwrap();
    for (from, to) in [
        ("x", "product_2"),
        ("product_2", "product_3"),
        ("product_3", "product_4"),
    ] {
        steps.push(json!({"op":"calculate","left":{"column":from},"operator":"multiply","right":{"constant":"1e256"},"name":to}));
    }
    let dataset = Dataset::open(input, &settings.to_string()).unwrap();
    let output = page(&dataset);
    assert_eq!(output["rows"][0][0]["canonical"], "true");
    assert_eq!(output["rows"][1][1]["validity"], "invalid");
    assert_eq!(
        output["rows"][0][4]["canonical"],
        format!("1{}", "0".repeat(1024))
    );
    settings["analysis"] = json!({"x":"product_4","y":"product_4"});
    let analyzed = Dataset::open(input, &settings.to_string()).unwrap();
    assert!(matches!(analyzed.proof(), Err(MathError::Limit)));
    settings["analysis"] = Value::Null;
    settings["steps"].as_array_mut().unwrap().push(json!({"op":"calculate","left":{"column":"product_4"},"operator":"multiply","right":{"constant":"1e256"},"name":"product_5"}));
    assert!(matches!(
        Dataset::open(input, &settings.to_string()),
        Err(MathError::Limit)
    ));
}
