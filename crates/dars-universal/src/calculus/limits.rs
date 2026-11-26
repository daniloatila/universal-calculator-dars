use super::ast::{
    Checked, Expr, Function, Guard, Rational, add, call, checked, mul, neg, num, pow, rat,
};
use super::series::{coefficients, guard_accepts, sign};
use crate::MathError;
use num_traits::Zero;
use std::cmp::Ordering;
use std::collections::BTreeSet;

pub(super) enum Point {
    Finite(Rational),
    Infinity(bool),
}

#[derive(Clone, Copy)]
pub(super) enum Side {
    Left,
    Right,
    Both,
}

#[derive(PartialEq, Eq)]
pub(super) enum Value {
    Finite(Expr),
    Infinity(bool),
    Absent,
}

#[derive(Clone)]
struct Leading {
    order: i16,
    coefficient: Expr,
}

impl Leading {
    fn sign(&self, negative: bool) -> Checked<Ordering> {
        let sign = sign(&self.coefficient).ok_or(MathError::Unsupported)?;
        Ok(if negative && self.order % 2 != 0 {
            sign.reverse()
        } else {
            sign
        })
    }
}

type Polynomial = Vec<Rational>;

fn trim(items: &mut Polynomial) {
    while items.last().is_some_and(Zero::is_zero) {
        items.pop();
    }
}

fn poly_sum(mut left: Polynomial, right: Polynomial) -> Checked<Polynomial> {
    left.resize(left.len().max(right.len()), rat(0));
    for (term, addition) in left.iter_mut().zip(right) {
        *term = checked(&*term + addition)?;
    }
    trim(&mut left);
    Ok(left)
}

fn poly_product(left: &Polynomial, right: &Polynomial) -> Checked<Polynomial> {
    if left.is_empty() || right.is_empty() {
        return Ok(Vec::new());
    }
    let length = left.len() + right.len() - 1;
    if length > 65 {
        return Err(MathError::Limit);
    }
    let mut result = vec![rat(0); length];
    for (i, coefficient) in left.iter().enumerate() {
        if coefficient.is_zero() {
            continue;
        }
        for (j, term) in right.iter().enumerate() {
            if !term.is_zero() {
                result[i + j] = checked(&result[i + j] + coefficient * term)?;
            }
        }
    }
    Ok(result)
}

fn poly_pow(mut base: Polynomial, mut power: u16) -> Checked<Polynomial> {
    let mut result = vec![rat(1)];
    while power > 0 {
        if power % 2 == 1 {
            result = poly_product(&result, &base)?;
        }
        power /= 2;
        if power > 0 {
            base = poly_product(&base, &base)?;
        }
    }
    Ok(result)
}

fn is_rational(expression: &Expr) -> bool {
    match expression {
        Expr::Add(items) | Expr::Mul(items) => items.iter().all(is_rational),
        Expr::Pow(base, _) => is_rational(base),
        Expr::Call(..) => false,
        _ => true,
    }
}

fn rational_parts(expression: &Expr, variable: u8) -> Checked<(Polynomial, Polynomial)> {
    match expression {
        Expr::Num(value) => {
            let numerator = if value.is_zero() {
                Vec::new()
            } else {
                vec![value.clone()]
            };
            Ok((numerator, vec![rat(1)]))
        }
        Expr::Var(index) if *index == variable => Ok((vec![rat(0), rat(1)], vec![rat(1)])),
        Expr::Add(items) => {
            let mut numerator = Vec::new();
            let mut denominator = vec![rat(1)];
            for item in items {
                let (n, d) = rational_parts(item, variable)?;
                numerator = poly_sum(
                    poly_product(&numerator, &d)?,
                    poly_product(&n, &denominator)?,
                )?;
                denominator = poly_product(&denominator, &d)?;
            }
            Ok((numerator, denominator))
        }
        Expr::Mul(items) => {
            let (mut numerator, mut denominator) = (vec![rat(1)], vec![rat(1)]);
            for item in items {
                let (n, d) = rational_parts(item, variable)?;
                numerator = poly_product(&numerator, &n)?;
                denominator = poly_product(&denominator, &d)?;
            }
            Ok((numerator, denominator))
        }
        Expr::Pow(base, power) => {
            let (mut numerator, mut denominator) = rational_parts(base, variable)?;
            if *power < 0 {
                std::mem::swap(&mut numerator, &mut denominator);
            }
            if denominator.is_empty() {
                return Err(MathError::Domain);
            }
            Ok((
                poly_pow(numerator, power.unsigned_abs())?,
                poly_pow(denominator, power.unsigned_abs())?,
            ))
        }
        _ => Err(MathError::Unsupported),
    }
}

