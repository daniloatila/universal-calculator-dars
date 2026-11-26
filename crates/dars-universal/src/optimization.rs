//! Bounded real root solving and constrained numerical optimization.

mod linear;
mod multivariate;
#[cfg(test)]
mod tests;

use crate::calculus::numerical_expression::{Bindings, Expression, finite, number};
use crate::{Computation, Exactness, MathError};
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::BTreeMap;

type Checked<T> = Result<T, MathError>;
const COORDINATE_LIMIT: f64 = 1e12;

#[derive(Serialize)]
struct Outcome {
    status: &'static str,
    point: Option<Vec<f64>>,
    value: Option<f64>,
    residual: Option<f64>,
    residual_kind: Option<&'static str>,
    iterations: usize,
    reason: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    point_exact: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_exact: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    alternative_optimum: Option<bool>,
}

impl Outcome {
    fn numerical(
        status: &'static str,
        reason: &'static str,
        point: Option<Vec<f64>>,
        value: Option<f64>,
        residual: Option<f64>,
        iterations: usize,
    ) -> Self {
        Self {
            status,
            reason,
            point,
            value,
            residual,
            residual_kind: None,
            iterations,
            point_exact: None,
            value_exact: None,
            alternative_optimum: None,
        }
    }

    fn root(
        status: &'static str,
        reason: &'static str,
        x: f64,
        value: f64,
        iterations: usize,
    ) -> Self {
        Self::numerical(
            status,
            reason,
            Some(vec![x]),
            Some(value),
            Some(value.abs()),
            iterations,
        )
    }

    fn unknown(reason: &'static str) -> Self {
        Self::numerical("inconclusive", reason, None, None, None, 0)
    }
}

struct Options<'a>(&'a Map<String, Value>);

impl<'a> Options<'a> {
    fn new(values: &'a Map<String, Value>, names: &[&str]) -> Checked<Self> {
        if values.keys().any(|name| !names.contains(&name.as_str())) {
            return Err(MathError::InvalidInput);
        }
        Ok(Self(values))
    }

    fn parsed(&self, name: &str) -> Checked<Option<f64>> {
        self.0
            .get(name)
            .map(|value| number(value.as_str().ok_or(MathError::InvalidInput)?))
            .transpose()
    }

    fn coordinate(&self, name: &str, default: Option<f64>) -> Checked<f64> {
        let value = self
            .parsed(name)?
            .or(default)
            .ok_or(MathError::InvalidInput)?;
        (value.abs() <= COORDINATE_LIMIT)
            .then_some(value)
            .ok_or(MathError::Limit)
    }

    fn bounds(&self, low: &str, high: &str) -> Checked<(f64, f64)> {
        let (a, b) = (self.coordinate(low, None)?, self.coordinate(high, None)?);
        if a >= b {
            return Err(MathError::Domain);
        }
        Ok((a, b))
    }

    fn integer(&self, name: &str, default: usize, min: usize, max: usize) -> Checked<usize> {
        let value = self.0.get(name).map_or(Ok(default as u64), |value| {
            value.as_u64().ok_or(MathError::InvalidInput)
        })?;
        if !(min as u64..=max as u64).contains(&value) {
            return Err(MathError::Limit);
        }
        Ok(value as usize)
    }

    fn tolerance(&self) -> Checked<f64> {
        let value = self.parsed("tolerance")?.unwrap_or(1e-9);
        (1e-13..=1e-2)
            .contains(&value)
            .then_some(value)
            .ok_or(MathError::Limit)
    }

    fn iterations(&self) -> Checked<usize> {
        self.integer("max_iterations", 256, 1, 4096)
    }
}

fn coordinate(value: f64) -> Option<f64> {
    (value.is_finite() && value.abs() <= COORDINATE_LIMIT).then_some(value)
}

fn bindings(point: &[f64]) -> Bindings {
    let mut values = [0.0; 7];
    values[..point.len()].copy_from_slice(point);
    values
}

fn value(expression: &Expression, x: f64) -> Checked<f64> {
    expression.value(&bindings(&[x]))
}

fn resolved_residual(expression: &Expression, x: f64, tolerance: f64) -> bool {
    expression
        .point_range(&bindings(&[x]))
        .is_ok_and(|(low, high)| low.abs().max(high.abs()) <= tolerance)
}

