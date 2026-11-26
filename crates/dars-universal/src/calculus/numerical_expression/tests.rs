use super::*;

fn coordinates(x: f64) -> Bindings {
    [x, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
}

#[test]
fn evaluates_safe_functions_and_interval_support() {
    let point = coordinates(2.0);
    for (text, expected) in [
        ("x^0", 1.0),
        ("sqrt(x^2)", 2.0),
        ("ln(x)", 2.0_f64.ln()),
        ("exp(x)", 2.0_f64.exp()),
        ("abs(-x)", 2.0),
        ("sin(pi/2)", 1.0),
        ("ln(e)", 1.0),
        ("sin(x)", 2.0_f64.sin()),
        ("cos(x)", 2.0_f64.cos()),
    ] {
        let expression = Expression::parse(text, 1).unwrap();
        assert!(
            (expression.value(&point).unwrap() - expected).abs() < 1e-14,
            "{text}"
        );
        let (lo, hi) = expression.point_range(&point).unwrap();
        assert!(lo <= expected && expected <= hi, "{text}: {lo}..{hi}");
    }
    let absolute = Expression::parse("abs(x)", 1).unwrap();
    assert_eq!(
        absolute.segment(&coordinates(-1.0), &coordinates(1.0)),
        Ok(true)
    );
    let sine = Expression::parse("sin(x)", 1).unwrap();
    assert_eq!(
        sine.segment(&coordinates(1e8), &coordinates(1e8 + 0.25)),
        Ok(true)
    );
    assert_eq!(
        sine.segment(&coordinates(-3.0), &coordinates(3.0)),
        Ok(false)
    );
}

#[test]
fn rejects_unrepresentable_numbers_and_domain_crossings() {
    assert_eq!(number("1e-200/1e200"), Err(MathError::Limit));
    let underflow_literal = format!("0.{}1e-256", "0".repeat(100));
    assert_eq!(
        Expression::parse(&underflow_literal, 1).err(),
        Some(MathError::Limit)
    );
    for (text, at, error) in [
        ("x^32", 1e-20, MathError::Limit),
        ("exp(x)", -1000.0, MathError::Limit),
        ("1e-200*x", 1e-200, MathError::Limit),
        ("ln(x)", 0.0, MathError::Domain),
        ("x^0", 0.0, MathError::Domain),
        ("sqrt(x)", -1.0, MathError::Domain),
    ] {
        let expression = Expression::parse(text, 1).unwrap();
        assert_eq!(expression.value(&coordinates(at)), Err(error), "{text}");
    }
    let overflow = Expression::parse("x^2*x^2", 1).unwrap();
    assert_eq!(
        overflow.segment(&coordinates(1e90), &coordinates(2e90)),
        Err(MathError::Limit)
    );
    let tangent = Expression::parse("tan(x)", 1).unwrap();
    assert_eq!(
        tangent.segment(&coordinates(1.0), &coordinates(2.0)),
        Err(MathError::Domain)
    );
}

#[cfg(feature = "optimization")]
#[test]
fn checks_analytic_derivatives_and_rejects_cusps() {
    let at = coordinates(2.0);
    for (text, expected) in [
        ("sin(x)", 2.0_f64.cos()),
        ("cos(x)", -2.0_f64.sin()),
        ("exp(x)", 2.0_f64.exp()),
        ("ln(x)", 0.5),
        ("sqrt(x)", 0.5 / 2.0_f64.sqrt()),
        ("abs(-x)", 1.0),
    ] {
        let expression = Expression::parse(text, 1).unwrap();
        assert!(
            (expression.derivative(&at, 0).unwrap() - expected).abs() < 1e-14,
            "{text}"
        );
    }
    let cusp = Expression::parse("sqrt(x^2)", 1).unwrap();
    assert_eq!(
        cusp.derivative(&coordinates(0.0), 0),
        Err(MathError::NoConvergence)
    );
    assert_eq!(cusp.value(&coordinates(0.0)), Ok(0.0));
}
