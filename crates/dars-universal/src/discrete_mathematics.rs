mod integer;
mod logic;
mod number_theory;
mod sets;

use crate::{Computation, Exactness, MathError};
use integer::{Checked, MAX_COUNT, MAX_INDEX, bound, checked, values};
use num_bigint::{BigInt, BigUint, Sign};
use num_traits::{One, ToPrimitive, Zero};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

struct Answer {
    result: String,
    exactness: Exactness,
    method: &'static str,
    formula: &'static str,
    domain: &'static str,
    constraints: Vec<String>,
    variables: BTreeMap<String, String>,
}

impl Answer {
    fn exact(
        result: impl std::fmt::Display,
        method: &'static str,
        formula: &'static str,
        domain: &'static str,
    ) -> Self {
        Self {
            result: result.to_string(),
            exactness: Exactness::Exact,
            method,
            formula,
            domain,
            constraints: Vec::new(),
            variables: BTreeMap::new(),
        }
    }

    fn variable(&mut self, name: &str, value: impl std::fmt::Display) {
        let text = value.to_string();
        self.variables.insert(
            name.to_owned(),
            if text.len() <= 256 {
                text
            } else {
                "Exact integer from input".to_owned()
            },
        );
    }

    fn constraints(&mut self, text: &str) {
        self.constraints.push(text.to_owned());
    }

    fn finish(self, input: &str) -> Computation {
        Computation {
            result: self.result,
            exactness: self.exactness,
            normalized: input.trim().to_owned(),
            method: self.method,
            domain: self.domain,
            formula: Some(self.formula),
            precision: None,
            tolerance: None,
            error_bound: None,
            constraints: self.constraints,
            variables: self.variables,
            units: BTreeMap::new(),
        }
    }
}

fn options_for<'a>(operation: &str, options: &'a Value) -> Checked<&'a Map<String, Value>> {
    let allowed = match operation {
        "permutations" | "arrangements" | "combinations" => Some("repetition"),
        "modular" | "sequence" => Some("mode"),
        "set_union"
        | "set_intersection"
        | "set_difference"
        | "set_symmetric_difference"
        | "set_subset"
        | "logic"
        | "truth_table"
        | "prime"
        | "factor"
        | "gcd"
        | "lcm" => None,
        _ => return Err(MathError::Unsupported),
    };
    let options = options.as_object().ok_or(MathError::InvalidInput)?;
    if options
        .keys()
        .any(|option| Some(option.as_str()) != allowed)
    {
        return Err(MathError::InvalidInput);
    }
    Ok(options)
}

fn repetition(options: &Map<String, Value>) -> Checked<bool> {
    options.get("repetition").map_or(Ok(false), |value| {
        value.as_bool().ok_or(MathError::InvalidInput)
    })
}

fn combinatorial(operation: &str, input: &str, repeat: bool) -> Checked<Answer> {
    const DOMAIN: &str = "nonnegative_integer";
    if operation == "permutations" {
        if repeat {
            let values = values(input, 1, 64)?;
            let result = integer::multiset(&values)?;
            let mut answer = Answer::exact(
                result,
                "exact_multiset_permutations",
                "(sum(m_i))!/prod(m_i!)",
                DOMAIN,
            );
            answer.variable("groups", values.len());
            answer.variable("n", values.iter().sum::<BigInt>());
            return Ok(answer);
        }
        let n = bound(&values(input, 1, 1)?[0], MAX_COUNT)?;
        let mut answer = Answer::exact(integer::falling(n, n), "exact_factorial", "n!", DOMAIN);
        answer.variable("n", n);
        return Ok(answer);
    }
    let values = values(input, 2, 2)?;
    let n = bound(&values[0], MAX_COUNT)?;
    let k = bound(&values[1], MAX_COUNT)?;
    let (result, method, formula) = match (operation, repeat) {
        ("arrangements", false) => (
            integer::falling(n, k),
            "exact_falling_factorial",
            "n!/(n-k)! for k<=n",
        ),
        ("arrangements", true) => (
            BigUint::from(n).pow(k),
            "exact_arrangements_with_repetition",
            "n^k",
        ),
        ("combinations", false) => (integer::choose(n, k), "exact_binomial", "binomial(n,k)"),
        ("combinations", true) => {
            let result = if k == 0 {
                BigUint::one()
            } else if n == 0 {
                BigUint::zero()
            } else {
                integer::choose(n + k - 1, k)
            };
            (
                result,
                "exact_multiset_combinations",
                "binomial(n+k-1,k) for n>0",
            )
        }
        _ => return Err(MathError::Unsupported),
    };
    let mut answer = Answer::exact(result, method, formula, DOMAIN);
    answer.variable("n", n);
    answer.variable("k", k);
    Ok(answer)
}