fn root_candidate(
    expression: &Expression,
    reason: &'static str,
    x: f64,
    value: f64,
    tolerance: f64,
    iteration: usize,
) -> Outcome {
    let (status, reason) = if resolved_residual(expression, x, tolerance) {
        ("converged", reason)
    } else {
        ("inconclusive", "residual_below_arithmetic_resolution")
    };
    Outcome::root(status, reason, x, value, iteration)
}

fn continuous(expression: &Expression, a: f64, b: f64) -> bool {
    fn panel(expression: &Expression, a: f64, b: f64, depth: u8) -> bool {
        if expression.segment(&bindings(&[a]), &bindings(&[b])).is_ok() {
            return true;
        }
        let middle = a.midpoint(b);
        depth != 0
            && middle != a
            && middle != b
            && panel(expression, a, middle, depth - 1)
            && panel(expression, middle, b, depth - 1)
    }
    panel(expression, a, b, 6)
}

fn bracket(expression: &Expression, options: &Options<'_>, hybrid: bool) -> Checked<Outcome> {
    let ((mut low, mut high), tol, max) = (
        options.bounds("lower", "upper")?,
        options.tolerance()?,
        options.iterations()?,
    );
    let initial = options.coordinate("initial", Some(low.midpoint(high)))?;
    if !(low..=high).contains(&initial) {
        return Ok(Outcome::unknown("initial_outside_bracket"));
    }
    let fl = value(expression, low);
    let fr = value(expression, high);
    let (Ok(mut left), Ok(mut right)) = (fl, fr) else {
        return Ok(Outcome::unknown("undefined_endpoint"));
    };
    if left == 0.0 {
        return Ok(root_candidate(expression, "zero_sample", low, left, tol, 0));
    }
    if right == 0.0 {
        return Ok(root_candidate(
            expression,
            "zero_sample",
            high,
            right,
            tol,
            0,
        ));
    }
    if !continuous(expression, low, high) {
        return Ok(Outcome::unknown("domain_continuity_unresolved"));
    }
    if left.is_sign_positive() == right.is_sign_positive() {
        return Ok(Outcome::unknown("no_sign_change"));
    }
    let (mut x, mut f) = if left.abs() < right.abs() {
        (low, left)
    } else {
        (high, right)
    };
    for iteration in 1..=max {
        let width = high - low;
        let middle = low.midpoint(high);
        let next = if hybrid && iteration == 1 && initial > low && initial < high {
            initial
        } else if hybrid {
            let derivative = expression
                .derivative(&bindings(&[x]), 0)
                .ok()
                .filter(|d| *d != 0.0);
            derivative
                .map(|d| x - f / d)
                .filter(|v| (low + width / 8.0..high - width / 8.0).contains(v))
                .unwrap_or(middle)
        } else {
            middle
        };
        if next == low || next == high {
            return Ok(Outcome::root(
                "inconclusive",
                "floating_point_resolution",
                x,
                f,
                iteration - 1,
            ));
        }
        let Ok(sample) = value(expression, next) else {
            return Ok(Outcome::root(
                "inconclusive",
                "undefined_iterate",
                x,
                f,
                iteration - 1,
            ));
        };
        if sample.abs() <= tol && (sample == 0.0 || width <= tol.max(tol * next.abs())) {
            return Ok(root_candidate(
                expression,
                "residual_and_bracket_tolerance",
                next,
                sample,
                tol,
                iteration,
            ));
        }
        if sample.is_sign_positive() == left.is_sign_positive() {
            low = next;
            left = sample;
        } else {
            high = next;
            right = sample;
        }
        (x, f) = if left.abs() < right.abs() {
            (low, left)
        } else {
            (high, right)
        };
    }
    Ok(Outcome::root(
        "iteration_limit",
        "maximum_iterations",
        x,
        f,
        max,
    ))
}

