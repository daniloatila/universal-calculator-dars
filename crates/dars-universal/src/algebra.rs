mod inequality;
mod linear;
mod polynomial;
mod roots;
mod syntax;

use crate::{Computation, Exactness, MathError};
use num_traits::{One, Zero};
use polynomial::{Coefficient, NAMES, Rational};
use roots::{Root, univariate_variable};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use syntax::Relation;

const MAX_ROWS: usize = 16;
type Assignments = [Option<Coefficient>; 3];

#[derive(Clone, Copy, PartialEq, Eq)]
enum Domain {
    Real,
    Complex,
}

impl Domain {
    fn parse(options: &Value) -> Result<Self, MathError> {
        let options = options.as_object().ok_or(MathError::InvalidInput)?;
        if options.keys().any(|key| key != "domain") {
            return Err(MathError::InvalidInput);
        }
        match options.get("domain").map(Value::as_str) {
            None | Some(Some("real")) => Ok(Self::Real),
            Some(Some("complex")) => Ok(Self::Complex),
            _ => Err(MathError::InvalidInput),
        }
    }

    fn text(self) -> &'static str {
        match self {
            Self::Real => "real",
            Self::Complex => "complex",
        }
    }
}

struct Answer {
    result: String,
    exactness: Exactness,
    method: &'static str,
    constraints: BTreeSet<String>,
    used: u8,
    assignments: Assignments,
}

impl Answer {
    fn new(result: String, method: &'static str, used: u8) -> Self {
        Self {
            result,
            exactness: if used == 0 {
                Exactness::Exact
            } else {
                Exactness::Symbolic
            },
            method,
            constraints: BTreeSet::new(),
            used,
            assignments: Default::default(),
        }
    }

    fn retain(&mut self, value: &Rational) {
        self.constraints.extend(
            value
                .restrictions
                .iter()
                .map(|poly| format!("{} != 0", poly.text())),
        );
    }

    fn into_computation(self, domain: Domain, normalized: String) -> Computation {
        let variables: BTreeMap<_, _> = NAMES
            .into_iter()
            .zip(self.assignments)
            .enumerate()
            .filter(|(index, _)| self.used & (1 << index) != 0)
            .map(|(_, (name, value))| {
                let description = value.map_or_else(
                    || format!("{} variable", domain.text()),
                    |value| value.to_string(),
                );
                (name.to_owned(), description)
            })
            .collect();
        Computation {
            result: self.result,
            exactness: self.exactness,
            normalized,
            method: self.method,
            domain: domain.text(),
            formula: None,
            precision: None,
            error_bound: None,
            constraints: self.constraints.into_iter().collect(),
            variables,
        }
    }
}

fn transform(operation: &str, input: &str) -> Result<Answer, MathError> {
    let value = syntax::expression(input)?;
    let (result, method) = match operation {
        "simplify" => (value.text(), "rational_polynomial_reduction"),
        "expand" => (value.text(), "polynomial_distribution"),
        "factor" => {
            let (numerator, mut partial) = roots::factor(value.numerator.clone())?;
            let result = if value
                .denominator
                .constant()
                .is_some_and(|item| item.is_one())
            {
                numerator
            } else {
                let (denominator, denominator_partial) = roots::factor(value.denominator.clone())?;
                partial |= denominator_partial;
                format!("({numerator})/({denominator})")
            };
            let method = if partial {
                "partial_polynomial_factor_extraction"
            } else {
                "bounded_polynomial_factor_extraction"
            };
            (result, method)
        }
        "polynomial" => {
            if value.denominator.constant().is_none() {
                return Err(MathError::Unsupported);
            }
            let variable = univariate_variable(value.numerator.variables())?;
            let degree = u8::try_from(value.numerator.degree()).map_err(|_| MathError::Limit)?;
            let coefficients = (0..=degree)
                .rev()
                .map(|power| value.numerator.coefficient_for(variable, power).to_string())
                .collect::<Vec<_>>()
                .join(",");
            (
                format!("[{coefficients}]"),
                "descending_polynomial_coefficients",
            )
        }
        _ => return Err(MathError::Unsupported),
    };
    let mut answer = Answer::new(result, method, value.used);
    answer.retain(&value);
    Ok(answer)
}

fn relation(input: &str) -> Result<(Rational, Relation), MathError> {
    let (left, operator, right) = syntax::relation(input)?;
    Ok((left.sum(right, true)?, operator))
}

