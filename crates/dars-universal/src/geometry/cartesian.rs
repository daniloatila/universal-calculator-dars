use super::value::{self, Checked, RadicalSum, Rational, checked, rational};
use crate::MathError;
use num_traits::{Signed, Zero};
use std::cmp::Ordering;
use std::collections::BTreeSet;

pub(super) const MAX_VERTICES: usize = 32;
pub(super) type Point2 = [Rational; 2];

pub(super) fn points(input: &str, cap: usize) -> Checked<Vec<Vec<Rational>>> {
    let mut points = Vec::new();
    for block in input.trim().split(';') {
        let block = block.trim();
        if block.is_empty() {
            return Err(MathError::InvalidInput);
        }
        for row in block.lines().map(str::trim).filter(|row| !row.is_empty()) {
            if points.len() == cap {
                return Err(MathError::Limit);
            }
            let cells: Vec<_> = row.split_whitespace().take(4).collect();
            if !(2..=3).contains(&cells.len()) {
                return Err(MathError::Domain);
            }
            if points
                .first()
                .is_some_and(|point: &Vec<Rational>| point.len() != cells.len())
            {
                return Err(MathError::Domain);
            }
            points.push(
                cells
                    .into_iter()
                    .map(value::parse)
                    .collect::<Checked<_>>()?,
            );
        }
    }
    Ok(points)
}

pub(super) fn planar(points: Vec<Vec<Rational>>) -> Checked<Vec<Point2>> {
    points
        .into_iter()
        .map(|point| point.try_into().map_err(|_| MathError::Domain))
        .collect()
}

pub(super) fn text(point: &[Rational]) -> String {
    format!(
        "[{}]",
        point
            .iter()
            .map(Rational::to_string)
            .collect::<Vec<_>>()
            .join(",")
    )
}

pub(super) fn displacement(left: &[Rational], right: &[Rational]) -> Checked<Vec<Rational>> {
    left.iter()
        .zip(right)
        .map(|(left, right)| checked(left - right))
        .collect()
}

pub(super) fn dot(left: &[Rational], right: &[Rational]) -> Checked<Rational> {
    left.iter()
        .zip(right)
        .try_fold(rational(0), |total, (left, right)| {
            checked(total + checked(left * right)?)
        })
}

pub(super) fn distance(left: &[Rational], right: &[Rational]) -> Checked<RadicalSum> {
    let delta = displacement(left, right)?;
    RadicalSum::sqrt(dot(&delta, &delta)?)
}

fn cross(ax: &Rational, ay: &Rational, bx: &Rational, by: &Rational) -> Checked<Rational> {
    checked(checked(ax * by)? - checked(ay * bx)?)
}

fn area_term(a: &Point2, b: &Point2, c: &Point2) -> Checked<Rational> {
    cross(
        &checked(&b[0] - &a[0])?,
        &checked(&b[1] - &a[1])?,
        &checked(&c[0] - &a[0])?,
        &checked(&c[1] - &a[1])?,
    )
}

fn orient(a: &Point2, b: &Point2, c: &Point2) -> Checked<Ordering> {
    Ok(area_term(a, b, c)?.cmp(&rational(0)))
}

fn bracket(a: &Point2, b: &Point2, point: &Point2) -> bool {
    a.min(b) <= point && point <= a.max(b)
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum Contact<'a> {
    Disjoint,
    Cross,
    Touch(&'a Point2),
    Overlap(&'a Point2, &'a Point2),
}

pub(super) fn contact<'a>(
    a: &'a Point2,
    b: &'a Point2,
    c: &'a Point2,
    d: &'a Point2,
) -> Checked<Contact<'a>> {
    if a == b || c == d {
        return Err(MathError::Domain);
    }
    let ab_c = orient(a, b, c)?;
    let ab_d = orient(a, b, d)?;
    let cd_a = orient(c, d, a)?;
    let cd_b = orient(c, d, b)?;
    if [ab_c, ab_d, cd_a, cd_b]
        .into_iter()
        .all(|sign| sign == Ordering::Equal)
    {
        let first = a.min(b).max(c.min(d));
        let last = a.max(b).min(c.max(d));
        return Ok(match first.cmp(last) {
            Ordering::Greater => Contact::Disjoint,
            Ordering::Equal => Contact::Touch(first),
            Ordering::Less => Contact::Overlap(first, last),
        });
    }
    if ab_c != Ordering::Equal
        && ab_d == ab_c.reverse()
        && cd_a != Ordering::Equal
        && cd_b == cd_a.reverse()
    {
        return Ok(Contact::Cross);
    }
    for (sign, first, last, point) in [
        (ab_c, a, b, c),
        (ab_d, a, b, d),
        (cd_a, c, d, a),
        (cd_b, c, d, b),
    ] {
        if sign == Ordering::Equal && bracket(first, last, point) {
            return Ok(Contact::Touch(point));
        }
    }
    Ok(Contact::Disjoint)
}

