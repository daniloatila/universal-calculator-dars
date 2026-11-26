//! Bounded binary64 evaluation of the existing Calculus syntax tree.

#[cfg(test)]
mod tests;

use super::ast::{self, Expr, Function};
use crate::MathError;
use num_traits::{ToPrimitive, Zero};
use std::f64::consts::{FRAC_PI_2, PI, TAU};

pub(crate) type Checked<T> = Result<T, MathError>;
#[cfg(feature = "graph-lab")]
pub(crate) const PARAMETERS: u8 = (1 << 4) | (1 << 5) | (1 << 6);
pub(crate) type Bindings = [f64; 7];

enum Node {
    Literal(f64, bool),
    Variable(usize),
    Add(Vec<Self>),
    Multiply(Vec<Self>),
    Power(Box<Self>, i16),
    Call(Function, Box<Self>),
}

pub(crate) struct Expression(Node);

pub(crate) fn finite(value: f64) -> Checked<f64> {
    value.is_finite().then_some(value).ok_or(MathError::Limit)
}

pub(crate) fn number(text: &str) -> Checked<f64> {
    let value = ast::binding(text)?;
    let converted = finite(value.to_f64().ok_or(MathError::Limit)?)?;
    if converted == 0.0 && !value.is_zero() {
        return Err(MathError::Limit);
    }
    Ok(converted)
}

#[cfg(feature = "optimization")]
pub(crate) fn rational(text: &str) -> Checked<num_rational::BigRational> {
    ast::binding(text)
}

impl Expression {
    pub(crate) fn parse(text: &str, allowed: u8) -> Checked<Self> {
        let expression = ast::parse_numerical(text)?;
        if expression.variables() & !allowed != 0 {
            return Err(MathError::InvalidInput);
        }
        Ok(Self(Node::compile(expression)?))
    }

    pub(crate) fn value(&self, coordinates: &Bindings) -> Checked<f64> {
        Ok(self.0.sample(coordinates, None)?.value)
    }

    #[cfg(feature = "optimization")]
    pub(crate) fn derivative(&self, coordinates: &Bindings, variable: usize) -> Checked<f64> {
        Ok(self.0.sample(coordinates, Some(variable))?.slope)
    }

    pub(crate) fn segment(&self, low: &Bindings, high: &Bindings) -> Checked<bool> {
        let bounds = std::array::from_fn(|index| Interval::between(low[index], high[index]));
        let mut resolved = true;
        self.0.range(&bounds, &mut resolved)?;
        Ok(resolved)
    }

    pub(crate) fn point_range(&self, point: &Bindings) -> Checked<(f64, f64)> {
        let bounds = point.map(Interval::point);
        let mut resolved = true;
        let value = self.0.range(&bounds, &mut resolved)?;
        Ok((value.low, value.high))
    }
}

#[derive(Clone, Copy)]
struct Dual {
    value: f64,
    slope: f64,
    depends: bool,
}

impl Dual {
    fn constant(value: f64) -> Self {
        Self {
            value,
            slope: 0.0,
            depends: false,
        }
    }

    fn add(self, other: Self) -> Self {
        Self {
            value: self.value + other.value,
            slope: self.slope + other.slope,
            depends: self.depends || other.depends,
        }
    }

    fn multiply(self, other: Self) -> Checked<Self> {
        let value = self.value * other.value;
        if value == 0.0 && self.value != 0.0 && other.value != 0.0 {
            return Err(MathError::Limit);
        }
        Ok(Self {
            value,
            slope: self.value * other.slope + self.slope * other.value,
            depends: self.depends || other.depends,
        })
    }
}

