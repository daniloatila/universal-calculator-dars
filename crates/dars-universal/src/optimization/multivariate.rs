use super::{COORDINATE_LIMIT, Checked, Expression, Options, Outcome, bindings, finite};
use crate::MathError;

type Point = [f64; 3];
type Matrix = [Point; 3];

struct BoxBounds {
    low: Point,
    high: Point,
    implicit_low: [bool; 3],
    implicit_high: [bool; 3],
}

impl BoxBounds {
    fn project(&self, point: Point) -> Point {
        std::array::from_fn(|i| point[i].clamp(self.low[i], self.high[i]))
    }

    fn numeric_boundary(&self, point: Point) -> bool {
        (0..3).any(|i| {
            (self.implicit_low[i] && point[i] == self.low[i])
                || (self.implicit_high[i] && point[i] == self.high[i])
        })
    }
}

fn value(expression: &Expression, point: Point) -> Checked<f64> {
    expression.value(&bindings(&point))
}

fn gradient(expression: &Expression, point: Point, dimensions: usize) -> Checked<Point> {
    let mut values = [0.0; 3];
    for (index, value) in values[..dimensions].iter_mut().enumerate() {
        *value = expression.derivative(&bindings(&point), index)?;
    }
    Ok(values)
}

fn norm(point: Point) -> f64 {
    point.into_iter().map(f64::abs).fold(0.0, f64::max)
}

fn difference(a: Point, b: Point) -> Point {
    std::array::from_fn(|i| a[i] - b[i])
}

fn step(x: Point, direction: Point, size: f64) -> Point {
    std::array::from_fn(|i| x[i] + size * direction[i])
}

fn dot(a: Point, b: Point) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn identity() -> Matrix {
    [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
}

fn apply(matrix: &Matrix, point: Point) -> Point {
    std::array::from_fn(|i| dot(matrix[i], point))
}

fn bfgs(matrix: Matrix, displacement: Point, change: Point) -> Matrix {
    let curvature = dot(displacement, change);
    if curvature <= 1e-12 * norm(displacement) * norm(change) || !curvature.is_finite() {
        return identity();
    }
    let projected = apply(&matrix, change);
    let coefficient = (1.0 + dot(projected, change) / curvature) / curvature;
    let next: Matrix = std::array::from_fn(|i| {
        std::array::from_fn(|j| {
            matrix[i][j] + coefficient * displacement[i] * displacement[j]
                - (projected[i] * displacement[j] + displacement[i] * projected[j]) / curvature
        })
    });
    if next.iter().flatten().all(|v| v.is_finite()) {
        next
    } else {
        identity()
    }
}

struct Problem<'a> {
    expression: &'a Expression,
    bounds: BoxBounds,
    dimensions: usize,
    tolerance: f64,
    maximum: usize,
}