fn root_allowed(root: &Root, value: &Rational, variable: usize) -> Result<bool, MathError> {
    if !root.is_zero_of(&value.numerator, variable)? {
        return Err(MathError::NoConvergence);
    }
    for restriction in value
        .restrictions
        .iter()
        .chain(std::iter::once(&value.denominator))
    {
        if root.is_zero_of(restriction, variable)? {
            return Ok(false);
        }
    }
    Ok(true)
}

fn solve(input: &str, domain: Domain) -> Result<Answer, MathError> {
    let (value, operator) = relation(input)?;
    if operator != Relation::Equal {
        return Err(MathError::InvalidInput);
    }
    let variable = univariate_variable(value.used)?;
    let name = NAMES[variable];
    let mut answer = Answer::new(String::new(), "verified_univariate_roots", value.used);
    answer.retain(&value);
    if value.numerator.is_zero() {
        answer.result = format!("all {} {name}", domain.text());
        answer.exactness = Exactness::Symbolic;
        return Ok(answer);
    }
    let mut roots = Vec::new();
    answer.exactness = Exactness::Exact;
    for (root, multiplicity) in
        roots::solve_roots(value.numerator.clone(), variable, domain == Domain::Complex)?
    {
        if !root_allowed(&root, &value, variable)? {
            continue;
        }
        if !matches!(root, Root::Rational(_)) {
            answer.exactness = Exactness::Symbolic;
        }
        roots.push(format!("{name}={} [m={multiplicity}]", root.text()));
    }
    answer.result = if roots.is_empty() {
        "none".to_owned()
    } else {
        roots.join("; ")
    };
    Ok(answer)
}

fn inequalities(input: &str, domain: Domain) -> Result<Answer, MathError> {
    let (value, operator) = relation(input)?;
    if operator == Relation::Equal {
        return Err(MathError::InvalidInput);
    }
    if domain == Domain::Complex {
        return Err(MathError::Unsupported);
    }
    let variable = univariate_variable(value.used)?;
    let mut answer = Answer::new(String::new(), "exact_rational_sign_chart", value.used);
    answer.retain(&value);
    answer.result = inequality::solve(value, operator, variable)?;
    answer.exactness = Exactness::Symbolic;
    Ok(answer)
}

fn system(input: &str) -> Result<Answer, MathError> {
    let mut rows = Vec::new();
    let mut used = 0;
    for row in input
        .split([';', '\n'])
        .map(str::trim)
        .filter(|row| !row.is_empty())
    {
        if rows.len() == MAX_ROWS {
            return Err(MathError::Limit);
        }
        let (value, operator) = relation(row)?;
        if operator != Relation::Equal {
            return Err(MathError::InvalidInput);
        }
        used |= value.used;
        rows.push(value);
    }
    if rows.is_empty() {
        return Err(MathError::InvalidInput);
    }
    let mut answer = Answer::new(String::new(), "exact_row_reduction", used);
    let mut equations = Vec::with_capacity(rows.len());
    let mut restrictions = Vec::new();
    for row in &rows {
        answer.retain(row);
        equations.push(row.numerator.clone());
        restrictions.extend(&row.restrictions);
    }
    let solution = linear::solve(&equations, used, &restrictions)?;
    answer.result = solution.result;
    answer.exactness = if solution.symbolic {
        Exactness::Symbolic
    } else {
        Exactness::Exact
    };
    answer.constraints.extend(solution.parameter_constraints);
    Ok(answer)
}

fn assignment_list(
    segments: std::str::Split<'_, char>,
    used: u8,
) -> Result<Assignments, MathError> {
    let mut values: Assignments = Default::default();
    let mut populated = 0;
    for item in segments {
        let (variable, value) = syntax::assignment(item)?;
        let bit = 1 << variable;
        if used & bit == 0 || populated & bit != 0 {
            return Err(MathError::InvalidInput);
        }
        values[variable] = Some(value);
        populated |= bit;
    }
    if populated == 0 {
        return Err(MathError::InvalidInput);
    }
    Ok(values)
}

