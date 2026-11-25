use super::{MathError, Rational, bounded, number};
use num_traits::{Signed, Zero};

pub(super) struct Root {
    pub(super) lower: Rational,
    pub(super) upper: Rational,
    pub(super) multiplicity: u32,
}

type Poly = Vec<Rational>;
const MAX_DEGREE: usize = 48;
const MAX_STEPS: usize = 3_600;

fn trim(poly: &mut Poly) {
    while poly.last().is_some_and(Zero::is_zero) {
        poly.pop();
    }
}

fn derivative(poly: &[Rational]) -> Poly {
    poly.iter()
        .enumerate()
        .skip(1)
        .map(|(i, c)| c * number(i as i64))
        .collect()
}

fn evaluate(poly: &[Rational], x: &Rational) -> Result<Rational, MathError> {
    poly.iter()
        .rev()
        .try_fold(number(0), |sum, c| bounded(sum * x + c))
}

fn divide(mut left: Poly, right: &[Rational]) -> Result<(Poly, Poly), MathError> {
    let lead = right.last().ok_or(MathError::NoConvergence)?;
    let mut quotient = vec![number(0); left.len().saturating_sub(right.len()) + 1];
    while left.len() >= right.len() {
        let shift = left.len() - right.len();
        let ratio = bounded(left.last().ok_or(MathError::NoConvergence)? / lead)?;
        quotient[shift] = ratio.clone();
        for (index, value) in right.iter().enumerate() {
            left[shift + index] = bounded(&left[shift + index] - &ratio * value)?;
        }
        trim(&mut left);
    }
    trim(&mut quotient);
    Ok((quotient, left))
}

fn quotient(left: Poly, right: &[Rational]) -> Result<Poly, MathError> {
    let (quotient, remainder) = divide(left, right)?;
    if !remainder.is_empty() {
        return Err(MathError::NoConvergence);
    }
    Ok(quotient)
}

fn normalize(poly: &mut Poly, monic: bool) -> Result<(), MathError> {
    if let Some(lead) = poly.last() {
        let divisor = if monic { lead.clone() } else { lead.abs() };
        for coefficient in poly {
            *coefficient = bounded(&*coefficient / &divisor)?;
        }
    }
    Ok(())
}

fn gcd(mut left: Poly, mut right: Poly) -> Result<Poly, MathError> {
    while !right.is_empty() {
        let (_, mut remainder) = divide(left, &right)?;
        normalize(&mut remainder, true)?;
        left = right;
        right = remainder;
    }
    normalize(&mut left, true)?;
    Ok(left)
}

fn variations(sequence: &[Poly], x: &Rational) -> Result<usize, MathError> {
    let mut previous = None;
    let mut changes = 0;
    for poly in sequence {
        let value = evaluate(poly, x)?;
        if !value.is_zero() {
            let sign = value.is_positive();
            if previous.is_some_and(|last| last != sign) {
                changes += 1;
            }
            previous = Some(sign);
        }
    }
    Ok(changes)
}

fn to_rate(x: &Rational) -> Rational {
    x.recip() - number(1)
}

fn exact_root(value: Rational, multiplicity: u32) -> Root {
    let rate = to_rate(&value);
    Root {
        lower: rate.clone(),
        upper: rate,
        multiplicity,
    }
}

fn simple(poly: &[Rational]) -> Option<Vec<Root>> {
    match poly {
        [constant, slope] => {
            let root = -constant / slope;
            Some(
                root.is_positive()
                    .then(|| exact_root(root, 1))
                    .into_iter()
                    .collect(),
            )
        }
        [constant, slope, quadratic] => {
            let discriminant = slope * slope - number(4) * constant * quadratic;
            if discriminant.is_negative() {
                return Some(Vec::new());
            }
            let num = discriminant.numer().sqrt();
            let den = discriminant.denom().sqrt();
            if &num * &num != *discriminant.numer() || &den * &den != *discriminant.denom() {
                return None;
            }
            let square_root = Rational::new(num, den);
            let twice = number(2) * quadratic;
            if square_root.is_zero() {
                let root = -slope / twice;
                return Some(
                    root.is_positive()
                        .then(|| exact_root(root, 2))
                        .into_iter()
                        .collect(),
                );
            }
            Some(
                [
                    (-slope + &square_root) / &twice,
                    (-slope - square_root) / twice,
                ]
                .into_iter()
                .filter(|value| value.is_positive())
                .map(|value| exact_root(value, 1))
                .collect(),
            )
        }
        _ => None,
    }
}

