use super::ast::{Checked, Expr, Function, Rational, checked, rat};
use super::symbolic::{Range, interval};
use crate::MathError;
use num_traits::{Signed, ToPrimitive, Zero};

const MAX_SAMPLES: usize = 32_768;
const MAX_DEPTH: u8 = 16;
const MAX_SEEDS: usize = 2_048;
const ROUNDING: f64 = 4.0 * f64::EPSILON;

#[derive(Clone, Copy)]
struct Sample {
    value: f64,
    noise: f64,
}

impl Sample {
    fn new(value: f64, sensitivity: f64) -> Checked<Self> {
        let noise = sensitivity + ROUNDING * value.abs();
        if value.is_finite() && noise.is_finite() {
            Ok(Self { value, noise })
        } else {
            Err(MathError::Limit)
        }
    }

    fn add(self, right: Self) -> Checked<Self> {
        Self::new(self.value + right.value, self.noise + right.noise)
    }

    fn multiply(self, right: Self) -> Checked<Self> {
        Self::new(
            self.value * right.value,
            self.value.abs() * right.noise
                + right.value.abs() * self.noise
                + self.noise * right.noise,
        )
    }

    fn inverse(self) -> Checked<Self> {
        let lower = self.value.abs() - self.noise;
        if lower <= 0.0 {
            return Err(MathError::NoConvergence);
        }
        Self::new(self.value.recip(), self.noise / (self.value.abs() * lower))
    }

    fn power(mut self, exponent: i16) -> Checked<Self> {
        if exponent < 0 {
            self = self.inverse()?;
        }
        let mut power = exponent.unsigned_abs();
        let mut result = Self {
            value: 1.0,
            noise: 0.0,
        };
        while power != 0 {
            if !power.is_multiple_of(2) {
                result = result.multiply(self)?;
            }
            power /= 2;
            if power != 0 {
                self = self.multiply(self)?;
            }
        }
        Ok(result)
    }
}

fn convert(value: &Rational) -> Checked<f64> {
    value
        .to_f64()
        .filter(|converted| converted.is_finite() && (*converted != 0.0 || value.is_zero()))
        .ok_or(MathError::Limit)
}

fn evaluate(expression: &Expr, variable: u8, x: Sample) -> Checked<Sample> {
    match expression {
        Expr::Num(value) => Sample::new(convert(value)?, 0.0),
        Expr::Var(index) if variable == *index => Ok(x),
        Expr::Var(_) => Err(MathError::Unsupported),
        Expr::Add(terms) => terms.iter().try_fold(
            Sample {
                value: 0.0,
                noise: 0.0,
            },
            |total, term| total.add(evaluate(term, variable, x)?),
        ),
        Expr::Mul(terms) => terms.iter().try_fold(
            Sample {
                value: 1.0,
                noise: 0.0,
            },
            |total, term| total.multiply(evaluate(term, variable, x)?),
        ),
        Expr::Pow(base, power) => evaluate(base, variable, x)?.power(*power),
        Expr::Call(function, base) => {
            let Sample { value, noise } = evaluate(base, variable, x)?;
            match function {
                Function::Sin => Sample::new(value.sin(), noise + ROUNDING),
                Function::Cos => Sample::new(value.cos(), noise + ROUNDING),
                Function::Abs => Sample::new(value.abs(), noise),
                Function::Exp => Sample::new(value.exp(), (value + noise).exp() * noise),
                Function::Ln if value > noise => Sample::new(value.ln(), noise / (value - noise)),
                Function::Ln => Err(MathError::NoConvergence),
                Function::Sqrt => Err(MathError::Unsupported),
            }
        }
    }
}

