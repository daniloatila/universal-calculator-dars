use dars_core::{Error, Evaluation, evaluate, evaluate_json};
use serde_json::{Value, json};

fn check(expression: &str, exact: Option<&str>, approximate: &str) {
    assert_eq!(
        evaluate(expression),
        Evaluation::Value {
            ok: true,
            exact: exact.map(String::from),
            approximate: approximate.into(),
        },
        "{expression}"
    );
}

fn check_error(expression: &str, code: Error) {
    assert_eq!(
        evaluate(expression),
        Evaluation::Failure { ok: false, code },
        "{expression}"
    );
}

#[test]
fn decimals_and_fractions_are_exact() {
    for (expression, exact, approximate) in [
        ("0.1 + 0.2", "3/10", "0.3"),
        ("1/3", "1/3", "0.333333333333333333333333"),
        ("-.25 + 1.", "3/4", "0.75"),
        ("1/-7", "-1/7", "-0.142857142857142857142857"),
        ("000.000 + -0", "0", "0"),
        ("9007199254740993-9007199254740992", "1", "1"),
        (
            "2^100",
            "1267650600228229401496703205376",
            "1267650600228229401496700000000",
        ),
    ] {
        check(expression, Some(exact), approximate);
    }
}

#[test]
fn parser_precedence_and_unicode_aliases() {
    for (expression, expected) in [
        ("2+3*4", "14"),
        ("(2+3)*4", "20"),
        ("-2^2", "-4"),
        ("(-2)^2", "4"),
        ("2^3^2", "512"),
        ("20 / 5 * 2 - 7 + 2", "3"),
        ("1 − 2 × (1 + 5) ÷ 4", "-2"),
        ("√9+√(4)", "5"),
        ("\u{2002}2\n\t + 2\u{00a0}", "4"),
    ] {
        check(expression, Some(expected), expected);
    }
}

#[test]
fn percentages_apply_relative_to_a_direct_additive_operand() {
    for (expression, exact, approximate) in [
        ("200 + 10%", "220", "220"),
        ("200 - 10%", "180", "180"),
        ("200 + (-10%)", "180", "180"),
        ("200 + (5 + 5)%", "220", "220"),
        ("200 + 10% * 2", "1001/5", "200.2"),
        ("200 * 10%", "20", "20"),
        ("200 / 10%", "2000", "2000"),
        ("10% - 10%", "9/100", "0.09"),
        ("10%", "1/10", "0.1"),
        ("10%%", "1/1000", "0.001"),
    ] {
        check(expression, Some(exact), approximate);
    }
}

#[test]
fn powers_and_roots_preserve_real_exact_values() {
    for (expression, exact, approximate) in [
        ("sqrt(9 / 16)", "3/4", "0.75"),
        ("sqrt(0)", "0", "0"),
        ("root(81,2+2)", "3", "3"),
        ("cbrt(-27)", "-3", "-3"),
        ("(-8)^(2/3)", "4", "4"),
        ("(-8)^(-1/3)", "-1/2", "-0.5"),
        ("2^-2", "1/4", "0.25"),
        ("4^50%", "2", "2"),
        ("1^0", "1", "1"),
    ] {
        check(expression, Some(exact), approximate);
    }
}

#[test]
fn irrational_results_match_independent_decimal_reference() {
    // Python Decimal at 100 working digits and 24 output digits supplied these values.
    for (expression, expected) in [
        ("sqrt(2)", "1.41421356237309504880169"),
        ("cbrt(-2)", "-1.25992104989487316476721"),
        ("root(2,64)", "1.01088928605170046002041"),
        ("3*sqrt(2)", "4.24264068711928514640507"),
        ("cbrt(2)^100", "10822639409.6809289614864"),
        (
            "sqrt(2) / (10^100)",
            &format!("0.{}141421356237309504880169", "0".repeat(99)),
        ),
    ] {
        check(expression, None, expected);
    }
}

#[test]
fn rounds_half_to_even_and_never_claims_an_uncertain_result() {
    for (expression, expected) in [
        ("1.234567890123456789012345", "1.23456789012345678901234"),
        ("1.234567890123456789012355", "1.23456789012345678901236"),
        ("-1.234567890123456789012355", "-1.23456789012345678901236"),
        ("999999999999999999999999.5", "1000000000000000000000000"),
    ] {
        let Evaluation::Value {
            exact, approximate, ..
        } = evaluate(expression)
        else {
            panic!("valid exact expression rejected: {expression}");
        };
        assert!(exact.is_some());
        assert_eq!(approximate, expected);
    }
    check("sqrt(2) - sqrt(2)", Some("0"), "0");
    check_error("1 / (sqrt(2) - sqrt(2))", Error::DivisionByZero);
    check_error("(1/0) - (1/0)", Error::DivisionByZero);
    check_error("sqrt(2) - sqrt(2.0)", Error::PrecisionLimit);
}