fn unbracketed(expression: &Expression, options: &Options<'_>, newton: bool) -> Checked<Outcome> {
    let (mut x, tol, max) = (
        options.coordinate("initial", None)?,
        options.tolerance()?,
        options.iterations()?,
    );
    let Ok(mut f) = value(expression, x) else {
        return Ok(Outcome::unknown("undefined_initial_point"));
    };
    let mut previous = if newton {
        None
    } else {
        let second = options.coordinate("second", None)?;
        if second == x {
            return Ok(Outcome::unknown("coincident_initial_points"));
        }
        match value(expression, second) {
            Ok(other) => Some((second, other)),
            Err(_) => return Ok(Outcome::unknown("undefined_initial_point")),
        }
    };
    if let Some((second, other)) = previous
        && other.abs() < f.abs()
    {
        previous = Some((x, f));
        (x, f) = (second, other);
    }
    if f == 0.0 {
        return Ok(root_candidate(expression, "zero_sample", x, f, tol, 0));
    }
    for iteration in 1..=max {
        let slope = if let Some((p, g)) = previous.filter(|_| !newton) {
            (f - g) / (x - p)
        } else {
            expression
                .derivative(&bindings(&[x]), 0)
                .unwrap_or(f64::NAN)
        };
        if slope == 0.0 || !slope.is_finite() {
            return Ok(Outcome::root(
                "inconclusive",
                "zero_or_undefined_slope",
                x,
                f,
                iteration - 1,
            ));
        }
        let Some(next) = coordinate(x - f / slope) else {
            return Ok(Outcome::root(
                "inconclusive",
                "iterate_outside_numeric_limits",
                x,
                f,
                iteration - 1,
            ));
        };
        if next == x {
            return Ok(Outcome::root(
                "inconclusive",
                "floating_point_resolution",
                x,
                f,
                iteration - 1,
            ));
        }
        if !continuous(expression, x, next) {
            return Ok(Outcome::root(
                "inconclusive",
                "domain_continuity_unresolved",
                x,
                f,
                iteration - 1,
            ));
        }
        let Ok(sample) = value(expression, next) else {
            return Ok(Outcome::root(
                "inconclusive",
                "undefined_iterate",
                x,
                f,
                iteration - 1,
            ));
        };
        if sample == 0.0 || (sample.abs() <= tol && (next - x).abs() <= tol * next.abs().max(1.0)) {
            return Ok(root_candidate(
                expression,
                "residual_and_step_tolerance",
                next,
                sample,
                tol,
                iteration,
            ));
        }
        previous = Some((x, f));
        (x, f) = (next, sample);
    }
    Ok(Outcome::root(
        "iteration_limit",
        "maximum_iterations",
        x,
        f,
        max,
    ))
}

fn extremum(expression: &Expression, options: &Options<'_>, maximum: bool) -> Checked<Outcome> {
    const RATIO: f64 = 0.618_033_988_749_894_8;
    let ((mut a, mut b), tol, max) = (
        options.bounds("lower", "upper")?,
        options.tolerance()?,
        options.iterations()?,
    );
    if !continuous(expression, a, b) {
        return Ok(Outcome::unknown("domain_continuity_unresolved"));
    }
    let sign = if maximum { -1.0 } else { 1.0 };
    let f = |x| value(expression, x).map(|result| result * sign);
    let ends = [(a, f(a)?), (b, f(b)?)];
    let (mut c, mut d) = (b - RATIO * (b - a), a + RATIO * (b - a));
    let (mut fc, mut fd) = (f(c)?, f(d)?);
    for iteration in 0..=max {
        let width = b - a;
        let done = width <= tol * a.abs().max(b.abs()).max(1.0);
        if done || iteration == max {
            let (x, result) = [ends[0], ends[1], (c, fc), (d, fd)]
                .into_iter()
                .min_by(|l, r| l.1.total_cmp(&r.1))
                .expect("four candidate points");
            let (status, reason) = if done {
                ("local_optimum_candidate", "interval_tolerance")
            } else {
                ("iteration_limit", "maximum_iterations")
            };
            return Ok(Outcome::numerical(
                status,
                reason,
                Some(vec![x]),
                Some(result * sign),
                Some(width),
                iteration,
            ));
        }
        if fc <= fd {
            b = d;
            d = c;
            fd = fc;
            c = b - RATIO * (b - a);
            fc = f(c)?;
        } else {
            a = c;
            c = d;
            fc = fd;
            d = a + RATIO * (b - a);
            fd = f(d)?;
        }
    }
    unreachable!("bounded iteration returns at limit")
}

