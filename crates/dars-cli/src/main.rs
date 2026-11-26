use std::process::ExitCode;

fn main() -> ExitCode {
    let mut args = std::env::args_os().skip(1);
    let Some(expression) = args.next() else {
        eprintln!("Usage: dars \"EXPRESSION\"");
        return ExitCode::from(2);
    };
    if expression == "dataset" || expression == "dataset-replay" {
        return dataset(args, expression == "dataset-replay");
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
                "Usage: dars \"EXPRESSION\"\n       dars tool \"REQUEST_JSON\"\n       dars standard-record \"EXPRESSION\" [\"BINDINGS_JSON\"]\n       dars dataset SETTINGS_JSON [--page OFFSET LENGTH] < source-file\n       dars dataset-replay DESCRIPTOR_JSON [--page OFFSET LENGTH] < source-file\nPrint a DARS result as JSON."
            )
        }
        "-V" | "--version" => println!("dars {}", env!("CARGO_PKG_VERSION")),
        _ => return emit(dars_core::evaluate_json(expression)),
    }
    ExitCode::SUCCESS
}

fn dataset(args: impl Iterator<Item = std::ffi::OsString>, replay: bool) -> ExitCode {
    use dars_universal::data_lab::{Dataset, max_input_bytes, max_replay_input_bytes};
    use std::io::Read;

    let args: Vec<_> = args.collect();
    let usage = || {
        eprintln!("Usage: dars dataset SETTINGS_JSON [--page OFFSET LENGTH] < source-file");
        eprintln!(
            "       dars dataset-replay DESCRIPTOR_JSON [--page OFFSET LENGTH] < source-file"
        );
        ExitCode::from(2)
    };
    let Some(options) = args.first().and_then(|value| value.to_str()) else {
        return usage();
    };
    let page = match args.as_slice() {
        [_] => None,
        [_, flag, offset, length] if flag == "--page" => {
            let index = |s: &std::ffi::OsString| s.to_str()?.parse::<usize>().ok();
            let (Some(offset), Some(length)) = (index(offset), index(length)) else {
                return usage();
            };
            Some((offset, length))
        }
        _ => return usage(),
    };
    let result = (|| {
        let max_bytes = if replay {
            max_replay_input_bytes(options)?
        } else {
            max_input_bytes(options)?
        };
        let mut bytes = Vec::new();
        std::io::stdin()
            .lock()
            .take(max_bytes as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| dars_universal::MathError::InvalidInput)?;
        let table = if replay {
            Dataset::replay(&bytes, options)?
        } else {
            Dataset::open(&bytes, options)?
        };
        if let Some((offset, length)) = page {
            table.page(offset, length)
        } else {
            table.proof()
        }
    })();
    match result {
        Ok(output) => {
            println!("{output}");
            ExitCode::SUCCESS
        }
        Err(code) => emit(serde_json::json!({"ok":false,"code":code}).to_string()),
    }
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
