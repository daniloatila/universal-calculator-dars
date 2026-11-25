use super::ast::{
    self, Checked, Condition, Expr, Function, Guard, Rational, add, call, checked, mul, neg, num,
    pow, rat,
};
use crate::MathError;
use num_traits::{Signed, Zero};
use std::collections::BTreeSet;

pub(super) fn derivative(expression: &Expr, variable: u8) -> Checked<Expr> {
    if expression.variables() & (1 << variable) == 0 {
        return Ok(num(0));
    }
    match expression {
        Expr::Var(_) => Ok(num(1)),
        Expr::Add(items) => add(items
            .iter()
            .map(|item| derivative(item, variable))
            .collect::<Checked<Vec<_>>>()?),
        Expr::Mul(items) => {
            let mut terms = Vec::new();
            for (index, item) in items.iter().enumerate() {
                let differential = derivative(item, variable)?;
                if !differential.is_zero() {
                    let mut factors = items.clone();
                    factors[index] = differential;
                    terms.push(mul(factors)?);
                }
            }
            add(terms)
        }
        Expr::Pow(base, degree) => mul([
            num(i64::from(*degree)),
            pow(base.as_ref().clone(), degree - 1)?,
            derivative(base, variable)?,
        ]),
        Expr::Call(function, argument) => {
            let argument_copy = argument.as_ref().clone();
            let outer = match function {
                Function::Sin => call(Function::Cos, argument_copy)?,
                Function::Cos => neg(call(Function::Sin, argument_copy)?)?,
                Function::Exp => expression.clone(),
                Function::Ln => pow(argument_copy, -1)?,
                Function::Abs => mul([argument_copy, pow(expression.clone(), -1)?])?,
            };
            mul([outer, derivative(argument, variable)?])
        }
        Expr::Num(_) => Ok(num(0)),
    }
}

fn affine_slope(expression: &Expr, variable: u8) -> Checked<Rational> {
    let derivative = derivative(expression, variable)?;
    derivative
        .fraction()
        .filter(|value| !value.is_zero())
        .cloned()
        .ok_or(MathError::Unsupported)
}

pub(super) fn antiderivative(expression: &Expr, variable: u8) -> Checked<Expr> {
    match elementary_primitive(expression, variable) {
        Err(MathError::Unsupported) => {}
        tested => return tested,
    }
    let Some(terms) = super::limits::polynomial(expression, variable)? else {
        return Err(MathError::Unsupported);
    };
    let mut primitive = Vec::new();
    for (degree, term) in terms.into_iter().enumerate() {
        if !term.is_zero() {
            let power = (degree + 1) as i16;
            primitive.push(mul([
                Expr::Num(checked(term / rat(i64::from(power)))?),
                pow(Expr::Var(variable), power)?,
            ])?);
        }
    }
    add(primitive)
}

fn elementary_primitive(expression: &Expr, variable: u8) -> Checked<Expr> {
    if expression.variables() & (1 << variable) == 0 {
        return mul([expression.clone(), Expr::Var(variable)]);
    }
    match expression {
        Expr::Var(_) => mul([
            Expr::Num(Rational::new(1.into(), 2.into())),
            pow(expression.clone(), 2)?,
        ]),
        Expr::Add(items) => add(items
            .iter()
            .map(|item| antiderivative(item, variable))
            .collect::<Checked<Vec<_>>>()?),
        Expr::Mul(items) => {
            let (mut factors, dependent): (Vec<_>, Vec<_>) = items
                .iter()
                .cloned()
                .partition(|item| item.variables() & (1 << variable) == 0);
            let [dependent] = dependent.as_slice() else {
                return Err(MathError::Unsupported);
            };
            factors.push(antiderivative(dependent, variable)?);
            mul(factors)
        }
        Expr::Pow(base, degree) => {
            let slope = affine_slope(base, variable)?;
            let base = base.as_ref().clone();
            if *degree == -1 {
                return mul([
                    Expr::Num(slope.recip()),
                    call(Function::Ln, call(Function::Abs, base)?)?,
                ]);
            }
            let new_power = degree + 1;
            let divisor = checked(slope * rat(i64::from(new_power)))?;
            mul([Expr::Num(divisor.recip()), pow(base, new_power)?])
        }
        Expr::Call(function, argument) => {
            let slope = affine_slope(argument, variable)?;
            let argument = argument.as_ref().clone();
            let primitive = match function {
                Function::Sin => neg(call(Function::Cos, argument)?)?,
                Function::Cos => call(Function::Sin, argument)?,
                Function::Exp => expression.clone(),
                Function::Ln => {
                    add([mul([argument.clone(), expression.clone()])?, neg(argument)?])?
                }
                Function::Abs => mul([
                    Expr::Num(Rational::new(1.into(), 2.into())),
                    argument,
                    expression.clone(),
                ])?,
            };
            mul([Expr::Num(slope.recip()), primitive])
        }
        Expr::Num(_) => Err(MathError::Unsupported),
    }
}

pub(super) fn derive(
    expression: &Expr,
    variable: u8,
    order: u64,
    guards: &mut BTreeSet<Guard>,
) -> Checked<Expr> {
    let mut current = expression.clone();
    for _ in 0..order {
        current = derivative(&current, variable)?;
        guards.extend(ast::guards(&current, false)?);
        if guards.len() > 16 {
            return Err(MathError::Limit);
        }
    }
    Ok(current)
}

