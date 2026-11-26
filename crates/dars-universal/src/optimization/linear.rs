use super::{Checked, Outcome};
use crate::{MathError, calculus::numerical_expression::rational};
use num_rational::BigRational as Q;
use num_traits::{One, Signed, ToPrimitive, Zero};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Program {
    objective: Vec<String>,
    constraints: Vec<Restriction>,
    sense: Sense,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum Sense {
    Minimize,
    Maximize,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Restriction {
    coefficients: Vec<String>,
    relation: Relation,
    rhs: String,
}

#[derive(Deserialize)]
enum Relation {
    #[serde(rename = "<=")]
    AtMost,
    #[serde(rename = ">=")]
    AtLeast,
    #[serde(rename = "=")]
    Equal,
}

#[derive(Clone)]
struct Row {
    a: Vec<Q>,
    b: Q,
}

fn bound(q: Q, bits: u64) -> Checked<Q> {
    (q.numer().bits().max(q.denom().bits()) <= bits)
        .then_some(q)
        .ok_or(MathError::Limit)
}

fn coefficient(text: &str) -> Checked<Q> {
    bound(rational(text)?, 112)
}

fn dot(a: &[Q], b: &[Q]) -> Checked<Q> {
    bound(a.iter().zip(b).map(|(x, y)| x * y).sum(), 2048)
}

fn elimination(rows: &[&Row]) -> Checked<Option<Vec<Q>>> {
    let n = rows.len();
    let mut augmented: Vec<_> = rows
        .iter()
        .map(|r| {
            let mut a = r.a.clone();
            a.push(r.b.clone());
            a
        })
        .collect();
    for col in 0..n {
        let Some(pivot) = (col..n).find(|i| !augmented[*i][col].is_zero()) else {
            return Ok(None);
        };
        augmented.swap(col, pivot);
        let scale = augmented[col][col].recip();
        for entry in &mut augmented[col][col..] {
            *entry = bound(&*entry * &scale, 2048)?;
        }
        let pivot = augmented[col].clone();
        for (row, values) in augmented.iter_mut().enumerate() {
            if row == col || values[col].is_zero() {
                continue;
            }
            let factor = values[col].clone();
            for (entry, divisor) in values[col..].iter_mut().zip(&pivot[col..]) {
                *entry = bound(&*entry - &factor * divisor, 2048)?;
            }
        }
    }
    Ok(Some(
        augmented
            .into_iter()
            .map(|mut values| values.pop().expect("one RHS column"))
            .collect(),
    ))
}

struct Enumeration<'a> {
    rows: &'a [Row],
    objective: &'a [Q],
    best: Option<(Vec<Q>, Q)>,
    multiple: bool,
    visited: usize,
}

impl<'a> Enumeration<'a> {
    fn vertices(rows: &'a [Row], objective: &'a [Q]) -> Checked<Self> {
        let mut this = Self {
            rows,
            objective,
            best: None,
            multiple: false,
            visited: 0,
        };
        this.next(0, &mut Vec::new())?;
        Ok(this)
    }

    fn next(&mut self, start: usize, selected: &mut Vec<&'a Row>) -> Checked<()> {
        let n = self.objective.len();
        if selected.len() < n {
            for index in start..=self.rows.len() - (n - selected.len()) {
                selected.push(&self.rows[index]);
                self.next(index + 1, selected)?;
                selected.pop();
            }
            return Ok(());
        }
        self.visited += 1;
        let Some(vertex) = elimination(selected)? else {
            return Ok(());
        };
        for Row { a, b } in self.rows {
            if &dot(a, &vertex)? > b {
                return Ok(());
            }
        }
        let value = dot(self.objective, &vertex)?;
        match self.best.as_ref() {
            Some((point, best)) if value == *best => self.multiple |= point != &vertex,
            Some((_, best)) if value < *best => {}
            _ => {
                self.best = Some((vertex, value));
                self.multiple = false;
            }
        }
        Ok(())
    }
}

fn negative(a: &[Q]) -> Vec<Q> {
    a.iter().map(|q| -q).collect()
}

pub(super) fn solve(input: &str) -> Checked<Outcome> {
    let Program {
        objective,
        constraints,
        sense,
    } = serde_json::from_str(input).map_err(|_| MathError::InvalidInput)?;
    let n = objective.len();
    if !(1..=3).contains(&n) || constraints.len() > 12 {
        return Err(MathError::Limit);
    }
    let objective = objective
        .iter()
        .map(|text| coefficient(text))
        .collect::<Checked<Vec<_>>>()?;
    let minimize = matches!(sense, Sense::Minimize);
    let preferred = if minimize {
        negative(&objective)
    } else {
        objective
    };
    let mut rows = Vec::new();
    for Restriction {
        coefficients,
        relation,
        rhs,
    } in constraints
    {
        if coefficients.len() != n {
            return Err(MathError::InvalidInput);
        }
        let a = coefficients
            .iter()
            .map(|text| coefficient(text))
            .collect::<Checked<Vec<_>>>()?;
        let b = coefficient(&rhs)?;
        if !matches!(relation, Relation::AtLeast) {
            rows.push(Row {
                a: a.clone(),
                b: b.clone(),
            });
        }
        if !matches!(relation, Relation::AtMost) {
            rows.push(Row {
                a: negative(&a),
                b: -b,
            });
        }
    }
    for i in 0..n {
        let mut a = vec![Q::zero(); n];
        a[i] = -Q::one();
        rows.push(Row { a, b: Q::zero() });
    }
    let primal = Enumeration::vertices(&rows, &preferred)?;
    let Some((vertex, score)) = primal.best else {
        return Ok(Outcome::numerical(
            "infeasible",
            "no_feasible_vertex_in_pointed_polyhedron",
            None,
            None,
            None,
            primal.visited,
        ));
    };
    let (primal_visited, primal_multiple) = (primal.visited, primal.multiple);
    let mut recession = rows
        .into_iter()
        .map(|row| Row {
            a: row.a,
            b: Q::zero(),
        })
        .collect::<Vec<_>>();
    // A nonzero nonnegative recession direction can be normalized to sum(d)=1.
    let sum = vec![Q::one(); n];
    recession.extend([
        Row {
            a: sum.clone(),
            b: Q::one(),
        },
        Row {
            a: negative(&sum),
            b: -Q::one(),
        },
    ]);
    let recession = Enumeration::vertices(&recession, &preferred)?;
    let visited = primal_visited + recession.visited;
    if recession
        .best
        .as_ref()
        .is_some_and(|(_, gain)| gain.is_positive())
    {
        return Ok(Outcome::numerical(
            "unbounded",
            "improving_recession_direction",
            None,
            None,
            None,
            visited,
        ));
    }
    let multiple = primal_multiple || recession.best.is_some_and(|(_, gain)| gain.is_zero());
    let objective = if minimize { -score } else { score };
    let point = vertex
        .iter()
        .map(ToPrimitive::to_f64)
        .collect::<Option<Vec<_>>>()
        .filter(|p| p.iter().all(|v| v.is_finite()));
    let value = objective.to_f64().filter(|v| v.is_finite());
    let mut result = Outcome::numerical(
        "global_optimum",
        "exact_vertex_and_recession_certificate",
        point,
        value,
        Some(0.0),
        visited,
    );
    result.point_exact = Some(vertex.iter().map(ToString::to_string).collect());
    result.value_exact = Some(objective.to_string());
    result.alternative_optimum = Some(multiple);
    Ok(result)
}