fn with_substitution(operation: &str, input: &str, domain: Domain) -> Result<Answer, MathError> {
    let mut segments = input.split(';');
    let head = segments.next().ok_or(MathError::InvalidInput)?;
    let (value, relation) = if operation == "verify" {
        let (value, relation) = relation(head)?;
        if domain == Domain::Complex && !matches!(relation, Relation::Equal | Relation::Unequal) {
            return Err(MathError::Unsupported);
        }
        (value, Some(relation))
    } else {
        (syntax::expression(head)?, None)
    };
    let assignments = assignment_list(segments, value.used)?;
    let method = if relation.is_some() {
        "exact_solution_substitution"
    } else {
        "rational_substitution"
    };
    let mut answer = Answer::new(String::new(), method, value.used);
    answer.assignments = assignments;
    if let Some(relation) = relation {
        if answer
            .assignments
            .iter()
            .enumerate()
            .any(|(index, value)| value.is_none() && answer.used & (1 << index) != 0)
        {
            return Err(MathError::InvalidInput);
        }
        answer.retain(&value);
        let valid = match value.substitute(&answer.assignments) {
            Ok(value) => relation.accepts(
                value
                    .constant()
                    .ok_or(MathError::NoConvergence)?
                    .cmp(&Coefficient::zero()),
            ),
            Err(MathError::Domain) => false,
            Err(error) => return Err(error),
        };
        answer.result = valid.to_string();
        answer.exactness = Exactness::Exact;
    } else {
        let value = value.substitute(&answer.assignments)?;
        answer.result = value.text();
        answer.exactness = if value.constant().is_some() && value.restrictions.is_empty() {
            Exactness::Exact
        } else {
            Exactness::Symbolic
        };
        answer.retain(&value);
    }
    Ok(answer)
}