pub(super) fn evaluate(
    operation: &str,
    input: &str,
    values: &Map<String, Value>,
) -> Checked<Computation> {
    let names: &[&str] = match operation {
        "linear_program" => &[],
        "bisection" | "minimize_univariate" | "maximize_univariate" => {
            &["lower", "upper", "tolerance", "max_iterations"]
        }
        "hybrid" => &["lower", "upper", "initial", "tolerance", "max_iterations"],
        "newton" => &["initial", "tolerance", "max_iterations"],
        "secant" => &["initial", "second", "tolerance", "max_iterations"],
        "gradient_descent" | "bfgs" | "nelder_mead" => &[
            "dimensions",
            "initial",
            "initial_y",
            "initial_z",
            "lower",
            "upper",
            "y_lower",
            "y_upper",
            "z_lower",
            "z_upper",
            "tolerance",
            "max_iterations",
        ],
        _ => return Err(MathError::Unsupported),
    };
    let opts = Options::new(values, names)?;
    let (mut outcome, method, formula, domain, constraint) = if operation == "linear_program" {
        (
            linear::solve(input)?,
            "exact_vertex_and_recession_enumeration",
            "optimize c*x with Ax <= b, x >= 0",
            "linear_programming",
            "Rational vertex feasibility and normalized recession cone searched exhaustively within the declared dimension and coefficient bounds",
        )
    } else if matches!(operation, "gradient_descent" | "bfgs" | "nelder_mead") {
        let dimensions = opts.integer("dimensions", 2, 2, 3)?;
        let expression = Expression::parse(input, (1 << dimensions) - 1)?;
        let outcome = multivariate::solve(operation, &expression, &opts, dimensions)?;
        let (method, formula) = match operation {
            "nelder_mead" => (
                "bounded_nelder_mead",
                "simplex reflection, expansion, contraction and shrink",
            ),
            "bfgs" => ("projected_bfgs_armijo", "x_next=P_box(x-alpha*H*grad(f))"),
            _ => ("projected_gradient_armijo", "x_next=P_box(x-alpha*grad(f))"),
        };
        (
            outcome,
            method,
            formula,
            "real_local_optimization",
            "Binary64 local search; convergence of a stopping criterion carries no global-optimality certificate",
        )
    } else {
        let expression = Expression::parse(input, 1)?;
        let (outcome, method, formula) = match operation {
            "bisection" => (
                bracket(&expression, &opts, false)?,
                "bisection",
                "x=(a+b)/2",
            ),
            "hybrid" => (
                bracket(&expression, &opts, true)?,
                "safeguarded_newton_bisection",
                "use Newton inside the safe bracket, otherwise bisect",
            ),
            "newton" => (
                unbracketed(&expression, &opts, true)?,
                "newton_raphson",
                "x_next=x-f(x)/f'(x)",
            ),
            "secant" => (
                unbracketed(&expression, &opts, false)?,
                "secant",
                "x_next=x-f(x)*(x-x_prev)/(f(x)-f(x_prev))",
            ),
            "minimize_univariate" | "maximize_univariate" => (
                extremum(&expression, &opts, operation == "maximize_univariate")?,
                "bounded_golden_section",
                "repeated interval contraction at the golden ratio",
            ),
            _ => return Err(MathError::Unsupported),
        };
        if matches!(operation, "minimize_univariate" | "maximize_univariate") {
            (
                outcome,
                method,
                formula,
                "real_local_optimization",
                "A bounded single-basin search; global claims require a separately proved unimodal or convex model",
            )
        } else {
            (
                outcome,
                method,
                formula,
                "real_root_search",
                "Binary64 candidate for one root; residual and stopping tolerance are distinct from a certified root error",
            )
        }
    };
    let linear = operation == "linear_program";
    outcome.residual_kind = outcome.residual.map(|_| match operation {
        "linear_program" => "primal_constraint_violation",
        "minimize_univariate" | "maximize_univariate" => "interval_width",
        "gradient_descent" | "bfgs" => "projected_gradient_infinity_norm",
        "nelder_mead" => "simplex_diameter_from_best",
        _ => "absolute_function_value",
    });
    let mut variables = BTreeMap::from([
        ("status".to_owned(), outcome.status.to_owned()),
        ("reason".to_owned(), outcome.reason.to_owned()),
        ("iterations".to_owned(), outcome.iterations.to_string()),
    ]);
    if let Some(residual) = outcome.residual {
        variables.insert("residual".to_owned(), residual.to_string());
    }
    if let Some(kind) = outcome.residual_kind {
        variables.insert("residual_kind".to_owned(), kind.to_owned());
    }
    if !linear {
        variables.insert("max_iterations".to_owned(), opts.iterations()?.to_string());
    }
    let result = serde_json::to_string(&outcome).map_err(|_| MathError::Limit)?;
    Ok(Computation {
        result,
        normalized: input.trim().to_owned(),
        exactness: if linear {
            Exactness::Exact
        } else {
            Exactness::Approximate
        },
        method,
        domain,
        formula: Some(formula),
        precision: (!linear).then_some(15),
        tolerance: if linear {
            None
        } else {
            Some(opts.tolerance()?.to_string())
        },
        error_bound: None,
        constraints: vec![constraint.to_owned()],
        variables,
        units: BTreeMap::new(),
    })
}
