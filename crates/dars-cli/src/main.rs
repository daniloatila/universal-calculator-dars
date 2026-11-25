use std::process::ExitCode;

fn main() -> ExitCode {
    let mut args = std::env::args_os().skip(1);
    let Some(expression) = args.next() else {
        eprintln!("Usage: dars \"EXPRESSION\"");
        return ExitCode::from(2);
    };
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
                "Usage: dars \"EXPRESSION\"\n       dars tool \"REQUEST_JSON\"\nPrint a DARS result as JSON."
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
