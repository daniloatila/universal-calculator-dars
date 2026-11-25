mod ast;
mod limits;
mod numeric;
mod series;
mod symbolic;

use crate::{Computation, Exactness, MathError};
use ast::{Checked, Expr, Guard, NAMES, Rational, add, binding, neg, rat};
use limits::{Point, Side};
use num_traits::ToPrimitive;
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use symbolic::Range;

struct Options<'a> {
    values: &'a Map<String, Value>,
    variable: u8,
}

impl<'a> Options<'a> {
    fn new(operation: &str, options: &'a Value) -> Checked<Self> {
        let allowed: &[&str] = match operation {
            "derivative" => &["order"],
            "antiderivative" => &[],
            "integral" => &["lower", "upper"],
            "limit" => &["point", "side"],
            "series" => &["point", "terms"],
            "numerical_integral" => &["lower", "upper", "tolerance"],
            _ => return Err(MathError::Unsupported),
        };
        let values = options.as_object().ok_or(MathError::InvalidInput)?;
        if values
            .keys()
            .any(|key| key != "variable" && !allowed.contains(&key.as_str()))
        {
            return Err(MathError::InvalidInput);
        }
        let variable = match values.get("variable") {
            Some(value) => value
                .as_str()
                .and_then(ast::variable)
                .ok_or(MathError::InvalidInput)?,
            None => 0,
        };
        Ok(Self { values, variable })
    }

    fn text(&self, name: &str, default: Option<&'a str>) -> Checked<&'a str> {
        match self.values.get(name) {
            Some(value) => value.as_str().ok_or(MathError::InvalidInput),
            None => default.ok_or(MathError::InvalidInput),
        }
    }

    fn amount(&self, name: &str, default: u64, largest: u64) -> Checked<u64> {
        let Some(amount) = self.values.get(name) else {
            return Ok(default);
        };
        let amount = amount.as_u64().ok_or(MathError::InvalidInput)?;
        if !(1..=largest).contains(&amount) {
            return Err(MathError::Limit);
        }
        Ok(amount)
    }

    fn rational(&self, name: &str, default: Option<&'a str>) -> Checked<Rational> {
        binding(self.text(name, default)?)
    }

    fn interval(&self) -> Checked<(Rational, Rational)> {
        Ok((self.rational("lower", None)?, self.rational("upper", None)?))
    }

    fn limit_point(&self) -> Checked<Point> {
        let value = self.text("point", Some("0"))?;
        match value.trim() {
            "inf" | "+inf" | "∞" | "+∞" => Ok(Point::Infinity(false)),
            "-inf" | "-∞" | "−∞" => Ok(Point::Infinity(true)),
            _ => Ok(Point::Finite(binding(value)?)),
        }
    }

    fn side(&self) -> Checked<Side> {
        match self.text("side", Some("both"))? {
            "left" => Ok(Side::Left),
            "right" => Ok(Side::Right),
            "both" => Ok(Side::Both),
            _ => Err(MathError::InvalidInput),
        }
    }
}

struct Answer {
    result: String,
    exactness: Exactness,
    method: &'static str,
    formula: &'static str,
    precision: Option<u32>,
    tolerance: Option<String>,
    details: Vec<String>,
}

impl Answer {
    fn symbolic(result: String, method: &'static str, formula: &'static str) -> Self {
        Self {
            result,
            exactness: Exactness::Symbolic,
            method,
            formula,
            precision: None,
            tolerance: None,
            details: Vec::new(),
        }
    }

