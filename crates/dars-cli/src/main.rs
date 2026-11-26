use std::process::ExitCode;

fn main() -> ExitCode {
    let mut args = std::env::args_os().skip(1);
    let Some(expression) = args.next() else {
        eprintln!("Usage: dars \"EXPRESSION\"");
        return ExitCode::from(2);
    };
    if expression == "dataset" {
        use std::io::Read;
        let settings = args.next();
        if let Some(config) = settings.as_deref().and_then(std::ffi::OsStr::to_str)
            && args.next().is_none()
        {
            let mut bytes = Vec::new();
            let result = std::io::stdin()
                .lock()
                .take(16 * 1024 * 1024 + 1)
                .read_to_end(&mut bytes);
            if result.is_err() {
                return emit(serde_json::json!({"ok":false,"code":"invalid_input"}).to_string());
            }
            let proof = dars_universal::data_lab::Dataset::open(&bytes, config)
                .and_then(|table| table.proof());
            return emit(
                proof
                    .unwrap_or_else(|code| serde_json::json!({"ok":false,"code":code}).to_string()),
            );
        }
        eprintln!("Usage: dars dataset SETTINGS_JSON < source-file");
        return ExitCode::from(2);
    }
    if expression == "tool" {
        let request = args.next();
        if let Some(request) = request.as_deref().and_then(std::ffi::OsStr::to_str)
            && args.next().is_none()
        {
            return emit(dars_universal::evaluate_tool_json(request));
        }
        eprintln!("Usage: dars tool \"REQUEST_JSON\"");
        return ExitCode::from(2);
    }
    if expression == "standard-record" {
        let input = args.next();
        let bindings = args.next();
        let input = input.as_deref().and_then(std::ffi::OsStr::to_str);
        let bindings = bindings
            .as_deref()
            .map_or(Some("{}"), std::ffi::OsStr::to_str);
        if let (Some(input), Some(bindings), None) = (input, bindings, args.next()) {
            return emit(dars_core::evaluate_value_record_json(input, bindings));
        }
        eprintln!("Usage: dars standard-record \"EXPRESSION\" [\"BINDINGS_JSON\"]");
        return ExitCode::from(2);
    }
    if args.next().is_some() {
        eprintln!("Pass the complete expression as one argument.");
        return ExitCode::from(2);
    }
    let Some(expression) = expression.to_str() else {
        eprintln!("The expression must be valid Unicode.");
        return ExitCode::from(2);
    };
    match expression {
        "-h" | "--help" => {
            println!(
                "Usage: dars \"EXPRESSION\"\n       dars tool \"REQUEST_JSON\"\n       dars standard-record \"EXPRESSION\" [\"BINDINGS_JSON\"]\n       dars dataset SETTINGS_JSON < source-file\nPrint a DARS result as JSON."
            )
        }
        "-V" | "--version" => println!("dars {}", env!("CARGO_PKG_VERSION")),
        _ => return emit(dars_core::evaluate_json(expression)),
    }
    ExitCode::SUCCESS
}

fn emit(output: String) -> ExitCode {
    let result: serde_json::Value =
        serde_json::from_str(&output).expect("the engine returns a JSON result");
    println!("{output}");
    if result.get("ok") == Some(&serde_json::Value::Bool(true)) {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