pub(super) fn polynomial(expression: &Expr, variable: u8) -> Checked<Option<Polynomial>> {
    if !is_rational(expression) || expression.variables() & !(1 << variable) != 0 {
        return Ok(None);
    }
    let (numerator, denominator) = rational_parts(expression, variable)?;
    if let [constant] = denominator.as_slice() {
        return numerator
            .into_iter()
            .map(|term| checked(term / constant))
            .collect::<Checked<Polynomial>>()
            .map(Some);
    }
    Ok(None)
}

fn term(poly: Polynomial, point: &Point) -> Checked<Option<(i16, Rational)>> {
    if poly.is_empty() {
        return Ok(None);
    }
    match point {
        Point::Infinity(_) => Ok(Some((
            1 - poly.len() as i16,
            poly.last().ok_or(MathError::NoConvergence)?.clone(),
        ))),
        Point::Finite(value) if value.is_zero() => Ok(poly
            .into_iter()
            .enumerate()
            .find(|(_, item)| !item.is_zero())
            .map(|(order, item)| (order as i16, item))),
        Point::Finite(value) => {
            let mut shifted = Vec::new();
            let offset = vec![value.clone(), rat(1)];
            for term in poly.into_iter().rev() {
                shifted = poly_sum(poly_product(&shifted, &offset)?, vec![term])?;
            }
            Ok(shifted
                .into_iter()
                .enumerate()
                .find(|(_, item)| !item.is_zero())
                .map(|(order, item)| (order as i16, item)))
        }
    }
}

fn rational_leading(expression: &Expr, variable: u8, point: &Point) -> Checked<Option<Leading>> {
    let (numerator, denominator) = rational_parts(expression, variable)?;
    let (denominator_order, denominator_coefficient) =
        term(denominator, point)?.ok_or(MathError::Domain)?;
    term(numerator, point)?
        .map(|(numerator_order, numerator_coefficient)| {
            Ok(Leading {
                order: numerator_order - denominator_order,
                coefficient: Expr::Num(checked(numerator_coefficient / denominator_coefficient)?),
            })
        })
        .transpose()
}

fn leading(
    expression: &Expr,
    variable: u8,
    point: &Point,
    negative: bool,
) -> Checked<Option<Leading>> {
    if is_rational(expression) {
        return rational_leading(expression, variable, point);
    }
    if let Point::Finite(center) = point {
        match coefficients(expression, variable, center, 12) {
            Ok(jet) => {
                let leading = jet
                    .into_iter()
                    .enumerate()
                    .find(|(_, term)| !term.is_zero());
                return leading
                    .map(|(order, coefficient)| {
                        Ok(Some(Leading {
                            order: order as i16,
                            coefficient,
                        }))
                    })
                    .unwrap_or(Err(MathError::NoConvergence));
            }
            Err(MathError::Domain | MathError::Unsupported | MathError::NoConvergence) => {}
            Err(error) => return Err(error),
        }
    }
    match expression {
        Expr::Mul(items) => {
            let mut order = 0;
            let mut terms = Vec::new();
            for item in items {
                let Some(leading) = leading(item, variable, point, negative)? else {
                    return Ok(None);
                };
                order += leading.order;
                terms.push(leading.coefficient);
            }
            Ok(Some(Leading {
                order,
                coefficient: mul(terms)?,
            }))
        }
        Expr::Pow(base, power) => {
            let Some(leading) = leading(base, variable, point, negative)? else {
                return if *power > 0 {
                    Ok(None)
                } else {
                    Err(MathError::Domain)
                };
            };
            if *power < 0 && leading.sign(negative)? == Ordering::Equal {
                return Err(MathError::Unsupported);
            }
            Ok(Some(Leading {
                order: leading.order.checked_mul(*power).ok_or(MathError::Limit)?,
                coefficient: pow(leading.coefficient, *power)?,
            }))
        }
        Expr::Add(items) => {
            let mut min = i16::MAX;
            let mut terms = Vec::new();
            for item in items {
                let Some(leading) = leading(item, variable, point, negative)? else {
                    continue;
                };
                if leading.order < min {
                    min = leading.order;
                    terms.clear();
                }
                if leading.order == min {
                    terms.push(leading.coefficient);
                }
            }
            if terms.is_empty() {
                return Ok(None);
            }
            let coefficient = add(terms)?;
            if coefficient.is_zero() {
                return Err(MathError::NoConvergence);
            }
            Ok(Some(Leading {
                order: min,
                coefficient,
            }))
        }
        Expr::Call(Function::Abs, base) => {
            let Some(mut leading) = leading(base, variable, point, negative)? else {
                return Ok(None);
            };
            if leading.sign(negative)? == Ordering::Less {
                leading.coefficient = neg(leading.coefficient)?;
            }
            Ok(Some(leading))
        }
        _ => Err(MathError::Unsupported),
    }
}