enum Shape<'a> {
    Trig(&'a Expr),
    Exp(&'a Expr),
    Reciprocal(&'a Expr),
}

fn shapes<'a>(expression: &'a Expr, found: &mut Vec<Shape<'a>>) {
    match expression {
        Expr::Add(items) | Expr::Mul(items) => {
            for item in items {
                shapes(item, found);
            }
        }
        Expr::Pow(base, degree) => {
            if *degree < 0 && base.variables() != 0 {
                found.push(Shape::Reciprocal(base));
            }
            shapes(base, found);
        }
        Expr::Call(function, argument) => {
            if argument.variables() != 0 {
                let shape = match function {
                    Function::Sin | Function::Cos => Some(Shape::Trig(argument)),
                    Function::Exp => Some(Shape::Exp(argument)),
                    Function::Ln => Some(Shape::Reciprocal(argument)),
                    Function::Abs => None,
                    Function::Sqrt => None,
                };
                found.extend(shape);
            }
            shapes(argument, found);
        }
        _ => {}
    }
}

fn permits_panel(shapes: &[Shape<'_>], variable: u8, input: &Range) -> Checked<bool> {
    for shape in shapes {
        let expression = match shape {
            Shape::Trig(value) | Shape::Exp(value) | Shape::Reciprocal(value) => value,
        };
        let range = match interval(expression, variable, input) {
            Ok(range) => range,
            Err(MathError::Unsupported) => return Ok(false),
            Err(error) => return Err(error),
        };
        let cap = match shape {
            Shape::Trig(_) => rat(1024),
            Shape::Exp(_) => rat(80),
            Shape::Reciprocal(_) => rat(1_000_000_000_000),
        };
        if range.lower < -&cap || range.upper > cap {
            return Ok(false);
        }
        let bounded = match shape {
            Shape::Trig(_) => &range.upper - &range.lower <= rat(4).recip(),
            Shape::Exp(_) => &range.upper - &range.lower <= rat(2).recip(),
            Shape::Reciprocal(_) => {
                (range.upper.is_negative() || range.lower.is_positive())
                    && (range.upper.abs().max(range.lower.abs())
                        <= rat(2) * range.upper.abs().min(range.lower.abs()))
            }
        };
        if !bounded {
            return Ok(false);
        }
    }
    Ok(true)
}

fn subdivide(
    range: Range,
    shapes: &[Shape<'_>],
    variable: u8,
    depth: u8,
    endpoints: &mut Vec<f64>,
    work: &mut usize,
) -> Checked<()> {
    if *work == 0 {
        return Err(MathError::Unsupported);
    }
    *work -= 1;
    if permits_panel(shapes, variable, &range)? {
        endpoints.push(convert(&range.upper)?);
        return Ok(());
    }
    if depth == 10 {
        return Err(MathError::Unsupported);
    }
    let middle = checked((&range.lower + &range.upper) / rat(2))?;
    subdivide(
        Range::new(&range.lower, &middle),
        shapes,
        variable,
        depth + 1,
        endpoints,
        work,
    )?;
    subdivide(
        Range::new(&middle, &range.upper),
        shapes,
        variable,
        depth + 1,
        endpoints,
        work,
    )
}

struct Evaluation<'a> {
    expression: &'a Expr,
    variable: u8,
    remaining: usize,
}

impl Evaluation<'_> {
    fn sample(&mut self, point: f64) -> Checked<Sample> {
        if self.remaining == 0 {
            return Err(MathError::NoConvergence);
        }
        self.remaining -= 1;
        evaluate(self.expression, self.variable, Sample::new(point, 0.0)?)
    }
}

#[derive(Clone, Copy)]
struct Panel {
    left: f64,
    right: f64,
    start: Sample,
    center: Sample,
    end: Sample,
}

impl Panel {
    fn estimate(self) -> Checked<Sample> {
        let four = Sample {
            value: 4.0,
            noise: 0.0,
        };
        let area = Sample::new(
            (self.right - self.left) / 6.0,
            ROUNDING * (self.right.abs() + self.left.abs()) / 6.0,
        )?;
        self.start
            .add(four.multiply(self.center)?)?
            .add(self.end)?
            .multiply(area)
    }

    fn refine(
        self,
        budget: f64,
        depth: u8,
        evaluation: &mut Evaluation<'_>,
    ) -> Checked<(Sample, f64)> {
        let middle = self.left.midpoint(self.right);
        let left_middle = self.left.midpoint(middle);
        let right_middle = middle.midpoint(self.right);
        if self.left == left_middle || self.right == right_middle {
            return Err(MathError::NoConvergence);
        }
        let left = Self {
            left: self.left,
            right: middle,
            start: self.start,
            center: evaluation.sample(left_middle)?,
            end: self.center,
        };
        let right = Self {
            left: middle,
            right: self.right,
            start: self.center,
            center: evaluation.sample(right_middle)?,
            end: self.end,
        };
        let coarse = self.estimate()?;
        let fine = left.estimate()?.add(right.estimate()?)?;
        let correction = (fine.value - coarse.value) / 15.0;
        let estimate = correction.abs();
        let result = Sample::new(
            fine.value + correction,
            fine.noise + (fine.noise + coarse.noise) / 15.0,
        )?;
        if result.noise > budget {
            return Err(MathError::NoConvergence);
        }
        if estimate + result.noise <= budget {
            return Ok((result, estimate));
        }
        if depth >= MAX_DEPTH {
            return Err(MathError::NoConvergence);
        }
        let (left, left_error) = left.refine(budget / 2.0, depth + 1, evaluation)?;
        let (right, right_error) = right.refine(budget / 2.0, depth + 1, evaluation)?;
        Ok((left.add(right)?, left_error + right_error))
    }
}

pub(super) fn integrate(
    expression: &Expr,
    variable: u8,
    range: &Range,
    tolerance: &Rational,
) -> Checked<(f64, f64)> {
    if range.lower.abs().max(range.upper.abs()) > rat(1_000_000) {
        return Err(MathError::Limit);
    }
    if range.lower == range.upper {
        return Ok((0.0, 0.0));
    }
    let mut endpoints = Vec::new();
    let mut shapes_to_check = Vec::new();
    shapes(expression, &mut shapes_to_check);
    let mut work = MAX_SEEDS * 2;
    let resolution = 16;
    let step = checked((&range.upper - &range.lower) / rat(resolution))?;
    endpoints.push(convert(&range.lower)?);
    let mut left = range.lower.clone();
    for index in 1..=resolution {
        let right = checked(&range.lower + &step * rat(index))?;
        subdivide(
            Range::new(&left, &right),
            &shapes_to_check,
            variable,
            0,
            &mut endpoints,
            &mut work,
        )?;
        left = right;
    }
    let tolerance = convert(tolerance)?;
    let a = endpoints[0];
    let b = *endpoints.last().ok_or(MathError::NoConvergence)?;
    let length = b - a;
    let mut sum = Sample {
        value: 0.0,
        noise: 0.0,
    };
    let mut total_error = 0.0;
    let mut evaluator = Evaluation {
        expression,
        variable,
        remaining: MAX_SAMPLES,
    };
    for window in endpoints.windows(2) {
        let [left, right] = *window else {
            unreachable!()
        };
        if left >= right {
            return Err(MathError::NoConvergence);
        }
        let panel = Panel {
            left,
            right,
            start: evaluator.sample(left)?,
            center: evaluator.sample(left.midpoint(right))?,
            end: evaluator.sample(right)?,
        };
        let (result, error) =
            panel.refine(tolerance * (right - left) / length, 0, &mut evaluator)?;
        sum = sum.add(result)?;
        total_error += error;
    }
    if total_error + sum.noise > tolerance {
        return Err(MathError::NoConvergence);
    }
    Ok((sum.value, total_error))
}