    fn expression(result: &Expr, method: &'static str, formula: &'static str) -> Self {
        let mut answer = Self::symbolic(result.text(), method, formula);
        if result.fraction().is_some() {
            answer.exactness = Exactness::Exact;
        }
        answer
    }
}

fn definite(
    expression: &Expr,
    guards: &BTreeSet<Guard>,
    options: &Options<'_>,
    approximate: bool,
) -> Checked<Answer> {
    let (lower, upper) = options.interval()?;
    let interval = Range::new(&lower, &upper);
    symbolic::certify_domain(guards, options.variable, &interval)?;
    if approximate {
        let tolerance = options.rational("tolerance", Some("1e-8"))?;
        if tolerance < rat(1_000_000_000_000).recip() || tolerance > rat(1_000).recip() {
            return Err(MathError::Limit);
        }
        let (mut value, estimate) =
            numeric::integrate(expression, options.variable, &interval, &tolerance)?;
        if lower > upper && value != 0.0 {
            value = -value;
        }
        let tolerance = tolerance.to_f64().ok_or(MathError::Limit)?;
        Ok(Answer {
            result: value.to_string(),
            exactness: Exactness::Approximate,
            method: "adaptive_simpson_quadrature",
            formula: "S(a,b) = (b-a)*(f(a)+4*f((a+b)/2)+f(b))/6",
            precision: Some(15),
            tolerance: Some(format!("{tolerance:e}")),
            details: vec![format!(
                "Estimated absolute quadrature error (uncertified): {estimate:e}"
            )],
        })
    } else {
        let result = if lower == upper {
            ast::num(0)
        } else {
            let primitive = symbolic::antiderivative(expression, options.variable)?;
            add([
                primitive.substitute(options.variable, &upper)?,
                neg(primitive.substitute(options.variable, &lower)?)?,
            ])?
        };
        Ok(Answer::expression(
            &result,
            "fundamental_theorem_of_calculus",
            "integral_a^b f(x) dx = F(b)-F(a)",
        ))
    }
}

pub(super) fn evaluate(operation: &str, input: &str, options: &Value) -> Checked<Computation> {
    let options = Options::new(operation, options)?;
    let original = ast::parse(input)?;
    let used = original.variables();
    let variable = options.variable;
    let multivariate = used & !(1 << variable) != 0;
    if multivariate && !matches!(operation, "derivative" | "antiderivative") {
        return Err(MathError::Unsupported);
    }
    let mut guards = ast::guards(&original, operation == "numerical_integral")?;
    let expression = original.normalize()?;
    let answer = match operation {
        "derivative" => {
            let order = options.amount("order", 1, 8)?;
            let result = symbolic::derive(&expression, variable, order, &mut guards)?;
            Answer::expression(
                &result,
                "symbolic_differentiation",
                "d(f(g(x)))/dx = f'(g(x))*g'(x)",
            )
        }
        "antiderivative" => {
            let result = symbolic::antiderivative(&expression, variable)?;
            Answer::symbolic(
                format!("{}+C", result.text()),
                "bounded_symbolic_antiderivative",
                "F'(x) = f(x)",
            )
        }
        "integral" => definite(&expression, &guards, &options, false)?,
        "numerical_integral" => definite(&expression, &guards, &options, true)?,
        "limit" => {
            let value = limits::solve(
                &expression,
                variable,
                &options.limit_point()?,
                options.side()?,
                &guards,
            )?;
            let method = "directional_leading_terms";
            let formula = "lim f(x) from each requested side";
            match value {
                limits::Value::Finite(result) => Answer::expression(&result, method, formula),
                limits::Value::Infinity(true) => {
                    Answer::symbolic("-inf".to_owned(), method, formula)
                }
                limits::Value::Infinity(false) => {
                    Answer::symbolic("inf".to_owned(), method, formula)
                }
                limits::Value::Absent => {
                    Answer::symbolic("does_not_exist".to_owned(), method, formula)
                }
            }
        }
        "series" => {
            let point = options.rational("point", Some("0"))?;
            let terms = options.amount("terms", 6, 12)? as usize;
            let (result, convergence) =
                series::expand(&expression, variable, &point, terms, &guards)?;
            let mut answer = Answer::symbolic(
                result,
                "truncated_taylor_coefficients",
                "sum(f^(k)(a)*(x-a)^k/k!)",
            );
            answer.details.push(convergence);
            answer
        }
        _ => return Err(MathError::Unsupported),
    };
    let variables: BTreeMap<String, String> = NAMES
        .into_iter()
        .enumerate()
        .filter(|(index, _)| {
            used & (1 << index) != 0
                || (operation == "antiderivative" && *index == usize::from(variable))
        })
        .map(|(_, name)| (name.to_owned(), "real variable".to_owned()))
        .collect();
    let mut constraints: Vec<_> = guards.iter().map(Guard::text).collect();
    constraints.extend(answer.details);
    Ok(Computation {
        result: answer.result,
        exactness: answer.exactness,
        normalized: input.trim().to_owned(),
        method: answer.method,
        domain: "real",
        formula: Some(answer.formula),
        precision: answer.precision,
        error_bound: None,
        tolerance: answer.tolerance,
        constraints,
        variables,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn calculate(operation: &str, input: &str, options: Value) -> Computation {
        evaluate(operation, input, &options).unwrap()
    }

    #[test]
    fn differentiates_symbolically_and_keeps_original_domain() {
        let partial = calculate("derivative", "  x^2*y+y^3  ", json!({"variable":"x"}));
        assert_eq!(partial.result, "2*x*y");
        assert_eq!(partial.normalized, "x^2*y+y^3");
        assert_eq!(partial.variables.keys().collect::<Vec<_>>(), ["x", "y"]);
        assert_eq!(
            calculate("derivative", "sin(2*x)", json!({"order":3})).result,
            "-8*cos(2*x)"
        );
        assert_eq!(
            calculate("derivative", "z^8", json!({"order":8,"variable":"z"})).result,
            "40320"
        );
        let quotient = calculate("derivative", "x/x", json!({}));
        assert_eq!(quotient.result, "0");
        assert_eq!(quotient.constraints, ["x != 0"]);
        assert_eq!(
            calculate("derivative", "abs(x)", json!({})).constraints,
            ["abs(x) != 0"]
        );
    }

    #[test]
    fn primitives_and_finite_integrals_respect_orientation() {
        assert_eq!(
            calculate("antiderivative", "2*x+cos(2*x)", json!({})).result,
            "1/2*sin(2*x)+x^2+C"
        );
        assert_eq!(
            calculate("antiderivative", "x^-1", json!({})).result,
            "ln(abs(x))+C"
        );
        assert_eq!(
            calculate("integral", "(x+1)*(x-1)", json!({"lower":"-1","upper":"1"})).result,
            "-4/3"
        );
        assert_eq!(
            calculate("integral", "x^2", json!({"lower":"1","upper":"0"})).result,
            "-1/3"
        );
        assert_eq!(
            calculate("integral", "1/x", json!({"lower":"-2","upper":"-1"})).result,
            "-ln(2)"
        );
        assert_eq!(
            calculate("integral", "abs(x)", json!({"lower":"-1","upper":"1"})).result,
            "1"
        );
        assert_eq!(
            evaluate("antiderivative", "exp(x^2)", &json!({})).err(),
            Some(MathError::Unsupported)
        );
        assert_eq!(
            evaluate("integral", "x/x", &json!({"lower":"-1","upper":"1"})).err(),
            Some(MathError::Domain)
        );
    }

    #[test]
    fn directional_limits_classify_cancellation_poles_and_end_behavior() {
        let examples = [
            ("(x^2-1)/(x-1)", json!({"point":"1"}), "2"),
            ("(1-cos(x))/x^2", json!({}), "1/2"),
            ("sin(x)/x", json!({}), "1"),
            ("(exp(x)-1)/x", json!({}), "1"),
            ("x/abs(x)", json!({}), "does_not_exist"),
            ("1/x", json!({"side":"left"}), "-inf"),
            ("1/x^2", json!({}), "inf"),
            ("ln(x)", json!({"side":"right"}), "-inf"),
            ("ln(x)", json!({"side":"left"}), "does_not_exist"),
            ("(3*x^2+1)/(2*x^2-x)", json!({"point":"-inf"}), "3/2"),
            ("x^3", json!({"point":"-inf"}), "-inf"),
            ("exp(-x^2)", json!({"point":"inf"}), "0"),
            ("sin(x)", json!({"point":"inf"}), "does_not_exist"),
            ("1/x", json!({"point":"inf"}), "0"),
        ];
        for (input, options, expected) in examples {
            assert_eq!(
                calculate("limit", input, options).result,
                expected,
                "{input}"
            );
        }
    }

    #[test]
    fn series_report_coefficients_center_and_convergence() {
        let sine = calculate("series", "sin(x)", json!({"terms":5}));
        assert_eq!(sine.result, "-1/6*x^3+x+O(x^5)");
        assert_eq!(sine.constraints, ["Taylor convergence for all real inputs"]);
        let log = calculate("series", "ln(1+x)", json!({"terms":4}));
        assert_eq!(log.result, "1/3*x^3-1/2*x^2+x+O(x^4)");
        assert!(
            log.constraints
                .contains(&String::from("Taylor convergence for |x| < 1"))
        );
        let shifted = calculate(
            "series",
            "1/(1+z)",
            json!({"variable":"z","point":"2","terms":3}),
        );
        assert!(shifted.result.ends_with("+O((z-2)^3)"));
        assert!(
            shifted
                .constraints
                .contains(&String::from("Taylor convergence for |z-2| < 3"))
        );
        assert_eq!(
            evaluate("series", "1/x", &json!({})).err(),
            Some(MathError::Domain)
        );
    }

    #[test]
    fn numerical_integration_tests_aliasing_roundoff_and_guarded_shapes() {
        let unit = json!({"lower":"0","upper":"1","tolerance":"1e-10"});
        let gaussian = calculate("numerical_integral", "exp(-x^2)", unit.clone());
        let observed: f64 = gaussian.result.parse().unwrap();
        assert!((observed - 0.746_824_132_812_427).abs() < 1e-10);
        assert_eq!(gaussian.exactness, Exactness::Approximate);
        assert_eq!(gaussian.precision, Some(15));
        assert_eq!(gaussian.tolerance.as_deref(), Some("1e-10"));
        assert_eq!(gaussian.error_bound, None);
        assert!(gaussian.constraints.iter().any(|detail| {
            detail.starts_with("Estimated absolute quadrature error (uncertified): ")
        }));
        let alias = calculate(
            "numerical_integral",
            "cos(25.132741228718345*x)",
            unit.clone(),
        );
        assert!(alias.result.parse::<f64>().unwrap().abs() < 1e-10);
        let reversed = calculate(
            "numerical_integral",
            "x^3",
            json!({"lower":"2","upper":"-1"}),
        );
        assert_eq!(reversed.result, "-3.75");
        for input in ["exp(-1e12*(x-0.1234567)^2)", "1/(1e-12+(x-0.1234567)^2)"] {
            assert_eq!(
                evaluate("numerical_integral", input, &unit).err(),
                Some(MathError::Unsupported),
                "{input}"
            );
        }
        assert_eq!(
            evaluate(
                "numerical_integral",
                "x",
                &json!({"lower":"1","upper":"1.000000000000000001"})
            )
            .err(),
            Some(MathError::NoConvergence)
        );
    }

    #[test]
    fn rejects_unknown_grammar_options_and_resource_excess() {
        let cases = [
            ("derivative", "x^33", json!({}), MathError::Limit),
            ("derivative", "x^y", json!({}), MathError::Unsupported),
            ("derivative", "x^0.5", json!({}), MathError::Unsupported),
            ("derivative", "x", json!({"order":9}), MathError::Limit),
            (
                "derivative",
                "x",
                json!({"variable":"a"}),
                MathError::InvalidInput,
            ),
            (
                "derivative",
                "x",
                json!({"side":"left"}),
                MathError::InvalidInput,
            ),
            ("derivative", "tan(x)", json!({}), MathError::Unsupported),
            ("derivative", "x(", json!({}), MathError::InvalidInput),
            ("derivative", "ln(-1)", json!({}), MathError::Domain),
            (
                "limit",
                "x",
                json!({"point":"+inf","side":"left"}),
                MathError::InvalidInput,
            ),
            (
                "integral",
                "x+y",
                json!({"lower":"0","upper":"1"}),
                MathError::Unsupported,
            ),
            (
                "numerical_integral",
                "x",
                json!({"lower":"0","upper":"1","tolerance":"1e-13"}),
                MathError::Limit,
            ),
        ];
        for (operation, input, options, error) in cases {
            assert_eq!(
                evaluate(operation, input, &options).err(),
                Some(error),
                "{operation}: {input}"
            );
        }
    }
}
