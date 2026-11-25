use crate::MathError;
use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{One, Signed, Zero};
use std::ops::{Index, IndexMut};

pub(super) type Rational = BigRational;
pub(super) type Checked<T> = Result<T, MathError>;
pub(super) const MAX_DIMENSION: usize = 12;

pub(super) fn rat(value: i64) -> Rational {
    Rational::from_integer(value.into())
}

fn checked(value: Rational) -> Checked<Rational> {
    if value.numer().bits().max(value.denom().bits()) > 4096 {
        Err(MathError::Limit)
    } else {
        Ok(value)
    }
}

fn decimal(text: &str) -> Checked<Rational> {
    let (mantissa, exponent) = if let Some((base, power)) = text.split_once(['e', 'E']) {
        let exponent = power.parse::<i32>().map_err(|error| match error.kind() {
            std::num::IntErrorKind::PosOverflow | std::num::IntErrorKind::NegOverflow => {
                MathError::Limit
            }
            _ => MathError::InvalidInput,
        })?;
        (base, exponent)
    } else {
        (text, 0)
    };
    let (negative, mantissa) = match mantissa.strip_prefix(['-', '−']) {
        Some(value) => (true, value),
        None => (false, mantissa.strip_prefix('+').unwrap_or(mantissa)),
    };
    let (whole, fraction) = mantissa.split_once('.').unwrap_or((mantissa, ""));
    if whole.len() + fraction.len() > 128 || exponent.unsigned_abs() > 256 {
        return Err(MathError::Limit);
    }
    let digits = format!("{whole}{fraction}");
    if digits.is_empty() || !digits.bytes().all(|digit| digit.is_ascii_digit()) {
        return Err(MathError::InvalidInput);
    }
    let value = BigInt::parse_bytes(digits.as_bytes(), 10).ok_or(MathError::InvalidInput)?;
    let value = if negative { -value } else { value };
    let scale = exponent - fraction.len() as i32;
    let factor = BigInt::from(10u8).pow(scale.unsigned_abs());
    checked(if scale >= 0 {
        Rational::from_integer(value * factor)
    } else {
        Rational::new(value, factor)
    })
}

pub(super) fn number(text: &str) -> Checked<Rational> {
    if text.len() > 256 {
        return Err(MathError::Limit);
    }
    if let Some((left, right)) = text.split_once('/') {
        let numerator = decimal(left)?;
        let denominator = decimal(right)?;
        if denominator.is_zero() {
            return Err(MathError::Domain);
        }
        checked(numerator / denominator)
    } else {
        decimal(text)
    }
}

#[derive(Clone)]
pub(super) struct Matrix {
    rows: Vec<Vec<Rational>>,
    columns: usize,
}

impl Matrix {
    fn zeros(rows: usize, columns: usize) -> Self {
        Self {
            rows: vec![vec![rat(0); columns]; rows],
            columns,
        }
    }

    fn identity(size: usize) -> Self {
        let mut result = Self::zeros(size, size);
        for index in 0..size {
            result[index][index] = rat(1);
        }
        result
    }

    pub(super) fn shape(&self) -> (usize, usize) {
        (self.rows.len(), self.columns)
    }

    pub(super) fn entries(&self) -> impl Iterator<Item = &Rational> {
        self.rows.iter().flatten()
    }

    pub(super) fn square(&self) -> Checked<usize> {
        let (rows, columns) = self.shape();
        if rows != columns {
            return Err(MathError::Domain);
        }
        Ok(rows)
    }

    pub(super) fn text(&self) -> String {
        format!(
            "[{}]",
            self.rows
                .iter()
                .map(|row| vector_text(row))
                .collect::<Vec<_>>()
                .join(",")
        )
    }

    pub(super) fn vector(&self) -> Checked<Vec<Rational>> {
        if self.rows.len() != 1 && self.columns != 1 {
            return Err(MathError::Domain);
        }
        Ok(self.entries().cloned().collect())
    }

    pub(super) fn transpose(&self) -> Self {
        let (rows, columns) = self.shape();
        let mut result = Self::zeros(columns, rows);
        for (row, values) in self.rows.iter().enumerate() {
            for (column, value) in values.iter().enumerate() {
                result[column][row] = value.clone();
            }
        }
        result
    }
}

impl Index<usize> for Matrix {
    type Output = [Rational];

    fn index(&self, row: usize) -> &Self::Output {
        &self.rows[row]
    }
}

impl IndexMut<usize> for Matrix {
    fn index_mut(&mut self, row: usize) -> &mut Self::Output {
        &mut self.rows[row]
    }
}

