use super::exact::{self, Checked, Matrix, Rational};
use crate::MathError;
use nalgebra::{
    DMatrix, DVector,
    linalg::{QR, SVD, SymmetricEigen},
};
use num_traits::{Signed, ToPrimitive, Zero};

const MAX_ITERATIONS: usize = 4096;
const SOLVER_EPSILON: f64 = 4.0 * f64::EPSILON;
const SENSITIVITY_THRESHOLD: f64 = 1.490_116_119_384_765_6e-8; // square root of binary64 epsilon

pub(super) struct Approximation {
    pub(super) result: String,
    pub(super) diagnostics: Vec<String>,
}

fn scaled(matrix: &Matrix) -> Checked<(DMatrix<f64>, f64)> {
    let (rows, columns) = matrix.shape();
    let max = matrix
        .entries()
        .map(Signed::abs)
        .max()
        .ok_or(MathError::InvalidInput)?;
    if max.is_zero() {
        return Ok((DMatrix::zeros(rows, columns), 1.0));
    }
    let scale = max
        .to_f64()
        .filter(|value| (1e-100..=1e100).contains(value))
        .ok_or(MathError::Limit)?;
    let mut entries = Vec::with_capacity(rows * columns);
    for value in matrix.entries() {
        entries.push(scaled_entry(value, &max)?);
    }
    Ok((DMatrix::from_row_slice(rows, columns, &entries), scale))
}

fn scaled_entry(value: &Rational, max: &Rational) -> Checked<f64> {
    (value / max)
        .to_f64()
        .filter(|converted| converted.is_finite() && (value.is_zero() || converted.abs() >= 1e-150))
        .ok_or(MathError::Limit)
}

fn number(value: f64) -> String {
    if value == 0.0 {
        "0".to_owned()
    } else {
        value.to_string()
    }
}

fn vector(values: impl IntoIterator<Item = f64>) -> String {
    format!(
        "[{}]",
        values.into_iter().map(number).collect::<Vec<_>>().join(",")
    )
}

fn text(matrix: &DMatrix<f64>) -> String {
    format!(
        "[{}]",
        matrix
            .row_iter()
            .map(|row| vector(row.iter().copied()))
            .collect::<Vec<_>>()
            .join(",")
    )
}

fn diagnostics(
    residual: DMatrix<f64>,
    original: &DMatrix<f64>,
    orthogonal: &DMatrix<f64>,
    tolerance: f64,
) -> Checked<Vec<String>> {
    let magnitude = original.norm();
    let residual = if magnitude == 0.0 {
        residual.norm()
    } else {
        residual.norm() / magnitude
    };
    let identity = DMatrix::identity(orthogonal.ncols(), orthogonal.ncols());
    let orthogonality = (orthogonal.transpose() * orthogonal - identity).norm();
    if !residual.is_finite()
        || !orthogonality.is_finite()
        || residual > tolerance
        || orthogonality > tolerance
    {
        return Err(MathError::NoConvergence);
    }
    Ok(vec![
        format!("Relative Frobenius residual (observed): {residual:e}"),
        format!("Frobenius orthogonality error (observed): {orthogonality:e}"),
    ])
}

