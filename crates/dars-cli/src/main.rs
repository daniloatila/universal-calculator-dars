use std::process::ExitCode;

fn main() -> ExitCode {
    let mut args = std::env::args_os().skip(1);
    let Some(expression) = args.next() else {
        eprintln!("Usage: dars \"EXPRESSION\"");
        return ExitCode::from(2);
    };
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
            println!("Usage: dars \"EXPRESSION\"\nPrint a DARS Standard result as JSON.")
        }
        "-V" | "--version" => println!("dars {}", env!("CARGO_PKG_VERSION")),
        _ => {
            let output = dars_core::evaluate_json(expression);
            let result: serde_json::Value =
                serde_json::from_str(&output).expect("the engine returns a JSON result");
            println!("{output}");
            if result.get("ok") != Some(&serde_json::Value::Bool(true)) {
                return ExitCode::FAILURE;
            }
        }
    }
    ExitCode::SUCCESS
}