impl Problem<'_> {
    fn result(
        &self,
        status: &'static str,
        reason: &'static str,
        point: Point,
        value: f64,
        residual: f64,
        iterations: usize,
    ) -> Outcome {
        Outcome::numerical(
            status,
            reason,
            Some(point[..self.dimensions].to_vec()),
            Some(value),
            finite(residual).ok(),
            iterations,
        )
    }

    fn gradient_method(
        &self,
        mut x: Point,
        mut score: f64,
        variable_metric: bool,
    ) -> Checked<Outcome> {
        let mut inverse = identity();
        for iteration in 0..=self.maximum {
            let Ok(g) = gradient(self.expression, x, self.dimensions) else {
                return Ok(self.result(
                    "inconclusive",
                    "undefined_gradient",
                    x,
                    score,
                    f64::NAN,
                    iteration,
                ));
            };
            let residual = norm(difference(self.bounds.project(step(x, g, -1.0)), x));
            if residual <= self.tolerance {
                let (status, reason) = if self.bounds.numeric_boundary(x) {
                    ("inconclusive", "iterate_outside_numeric_limits")
                } else {
                    ("stationary_point", "projected_gradient_tolerance")
                };
                return Ok(self.result(status, reason, x, score, residual, iteration));
            }
            if iteration == self.maximum {
                return Ok(self.result(
                    "iteration_limit",
                    "maximum_iterations",
                    x,
                    score,
                    residual,
                    iteration,
                ));
            }
            let direction = apply(&inverse, g);
            let mut size = 1.0;
            let mut accepted = None;
            for _ in 0..40 {
                let candidate = self.bounds.project(step(x, direction, -size));
                let displacement = difference(candidate, x);
                let descent = dot(g, displacement);
                if descent < 0.0
                    && self
                        .expression
                        .segment(&bindings(&x), &bindings(&candidate))
                        .is_ok()
                    && let Ok(next) = value(self.expression, candidate)
                    && next <= score + 1e-4 * descent
                    && next < score
                {
                    accepted = Some((candidate, next, displacement));
                    break;
                }
                size *= 0.5;
            }
            let Some((candidate, next, displacement)) = accepted else {
                return Ok(self.result(
                    "inconclusive",
                    "line_search_stalled",
                    x,
                    score,
                    residual,
                    iteration,
                ));
            };
            if variable_metric
                && let Ok(next_gradient) = gradient(self.expression, candidate, self.dimensions)
            {
                inverse = bfgs(inverse, displacement, difference(next_gradient, g));
            }
            (x, score) = (candidate, next);
        }
        unreachable!("the bounded iteration returns at its limit")
    }

    fn nelder_mead(&self, x: Point, score: f64) -> Checked<Outcome> {
        let mut simplex = vec![(x, score)];
        for i in 0..self.dimensions {
            let span = 0.05 * x[i].abs().max(1.0);
            let mut point = x;
            point[i] = (x[i] + span).min(self.bounds.high[i]);
            if point[i] == x[i] || value(self.expression, point).is_err() {
                point[i] = (x[i] - span).max(self.bounds.low[i]);
            }
            let Ok(score) = value(self.expression, point) else {
                return Ok(Outcome::unknown("simplex_initialization_failed"));
            };
            if point[i] == x[i] {
                return Ok(Outcome::unknown("simplex_initialization_failed"));
            }
            simplex.push((point, score));
        }
        let n = self.dimensions;
        for iteration in 0..=self.maximum {
            simplex.sort_by(|a, b| a.1.total_cmp(&b.1));
            let (best, best_score) = simplex[0];
            let (worst, worst_score) = simplex[n];
            let diameter = simplex
                .iter()
                .map(|(point, _)| norm(difference(*point, best)))
                .fold(0.0, f64::max);
            let spread = worst_score - best_score;
            if diameter <= self.tolerance * norm(best).max(1.0)
                && spread <= self.tolerance * best_score.abs().max(1.0)
            {
                let (status, reason) = if self.bounds.numeric_boundary(best) {
                    ("inconclusive", "iterate_outside_numeric_limits")
                } else {
                    ("local_optimum_candidate", "simplex_diameter_and_spread")
                };
                return Ok(self.result(status, reason, best, best_score, diameter, iteration));
            }
            if iteration == self.maximum {
                return Ok(self.result(
                    "iteration_limit",
                    "maximum_iterations",
                    best,
                    best_score,
                    diameter,
                    iteration,
                ));
            }
            let center: Point = std::array::from_fn(|i| {
                simplex[..n].iter().map(|p| p.0[i]).sum::<f64>() / (n as f64)
            });
            let away = difference(center, worst);
            let candidate = |multiplier| {
                let point = self.bounds.project(step(center, away, multiplier));
                (
                    point,
                    value(self.expression, point).unwrap_or(f64::INFINITY),
                )
            };
            let reflected = candidate(1.0);
            if reflected.1 < best_score {
                let expanded = candidate(2.0);
                simplex[n] = if expanded.1 < reflected.1 {
                    expanded
                } else {
                    reflected
                };
            } else if reflected.1 < simplex[n - 1].1 {
                simplex[n] = reflected;
            } else {
                let outside = reflected.1 < worst_score;
                let contracted = candidate(if outside { 0.5 } else { -0.5 });
                if contracted.1 < worst_score.min(reflected.1) {
                    simplex[n] = contracted;
                } else {
                    for point in &mut simplex[1..] {
                        let shrunk =
                            self.bounds
                                .project(step(best, difference(point.0, best), 0.5));
                        let Ok(score) = value(self.expression, shrunk) else {
                            return Ok(self.result(
                                "inconclusive",
                                "undefined_simplex_shrink",
                                best,
                                best_score,
                                diameter,
                                iteration,
                            ));
                        };
                        *point = (shrunk, score);
                    }
                }
            }
        }
        unreachable!("the bounded iteration returns at its limit")
    }
}

pub(super) fn solve(
    operation: &str,
    expression: &Expression,
    options: &Options<'_>,
    dimensions: usize,
) -> Checked<Outcome> {
    let initial_names = ["initial", "initial_y", "initial_z"];
    let low_names = ["lower", "y_lower", "z_lower"];
    let high_names = ["upper", "y_upper", "z_upper"];
    let mut start = [0.0; 3];
    let mut bounds = BoxBounds {
        low: [-COORDINATE_LIMIT; 3],
        high: [COORDINATE_LIMIT; 3],
        implicit_low: [true; 3],
        implicit_high: [true; 3],
    };
    for i in 0..3 {
        if i >= dimensions {
            if [initial_names[i], low_names[i], high_names[i]]
                .iter()
                .any(|name| options.0.contains_key(*name))
            {
                return Err(MathError::InvalidInput);
            }
            continue;
        }
        start[i] = options.coordinate(initial_names[i], Some(0.0))?;
        bounds.implicit_low[i] = !options.0.contains_key(low_names[i]);
        bounds.implicit_high[i] = !options.0.contains_key(high_names[i]);
        bounds.low[i] = options.coordinate(low_names[i], Some(-COORDINATE_LIMIT))?;
        bounds.high[i] = options.coordinate(high_names[i], Some(COORDINATE_LIMIT))?;
        if bounds.low[i] >= bounds.high[i] {
            return Ok(Outcome::unknown("invalid_bound_interval"));
        }
    }
    if bounds.project(start) != start {
        return Ok(Outcome::numerical(
            "constraint_violation",
            "initial_point_outside_bounds",
            None,
            None,
            None,
            0,
        ));
    }
    let Ok(score) = value(expression, start) else {
        return Ok(Outcome::unknown("undefined_initial_point"));
    };
    let problem = Problem {
        expression,
        bounds,
        dimensions,
        tolerance: options.tolerance()?,
        maximum: options.iterations()?,
    };
    if operation == "nelder_mead" {
        problem.nelder_mead(start, score)
    } else {
        problem.gradient_method(start, score, operation == "bfgs")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_nonpositive_or_overflowing_inverse_hessian_updates() {
        let old = [[2.0, 0.0, 0.0], [0.0, 2.0, 0.0], [0.0, 0.0, 2.0]];
        assert_eq!(bfgs(old, [1.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), identity());
        assert_eq!(
            bfgs(old, [1e-160, 0.0, 0.0], [1e-160, 0.0, 0.0]),
            identity()
        );
    }
}
