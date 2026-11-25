use super::MathError;
use super::polynomial::{Coefficient, Rational, checked_coefficient, coefficient};
use super::roots::{Root, evaluate, solve_roots};
use super::syntax::Relation;
use num_bigint::BigInt;
use num_traits::{Signed, Zero};
use std::cmp::Ordering;

struct CriticalPoint {
    root: Root,
    excluded: bool,
}

fn bracket(root: &Root, bits: usize) -> Result<(Coefficient, Coefficient), MathError> {
    match root {
        Root::Rational(point) => Ok((point.clone(), point.clone())),
        Root::Quadratic {
            center,
            radius_squared,
            negative,
            nonreal: false,
        } => {
            let scale = BigInt::from(1u8) << bits;
            let squared_floor = (radius_squared.numer() << (2 * bits)) / radius_squared.denom();
            let radius_floor = squared_floor.sqrt();
            let lower = Coefficient::new(radius_floor.clone(), scale.clone());
            let upper = Coefficient::new(radius_floor + BigInt::from(1u8), scale);
            if *negative {
                Ok((
                    checked_coefficient(center - upper)?,
                    checked_coefficient(center - lower)?,
                ))
            } else {
                Ok((
                    checked_coefficient(center + lower)?,
                    checked_coefficient(center + upper)?,
                ))
            }
        }
        Root::Quadratic { nonreal: true, .. } => Err(MathError::Unsupported),
    }
}

fn sample(
    left: Option<&CriticalPoint>,
    right: Option<&CriticalPoint>,
) -> Result<Coefficient, MathError> {
    match (left, right) {
        (None, None) => Ok(coefficient(0)),
        (Some(left), None) => checked_coefficient(bracket(&left.root, 8)?.1 + coefficient(1)),
        (None, Some(right)) => checked_coefficient(bracket(&right.root, 8)?.0 - coefficient(1)),
        (Some(left), Some(right)) => {
            for bits in [8, 16, 32, 64, 128, 256, 512] {
                let before = bracket(&left.root, bits)?.1;
                let after = bracket(&right.root, bits)?.0;
                if before < after {
                    return checked_coefficient((before + after) / coefficient(2));
                }
            }
            Err(MathError::NoConvergence)
        }
    }
}

fn render(critical: &[CriticalPoint], mask: &[bool]) -> String {
    let mut intervals = Vec::new();
    let mut index = 0;
    while index < mask.len() {
        if !mask[index] {
            index += 1;
            continue;
        }
        let start = index;
        while index + 1 < mask.len() && mask[index + 1] {
            index += 1;
        }
        let end = index;
        let left = if start == 0 {
            String::from("-inf")
        } else {
            critical[(start - 1) / 2].root.text()
        };
        let right = if end == mask.len() - 1 {
            String::from("inf")
        } else {
            critical[end / 2].root.text()
        };
        let opening = if start.is_multiple_of(2) { '(' } else { '[' };
        let closing = if end.is_multiple_of(2) { ')' } else { ']' };
        intervals.push(format!("{opening}{left},{right}{closing}"));
        index += 1;
    }
    if intervals.is_empty() {
        "{}".to_owned()
    } else {
        intervals.join(" union ")
    }
}

pub(super) fn solve(
    value: Rational,
    relation: Relation,
    variable: usize,
) -> Result<String, MathError> {
    let mut critical = Vec::new();
    if value.numerator.degree() != 0 {
        for (root, _) in solve_roots(value.numerator.clone(), variable, false)? {
            critical.push(CriticalPoint {
                root,
                excluded: false,
            });
        }
    }
    for exclusion in value
        .restrictions
        .iter()
        .chain(std::iter::once(&value.denominator))
    {
        if exclusion.degree() == 0 {
            continue;
        }
        for (root, _) in solve_roots(exclusion.clone(), variable, false)? {
            // Divisor exclusions stay ordered by exact rationals. This keeps symbolic critical
            // points attributable to a single quadratic with an exact comparison rule.
            if !matches!(root, Root::Rational(_)) {
                return Err(MathError::Unsupported);
            }
            critical.push(CriticalPoint {
                root,
                excluded: true,
            });
        }
    }
    critical.sort_by(|a, b| a.root.cmp_from_one_quadratic(&b.root));
    critical.dedup_by(|later, earlier| {
        let same = later.root.cmp_from_one_quadratic(&earlier.root) == Ordering::Equal;
        earlier.excluded |= same && later.excluded;
        same
    });

    let mut mask = Vec::with_capacity(2 * critical.len() + 1);
    let zero = Coefficient::zero();
    for index in 0..=critical.len() {
        let left = index.checked_sub(1).and_then(|i| critical.get(i));
        let right = critical.get(index);
        let sample = sample(left, right)?;
        let numerator = evaluate(&value.numerator, variable, &sample)?;
        let denominator = evaluate(&value.denominator, variable, &sample)?;
        let order = numerator.cmp(&zero);
        mask.push(relation.accepts(if denominator.is_negative() {
            order.reverse()
        } else {
            order
        }));
        if let Some(point) = right {
            mask.push(!point.excluded && relation.accepts(Ordering::Equal));
        }
    }
    Ok(render(&critical, &mask))
}