fn finite_set(operation: &str, input: &str) -> Checked<Answer> {
    let (result, left, right) = sets::evaluate(operation, input)?;
    let formula = match operation {
        "set_union" => "A ∪ B",
        "set_intersection" => "A ∩ B",
        "set_difference" => "A − B",
        "set_symmetric_difference" => "A △ B",
        "set_subset" => "A ⊆ B",
        _ => return Err(MathError::Unsupported),
    };
    let mut answer = Answer::exact(result, "exact_finite_set_operation", formula, "finite_set");
    answer.variable("A", format!("{left} distinct elements"));
    answer.variable("B", format!("{right} distinct elements"));
    Ok(answer)
}

fn proposition(operation: &str, input: &str) -> Checked<Answer> {
    let table = operation == "truth_table";
    let evaluated = if table {
        logic::truth_table(input)?
    } else {
        logic::evaluate(input)?
    };
    let (method, formula) = if table {
        ("exhaustive_truth_table", "f(a) for each a in {0,1}^n")
    } else {
        (
            "typed_propositional_evaluation",
            "f(A,B,...) in {false,true}",
        )
    };
    let mut answer = Answer::exact(evaluated.result, method, formula, "boolean");
    answer.variables = evaluated.variables;
    Ok(answer)
}

fn primality(input: &str) -> Checked<Answer> {
    use number_theory::Primality;
    let values = values(input, 1, 1)?;
    let n = &values[0];
    let state = number_theory::prime(n)?;
    let method = match state {
        Primality::NotPrime => "primality_domain_check",
        Primality::ProbablePrime => "fixed_base_probable_primality",
        _ if n.to_u64().is_some() => "deterministic_miller_rabin_u64",
        _ => "miller_rabin_composite_witness",
    };
    let result = match state {
        Primality::NotPrime => "not_prime",
        Primality::Prime => "prime",
        Primality::Divisible(_) | Primality::Witness(_) => "composite",
        Primality::ProbablePrime => "probable_prime",
    };
    let formula = if state == Primality::NotPrime {
        "n < 2"
    } else {
        "n-1 = d*2^s, check powers of a^d mod n"
    };
    let mut answer = Answer::exact(result, method, formula, "integer");
    answer.variable("n", n);
    match state {
        Primality::NotPrime => answer.constraints("Primes are integers greater than one"),
        Primality::Prime => {
            answer.constraints("Deterministic result for the unsigned 64-bit range")
        }
        Primality::Divisible(divisor) => {
            answer.constraints(&format!("Small prime divisor: {divisor}"))
        }
        Primality::Witness(base) => {
            answer.constraints(&format!("Compositeness witness base: {base}"))
        }
        Primality::ProbablePrime => {
            answer.exactness = Exactness::Approximate;
            answer.constraints("Passed 12 fixed strong probable-prime tests");
        }
    }
    Ok(answer)
}