fn isolate(
    poly: Poly,
    multiplicity: u32,
    roots: &mut Vec<Root>,
    steps: &mut usize,
) -> Result<(), MathError> {
    let lead = poly.last().ok_or(MathError::NoConvergence)?.abs();
    let upper = number(2)
        + poly
            .iter()
            .take(poly.len() - 1)
            .map(|c| c.abs() / &lead)
            .max()
            .unwrap_or_else(|| number(0));
    let mut sequence = vec![poly.clone(), derivative(&poly)];
    while sequence.last().is_some_and(|p| !p.is_empty()) {
        let len = sequence.len();
        let (_, mut remainder) = divide(sequence[len - 2].clone(), &sequence[len - 1])?;
        if remainder.is_empty() {
            break;
        }
        for coefficient in &mut remainder {
            *coefficient = -&*coefficient;
        }
        normalize(&mut remainder, false)?;
        sequence.push(remainder);
    }
    let tolerance = number(1) / number(1_000_000_000_000);
    let lo = number(0);
    let mut pending = vec![(
        lo.clone(),
        upper.clone(),
        variations(&sequence, &lo)?,
        variations(&sequence, &upper)?,
    )];
    while let Some((a, b, va, vb)) = pending.pop() {
        let count = va.checked_sub(vb).ok_or(MathError::NoConvergence)?;
        if count == 0 {
            continue;
        }
        *steps += 1;
        if *steps > MAX_STEPS {
            return Err(MathError::Limit);
        }
        if count == 1 && evaluate(&poly, &b)?.is_zero() {
            roots.push(exact_root(b, multiplicity));
            continue;
        }
        if count == 1 && a.is_positive() {
            let lower = to_rate(&b);
            let upper = to_rate(&a);
            if &upper - &lower <= tolerance {
                roots.push(Root {
                    lower,
                    upper,
                    multiplicity,
                });
                continue;
            }
        }
        let middle = (&a + &b) / number(2);
        let vm = variations(&sequence, &middle)?;
        pending.push((middle.clone(), b, vm, vb));
        pending.push((a, middle, va, vm));
    }
    Ok(())
}

pub(super) fn periodic(flows: &[Rational]) -> Result<Vec<Root>, MathError> {
    let Some(start) = flows.iter().position(|value| !value.is_zero()) else {
        return Ok(Vec::new());
    };
    let mut poly = flows[start..].to_vec();
    trim(&mut poly);
    if poly.len() < 2
        || poly.iter().all(|c| !c.is_positive())
        || poly.iter().all(|c| !c.is_negative())
    {
        return Ok(Vec::new());
    }
    if poly.len() > MAX_DEGREE + 1 {
        return Err(MathError::Limit);
    }
    if let Some(mut exact) = simple(&poly) {
        exact.sort_by(|left, right| left.lower.cmp(&right.lower));
        return Ok(exact);
    }
    let mut common = gcd(poly.clone(), derivative(&poly))?;
    let mut distinct = quotient(poly, &common)?;
    let mut multiplicity = 1;
    let mut roots = Vec::new();
    let mut steps = 0;
    while distinct.len() > 1 {
        let repeated = gcd(distinct.clone(), common.clone())?;
        let square_free = quotient(distinct, &repeated)?;
        if square_free.len() > 1 {
            if let [constant, slope] = square_free.as_slice() {
                let root = -constant / slope;
                if root.is_positive() {
                    roots.push(exact_root(root, multiplicity));
                }
            } else {
                isolate(square_free, multiplicity, &mut roots, &mut steps)?;
            }
        }
        distinct = repeated;
        common = quotient(common, &distinct)?;
        multiplicity += 1;
    }
    roots.sort_by(|left, right| left.lower.cmp(&right.lower));
    Ok(roots)
}