pub(super) fn parse(input: &str) -> Checked<Matrix> {
    let mut rows = Vec::new();
    for block in input.trim().split(';') {
        let block = block.trim();
        if block.is_empty() {
            return Err(MathError::InvalidInput);
        }
        for row in block.lines().map(str::trim).filter(|line| !line.is_empty()) {
            if rows.len() == MAX_DIMENSION {
                return Err(MathError::Limit);
            }
            let values: Vec<_> = row.split_whitespace().take(MAX_DIMENSION + 1).collect();
            if values.len() > MAX_DIMENSION {
                return Err(MathError::Limit);
            }
            if rows
                .first()
                .is_some_and(|old: &Vec<Rational>| old.len() != values.len())
            {
                return Err(MathError::InvalidInput);
            }
            rows.push(values.into_iter().map(number).collect::<Checked<_>>()?);
        }
    }
    let columns = rows
        .first()
        .filter(|row| !row.is_empty())
        .ok_or(MathError::InvalidInput)?
        .len();
    Ok(Matrix { rows, columns })
}

pub(super) fn vector_text(values: &[Rational]) -> String {
    format!(
        "[{}]",
        values
            .iter()
            .map(Rational::to_string)
            .collect::<Vec<_>>()
            .join(",")
    )
}

pub(super) fn add(mut left: Matrix, right: Matrix, subtract: bool) -> Checked<Matrix> {
    if left.shape() != right.shape() {
        return Err(MathError::Domain);
    }
    for (left, right) in left
        .rows
        .iter_mut()
        .flatten()
        .zip(right.rows.into_iter().flatten())
    {
        *left = checked(if subtract {
            &*left - right
        } else {
            &*left + right
        })?;
    }
    Ok(left)
}

pub(super) fn dot(left: &[Rational], right: &[Rational]) -> Checked<Rational> {
    if left.len() != right.len() {
        return Err(MathError::Domain);
    }
    left.iter()
        .zip(right)
        .try_fold(rat(0), |total, (left, right)| checked(total + left * right))
}

pub(super) fn cross(left: &[Rational], right: &[Rational]) -> Checked<Vec<Rational>> {
    if left.len() != 3 || right.len() != 3 {
        return Err(MathError::Domain);
    }
    [(1, 2), (2, 0), (0, 1)]
        .into_iter()
        .map(|(a, b)| checked(&left[a] * &right[b] - &left[b] * &right[a]))
        .collect()
}

pub(super) fn multiply(left: &Matrix, right: &Matrix) -> Checked<Matrix> {
    let (left_rows, left_columns) = left.shape();
    let (right_rows, right_columns) = right.shape();
    if left_columns != right_rows {
        return Err(MathError::Domain);
    }
    let transposed = right.transpose();
    let mut result = Matrix::zeros(left_rows, right_columns);
    for row in 0..left_rows {
        for column in 0..right_columns {
            result[row][column] = dot(&left[row], &transposed[column])?;
        }
    }
    Ok(result)
}

fn pivot(matrix: &Matrix, starting_row: usize, column: usize) -> Option<usize> {
    (starting_row..matrix.rows.len())
        .filter(|&row| !matrix[row][column].is_zero())
        .max_by(|&a, &b| {
            matrix[a][column]
                .abs()
                .cmp(&matrix[b][column].abs())
                .then_with(|| b.cmp(&a))
        })
}

fn rref(matrix: &mut Matrix, columns: usize) -> Checked<Vec<usize>> {
    let mut pivots = Vec::new();
    for column in 0..columns {
        let pivot_row = pivots.len();
        let Some(selected) = pivot(matrix, pivot_row, column) else {
            continue;
        };
        matrix.rows.swap(pivot_row, selected);
        let inverse = matrix[pivot_row][column].recip();
        for value in &mut matrix[pivot_row][column..] {
            *value = checked(&*value * &inverse)?;
        }
        let coefficients = matrix[pivot_row][column..].to_vec();
        for (row, values) in matrix.rows.iter_mut().enumerate() {
            let multiple = values[column].clone();
            if row == pivot_row || multiple.is_zero() {
                continue;
            }
            for (value, pivot) in values[column..].iter_mut().zip(&coefficients) {
                *value = checked(&*value - &multiple * pivot)?;
            }
        }
        pivots.push(column);
    }
    Ok(pivots)
}

pub(super) fn rank(mut matrix: Matrix) -> Checked<usize> {
    let columns = matrix.columns;
    Ok(rref(&mut matrix, columns)?.len())
}

pub(super) fn inverse(mut matrix: Matrix) -> Checked<Matrix> {
    let size = matrix.square()?;
    let identity = Matrix::identity(size);
    for (row, companion) in matrix.rows.iter_mut().zip(identity.rows) {
        row.extend(companion);
    }
    matrix.columns *= 2;
    if rref(&mut matrix, size)?.len() != size {
        return Err(MathError::Singular);
    }
    for row in &mut matrix.rows {
        row.drain(..size);
    }
    matrix.columns = size;
    Ok(matrix)
}