fn factorization(input: &str) -> Checked<Answer> {
    let values = values(input, 1, 1)?;
    let n = &values[0];
    let factors = number_theory::factor(n)?;
    let mut factors: Vec<_> = factors
        .into_iter()
        .map(|factor| factor.to_string())
        .collect();
    if n.sign() == Sign::Minus {
        factors.insert(0, "-1".to_owned());
    }
    let mut answer = Answer::exact(
        format!("[{}]", factors.join(",")),
        "bounded_brent_prime_factorization",
        "abs(n) = prod(p_i)",
        "integer",
    );
    answer.variable("n", n);
    answer.constraints("Prime factors verified in the unsigned 64-bit range with multiplicity");
    Ok(answer)
}

fn common(operation: &str, input: &str) -> Checked<Answer> {
    let values = values(input, 2, 32)?;
    let mut answer = if operation == "gcd" {
        Answer::exact(
            number_theory::gcd(&values),
            "exact_euclidean_gcd",
            "gcd(a,b) = gcd(b,a mod b)",
            "integer",
        )
    } else {
        Answer::exact(
            number_theory::lcm(&values)?,
            "exact_lcm_via_gcd",
            "lcm(a,b) = abs(a*b)/gcd(a,b) for a*b != 0",
            "integer",
        )
    };
    if let [a, b] = values.as_slice() {
        answer.variable("a", a);
        answer.variable("b", b);
    } else {
        answer.variable("count", values.len());
    }
    Ok(answer)
}

fn selected_mode<'a>(options: &'a Map<String, Value>, default: &'a str) -> Checked<&'a str> {
    options.get("mode").map_or(Ok(default), |mode| {
        mode.as_str().ok_or(MathError::InvalidInput)
    })
}

fn modular(input: &str, mode: &str) -> Checked<Answer> {
    let (count, method, formula) = match mode {
        "remainder" => (2, "exact_euclidean_residue", "r = a mod m, 0 <= r < m"),
        "inverse" => (2, "exact_modular_inverse", "a*r = 1 mod m"),
        "add" => (3, "exact_modular_addition", "r = (a+b) mod m"),
        "mul" => (3, "exact_modular_multiplication", "r = (a*b) mod m"),
        "pow" => (3, "exact_modular_exponentiation", "r = a^e mod m"),
        _ => return Err(MathError::InvalidInput),
    };
    let values = values(input, count, count)?;
    let output = number_theory::modular(mode, &values)?;
    let mut answer = Answer::exact(output, method, formula, "integer");
    answer.variable("a", &values[0]);
    answer.variable("m", &values[count - 1]);
    if count == 3 {
        answer.variable(if mode == "pow" { "e" } else { "b" }, &values[1]);
    }
    answer.constraints("Modulus is strictly positive");
    if mode == "inverse" || (mode == "pow" && values[1].sign() == Sign::Minus) {
        answer.constraints("Modular inverse requires coprime operands and modulus above one");
    }
    Ok(answer)
}

fn sequence(input: &str, mode: &str) -> Checked<Answer> {
    let (count, method, formula) = match mode {
        "fibonacci" => (
            1,
            "exact_fibonacci_doubling",
            "F(0)=0, F(1)=1, F(n+2)=F(n+1)+F(n)",
        ),
        "lucas" => (1, "exact_lucas_doubling", "L(n)=2*F(n+1)-F(n)"),
        "arithmetic" => (3, "exact_arithmetic_sequence", "a(n)=a0+n*d"),
        "geometric" => (3, "exact_geometric_sequence", "a(n)=a0*r^n"),
        _ => return Err(MathError::InvalidInput),
    };
    let values = values(input, count, count)?;
    let index = bound(&values[count - 1], MAX_INDEX)?;
    let result = match mode {
        "fibonacci" => BigInt::from(integer::fibonacci_pair(index).0),
        "lucas" => {
            let (term, next) = integer::fibonacci_pair(index);
            BigInt::from((next << 1usize) - term)
        }
        "arithmetic" => checked(&values[0] + &values[1] * index)?,
        "geometric" if values[0].is_zero() => BigInt::zero(),
        "geometric" => checked(&values[0] * integer::bounded_power(values[1].clone(), index)?)?,
        _ => return Err(MathError::InvalidInput),
    };
    let mut answer = Answer::exact(result, method, formula, "integer");
    answer.variable("n", index);
    if count == 3 {
        answer.variable("a0", &values[0]);
        answer.variable(if mode == "arithmetic" { "d" } else { "r" }, &values[1]);
    }
    answer.constraints("Sequence index is zero-based");
    Ok(answer)
}