#[test]
fn errors_are_distinct_for_domains_syntax_and_limits() {
    for (expression, code) in [
        ("  ", Error::EmptyExpression),
        ("2 call(4)", Error::InvalidCharacter),
        ("2.0.3", Error::InvalidNumber),
        ("(2+3", Error::MissingParenthesis),
        ("1**2", Error::UnexpectedToken),
        ("1 2", Error::UnexpectedToken),
        ("2(3)", Error::UnexpectedToken),
        ("1 / (2 - 2)", Error::DivisionByZero),
        ("0^-2", Error::DivisionByZero),
        ("sqrt(-1)", Error::DomainError),
        ("root(16,2.5)", Error::DomainError),
        ("root(16,65)", Error::DomainError),
        ("0^0", Error::DomainError),
        ("(-16)^(1/4)", Error::DomainError),
        ("3^sqrt(2)", Error::UnsupportedExponent),
        ("2^(1/65)", Error::UnsupportedExponent),
        ("2^10001", Error::UnsupportedExponent),
        ("2^10000", Error::MagnitudeLimit),
    ] {
        check_error(expression, code);
    }
    check_error(&"2".repeat(257), Error::InputLimit);
    check_error(&format!("{}1", " ".repeat(4096)), Error::InputLimit);
    check_error(
        &format!("{}1{}", "(".repeat(48), ")".repeat(48)),
        Error::ComplexityLimit,
    );
    check_error(&format!("{}1", "1+".repeat(128)), Error::ComplexityLimit);
}

#[test]
fn bounded_generated_rational_and_root_identities() {
    for x in -16i32..=16 {
        for y in 1i32..=8 {
            let expected = (x + 3 * y).to_string();
            let expression = format!("(({x}/{y})+3)*{y}");
            check(&expression, Some(&expected), &expected);
        }
        let expected = x.to_string();
        check(&format!("cbrt({x}^3)"), Some(&expected), &expected);
    }
}

#[test]
fn native_serialization_contract() {
    for (expression, expected) in [
        (
            "0.1+0.2",
            json!({"ok":true,"exact":"3/10","approximate":"0.3"}),
        ),
        (
            "sqrt(2)",
            json!({"ok":true,"exact":null,"approximate":"1.41421356237309504880169"}),
        ),
        ("1/0", json!({"ok":false,"code":"division_by_zero"})),
    ] {
        assert_eq!(
            serde_json::from_str::<Value>(&evaluate_json(expression)).unwrap(),
            expected
        );
    }
}

#[test]
fn bounded_mutation_fuzz_preserves_json_and_never_panics() {
    const FRAGMENTS: [&str; 21] = [
        "1", "2", "0", "+", "-", "*", "/", "%", "^", "(", ")", ".", ",", "√", "root", "sqrt",
        "cbrt", "🧮", "\0", " ", "\u{202e}",
    ];
    let mut state = 0xe482_17d1_u32;
    let mut random = || {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        state as usize
    };
    for index in 0..2500 {
        let mut input = String::from(["0.1+0.2", "root(-8,3)/4", "(2^3+sqrt(2))*5%"][index % 3]);
        for _ in 0..=(random() % 8) {
            let offset = random() % (input.chars().count() + 1);
            let (byte_offset, character) = input
                .char_indices()
                .nth(offset)
                .unwrap_or((input.len(), ' '));
            if random() & 1 == 1 && byte_offset != input.len() {
                input.replace_range(byte_offset..byte_offset + character.len_utf8(), "");
            } else {
                input.insert_str(byte_offset, FRAGMENTS[random() % FRAGMENTS.len()]);
            }
        }
        let result: Value =
            serde_json::from_str(&evaluate_json(&input)).expect("valid JSON for all input");
        if result["ok"].as_bool().expect("stable status for all input") {
            assert!(result["approximate"].is_string());
            assert!(result["exact"].is_string() || result["exact"].is_null());
        } else {
            assert!(result["code"].is_string());
        }
    }
}