#[derive(Clone)]
pub(super) struct Range {
    pub(super) lower: Rational,
    pub(super) upper: Rational,
}

impl Range {
    pub(super) fn new(lower: &Rational, upper: &Rational) -> Self {
        Self {
            lower: lower.clone().min(upper.clone()),
            upper: lower.clone().max(upper.clone()),
        }
    }

    fn singleton(value: Rational) -> Self {
        Self {
            lower: value.clone(),
            upper: value,
        }
    }

    fn positive(&self) -> bool {
        self.lower.is_positive()
    }

    fn excludes_zero(&self) -> bool {
        self.positive() || self.upper.is_negative()
    }

    fn midpoint(&self) -> Checked<Rational> {
        checked((&self.lower + &self.upper) / rat(2))
    }
}

pub(super) fn interval(expression: &Expr, variable: u8, input: &Range) -> Checked<Range> {
    match expression {
        Expr::Num(value) => Ok(Range::singleton(value.clone())),
        Expr::Var(index) if *index == variable => Ok(input.clone()),
        Expr::Var(_) => Err(MathError::Unsupported),
        Expr::Add(items) => {
            let mut range = Range::singleton(rat(0));
            for item in items {
                let item = interval(item, variable, input)?;
                range.lower = checked(range.lower + item.lower)?;
                range.upper = checked(range.upper + item.upper)?;
            }
            Ok(range)
        }
        Expr::Mul(items) => {
            let mut range = Range::singleton(rat(1));
            for item in items {
                let item = interval(item, variable, input)?;
                let candidates = [
                    &range.lower * &item.lower,
                    &range.lower * &item.upper,
                    &range.upper * &item.lower,
                    &range.upper * &item.upper,
                ];
                let lower = candidates.iter().min().ok_or(MathError::NoConvergence)?;
                let upper = candidates.iter().max().ok_or(MathError::NoConvergence)?;
                range = Range {
                    lower: checked(lower.clone())?,
                    upper: checked(upper.clone())?,
                };
            }
            Ok(range)
        }
        Expr::Pow(base, degree) => {
            let base = interval(base, variable, input)?;
            if *degree <= 0 && !base.excludes_zero() {
                return Err(MathError::Unsupported);
            }
            let lower = checked(base.lower.pow(i32::from(*degree)))?;
            let upper = checked(base.upper.pow(i32::from(*degree)))?;
            let mut enclosure = Range::new(&lower, &upper);
            if *degree > 0 && degree % 2 == 0 && !base.excludes_zero() {
                enclosure.lower = rat(0);
            }
            Ok(enclosure)
        }
        Expr::Call(Function::Sin | Function::Cos, _) => Ok(Range::new(&rat(-1), &rat(1))),
        Expr::Call(Function::Abs, base) => {
            let base = interval(base, variable, input)?;
            let mut enclosure = Range::new(&base.lower.abs(), &base.upper.abs());
            if !base.excludes_zero() {
                enclosure.lower = rat(0);
            }
            Ok(enclosure)
        }
        Expr::Call(..) => Err(MathError::Unsupported),
    }
}

fn test_range(guard: &Guard, variable: u8, range: &Range) -> Checked<bool> {
    if matches!(guard.0, Expr::Call(Function::Exp, _)) {
        return Ok(true);
    }
    if let Expr::Call(Function::Abs, base) = &guard.0 {
        return test_range(
            &Guard(base.as_ref().clone(), Condition::Nonzero),
            variable,
            range,
        );
    }
    match interval(&guard.0, variable, range) {
        Ok(enclosure) => Ok(match guard.1 {
            Condition::Positive => enclosure.positive(),
            Condition::Nonzero => enclosure.excludes_zero(),
        }),
        Err(MathError::Unsupported) => Ok(false),
        Err(error) => Err(error),
    }
}

fn certify(guard: &Guard, variable: u8, range: &Range, depth: u8, work: &mut usize) -> Checked<()> {
    if *work == 0 {
        return Err(MathError::Unsupported);
    }
    *work -= 1;
    if test_range(guard, variable, range)? {
        return Ok(());
    }
    let lower = guard.0.substitute(variable, &range.lower)?;
    let upper = guard.0.substitute(variable, &range.upper)?;
    if [lower.fraction(), upper.fraction()]
        .into_iter()
        .flatten()
        .any(|value| !guard.accepts(value))
    {
        return Err(MathError::Domain);
    }
    if guard.1 == Condition::Nonzero
        && let (Some(left), Some(right)) = (lower.fraction(), upper.fraction())
        && left.is_positive() != right.is_positive()
    {
        return Err(MathError::Domain);
    }
    if depth == 12 || range.lower == range.upper {
        return Err(MathError::Unsupported);
    }
    let middle = range.midpoint()?;
    certify(
        guard,
        variable,
        &Range::new(&range.lower, &middle),
        depth + 1,
        work,
    )?;
    certify(
        guard,
        variable,
        &Range::new(&middle, &range.upper),
        depth + 1,
        work,
    )
}

pub(super) fn certify_domain(guards: &BTreeSet<Guard>, variable: u8, range: &Range) -> Checked<()> {
    let mut work = 2048;
    for guard in guards {
        certify(guard, variable, range, 0, &mut work)?;
    }
    Ok(())
}