pub(super) fn evaluate(operation: &str, input: &str, options: &Value) -> Checked<Computation> {
    if input.len() > 4096 {
        return Err(MathError::Limit);
    }
    let options = options_for(operation, options)?;
    let answer = match operation {
        "permutations" | "arrangements" | "combinations" => {
            combinatorial(operation, input, repetition(options)?)
        }
        "set_union"
        | "set_intersection"
        | "set_difference"
        | "set_symmetric_difference"
        | "set_subset" => finite_set(operation, input),
        "logic" | "truth_table" => proposition(operation, input),
        "prime" => primality(input),
        "factor" => factorization(input),
        "gcd" | "lcm" => common(operation, input),
        "modular" => modular(input, selected_mode(options, "remainder")?),
        "sequence" => sequence(input, selected_mode(options, "fibonacci")?),
        _ => return Err(MathError::Unsupported),
    }?;
    Ok(answer.finish(input))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn result(operation: &str, input: &str, options: Value) -> String {
        evaluate(operation, input, &options).unwrap().result
    }

    #[test]
    fn counts_distinguish_order_repetition_and_empty_selections() {
        assert_eq!(
            result("permutations", "20", json!({})),
            "2432902008176640000"
        );
        assert_eq!(
            result("permutations", "2 0 2", json!({"repetition":true})),
            "6"
        );
        assert_eq!(
            result("permutations", "0 0", json!({"repetition":true})),
            "1"
        );
        assert_eq!(result("arrangements", "4 3", json!({})), "24");
        assert_eq!(
            result("arrangements", "4 3", json!({"repetition":true})),
            "64"
        );
        assert_eq!(result("combinations", "4 3", json!({})), "4");
        assert_eq!(
            result("combinations", "4 3", json!({"repetition":true})),
            "20"
        );
        for operation in ["arrangements", "combinations"] {
            assert_eq!(result(operation, "2 3", json!({})), "0");
            assert_eq!(result(operation, "0 0", json!({"repetition":true})), "1");
            assert_eq!(result(operation, "0 1", json!({"repetition":true})), "0");
        }
        let large = result("permutations", "4096", json!({}));
        assert_eq!(large.len(), 13020);
        assert_eq!(
            large
                .bytes()
                .rev()
                .take_while(|&digit| digit == b'0')
                .count(),
            1021
        );
    }

    #[test]
    fn finite_sets_use_value_identity_and_stable_order() {
        for (operation, output) in [
            ("set_union", r#"[-2,1,2,"A","a","b-c"]"#),
            ("set_intersection", r#"[1,"a"]"#),
            ("set_difference", r#"[-2,"A"]"#),
            ("set_symmetric_difference", r#"[-2,2,"A","b-c"]"#),
            ("set_subset", "false"),
        ] {
            assert_eq!(
                result(operation, "A a -2 +01 1 |2 1 a b-c", json!({})),
                output
            );
        }
        assert_eq!(result("set_union", "|", json!({})), "[]");
        assert_eq!(result("set_subset", "| 1", json!({})), "true");
        assert_eq!(result("set_subset", "x|x", json!({})), "true");
    }

    #[test]
    fn typed_logic_precedence_and_complete_truth_rows() {
        let logical =
            evaluate("logic", "  A || B && !C | A=0 B=TRUE C=false  ", &json!({})).unwrap();
        assert_eq!(logical.result, "true");
        assert_eq!(logical.normalized, "A || B && !C | A=0 B=TRUE C=false");
        assert_eq!(logical.variables["A"], "false");
        assert_eq!(logical.variables["B"], "true");
        assert_eq!(result("logic", "0 -> 1 -> 0", json!({})), "true");
        assert_eq!(result("logic", "(0 -> 1) -> 0", json!({})), "false");
        assert_eq!(
            result("logic", "a ∧ ¬A ↔ (a ⊕ A) | A=0 a=1", json!({})),
            "true"
        );
        assert_eq!(
            result("logic", "a ⇔ A ⇒ (!a ∨ A) | A=1 a=0", json!({})),
            "false"
        );
        assert_eq!(
            result("truth_table", "A -> B", json!({})),
            r#"{"variables":["A","B"],"rows":[[0,0,1],[0,1,1],[1,0,0],[1,1,1]]}"#
        );
        assert_eq!(
            result("truth_table", "FALSE <-> 0", json!({})),
            r#"{"variables":[],"rows":[[1]]}"#
        );
        assert_eq!(
            result(
                "logic",
                "Constructor AND Prototype | Constructor=1 Prototype=1",
                json!({})
            ),
            "true"
        );
        let table = result(
            "truth_table",
            "h XOR a XOR b XOR c XOR d XOR e XOR f XOR g",
            json!({}),
        );
        let table: Value = serde_json::from_str(&table).unwrap();
        let rows = table["rows"].as_array().unwrap();
        assert_eq!(rows.len(), 256);
        for row in rows {
            let row = row.as_array().unwrap();
            let parity = row[..8]
                .iter()
                .filter(|value| value.as_u64() == Some(1))
                .count()
                % 2;
            assert_eq!(row[8], json!(parity));
        }
    }

    #[test]
    fn deterministic_bound_and_probable_labels_are_distinct() {
        assert_eq!(result("prime", "-7", json!({})), "not_prime");
        assert_eq!(result("prime", "1", json!({})), "not_prime");
        assert_eq!(result("prime", "18446744073709551557", json!({})), "prime");
        assert_eq!(
            result("prime", "18446744073709551615", json!({})),
            "composite"
        );
        let large = evaluate(
            "prime",
            "170141183460469231731687303715884105727",
            &json!({}),
        )
        .unwrap();
        assert_eq!(large.result, "probable_prime");
        assert_eq!(large.exactness, Exactness::Approximate);
        assert_eq!(large.precision, None);
        assert_eq!(large.error_bound, None);
        // Sorenson and Webster's first common strong pseudoprime to these twelve bases.
        let pseudoprime = evaluate("prime", "318665857834031151167461", &json!({})).unwrap();
        assert_eq!(pseudoprime.result, "probable_prime");
        assert_eq!(pseudoprime.exactness, Exactness::Approximate);
        let witness = evaluate("prime", "18446744073709551617", &json!({})).unwrap();
        assert_eq!(witness.result, "composite");
        assert_eq!(witness.exactness, Exactness::Exact);
        assert!(witness.constraints[0].starts_with("Compositeness witness base: "));
    }

    #[test]
    fn factorization_recomposes_signed_inputs_and_full_width_semiprime() {
        for (input, output) in [
            ("1", "[]"),
            ("-1", "[-1]"),
            ("-360", "[-1,2,2,2,3,3,5]"),
            ("1000036000099", "[1000003,1000033]"),
            ("18446743979220271189", "[4294967279,4294967291]"),
            ("18446744073709551615", "[3,5,17,257,641,65537,6700417]"),
        ] {
            assert_eq!(result("factor", input, json!({})), output);
        }
    }

    #[test]
    fn gcd_lcm_and_modular_arithmetic_respect_sign_and_zero() {
        assert_eq!(result("gcd", "-144 54 36", json!({})), "18");
        assert_eq!(result("gcd", "0 0", json!({})), "0");
        assert_eq!(result("lcm", "-12 15 21", json!({})), "420");
        assert_eq!(result("lcm", "0 4 -5", json!({})), "0");
        for (mode, input, output) in [
            ("remainder", "−8 5", "2"),
            ("add", "-8 3 7", "2"),
            ("mul", "-4 3 7", "2"),
            ("inverse", "-3 7", "2"),
            ("pow", "3 -1 11", "4"),
            ("pow", "0 0 5", "1"),
            ("pow", "42 0 1", "0"),
            ("pow", "-2 5 13", "7"),
        ] {
            assert_eq!(result("modular", input, json!({"mode":mode})), output);
        }
    }

    #[test]
    fn sequences_keep_zero_based_exact_arithmetic_and_geometric_edges() {
        assert_eq!(
            result("sequence", "100", json!({})),
            "354224848179261915075"
        );
        assert_eq!(result("sequence", "0", json!({})), "0");
        assert_eq!(result("sequence", "0", json!({"mode":"lucas"})), "2");
        assert_eq!(result("sequence", "10", json!({"mode":"lucas"})), "123");
        assert_eq!(
            result("sequence", "3 -2 5", json!({"mode":"arithmetic"})),
            "-7"
        );
        assert_eq!(
            result("sequence", "2 -3 5", json!({"mode":"geometric"})),
            "-486"
        );
        assert_eq!(
            result("sequence", "2 0 0", json!({"mode":"geometric"})),
            "2"
        );
        assert_eq!(
            result(
                "sequence",
                "0 9999999999 32768",
                json!({"mode":"geometric"})
            ),
            "0"
        );
    }

    #[test]
    fn errors_separate_syntax_domain_and_resource_bounds() {
        let cases = [
            ("permutations", "4097", json!({}), MathError::Limit),
            (
                "permutations",
                "4096 1",
                json!({"repetition":true}),
                MathError::Limit,
            ),
            ("arrangements", "2 -1", json!({}), MathError::Domain),
            (
                "combinations",
                "2 1",
                json!({"repetition":"true"}),
                MathError::InvalidInput,
            ),
            ("set_union", "1|2|3", json!({}), MathError::InvalidInput),
            ("set_union", "[1]|2", json!({}), MathError::InvalidInput),
            (
                "truth_table",
                "a OR b OR c OR d OR e OR f OR g OR h OR i",
                json!({}),
                MathError::Limit,
            ),
            ("logic", "A AND B | A=1", json!({}), MathError::InvalidInput),
            ("logic", "A | A=1 A=0", json!({}), MathError::InvalidInput),
            (
                "logic",
                "A ||| B | A=1 B=1",
                json!({}),
                MathError::InvalidInput,
            ),
            ("logic", "(TRUE", json!({}), MathError::InvalidInput),
            (
                "logic",
                "constructor | constructor=1",
                json!({}),
                MathError::InvalidInput,
            ),
            (
                "truth_table",
                "prototype",
                json!({}),
                MathError::InvalidInput,
            ),
            ("truth_table", "A | A=1", json!({}), MathError::InvalidInput),
            ("factor", "0", json!({}), MathError::Domain),
            (
                "factor",
                "18446744073709551616",
                json!({}),
                MathError::Limit,
            ),
            (
                "modular",
                "3 -1 6",
                json!({"mode":"pow"}),
                MathError::Domain,
            ),
            (
                "modular",
                "3 1",
                json!({"mode":"inverse"}),
                MathError::Domain,
            ),
            ("modular", "3 0", json!({}), MathError::Domain),
            (
                "sequence",
                "0",
                json!({"mode":"unknown"}),
                MathError::InvalidInput,
            ),
            ("sequence", "32769", json!({}), MathError::Limit),
            (
                "sequence",
                "1 16 32768",
                json!({"mode":"geometric"}),
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