impl Node {
    fn compile(expression: Expr) -> Checked<Self> {
        Ok(match expression {
            Expr::Num(value) => {
                let converted = finite(value.to_f64().ok_or(MathError::Limit)?)?;
                if converted == 0.0 && !value.is_zero() {
                    return Err(MathError::Limit);
                }
                let rounded =
                    num_rational::BigRational::from_float(converted).as_ref() != Some(&value);
                Self::Literal(converted, rounded)
            }
            Expr::Var(index) => Self::Variable(usize::from(index)),
            Expr::Add(items) => Self::Add(
                items
                    .into_iter()
                    .map(Self::compile)
                    .collect::<Checked<_>>()?,
            ),
            Expr::Mul(items) => Self::Multiply(
                items
                    .into_iter()
                    .map(Self::compile)
                    .collect::<Checked<_>>()?,
            ),
            Expr::Pow(base, degree) => Self::Power(Box::new(Self::compile(*base)?), degree),
            Expr::Call(function, base) => Self::Call(function, Box::new(Self::compile(*base)?)),
        })
    }

    fn sample(&self, coordinates: &Bindings, variable: Option<usize>) -> Checked<Dual> {
        let result = match self {
            Self::Literal(value, _) => Dual::constant(*value),
            Self::Variable(index) => Dual {
                value: coordinates[*index],
                slope: if variable == Some(*index) { 1.0 } else { 0.0 },
                depends: variable == Some(*index),
            },
            Self::Add(items) => items.iter().try_fold(Dual::constant(0.0), |sum, item| {
                Ok(sum.add(item.sample(coordinates, variable)?))
            })?,
            Self::Multiply(items) => items
                .iter()
                .try_fold(Dual::constant(1.0), |product, item| {
                    product.multiply(item.sample(coordinates, variable)?)
                })?,
            Self::Power(base, degree) => {
                let x = base.sample(coordinates, variable)?;
                let degree = i32::from(*degree);
                if x.value == 0.0 && degree <= 0 {
                    return Err(MathError::Domain);
                }
                let value = x.value.powi(degree);
                if value == 0.0 && x.value != 0.0 {
                    return Err(MathError::Limit);
                }
                let slope = if x.slope == 0.0 || degree == 0 {
                    0.0
                } else {
                    f64::from(degree) * x.value.powi(degree - 1) * x.slope
                };
                Dual {
                    value,
                    slope,
                    depends: x.depends && degree != 0,
                }
            }
            Self::Call(function, base) => {
                let x = base.sample(coordinates, variable)?;
                let value = match function {
                    Function::Sin => x.value.sin(),
                    Function::Cos => x.value.cos(),
                    Function::Exp => {
                        let exponential = x.value.exp();
                        if exponential == 0.0 {
                            return Err(MathError::Limit);
                        }
                        exponential
                    }
                    Function::Ln if x.value > 0.0 => x.value.ln(),
                    Function::Sqrt if x.value >= 0.0 => x.value.sqrt(),
                    Function::Abs => x.value.abs(),
                    _ => return Err(MathError::Domain),
                };
                if x.depends && x.value == 0.0 && matches!(function, Function::Abs | Function::Sqrt)
                {
                    return Err(MathError::NoConvergence);
                }
                let slope = if x.slope == 0.0 {
                    0.0
                } else {
                    x.slope
                        * match function {
                            Function::Sin => x.value.cos(),
                            Function::Cos => -x.value.sin(),
                            Function::Exp => value,
                            Function::Ln => x.value.recip(),
                            Function::Sqrt if value > 0.0 => 0.5 / value,
                            Function::Abs if x.value != 0.0 => x.value.signum(),
                            _ => return Err(MathError::NoConvergence),
                        }
                };
                Dual {
                    value,
                    slope,
                    depends: x.depends,
                }
            }
        };
        finite(result.value)?;
        finite(result.slope)?;
        Ok(result)
    }

