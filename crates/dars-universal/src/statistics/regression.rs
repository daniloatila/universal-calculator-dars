use super::*;
use nalgebra::{DMatrix, DVector, linalg::SVD};

const MAX_PREDICTORS: usize = 8;
const MAX_REGRESSION_ROWS: usize = 256;
const SVD_ITERATIONS: usize = 4096;

pub(super) fn evaluate(fields: &Fields, options: &Map<String, Value>) -> Checked<Output> {
    fields.restrict(&["predictors", "response"])?;
    options_allowed(options, &["missing"])?;
    let policy = missing(options)?;
    let raw_rows: Vec<Raw> = decode(fields.get("predictors")?)?;
    if raw_rows.len() > MAX_REGRESSION_ROWS {
        return Err(MathError::Limit);
    }
    let y = vector(fields.get("response")?, policy, MAX_REGRESSION_ROWS)?;
    if raw_rows.len() != y.len() {
        return Err(MathError::Domain);
    }
    let mut rows = Vec::new();
    let mut response = Vec::new();
    let mut source_rows = Vec::new();
    let mut width = None;
    for (i, (row, value)) in raw_rows.iter().zip(y).enumerate() {
        let entries = vector(row, policy, MAX_PREDICTORS)?;
        if entries.is_empty() || width.is_some_and(|columns| columns != entries.len()) {
            return Err(MathError::Domain);
        }
        width = Some(entries.len());
        if let (Some(complete), Some(y)) = (entries.into_iter().collect::<Option<Vec<_>>>(), value)
        {
            rows.push(complete);
            response.push(y);
            source_rows.push(i);
        }
    }
    let k = width.ok_or(MathError::Domain)?;
    let n = rows.len();
    if n <= k {
        return Err(MathError::Domain);
    }
    let predictor_moments = (0..k)
        .map(|j| moments(&rows.iter().map(|r| r[j].clone()).collect::<Vec<_>>()))
        .collect::<Checked<Vec<_>>>()?;
    let predictor_centers = predictor_moments
        .iter()
        .map(|m| m.mean.to_string())
        .collect::<Vec<_>>();
    let y = moments(&response)?;
    let y_center = y.mean.to_string();
    let column_max = predictor_moments
        .iter()
        .map(|m| m.centered.iter().map(Signed::abs).max().unwrap_or_default())
        .collect::<Vec<_>>();
    let scale = |x: &Rational, divisor: &Rational| {
        if divisor.is_zero() {
            Ok(0.0)
        } else {
            float(&(x / divisor))
        }
    };
    let mut values = Vec::with_capacity(n * k);
    for i in 0..n {
        for (column, max) in predictor_moments.iter().zip(&column_max) {
            values.push(scale(&column.centered[i], max)?);
        }
    }
    let x = DMatrix::from_row_slice(n, k, &values);
    let svd = SVD::try_new(x.clone(), true, true, 4.0 * f64::EPSILON, SVD_ITERATIONS)
        .ok_or(MathError::NoConvergence)?;
    let singular = svd.singular_values.as_slice();
    if singular.iter().any(|x| !x.is_finite() || *x < 0.0) {
        return Err(MathError::NoConvergence);
    }
    let high = singular.iter().copied().fold(0.0_f64, f64::max);
    let low = singular.iter().copied().fold(f64::INFINITY, f64::min);
    let rank_threshold = high * (n.max(k) as f64 * 32.0 * f64::EPSILON);
    let rank = singular.iter().filter(|v| **v > rank_threshold).count();
    let reciprocal_condition = if high == 0.0 { 0.0 } else { low / high };
    let status = if rank < k {
        "rank_deficient"
    } else if reciprocal_condition <= 1e-8 {
        "ill_conditioned"
    } else {
        "fitted"
    };
    let mut result = json!({"count":n,"missing":raw_rows.len()-n,"predictors":k,"rank":rank+1,"expected_rank":k+1,
        "status":status,"reciprocal_condition":reciprocal_condition,"rank_threshold":rank_threshold,"predictor_centers":predictor_centers,
        "response_center":y_center,"coefficients":null,"intercept":null,"residuals":null,"diagnostics":null});
    if rank == k {
        let response_scale = y.centered.iter().map(Signed::abs).max().unwrap_or_default();
        let scaled_y = DVector::from_vec(
            y.centered
                .iter()
                .map(|entry| scale(entry, &response_scale))
                .collect::<Checked<Vec<_>>>()?,
        );
        let slopes = svd
            .solve(&scaled_y, rank_threshold)
            .map_err(|_| MathError::NoConvergence)?;
        let coefficients = slopes
            .iter()
            .zip(&column_max)
            .map(|(&coefficient, column_max)| {
                let coef = Rational::from_float(coefficient).ok_or(MathError::NoConvergence)?;
                Ok(coef * &response_scale / column_max)
            })
            .collect::<Checked<Vec<_>>>()?;
        let natural_slopes = coefficients
            .iter()
            .map(float)
            .collect::<Checked<Vec<_>>>()?;
        let intercept = &y.mean
            - coefficients
                .iter()
                .zip(&predictor_moments)
                .map(|(c, m)| c * &m.mean)
                .sum::<Rational>();
        let scaled_residuals = &scaled_y - &x * &slopes;
        let response_scale = float(&response_scale)?;
        let residuals = source_rows
            .iter()
            .zip(scaled_residuals.iter())
            .map(|(&index, &value)| json!({"index":index,"value":value*response_scale}))
            .collect::<Vec<_>>();
        let ssr = scaled_residuals.norm_squared();
        let sst = scaled_y.norm_squared();
        let df = n - k - 1;
        let r2 = (sst != 0.0).then(|| 1.0 - ssr / sst);
        let rss = ssr * response_scale * response_scale;
        let tss = sst * response_scale * response_scale;
        let rmse = (ssr / n as f64).sqrt() * response_scale;
        if !rss.is_finite() || !tss.is_finite() || !rmse.is_finite() {
            return Err(MathError::Limit);
        }
        result["intercept"] = json!(float(&intercept)?);
        result["coefficients"] = json!(natural_slopes);
        result["residuals"] = json!(residuals);
        result["diagnostics"] = json!({"r2":r2,"adjusted_r2":r2.filter(|_|df>0).map(|r|1.0-(1.0-r)*(n-1) as f64/df as f64),
            "residual_df":df,"rss":rss,"tss":tss,"rmse":rmse,"residual_standard_error":(df>0).then(||(ssr/df as f64).sqrt()*response_scale)});
    }
    Ok(Output::new(
        result,
        "centered_scaled_svd_least_squares",
        "y_hat = mean(y) + sum(beta_j * (x_j - mean(x_j)))",
        &[
            "Exact decimal centering precedes binary64 SVD on predictors independently scaled by their largest centered magnitude.",
            "Rank uses sigma_max × max(n,k) × 32 × binary64 epsilon. Reported rank includes the intercept. A reciprocal condition at most 1e−8 flags a numerically sensitive fit.",
            "A rank-deficient design produces rank diagnostics without coefficients. Centered prediction uses the exact rational centers; the uncentered intercept can be sensitive to extrapolation.",
            "Residuals are observed minus fitted, indexed back into the input. A constant response has undefined R-squared. No causal interpretation is implied.",
        ],
    ))
}
