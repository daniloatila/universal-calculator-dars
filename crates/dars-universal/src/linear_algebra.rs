mod exact;
mod numeric;

use crate::{Computation, Exactness, MathError};
use exact::{Checked, Matrix, Solution, number, rat, vector_text};
use num_traits::{ToPrimitive, Zero};
use serde_json::Value;
use std::collections::BTreeMap;

struct Answer {
    result: String,
    method: &'static str,
    formula: &'static str,
    tolerance: Option<f64>,
    constraints: Vec<String>,
}

impl Answer {
    fn exact(result: String, method: &'static str, formula: &'static str) -> Self {
        Self {
            result,
            method,
            formula,
            tolerance: None,
            constraints: Vec::new(),
        }
    }

    fn approximate(
        result: numeric::Approximation,
        method: &'static str,
        formula: &'static str,
        tolerance: f64,
    ) -> Self {
        Self {
            result: result.result,
            method,
            formula,
            tolerance: Some(tolerance),
            constraints: result.diagnostics,
        }
    }
}

fn tolerance(options: &Value, permitted: bool) -> Checked<f64> {
    let options = options.as_object().ok_or(MathError::InvalidInput)?;
    if options.keys().any(|name| !permitted || name != "tolerance") {
        return Err(MathError::InvalidInput);
    }
    let Some(value) = options.get("tolerance") else {
        return Ok(1e-10);
    };
    let value = number(value.as_str().ok_or(MathError::InvalidInput)?.trim())?;
    if value < rat(10_000_000_000_000).recip() || value > rat(1_000_000).recip() {
        return Err(MathError::Limit);
    }
    value.to_f64().ok_or(MathError::Limit)
}

