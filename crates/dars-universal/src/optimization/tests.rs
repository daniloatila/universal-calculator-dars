use super::*;
use serde_json::json;

fn solve(operation: &str, input: &str, options: Value) -> Value {
    let result = evaluate(operation, input, options.as_object().unwrap()).unwrap();
    serde_json::from_str(&result.result).unwrap()
}

fn reason(operation: &str, input: &str, options: Value, expected: &str) {
    let result = solve(operation, input, options);
    assert_eq!(result["reason"], expected, "{operation}: {input}: {result}");
}

#[test]
fn bracket_endpoints_and_machine_resolution_are_reported() {
    for (expression, root) in [("x", 0.0), ("x-2", 2.0)] {
        let output = solve("bisection", expression, json!({"lower":"0","upper":"2"}));
        assert_eq!(output["point"], json!([root]));
        assert_eq!(output["iterations"], 0);
        assert_eq!(output["status"], "converged");
    }
    reason(
        "hybrid",
        "x^2-2",
        json!({"lower":"0","upper":"2","initial":"3"}),
        "initial_outside_bracket",
    );
    reason(
        "bisection",
        "x-1e12+0.00005",
        json!({"lower":"999999999999.9998779296875","upper":"1e12"}),
        "floating_point_resolution",
    );
    reason(
        "bisection",
        "exp(-1000*(1-x*x))*(x-0.1)",
        json!({"lower":"-1","upper":"1"}),
        "undefined_iterate",
    );
}

#[test]
fn unbracketed_search_handles_hazards_and_iteration_limits() {
    for (operation, expression, options, expected) in [
        (
            "secant",
            "ln(x)",
            json!({"initial":"2","second":"-1"}),
            "undefined_initial_point",
        ),
        (
            "secant",
            "x-2",
            json!({"initial":"9","second":"2"}),
            "zero_sample",
        ),
        (
            "newton",
            "1-1e-13*x",
            json!({"initial":"0"}),
            "iterate_outside_numeric_limits",
        ),
        (
            "newton",
            "x-1e12+0.00005",
            json!({"initial":"1e12"}),
            "floating_point_resolution",
        ),
        (
            "newton",
            "1/x-2",
            json!({"initial":"1"}),
            "domain_continuity_unresolved",
        ),
        (
            "newton",
            "x+exp(-1000*(1-x*x))*(x-1)^2",
            json!({"initial":"1"}),
            "undefined_iterate",
        ),
        (
            "newton",
            "x^2-2",
            json!({"initial":"1","max_iterations":1}),
            "maximum_iterations",
        ),
        (
            "minimize_univariate",
            "(x-3)^2+2",
            json!({"lower":"0","upper":"5","max_iterations":1}),
            "maximum_iterations",
        ),
        (
            "maximize_univariate",
            "1/(x-1)",
            json!({"lower":"0","upper":"2"}),
            "domain_continuity_unresolved",
        ),
    ] {
        reason(operation, expression, options, expected);
    }
}

#[test]
fn multidimensional_diagnostics_distinguish_stalls_and_bounds() {
    for (operation, expression, options, expected) in [
        ("bfgs", "abs(x)+y^2", json!({}), "undefined_gradient"),
        (
            "bfgs",
            "-x^2+y^2",
            json!({"initial":"1e12"}),
            "iterate_outside_numeric_limits",
        ),
        (
            "bfgs",
            "1e16+x^2+y^2",
            json!({"initial":"0.5"}),
            "line_search_stalled",
        ),
        (
            "bfgs",
            "x^4+y^2",
            json!({"initial":"1","initial_y":"1","max_iterations":1}),
            "maximum_iterations",
        ),
        (
            "bfgs",
            "x+y",
            json!({"lower":"1","upper":"0"}),
            "invalid_bound_interval",
        ),
        ("bfgs", "ln(x)+y^2", json!({}), "undefined_initial_point"),
        (
            "nelder_mead",
            "(1-x)^2+100*(y-x^2)^2",
            json!({"initial":"-1.2","initial_y":"1","max_iterations":1}),
            "maximum_iterations",
        ),
        (
            "nelder_mead",
            "sqrt(0.001-x^2)+y^2",
            json!({}),
            "simplex_initialization_failed",
        ),
        (
            "nelder_mead",
            "1/(x-0.025)^2+1e16",
            json!({}),
            "undefined_simplex_shrink",
        ),
        (
            "nelder_mead",
            "-x",
            json!({"initial":"1e12"}),
            "iterate_outside_numeric_limits",
        ),
        ("nelder_mead", "4", json!({}), "simplex_diameter_and_spread"),
    ] {
        reason(operation, expression, options, expected);
    }
}

#[test]
fn reject_mismatched_operation_and_bound_options() {
    for (operation, options, code) in [
        ("unknown_algorithm", json!({}), MathError::Unsupported),
        (
            "bisection",
            json!({"lower":"-1","upper":"1","initial":"0"}),
            MathError::InvalidInput,
        ),
        (
            "bisection",
            json!({"lower":"2","upper":"1"}),
            MathError::Domain,
        ),
        (
            "bfgs",
            json!({"dimensions":2,"initial_z":"0"}),
            MathError::InvalidInput,
        ),
    ] {
        assert_eq!(
            evaluate(operation, "x^2", options.as_object().unwrap()).err(),
            Some(code)
        );
    }
}