pub(super) enum Solution {
    Unique(Vec<Rational>),
    Infinite {
        particular: Vec<Rational>,
        basis: Vec<Vec<Rational>>,
    },
    Inconsistent,
}

pub(super) fn solve(mut left: Matrix, right: &[Rational]) -> Checked<Solution> {
    if left.rows.len() != right.len() {
        return Err(MathError::Domain);
    }
    let columns = left.columns;
    for (row, value) in left.rows.iter_mut().zip(right) {
        row.push(value.clone());
    }
    left.columns += 1;
    let pivots = rref(&mut left, columns)?;
    if left.rows[pivots.len()..]
        .iter()
        .any(|row| !row[columns].is_zero())
    {
        return Ok(Solution::Inconsistent);
    }
    let mut particular = vec![rat(0); columns];
    for (row, column) in pivots.iter().copied().enumerate() {
        particular[column] = left[row][columns].clone();
    }
    if pivots.len() == columns {
        return Ok(Solution::Unique(particular));
    }
    let mut basis = Vec::new();
    for free in (0..columns).filter(|column| !pivots.contains(column)) {
        let mut direction = vec![rat(0); columns];
        direction[free] = rat(1);
        for (row, column) in pivots.iter().copied().enumerate() {
            direction[column] = -&left[row][free];
        }
        basis.push(direction);
    }
    Ok(Solution::Infinite { particular, basis })
}

pub(super) struct Lu {
    pub(super) permutation: Matrix,
    pub(super) lower: Matrix,
    pub(super) upper: Matrix,
    parity: bool,
}

pub(super) fn lu(mut upper: Matrix) -> Checked<Lu> {
    let (rows, columns) = upper.shape();
    let inner = rows.min(columns);
    let mut permutation = Matrix::identity(rows);
    let mut lower = Matrix::zeros(rows, inner);
    let mut parity = false;
    for column in 0..inner {
        lower[column][column] = rat(1);
        let Some(selected) = pivot(&upper, column, column) else {
            continue;
        };
        if selected != column {
            parity = !parity;
            permutation.rows.swap(column, selected);
            upper.rows.swap(column, selected);
            for prior in 0..column {
                let current = lower[column][prior].clone();
                lower[column][prior] = lower[selected][prior].clone();
                lower[selected][prior] = current;
            }
        }
        let reciprocal = upper[column][column].recip();
        let pivot = upper[column][column..].to_vec();
        for row in (column + 1)..rows {
            if upper[row][column].is_zero() {
                continue;
            }
            let multiple = checked(&upper[row][column] * &reciprocal)?;
            for (value, coefficient) in upper[row][column..].iter_mut().zip(&pivot) {
                *value = checked(&*value - &multiple * coefficient)?;
            }
            lower[row][column] = multiple;
        }
    }
    upper.rows.truncate(inner);
    Ok(Lu {
        permutation,
        lower,
        upper,
        parity,
    })
}

pub(super) fn determinant(matrix: Matrix) -> Checked<Rational> {
    let size = matrix.square()?;
    let lu = lu(matrix)?;
    let sign = if lu.parity { -1 } else { 1 };
    let mut determinant = rat(sign);
    for index in 0..size {
        if lu.upper[index][index].is_zero() {
            return Ok(rat(0));
        }
        determinant = checked(determinant * &lu.upper[index][index])?;
    }
    Ok(determinant)
}

pub(super) fn diagonal(matrix: &Matrix) -> bool {
    matrix.rows.iter().enumerate().all(|(row, entries)| {
        entries
            .iter()
            .enumerate()
            .all(|(column, entry)| row == column || entry.is_zero())
    })
}

pub(super) fn symmetric(matrix: &Matrix) -> bool {
    let (rows, _) = matrix.shape();
    (0..rows).all(|row| (0..row).all(|column| matrix[row][column] == matrix[column][row]))
}

pub(super) fn exactly_diagonal_spectrum(matrix: &Matrix) -> (Vec<Rational>, Matrix) {
    let (size, _) = matrix.shape();
    let mut order: Vec<_> = (0..size).collect();
    order.sort_by(|&left, &right| matrix[left][left].cmp(&matrix[right][right]));
    let mut values = Vec::with_capacity(size);
    let mut vectors = Matrix::zeros(size, size);
    for (column, row) in order.into_iter().enumerate() {
        values.push(matrix[row][row].clone());
        vectors[row][column] = Rational::one();
    }
    (values, vectors)
}