fn system(left: Matrix, right: &[exact::Rational]) -> Checked<Answer> {
    const METHOD: &str = "exact_linear_system";
    const FORMULA: &str = "A*x = b";
    Ok(match exact::solve(left, right)? {
        Solution::Unique(vector) => Answer::exact(
            format!(
                r#"{{"status":"unique","solution":{}}}"#,
                vector_text(&vector)
            ),
            METHOD,
            FORMULA,
        ),
        Solution::Inconsistent => {
            Answer::exact(r#"{"status":"inconsistent"}"#.to_owned(), METHOD, FORMULA)
        }
        Solution::Infinite { particular, basis } => {
            let directions = basis
                .iter()
                .map(|direction| vector_text(direction))
                .collect::<Vec<_>>()
                .join(",");
            let parameters = (1..=basis.len())
                .map(|index| format!(r#""t{index}""#))
                .collect::<Vec<_>>()
                .join(",");
            let mut answer = Answer::exact(
                format!(
                    r#"{{"status":"infinite","particular":{},"basis":[{directions}],"parameters":[{parameters}]}}"#,
                    vector_text(&particular)
                ),
                METHOD,
                FORMULA,
            );
            answer
                .constraints
                .push("Free parameters range over the reals".to_owned());
            answer
        }
    })
}

fn eigen(matrix: &Matrix, vectors: bool, tolerance: f64) -> Checked<Answer> {
    matrix.square()?;
    const FORMULA: &str = "A*V = V*diag(lambda)";
    if exact::diagonal(matrix) {
        let (values, basis) = exact::exactly_diagonal_spectrum(matrix);
        let zeros = values.iter().filter(|value| value.is_zero()).count();
        let values = vector_text(&values);
        let result = if vectors {
            format!(r#"{{"values":{values},"vectors":{}}}"#, basis.text())
        } else {
            values
        };
        let mut answer = Answer::exact(result, "exact_diagonal_spectrum", FORMULA);
        if zeros != 0 {
            answer
                .constraints
                .push("Zero diagonal eigenvalue: the matrix is singular".to_owned());
        }
        return Ok(answer);
    }
    let result = numeric::eigen(matrix, tolerance, vectors)?;
    Ok(Answer::approximate(
        result,
        "verified_symmetric_eigen",
        FORMULA,
        tolerance,
    ))
}

fn shape(matrix: &Matrix) -> String {
    let (rows, columns) = matrix.shape();
    format!("{rows}×{columns} matrix")
}

fn vector(values: &[exact::Rational]) -> String {
    format!("Vector with {} components", values.len())
}

fn evaluate_pair(
    operation: &str,
    left: Matrix,
    right: Matrix,
) -> Checked<(Answer, BTreeMap<String, String>)> {
    let mut variables = BTreeMap::new();
    let answer = match operation {
        "dot" | "cross" => {
            let left = left.vector()?;
            let right = right.vector()?;
            variables.insert("a".to_owned(), vector(&left));
            variables.insert("b".to_owned(), vector(&right));
            if operation == "dot" {
                Answer::exact(
                    exact::dot(&left, &right)?.to_string(),
                    "exact_dot_product",
                    "a·b = sum(a_i*b_i)",
                )
            } else {
                Answer::exact(
                    vector_text(&exact::cross(&left, &right)?),
                    "exact_cross_product",
                    "a×b = [a2*b3-a3*b2,a3*b1-a1*b3,a1*b2-a2*b1]",
                )
            }
        }
        "solve" => {
            let right = right.vector()?;
            variables.insert("A".to_owned(), shape(&left));
            variables.insert("b".to_owned(), vector(&right));
            system(left, &right)?
        }
        "add" | "subtract" | "multiply" => {
            variables.insert("A".to_owned(), shape(&left));
            variables.insert("B".to_owned(), shape(&right));
            match operation {
                "add" => Answer::exact(
                    exact::add(left, right, false)?.text(),
                    "exact_matrix_addition",
                    "C_ij = A_ij+B_ij",
                ),
                "subtract" => Answer::exact(
                    exact::add(left, right, true)?.text(),
                    "exact_matrix_subtraction",
                    "C_ij = A_ij-B_ij",
                ),
                _ => Answer::exact(
                    exact::multiply(&left, &right)?.text(),
                    "exact_matrix_product",
                    "C_ij = sum(A_ik*B_kj)",
                ),
            }
        }
        _ => return Err(MathError::InvalidInput),
    };
    Ok((answer, variables))
}

fn evaluate_single(operation: &str, matrix: Matrix, tolerance: f64) -> Checked<Answer> {
    Ok(match operation {
        "transpose" => Answer::exact(
            matrix.transpose().text(),
            "exact_matrix_transpose",
            "(A^T)_ij = A_ji",
        ),
        "determinant" => Answer::exact(
            exact::determinant(matrix)?.to_string(),
            "exact_pivoted_determinant",
            "det(A) = det(P)*prod(U_ii)",
        ),
        "inverse" => Answer::exact(
            exact::inverse(matrix)?.text(),
            "exact_gauss_jordan_inverse",
            "[A|I] -> [I|A^-1]",
        ),
        "rank" => Answer::exact(
            exact::rank(matrix)?.to_string(),
            "exact_row_rank",
            "rank(A) = number of pivots",
        ),
        "lu" => {
            let factors = exact::lu(matrix)?;
            Answer::exact(
                format!(
                    r#"{{"P":{},"L":{},"U":{}}}"#,
                    factors.permutation.text(),
                    factors.lower.text(),
                    factors.upper.text()
                ),
                "exact_pivoted_lu",
                "P*A = L*U",
            )
        }
        "eigenvalues" | "eigenvectors" => eigen(&matrix, operation == "eigenvectors", tolerance)?,
        "qr" => Answer::approximate(
            numeric::qr(matrix, tolerance)?,
            "verified_householder_qr",
            "A = Q*R and Q^T*Q = I",
            tolerance,
        ),
        "add" | "subtract" | "multiply" | "dot" | "cross" | "solve" => {
            return Err(MathError::InvalidInput);
        }
        _ => return Err(MathError::Unsupported),
    })
}

pub(super) fn evaluate(operation: &str, input: &str, options: &Value) -> Checked<Computation> {
    if input.len() > 4096 {
        return Err(MathError::Limit);
    }
    let binary = match operation {
        "add" | "subtract" | "multiply" | "dot" | "cross" | "solve" => true,
        "transpose" | "determinant" | "inverse" | "rank" | "lu" | "eigenvalues"
        | "eigenvectors" | "qr" => false,
        _ => return Err(MathError::Unsupported),
    };
    let tolerance = tolerance(
        options,
        matches!(operation, "eigenvalues" | "eigenvectors" | "qr"),
    )?;
    let (answer, variables) = match (binary, input.split_once('|')) {
        (true, Some((left, right))) if !right.contains('|') => {
            evaluate_pair(operation, exact::parse(left)?, exact::parse(right)?)?
        }
        (false, None) => {
            let matrix = exact::parse(input)?;
            let variables = BTreeMap::from([("A".to_owned(), shape(&matrix))]);
            (evaluate_single(operation, matrix, tolerance)?, variables)
        }
        _ => return Err(MathError::InvalidInput),
    };
    Ok(Computation {
        result: answer.result,
        exactness: if answer.tolerance.is_some() {
            Exactness::Approximate
        } else {
            Exactness::Exact
        },
        normalized: input.trim().to_owned(),
        method: answer.method,
        domain: "real",
        formula: Some(answer.formula),
        precision: answer.tolerance.map(|_| f64::DIGITS),
        tolerance: answer.tolerance.map(|tolerance| format!("{tolerance:e}")),
        error_bound: None,
        constraints: answer.constraints,
        variables,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn calculate(operation: &str, input: &str) -> Computation {
        evaluate(operation, input, &json!({})).unwrap()
    }

    #[test]
    fn exact_shapes_and_vector_orientation() {
        let sum = calculate("add", "  .5 2\n−3 4 | 1/2 -2; 2/3 -4  ");
        assert_eq!(sum.result, "[[1,0],[-7/3,0]]");
        assert_eq!(sum.normalized, ".5 2\n−3 4 | 1/2 -2; 2/3 -4");
        assert_eq!(sum.variables["A"], "2×2 matrix");
        assert_eq!(
            calculate("subtract", "2 3;4 5|1 1;4 2").result,
            "[[1,2],[0,3]]"
        );
        assert_eq!(
            calculate("multiply", "1 2 3;4 5 6|1 0;0 1;1 1").result,
            "[[4,5],[10,11]]"
        );
        assert_eq!(
            calculate("transpose", "1 2 3;4 5 6").result,
            "[[1,4],[2,5],[3,6]]"
        );
        assert_eq!(calculate("dot", "1 2 -3|4;0;1/2").result, "5/2");
        assert_eq!(calculate("cross", "1;2;3|0 -1 2").result, "[7,-2,-1]");
    }

    #[test]
    fn square_pivoting_and_exact_singular_distinction() {
        assert_eq!(calculate("determinant", "0 2;3 4").result, "-6");
        assert_eq!(calculate("determinant", "0 2;0 4").result, "0");
        assert_eq!(calculate("rank", "0 2 4;0 1 2;0 3 6").result, "1");
        let input = exact::parse("0 3/7;2 1/3").unwrap();
        let inverse = exact::inverse(input.clone()).unwrap();
        assert_eq!(
            exact::multiply(&input, &inverse).unwrap().text(),
            "[[1,0],[0,1]]"
        );
        let narrow = calculate("determinant", "1 1;1 1.00000000000000000001");
        assert_eq!(narrow.result, "1/100000000000000000000");
        assert_eq!(
            evaluate("inverse", "1 2;2 4", &json!({})).err(),
            Some(MathError::Singular)
        );
        assert_eq!(
            evaluate("inverse", "1 2", &json!({})).err(),
            Some(MathError::Domain)
        );
    }

    #[test]
    fn linear_system_states_include_free_coordinates() {
        let unique = calculate("solve", "0 1;1 1;1 2|2;3;5");
        assert_eq!(unique.result, r#"{"status":"unique","solution":[1,2]}"#);
        let family = calculate("solve", "0 1 2;0 2 4|3;6");
        assert_eq!(
            family.result,
            r#"{"status":"infinite","particular":[0,3,0],"basis":[[1,0,0],[0,-2,1]],"parameters":["t1","t2"]}"#
        );
        assert_eq!(family.constraints, ["Free parameters range over the reals"]);
        assert_eq!(
            calculate("solve", "1 2;2 4|1;3").result,
            r#"{"status":"inconsistent"}"#
        );
        assert_eq!(
            calculate("solve", "0|0").result,
            r#"{"status":"infinite","particular":[0],"basis":[[1]],"parameters":["t1"]}"#
        );
    }

    #[test]
    fn rectangular_and_singular_lu_recompose_exactly() {
        for input in [
            "0 2;3 4",
            "0 1;0 2;0 5",
            "1/3 -2 5;4 1 0",
            "0 0 0;0 0 0",
            "1 2 1;2 1 4;3 0 7",
        ] {
            let matrix = exact::parse(input).unwrap();
            let factors = exact::lu(matrix.clone()).unwrap();
            let (rows, columns) = matrix.shape();
            let inner = rows.min(columns);
            assert_eq!(factors.permutation.shape(), (rows, rows));
            assert_eq!(factors.lower.shape(), (rows, inner));
            assert_eq!(factors.upper.shape(), (inner, columns));
            assert_eq!(
                exact::multiply(&factors.permutation, &matrix)
                    .unwrap()
                    .text(),
                exact::multiply(&factors.lower, &factors.upper)
                    .unwrap()
                    .text(),
                "{input}",
            );
            for index in 0..inner {
                assert_eq!(factors.lower[index][index], rat(1));
                assert!(factors.upper[index][..index].iter().all(Zero::is_zero));
            }
        }
    }

    fn assert_diagnostics(result: &Computation) {
        assert_eq!(result.exactness, Exactness::Approximate);
        assert_eq!(result.precision, Some(15));
        assert!(result.error_bound.is_none());
        let tolerance: f64 = result.tolerance.as_ref().unwrap().parse().unwrap();
        for prefix in [
            "Relative Frobenius residual (observed): ",
            "Frobenius orthogonality error (observed): ",
        ] {
            let value = result
                .constraints
                .iter()
                .find_map(|entry| entry.strip_prefix(prefix))
                .unwrap();
            assert!(value.parse::<f64>().unwrap() <= tolerance);
        }
    }

    #[test]
    fn spectral_results_verify_repeated_and_exact_cases() {
        let diagonal = calculate("eigenvectors", "2 0 0;0 0 0;0 0 1/3");
        assert_eq!(diagonal.exactness, Exactness::Exact);
        assert_eq!(
            diagonal.result,
            r#"{"values":[0,1/3,2],"vectors":[[0,0,1],[1,0,0],[0,1,0]]}"#
        );
        assert!(
            diagonal
                .constraints
                .iter()
                .any(|value| value.contains("singular"))
        );
        let clustered = evaluate(
            "eigenvectors",
            "2 1 0;1 2 0;0 0 3",
            &json!({"tolerance":"1e-13"}),
        )
        .unwrap();
        assert_diagnostics(&clustered);
        let parsed: Value = serde_json::from_str(&clustered.result).unwrap();
        for (observed, expected) in parsed["values"]
            .as_array()
            .unwrap()
            .iter()
            .zip([1.0, 3.0, 3.0])
        {
            assert!((observed.as_f64().unwrap() - expected).abs() < 1e-13);
        }
        assert!(
            clustered
                .constraints
                .iter()
                .any(|value| value.starts_with("Clustered eigenvalues"))
        );
        let rank_deficient = calculate("eigenvalues", "1 1;1 1");
        assert!(
            rank_deficient
                .constraints
                .iter()
                .any(|value| value.starts_with("Eigenvalue near zero"))
        );
    }

    #[test]
    fn thin_qr_identifies_conditioning_and_rank() {
        for input in ["1 2;3 4;5 6", "1 2 3;4 5 6", "0 0 0", "1e-90 0;1e-90 1e-90"] {
            assert_diagnostics(&calculate("qr", input));
        }
        let poorly_conditioned = calculate("qr", "1 1;1 1.000000000001");
        assert!(
            poorly_conditioned
                .constraints
                .iter()
                .any(|value| value.starts_with("Ill-conditioned"))
        );
        assert!(
            poorly_conditioned
                .constraints
                .contains(&"Exact rank: 2 of 2".to_owned())
        );
        let deficient = calculate("qr", "1 2;2 4;3 6");
        assert!(
            deficient
                .constraints
                .contains(&"Exact rank: 1 of 2".to_owned())
        );
        assert!(
            !deficient
                .constraints
                .iter()
                .any(|value| value.starts_with("Estimated reciprocal"))
        );
    }

    #[test]
    fn bounded_input_and_options_report_structured_errors() {
        let cases = [
            ("add", "1 2;3|3 4;5 6", json!({}), MathError::InvalidInput),
            ("add", "1 2|3;4", json!({}), MathError::Domain),
            ("transpose", "1|1/0", json!({}), MathError::InvalidInput),
            ("solve", "1|1|1", json!({}), MathError::InvalidInput),
            ("multiply", "1 2|3 4", json!({}), MathError::Domain),
            ("rank", "1;;2", json!({}), MathError::InvalidInput),
            ("dot", "1 2|3", json!({}), MathError::Domain),
            ("cross", "1 2|3 4", json!({}), MathError::Domain),
            ("eigenvalues", "1 2;3 4", json!({}), MathError::Unsupported),
            ("qr", "1 1e-151", json!({}), MathError::Limit),
            ("qr", "1e101", json!({}), MathError::Limit),
            ("qr", "1", json!({"tolerance":"1e-14"}), MathError::Limit),
            (
                "qr",
                "1",
                json!({"tolerance":true}),
                MathError::InvalidInput,
            ),
            ("transpose", "2/0", json!({}), MathError::Domain),
            ("transpose", "1e", json!({}), MathError::InvalidInput),
            (
                "rank",
                "1",
                json!({"tolerance":"1e-9"}),
                MathError::InvalidInput,
            ),
            (
                "rank",
                "1 2 3 4 5 6 7 8 9 10 11 12 13",
                json!({}),
                MathError::Limit,
            ),
        ];
        for (operation, input, options, error) in cases {
            assert_eq!(
                evaluate(operation, input, &options).err(),
                Some(error),
                "{operation}: {input}"
            );
        }
    }
}