pub(super) fn crossing_point(a: &Point2, b: &Point2, c: &Point2, d: &Point2) -> Checked<Point2> {
    let bax = checked(&b[0] - &a[0])?;
    let bay = checked(&b[1] - &a[1])?;
    let dcx = checked(&d[0] - &c[0])?;
    let dcy = checked(&d[1] - &c[1])?;
    let denominator = cross(&bax, &bay, &dcx, &dcy)?;
    if denominator.is_zero() {
        return Err(MathError::Domain);
    }
    let numerator = cross(
        &checked(&c[0] - &a[0])?,
        &checked(&c[1] - &a[1])?,
        &dcx,
        &dcy,
    )?;
    let parameter = checked(numerator / denominator)?;
    Ok([
        checked(&a[0] + checked(&parameter * bax)?)?,
        checked(&a[1] + checked(&parameter * bay)?)?,
    ])
}

pub(super) struct Polygon {
    pub(super) count: usize,
    pub(super) area: Rational,
    pub(super) perimeter: RadicalSum,
    pub(super) orientation: &'static str,
}

fn validate_boundary(vertices: &[Point2]) -> Checked<()> {
    let count = vertices.len();
    if vertices.iter().collect::<BTreeSet<_>>().len() != count {
        return Err(MathError::Domain);
    }
    for i in 0..count {
        let after_i = (i + 1) % count;
        for j in (i + 1)..count {
            let after_j = (j + 1) % count;
            let relation = contact(
                &vertices[i],
                &vertices[after_i],
                &vertices[j],
                &vertices[after_j],
            )?;
            if after_i == j {
                if relation != Contact::Touch(&vertices[j]) {
                    return Err(MathError::Domain);
                }
            } else if after_j == i {
                if relation != Contact::Touch(&vertices[i]) {
                    return Err(MathError::Domain);
                }
            } else if relation != Contact::Disjoint {
                return Err(MathError::Domain);
            }
        }
    }
    Ok(())
}

pub(super) fn polygon(input: &str) -> Checked<Polygon> {
    let mut vertices = planar(points(input, MAX_VERTICES + 1)?)?;
    if vertices.len() >= 2 && vertices.first() == vertices.last() {
        vertices.pop();
    }
    if vertices.len() < 3 {
        return Err(MathError::Domain);
    }
    if vertices.len() > MAX_VERTICES {
        return Err(MathError::Limit);
    }
    validate_boundary(&vertices)?;
    let mut twice_area = rational(0);
    let mut perimeter = RadicalSum::default();
    for index in 0..vertices.len() {
        let current = &vertices[index];
        let next = &vertices[(index + 1) % vertices.len()];
        twice_area = checked(twice_area + area_term(&vertices[0], current, next)?)?;
        perimeter = perimeter.add(distance(current, next)?)?;
    }
    let orientation = match twice_area.cmp(&rational(0)) {
        Ordering::Less => "clockwise",
        Ordering::Greater => "counterclockwise",
        Ordering::Equal => return Err(MathError::Domain),
    };
    Ok(Polygon {
        count: vertices.len(),
        area: checked(twice_area.abs() / rational(2))?,
        perimeter,
        orientation,
    })
}