pub(super) fn eigen(matrix: &Matrix, tolerance: f64, vectors: bool) -> Checked<Approximation> {
    let size = matrix.square()?;
    if !exact::symmetric(matrix) {
        return Err(MathError::Unsupported);
    }
    let (scaled, scale) = scaled(matrix)?;
    let factors = SymmetricEigen::try_new(scaled.clone(), SOLVER_EPSILON, MAX_ITERATIONS)
        .ok_or(MathError::NoConvergence)?;
    if factors
        .eigenvalues
        .iter()
        .chain(factors.eigenvectors.iter())
        .any(|item| !item.is_finite())
    {
        return Err(MathError::NoConvergence);
    }

    let mut order: Vec<_> = (0..size).collect();
    order.sort_by(|&a, &b| factors.eigenvalues[a].total_cmp(&factors.eigenvalues[b]));
    let mut values = Vec::with_capacity(size);
    let mut basis = DMatrix::zeros(size, size);
    for (index, previous) in order.into_iter().enumerate() {
        values.push(factors.eigenvalues[previous] * scale);
        let mut column = factors.eigenvectors.column(previous).into_owned();
        let anchor = column
            .iter()
            .enumerate()
            .max_by(|(i, a), (j, b)| a.abs().total_cmp(&b.abs()).then_with(|| j.cmp(i)))
            .ok_or(MathError::NoConvergence)?
            .1;
        if *anchor < 0.0 {
            column *= -1.0;
        }
        basis.set_column(index, &column);
    }
    let diagonal = DMatrix::from_diagonal(&DVector::from_iterator(
        size,
        values.iter().map(|value| value / scale),
    ));
    let mut diagnostics = diagnostics(
        &scaled * &basis - &basis * diagonal,
        &scaled,
        &basis,
        tolerance,
    )?;
    let spectral_scale = values
        .iter()
        .fold(0.0_f64, |max, value| max.max(value.abs()));
    let sensitivity = spectral_scale * SENSITIVITY_THRESHOLD;
    if values
        .windows(2)
        .any(|pair| (pair[1] - pair[0]).abs() <= sensitivity)
    {
        diagnostics
            .push("Clustered eigenvalues: individual eigenvectors may be sensitive".to_owned());
    }
    if values.iter().any(|value| value.abs() <= sensitivity) {
        diagnostics.push("Eigenvalue near zero relative to the matrix scale".to_owned());
    }
    let values = vector(values);
    let result = if vectors {
        format!(r#"{{"values":{values},"vectors":{}}}"#, text(&basis))
    } else {
        values
    };
    Ok(Approximation {
        result,
        diagnostics,
    })
}

fn conditioning(matrix: DMatrix<f64>, rank: usize, inner: usize, diagnostics: &mut Vec<String>) {
    diagnostics.push(format!("Exact rank: {rank} of {inner}"));
    if rank < inner {
        diagnostics.push("Rank deficient: the matrix has dependent rows or columns".to_owned());
        return;
    }
    let Some(reciprocity) = reciprocal_condition(matrix) else {
        diagnostics.push("Condition estimate unavailable within the iteration budget".to_owned());
        return;
    };
    diagnostics.push(format!(
        "Estimated reciprocal 2-norm condition: {reciprocity:e}"
    ));
    if reciprocity <= SENSITIVITY_THRESHOLD {
        diagnostics.push(
            "Ill-conditioned: small perturbations may change the factors or solutions".to_owned(),
        );
    }
}

fn reciprocal_condition(matrix: DMatrix<f64>) -> Option<f64> {
    let decomposition =
        SVD::try_new_unordered(matrix, false, false, SOLVER_EPSILON, MAX_ITERATIONS)?;
    let mut smallest = f64::INFINITY;
    let mut largest = 0.0_f64;
    for &value in &decomposition.singular_values {
        if !value.is_finite() || value < 0.0 {
            return None;
        }
        smallest = smallest.min(value);
        largest = largest.max(value);
    }
    (largest > 0.0).then(|| smallest / largest)
}

pub(super) fn qr(matrix: Matrix, tolerance: f64) -> Checked<Approximation> {
    let (rows, columns) = matrix.shape();
    let inner = rows.min(columns);
    let (scaled, scale) = scaled(&matrix)?;
    let rank = exact::rank(matrix)?;
    let (mut q, mut r) = QR::new(scaled.clone()).unpack();
    for index in 0..inner {
        if r[(index, index)] < 0.0 {
            q.column_mut(index).scale_mut(-1.0);
            r.row_mut(index).scale_mut(-1.0);
        }
    }
    r *= scale;
    let residual = &q * r.map(|value| value / scale) - &scaled;
    let mut diagnostics = diagnostics(residual, &scaled, &q, tolerance)?;
    conditioning(scaled, rank, inner, &mut diagnostics);
    let result = format!(r#"{{"Q":{},"R":{}}}"#, text(&q), text(&r));
    Ok(Approximation {
        result,
        diagnostics,
    })
}
