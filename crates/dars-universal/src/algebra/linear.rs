use super::polynomial::{Coefficient, NAMES, Poly, Powers, checked_coefficient};
use crate::MathError;
use num_traits::Zero;
use std::array;
use std::collections::BTreeSet;

pub(super) struct Solution {
    pub(super) result: String,
    pub(super) symbolic: bool,
    pub(super) parameter_constraints: BTreeSet<String>,
}

impl Solution {
    fn none() -> Self {
        Self {
            result: "none".to_owned(),
            symbolic: false,
            parameter_constraints: BTreeSet::new(),
        }
    }
}

fn reduce(matrix: &mut [Vec<Coefficient>], columns: usize) -> Result<Vec<usize>, MathError> {
    let mut pivots = Vec::with_capacity(columns);
    for column in 0..columns {
        let row = pivots.len();
        let Some(next) = (row..matrix.len()).find(|&index| !matrix[index][column].is_zero()) else {
            continue;
        };
        matrix.swap(row, next);
        let reciprocal = matrix[row][column].recip();
        for value in &mut matrix[row][column..] {
            *value = checked_coefficient(&*value * &reciprocal)?;
        }
        let pivot = matrix[row].clone();
        for (index, entry) in matrix.iter_mut().enumerate() {
            let multiple = entry[column].clone();
            if index == row || multiple.is_zero() {
                continue;
            }
            for (value, pivot_value) in entry[column..].iter_mut().zip(&pivot[column..]) {
                *value = checked_coefficient(&*value - &multiple * pivot_value)?;
            }
        }
        pivots.push(column);
    }
    Ok(pivots)
}

fn compose(poly: &Poly, affine: &[Poly; 3]) -> Result<Poly, MathError> {
    let mut result = Poly::default();
    for (powers, coefficient) in &poly.0 {
        let mut term = Poly::value(coefficient.clone());
        for (base, exponent) in affine.iter().zip(powers.0) {
            if exponent != 0 {
                term = term.mul(&base.clone().pow(exponent)?)?;
            }
        }
        result = result.add(&term)?;
    }
    Ok(result)
}

fn affine_text(mut poly: Poly, names: [&str; 3]) -> String {
    if poly.degree() != 0
        && let Some(constant) = poly.0.remove(&Powers([0; 3]))
    {
        let variables = poly.render(names);
        let sign = if variables.starts_with('-') { "" } else { "+" };
        return format!("{constant}{sign}{variables}");
    }
    poly.render(names)
}

pub(super) fn solve(
    equations: &[Poly],
    used: u8,
    restrictions: &[&Poly],
) -> Result<Solution, MathError> {
    if equations.iter().any(|equation| equation.degree() > 1) {
        return Err(MathError::Unsupported);
    }
    let used = if used == 0 { 1 } else { used };
    let variables: Vec<_> = (0..NAMES.len())
        .filter(|&index| used & (1 << index) != 0)
        .collect();
    let columns = variables.len();
    let mut matrix: Vec<Vec<_>> = equations
        .iter()
        .map(|equation| {
            let mut row: Vec<_> = variables
                .iter()
                .map(|&variable| equation.coefficient_for(variable, 1))
                .collect();
            row.push(-equation.coefficient_for(0, 0));
            row
        })
        .collect();
    let pivots = reduce(&mut matrix, columns)?;
    if matrix[pivots.len()..]
        .iter()
        .any(|row| !row[columns].is_zero())
    {
        return Ok(Solution::none());
    }

    let free: Vec<_> = (0..columns)
        .filter(|column| !pivots.contains(column))
        .collect();
    let mut affine = array::from_fn(|_| Poly::default());
    let mut names = NAMES;
    for (&column, parameter) in free.iter().zip(["t1", "t2", "t3"]) {
        let variable = variables[column];
        affine[variable] = Poly::variable(variable);
        names[variable] = parameter;
    }
    for (pivot_row, &pivot_column) in pivots.iter().enumerate() {
        let row = &matrix[pivot_row];
        let solution = &mut affine[variables[pivot_column]];
        *solution = Poly::value(row[columns].clone());
        for &free_column in &free {
            let mut powers = [0; 3];
            powers[variables[free_column]] = 1;
            solution.integrate_term(Powers(powers), -row[free_column].clone())?;
        }
    }

    let mut parameter_constraints = BTreeSet::new();
    for restriction in restrictions {
        let candidate = compose(restriction, &affine)?;
        if candidate.is_zero() {
            return Ok(Solution::none());
        }
        if candidate.constant().is_none() {
            parameter_constraints.insert(format!("{} != 0", candidate.monic()?.render(names)));
        }
    }
    let result = variables
        .into_iter()
        .map(|variable| {
            let expression = affine_text(std::mem::take(&mut affine[variable]), names);
            format!("{}={expression}", NAMES[variable])
        })
        .collect::<Vec<_>>()
        .join("; ");
    Ok(Solution {
        result,
        symbolic: !free.is_empty(),
        parameter_constraints,
    })
}
