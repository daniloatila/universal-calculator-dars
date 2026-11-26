use super::ast::{
    Checked, Expr, Function, Guard, NAMES, Rational, add, call, mul, neg, num, pow, rat,
};
use super::symbolic::derivative;
use crate::MathError;
use num_traits::{Signed, Zero};
use std::cmp::Ordering;
use std::collections::BTreeSet;

pub(super) fn sign(expression: &Expr) -> Option<Ordering> {
    match expression {
        Expr::Num(value) => Some(value.cmp(&rat(0))),
        Expr::Call(Function::Exp, _) => Some(Ordering::Greater),
        Expr::Call(Function::Abs, item) => sign(item).map(|value| value.max(value.reverse())),
        Expr::Mul(items) => items.iter().try_fold(Ordering::Greater, |total, item| {
            let value = sign(item)?;
            Some(match (total, value) {
                (Ordering::Equal, _) | (_, Ordering::Equal) => Ordering::Equal,
                (Ordering::Greater, result) => result,
                (Ordering::Less, result) => result.reverse(),
            })
        }),
        Expr::Pow(item, power) => sign(item).map(|value| {
            if power % 2 == 0 {
                value.max(value.reverse())
            } else {
                value
            }
        }),
        _ => None,
    }
}

fn preserves_local_guard(guard: &Guard, variable: u8, point: &Rational) -> Checked<()> {
    let value = guard.0.substitute(variable, point)?;
    let sign = sign(&value).ok_or(MathError::Unsupported)?;
    if !guard_accepts(guard, sign) {
        return Err(MathError::Domain);
    }
    Ok(())
}

pub(super) fn guard_accepts(guard: &Guard, sign: Ordering) -> bool {
    use super::ast::Condition::{Nonzero, Positive};
    match guard.1 {
        Nonzero => sign != Ordering::Equal,
        Positive => sign == Ordering::Greater,
    }
}

type Jet = Vec<Expr>;

fn constant(value: Expr, count: usize) -> Jet {
    let mut result = vec![num(0); count];
    result[0] = value;
    result
}

fn sum(mut left: Jet, right: Jet) -> Checked<Jet> {
    for (entry, addition) in left.iter_mut().zip(right) {
        *entry = add([entry.clone(), addition])?;
    }
    Ok(left)
}

fn product(left: &Jet, right: &Jet) -> Checked<Jet> {
    let mut result = Vec::with_capacity(left.len());
    for degree in 0..left.len() {
        let terms = (0..=degree)
            .filter(|&i| !left[i].is_zero() && !right[degree - i].is_zero())
            .map(|i| mul([left[i].clone(), right[degree - i].clone()]))
            .collect::<Checked<Vec<_>>>()?;
        result.push(add(terms)?);
    }
    Ok(result)
}

fn inverse(jet: &Jet) -> Checked<Jet> {
    match sign(&jet[0]) {
        Some(Ordering::Equal) => return Err(MathError::Domain),
        None => return Err(MathError::Unsupported),
        _ => {}
    }
    let inverse = pow(jet[0].clone(), -1)?;
    let mut result = Vec::with_capacity(jet.len());
    result.push(inverse.clone());
    for degree in 1..jet.len() {
        let terms = (1..=degree)
            .filter(|&i| !jet[i].is_zero() && !result[degree - i].is_zero())
            .map(|i| mul([jet[i].clone(), result[degree - i].clone()]))
            .collect::<Checked<Vec<_>>>()?;
        result.push(mul([neg(inverse.clone())?, add(terms)?])?);
    }
    Ok(result)
}

fn power(mut jet: Jet, exponent: i16) -> Checked<Jet> {
    if exponent < 0 {
        jet = inverse(&jet)?;
    }
    let mut remaining = exponent.unsigned_abs();
    let mut result = constant(num(1), jet.len());
    while remaining > 0 {
        if remaining % 2 == 1 {
            result = product(&result, &jet)?;
        }
        remaining /= 2;
        if remaining > 0 {
            jet = product(&jet, &jet)?;
        }
    }
    Ok(result)
}

fn convolution_derivative(input: &Jet, state: &Jet, degree: usize) -> Checked<Expr> {
    let terms = (1..=degree)
        .filter(|&i| !input[i].is_zero() && !state[degree - i].is_zero())
        .map(|i| mul([num(i as i64), input[i].clone(), state[degree - i].clone()]))
        .collect::<Checked<Vec<_>>>()?;
    mul([add(terms)?, Expr::Num(rat(degree as i64).recip())])
}