    fn range(&self, coordinates: &[Interval; 7], resolved: &mut bool) -> Checked<Interval> {
        let result = match self {
            Self::Literal(value, rounded) => {
                if *rounded {
                    Interval::around(*value, *value)
                } else {
                    Interval::point(*value)
                }
            }
            Self::Variable(index) => coordinates[*index],
            Self::Add(items) => items.iter().try_fold(Interval::point(0.0), |sum, item| {
                let item = item.range(coordinates, resolved)?;
                Ok(Interval::around(sum.low + item.low, sum.high + item.high))
            })?,
            Self::Multiply(items) => {
                items
                    .iter()
                    .try_fold(Interval::point(1.0), |product, item| {
                        let item = item.range(coordinates, resolved)?;
                        let products = [
                            product.low * item.low,
                            product.low * item.high,
                            product.high * item.low,
                            product.high * item.high,
                        ];
                        Interval::hull(&products)
                    })?
            }
            Self::Power(base, degree) => {
                let x = base.range(coordinates, resolved)?;
                let degree = i32::from(*degree);
                if degree <= 0 && x.contains_zero() {
                    return Err(MathError::Domain);
                }
                if degree == 0 {
                    Interval::point(1.0)
                } else {
                    let first = x.low.powi(degree);
                    let last = x.high.powi(degree);
                    let minimum = if degree > 0 && degree % 2 == 0 && x.contains_zero() {
                        0.0
                    } else {
                        first.min(last)
                    };
                    Interval::around(minimum, first.max(last))
                }
            }
            Self::Call(function, base) => {
                let x = base.range(coordinates, resolved)?;
                match function {
                    Function::Sin | Function::Cos => {
                        *resolved &= x.high - x.low <= FRAC_PI_2;
                        x.trigonometric(matches!(function, Function::Cos))
                    }
                    Function::Exp => Interval::around(x.low.exp(), x.high.exp()),
                    Function::Ln if x.low > 0.0 => Interval::around(x.low.ln(), x.high.ln()),
                    Function::Sqrt if x.low >= 0.0 => Interval::around(x.low.sqrt(), x.high.sqrt()),
                    Function::Abs => Interval::around(
                        if x.contains_zero() {
                            0.0
                        } else {
                            x.low.abs().min(x.high.abs())
                        },
                        x.low.abs().max(x.high.abs()),
                    ),
                    _ => return Err(MathError::Domain),
                }
            }
        };
        finite(result.low)?;
        finite(result.high)?;
        Ok(result)
    }
}

#[derive(Clone, Copy)]
struct Interval {
    low: f64,
    high: f64,
}

impl Interval {
    fn point(value: f64) -> Self {
        Self {
            low: value,
            high: value,
        }
    }

    fn between(first: f64, last: f64) -> Self {
        Self {
            low: first.min(last),
            high: first.max(last),
        }
    }

    fn around(low: f64, high: f64) -> Self {
        Self {
            low: low.next_down(),
            high: high.next_up(),
        }
    }

    fn hull(values: &[f64]) -> Checked<Self> {
        if values.iter().any(|x| !x.is_finite()) {
            return Err(MathError::Limit);
        }
        let low = values.iter().copied().fold(f64::INFINITY, f64::min);
        let high = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        Ok(Self::around(low, high))
    }

    fn contains_zero(self) -> bool {
        self.low <= 0.0 && self.high >= 0.0
    }

    fn trigonometric(self, cosine: bool) -> Self {
        if self.low.abs().max(self.high.abs()) > 1e7 || self.high - self.low >= TAU {
            return Self {
                low: -1.0,
                high: 1.0,
            };
        }
        let limit = 8.0 * f64::EPSILON * self.low.abs().max(self.high.abs()).max(1.0);
        let includes = |phase: f64| {
            ((self.low - limit - phase) / TAU).ceil() <= ((self.high + limit - phase) / TAU).floor()
        };
        let (left, right, maximum, minimum) = if cosine {
            (self.low.cos(), self.high.cos(), 0.0, PI)
        } else {
            (self.low.sin(), self.high.sin(), FRAC_PI_2, -FRAC_PI_2)
        };
        Self::around(
            if includes(minimum) {
                -1.0
            } else {
                left.min(right) - limit
            },
            if includes(maximum) {
                1.0
            } else {
                left.max(right) + limit
            },
        )
    }
}