fn value(expression: &Expr, variable: u8, point: &Point, negative: bool) -> Checked<Value> {
    if let Expr::Call(function, argument) = expression {
        return match value(argument, variable, point, negative)? {
            Value::Absent => Ok(Value::Absent),
            Value::Finite(argument) if *function == Function::Ln && argument.is_zero() => {
                Ok(Value::Infinity(true))
            }
            Value::Finite(argument) => Ok(Value::Finite(call(*function, argument)?)),
            Value::Infinity(is_negative) => Ok(match function {
                Function::Abs => Value::Infinity(false),
                Function::Exp if is_negative => Value::Finite(num(0)),
                Function::Exp => Value::Infinity(false),
                Function::Ln if is_negative => Value::Absent,
                Function::Ln => Value::Infinity(false),
                Function::Sin | Function::Cos => Value::Absent,
                Function::Sqrt => return Err(MathError::Unsupported),
            }),
        };
    }
    let Some(leading) = leading(expression, variable, point, negative)? else {
        return Ok(Value::Finite(num(0)));
    };
    match leading.order.cmp(&0) {
        Ordering::Greater => Ok(Value::Finite(num(0))),
        Ordering::Equal => Ok(Value::Finite(leading.coefficient)),
        Ordering::Less => match leading.sign(negative)? {
            Ordering::Less => Ok(Value::Infinity(true)),
            Ordering::Greater => Ok(Value::Infinity(false)),
            Ordering::Equal => Err(MathError::NoConvergence),
        },
    }
}

fn directional(
    expression: &Expr,
    variable: u8,
    point: &Point,
    negative: bool,
    guards: &BTreeSet<Guard>,
) -> Checked<Value> {
    for guard in guards {
        let sign = if matches!(guard.0, Expr::Call(Function::Exp, _)) {
            Ordering::Greater
        } else {
            match leading(&guard.0, variable, point, negative)? {
                Some(leading) => leading.sign(negative)?,
                None => Ordering::Equal,
            }
        };
        if !guard_accepts(guard, sign) {
            return Ok(Value::Absent);
        }
    }
    value(expression, variable, point, negative)
}

pub(super) fn solve(
    expression: &Expr,
    variable: u8,
    point: &Point,
    side: Side,
    guards: &BTreeSet<Guard>,
) -> Checked<Value> {
    match (point, side) {
        (Point::Infinity(negative), Side::Both) => {
            directional(expression, variable, point, *negative, guards)
        }
        (Point::Infinity(_), _) => Err(MathError::InvalidInput),
        (_, Side::Left) => directional(expression, variable, point, true, guards),
        (_, Side::Right) => directional(expression, variable, point, false, guards),
        (_, Side::Both) => {
            let left = directional(expression, variable, point, true, guards)?;
            let right = directional(expression, variable, point, false, guards)?;
            if left == right {
                return Ok(left);
            }
            if let (Value::Finite(left), Value::Finite(right)) = (&left, &right) {
                let difference = add([left.clone(), neg(right.clone())?])?;
                return match sign(&difference) {
                    Some(Ordering::Equal) => Ok(Value::Finite(left.clone())),
                    Some(_) => Ok(Value::Absent),
                    None => Err(MathError::Unsupported),
                };
            }
            Ok(Value::Absent)
        }
    }
}