fn compound(function: Function, jet: Jet) -> Checked<Jet> {
    let start = jet[0].clone();
    match function {
        Function::Exp => {
            let mut result = vec![call(function, start)?];
            for degree in 1..jet.len() {
                result.push(convolution_derivative(&jet, &result, degree)?);
            }
            Ok(result)
        }
        Function::Sin | Function::Cos => {
            let mut sine = vec![call(Function::Sin, start.clone())?];
            let mut cosine = vec![call(Function::Cos, start)?];
            for degree in 1..jet.len() {
                let next_sine = convolution_derivative(&jet, &cosine, degree)?;
                let next_cosine = neg(convolution_derivative(&jet, &sine, degree)?)?;
                sine.push(next_sine);
                cosine.push(next_cosine);
            }
            Ok(if function == Function::Sin {
                sine
            } else {
                cosine
            })
        }
        Function::Ln => {
            match sign(&start) {
                Some(Ordering::Greater) => {}
                Some(_) => return Err(MathError::Domain),
                None => return Err(MathError::Unsupported),
            }
            let inverse = inverse(&jet)?;
            let mut result = vec![call(function, start)?];
            for degree in 1..jet.len() {
                result.push(convolution_derivative(&jet, &inverse, degree)?);
            }
            Ok(result)
        }
        Function::Abs => match sign(&start) {
            Some(Ordering::Greater) => Ok(jet),
            Some(Ordering::Less) => jet.into_iter().map(neg).collect(),
            Some(Ordering::Equal) if jet.iter().all(Expr::is_zero) => Err(MathError::NoConvergence),
            Some(Ordering::Equal) => Err(MathError::Unsupported),
            None => Err(MathError::Unsupported),
        },
        Function::Sqrt => Err(MathError::Unsupported),
    }
}

pub(super) fn coefficients(
    expression: &Expr,
    variable: u8,
    point: &Rational,
    count: usize,
) -> Checked<Jet> {
    match expression {
        Expr::Num(_) => Ok(constant(expression.clone(), count)),
        Expr::Var(index) if *index == variable => {
            let mut result = constant(Expr::Num(point.clone()), count);
            if count > 1 {
                result[1] = num(1);
            }
            Ok(result)
        }
        Expr::Var(_) => Err(MathError::Unsupported),
        Expr::Add(items) => items
            .iter()
            .try_fold(constant(num(0), count), |total, item| {
                sum(total, coefficients(item, variable, point, count)?)
            }),
        Expr::Mul(items) => items
            .iter()
            .try_fold(constant(num(1), count), |total, item| {
                product(&total, &coefficients(item, variable, point, count)?)
            }),
        Expr::Pow(base, degree) => power(coefficients(base, variable, point, count)?, *degree),
        Expr::Call(function, base) => {
            compound(*function, coefficients(base, variable, point, count)?)
        }
    }
}

fn affine_distance(base: &Expr, variable: u8, point: &Rational) -> Checked<Option<Rational>> {
    let slope = derivative(base, variable)?;
    let center = base.substitute(variable, point)?;
    match (slope.fraction(), center.fraction()) {
        (Some(slope), Some(center)) if !slope.is_zero() => Ok(Some((center / slope).abs())),
        _ => Ok(None),
    }
}

enum Convergence {
    Entire,
    Radius(Rational),
    Local,
}

impl Convergence {
    fn merge(self, other: Self) -> Self {
        match (self, other) {
            (Self::Local, _) | (_, Self::Local) => Self::Local,
            (Self::Radius(a), Self::Radius(b)) => Self::Radius(a.min(b)),
            (Self::Entire, value) | (value, Self::Entire) => value,
        }
    }
}

fn convergence(expression: &Expr, variable: u8, point: &Rational) -> Checked<Convergence> {
    Ok(match expression {
        Expr::Add(items) | Expr::Mul(items) => items
            .iter()
            .try_fold(Convergence::Entire, |current, item| {
                Ok(current.merge(convergence(item, variable, point)?))
            })?,
        Expr::Pow(base, exponent) if *exponent < 0 => {
            affine_distance(base, variable, point)?.map_or(Convergence::Local, Convergence::Radius)
        }
        Expr::Call(Function::Ln | Function::Abs, base) => {
            affine_distance(base, variable, point)?.map_or(Convergence::Local, Convergence::Radius)
        }
        Expr::Pow(base, _) | Expr::Call(_, base) => convergence(base, variable, point)?,
        _ => Convergence::Entire,
    })
}

pub(super) fn expand(
    expression: &Expr,
    variable: u8,
    point: &Rational,
    count: usize,
    guards: &BTreeSet<Guard>,
) -> Checked<(String, String)> {
    for guard in guards {
        preserves_local_guard(guard, variable, point)?;
    }
    let values = coefficients(expression, variable, point, count)?;
    let shift = add([Expr::Var(variable), Expr::Num(-point)])?;
    let mut terms = Vec::new();
    for (degree, value) in values.into_iter().enumerate() {
        if !value.is_zero() {
            terms.push(mul([value, pow(shift.clone(), degree as i16)?])?);
        }
    }
    let polynomial = add(terms)?.text();
    let variable_name = NAMES[usize::from(variable)];
    let offset = if point.is_zero() {
        variable_name.to_owned()
    } else {
        format!("({})", shift.text())
    };
    let condition = match convergence(expression, variable, point)? {
        Convergence::Entire if guards.is_empty() => {
            "Taylor convergence for all real inputs".to_owned()
        }
        Convergence::Radius(radius)
            if guards.is_empty()
                || guards.iter().all(|guard| {
                    affine_distance(&guard.0, variable, point).is_ok_and(|radius| radius.is_some())
                }) =>
        {
            let mut bound = radius;
            for guard in guards {
                if let Some(guard_radius) = affine_distance(&guard.0, variable, point)? {
                    bound = bound.min(guard_radius);
                }
            }
            format!("Taylor convergence for |{}| < {bound}", shift.text())
        }
        _ => "Taylor convergence on a neighborhood of the expansion point".to_owned(),
    };
    Ok((format!("{polynomial}+O({offset}^{count})"), condition))
}