pub(super) fn evaluate(
    operation: &str,
    input: &str,
    options: &Value,
) -> Result<Computation, MathError> {
    if input.len() > 4096 {
        return Err(MathError::Limit);
    }
    let domain = Domain::parse(options)?;
    let answer = match operation {
        "solve" => solve(input, domain),
        "inequality" => inequalities(input, domain),
        "system" => system(input),
        "substitute" | "verify" => with_substitution(operation, input, domain),
        _ => transform(operation, input),
    }?;
    // Retain the original operations so replay can reproduce cancelled domain exclusions.
    Ok(answer.into_computation(domain, input.trim().to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn calculate(operation: &str, input: &str) -> Computation {
        evaluate(operation, input, &json!({})).unwrap()
    }

    #[test]
    fn exact_polynomial_transforms() {
        let cases = [
            ("expand", "(x−y)^2", "x^2-2*x*y+y^2"),
            ("expand", "-x^2 + 2x(x+1)", "x^2+2*x"),
            ("expand", "2.5e-1X+3/4*x", "x"),
            ("factor", "x^3-x", "(x-1)*x*(x+1)"),
            ("factor", "2*x^2-3*x+1", "2*(x-1)*(x-1/2)"),
            ("factor", "x^2-y^2", "(x-y)*(x+y)"),
            ("polynomial", "z^3-z/2", "[1,0,-1/2,0]"),
            ("polynomial", "z-z", "[0]"),
        ];
        for (operation, input, result) in cases {
            assert_eq!(calculate(operation, input).result, result, "{input}");
        }
        assert_eq!(
            calculate("factor", "x^4+5*x^2+4").method,
            "partial_polynomial_factor_extraction"
        );
    }

    #[test]
    fn cancelled_domain_exclusions_survive_and_replay() {
        let answer = calculate("simplify", "  (x^2-1)/(x-1)  ");
        assert_eq!(answer.result, "x+1");
        assert_eq!(answer.normalized, "(x^2-1)/(x-1)");
        assert_eq!(answer.constraints, ["x-1 != 0"]);
        assert_eq!(
            calculate("simplify", &answer.normalized).constraints,
            answer.constraints
        );
        let zero = calculate("simplify", "x/x - x/x");
        assert_eq!(zero.result, "0");
        assert_eq!(zero.constraints, ["x != 0"]);
        let reciprocal = calculate("simplify", "(x/y)^-1");
        assert_eq!(reciprocal.result, "(y)/(x)");
        assert_eq!(reciprocal.constraints, ["x != 0", "y != 0"]);
        assert_eq!(calculate("simplify", "x^0").constraints, ["x != 0"]);
    }

    #[test]
    fn equation_roots_are_complete_for_admitted_residuals() {
        let cases = [
            ("(x-2)^3=0", "x=2 [m=3]"),
            (
                "x*(x^2-2)=0",
                "x=-sqrt(2) [m=1]; x=0 [m=1]; x=sqrt(2) [m=1]",
            ),
            ("x^2+2*x+1=0", "x=-1 [m=2]"),
            ("(x^2-1)/(x-1)=2", "none"),
            ("(x^2-2)^2/(x^2-2)=0", "none"),
            ("x^2+1=0", "none"),
            ("1=2", "none"),
            ("y/y=1", "all real y"),
        ];
        for (input, result) in cases {
            assert_eq!(calculate("solve", input).result, result, "{input}");
        }
        let complex = evaluate("solve", "z^2+2*z+5=0", &json!({"domain":"complex"})).unwrap();
        assert_eq!(complex.result, "z=-1-2*i [m=1]; z=-1+2*i [m=1]");
        assert_eq!(complex.exactness, Exactness::Symbolic);
        assert_eq!(complex.variables["z"], "complex variable");
    }

    #[test]
    fn inequality_endpoints_keep_multiplicities_and_holes() {
        let cases = [
            ("x^2<=2", "[-sqrt(2),sqrt(2)]"),
            ("(x-2)^2<=0", "[2,2]"),
            ("(x-2)^2<0", "{}"),
            ("(x^2-1)/(x-1)>0", "(-1,1) union (1,inf)"),
            ("1/(x-1)<=2", "(-inf,1) union [3/2,inf)"),
            ("(x^2-2)/(x-1)>=0", "[-sqrt(2),1) union [sqrt(2),inf)"),
            ("x/x!=0", "(-inf,0) union (0,inf)"),
            ("x-x>=0", "(-inf,inf)"),
        ];
        for (input, result) in cases {
            assert_eq!(calculate("inequality", input).result, result, "{input}");
        }
    }

    #[test]
    fn systems_exactly_parameterize_free_variables_and_restrictions() {
        assert_eq!(calculate("system", "x+y=3\nx-y=1").result, "x=2; y=1");
        assert_eq!(calculate("system", "x+y=3; 2x+2y=6").result, "x=3-t1; y=t1");
        assert_eq!(calculate("system", "x+y=3; 2x+2y=7").result, "none");
        assert_eq!(calculate("system", "x/x=1; x=0").result, "none");
        let family = calculate("system", "x/x=1; y=2");
        assert_eq!(family.result, "x=t1; y=2");
        assert_eq!(family.constraints, ["t1 != 0", "x != 0"]);
        assert_eq!(
            calculate("system", "x+y+z=1").result,
            "x=1-t1-t2; y=t1; z=t2"
        );
    }

    #[test]
    fn substitution_uses_exact_values_and_verifies_the_original_domain() {
        let partial = calculate("substitute", "x^2+y; x=2");
        assert_eq!(partial.result, "y+4");
        assert_eq!(partial.variables["x"], "2");
        assert_eq!(partial.variables["y"], "real variable");
        assert_eq!(calculate("substitute", "x/y; x=0").constraints, ["y != 0"]);
        assert_eq!(calculate("substitute", "x^2+y; x=1/3; y=2/3").result, "7/9");
        assert_eq!(calculate("verify", "x^2=4; x=-2").result, "true");
        assert_eq!(calculate("verify", "x/x=1; x=0").result, "false");
        assert_eq!(calculate("verify", "x/y<3; x=1; y=2").result, "true");
    }

    #[test]
    fn stable_errors_bound_problem_classes_and_work() {
        let cases = [
            ("expand", "x^25", MathError::Limit),
            ("expand", "(x+y+z)^24", MathError::Limit),
            ("simplify", "x^1.5", MathError::Unsupported),
            ("simplify", "sin(x)", MathError::Unsupported),
            ("simplify", "1/0", MathError::Domain),
            ("simplify", "0^0", MathError::Domain),
            ("solve", "x^3+x+1=0", MathError::Unsupported),
            ("solve", "x+y=0", MathError::Unsupported),
            ("solve", "x<0", MathError::InvalidInput),
            ("inequality", "1/(x^2-2)>0", MathError::Unsupported),
            ("system", "xy=1; x=1", MathError::Unsupported),
            ("verify", "x+y=2; x=1", MathError::InvalidInput),
            ("substitute", "x; x=1; x=2", MathError::InvalidInput),
        ];
        for (operation, input, error) in cases {
            assert_eq!(
                evaluate(operation, input, &json!({})).err(),
                Some(error),
                "{input}"
            );
        }
        assert_eq!(
            evaluate("inequality", "x>0", &json!({"domain":"complex"})).err(),
            Some(MathError::Unsupported)
        );
    }
}
