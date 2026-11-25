use crate::{Computation, Exactness, MathError};
use num_bigint::BigUint;
use num_traits::{One, Zero};
use serde_json::Value;
use std::collections::BTreeMap;

type Checked<T> = Result<T, MathError>;
const MAX_WIDTH: u64 = 1024;
const MAX_DIGITS: usize = 1024;

struct WordSpec {
    base: u32,
    width: usize,
    signed: bool,
    modulus: BigUint,
    mask: BigUint,
    half: BigUint,
}

impl WordSpec {
    fn read(options: &Value) -> Checked<Self> {
        let options = options.as_object().ok_or(MathError::InvalidInput)?;
        if options
            .keys()
            .any(|key| !matches!(key.as_str(), "base" | "width" | "signed"))
        {
            return Err(MathError::InvalidInput);
        }
        let base = options.get("base").map_or(Ok(10), |base| {
            base.as_u64()
                .filter(|base| matches!(base, 2 | 8 | 10 | 16))
                .ok_or(MathError::InvalidInput)
        })? as u32;
        let width = options.get("width").map_or(Ok(32), |width| {
            width.as_u64().ok_or(MathError::InvalidInput)
        })?;
        if width == 0 {
            return Err(MathError::Domain);
        }
        if width > MAX_WIDTH {
            return Err(MathError::Limit);
        }
        let width = width as usize;
        let signed = options.get("signed").map_or(Ok(false), |signed| {
            signed.as_bool().ok_or(MathError::InvalidInput)
        })?;
        let modulus = BigUint::one() << width;
        let mask = &modulus - 1u8;
        let half = &modulus >> 1usize;
        Ok(Self {
            base,
            width,
            signed,
            modulus,
            mask,
            half,
        })
    }

    fn parse_word(&self, input: &str) -> Checked<BigUint> {
        let (digits, sign) = sign(input);
        let digits = match self.base {
            2 => strip_prefix(digits, 'b'),
            8 => strip_prefix(digits, 'o'),
            16 => strip_prefix(digits, 'x'),
            _ => digits,
        };
        validate_digits(digits, self.base)?;
        let value =
            BigUint::parse_bytes(digits.as_bytes(), self.base).ok_or(MathError::InvalidInput)?;
        let is_number = self.base == 10 || sign != Sign::Implicit;
        let negative = sign == Sign::Negative && !value.is_zero();
        if negative {
            if !self.signed || value > self.half {
                return Err(MathError::Domain);
            }
            return Ok(&self.modulus - value);
        }
        let ceiling = if self.signed && is_number {
            &self.half
        } else {
            &self.modulus
        };
        if &value >= ceiling {
            return Err(MathError::Domain);
        }
        Ok(value)
    }

    fn has_sign_bit(&self, value: &BigUint) -> bool {
        value >= &self.half
    }

    fn decimal(&self, value: &BigUint) -> String {
        if self.signed && self.has_sign_bit(value) {
            format!("-{}", &self.modulus - value)
        } else {
            value.to_string()
        }
    }

    fn render(&self, value: &BigUint) -> String {
        let width = self.width;
        let octal_width = width.div_ceil(3);
        let hex_width = width.div_ceil(4);
        let binary = value.to_str_radix(2);
        let octal = value.to_str_radix(8);
        let decimal = self.decimal(value);
        let hexadecimal = value.to_str_radix(16).to_ascii_uppercase();
        format!(
            "binary={binary:0>width$}; octal={octal:0>octal_width$}; decimal={decimal}; hexadecimal={hexadecimal:0>hex_width$}"
        )
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Sign {
    Implicit,
    Positive,
    Negative,
}

fn sign(input: &str) -> (&str, Sign) {
    if let Some(value) = input.strip_prefix(['-', '−']) {
        (value, Sign::Negative)
    } else if let Some(value) = input.strip_prefix('+') {
        (value, Sign::Positive)
    } else {
        (input, Sign::Implicit)
    }
}

fn strip_prefix(input: &str, marker: char) -> &str {
    if let Some(rest) = input.strip_prefix('0')
        && let Some(rest) = rest.strip_prefix([marker, marker.to_ascii_uppercase()])
    {
        return rest;
    }
    input
}

fn validate_digits(input: &str, base: u32) -> Checked<()> {
    if input.is_empty() {
        return Err(MathError::InvalidInput);
    }
    if input.len() > MAX_DIGITS {
        return Err(MathError::Limit);
    }
    if !input.bytes().all(|byte| char::from(byte).is_digit(base)) {
        return Err(MathError::InvalidInput);
    }
    Ok(())
}

struct Count<'a> {
    capped: usize,
    remainder: usize,
    digits: &'a str,
}

impl<'a> Count<'a> {
    fn read(input: &'a str, width: usize) -> Checked<Self> {
        let (digits, sign) = sign(input);
        validate_digits(digits, 10)?;
        let canonical = digits.trim_start_matches('0');
        if sign == Sign::Negative && !canonical.is_empty() {
            return Err(MathError::Domain);
        }
        let mut capped = 0;
        let mut remainder = 0;
        for byte in canonical.bytes() {
            let digit = usize::from(byte - b'0');
            capped = (capped * 10 + digit).min(width);
            remainder = (remainder * 10 + digit) % width;
        }
        Ok(Self {
            capped,
            remainder,
            digits: if canonical.is_empty() { "0" } else { canonical },
        })
    }
}

#[derive(Clone, Copy)]
enum Operation {
    Convert,
    And,
    Or,
    Xor,
    Not,
    ShiftLeft,
    ShiftRightLogical,
    ShiftRightArithmetic,
    RotateLeft,
    RotateRight,
    TwosComplement,
}

impl Operation {
    fn read(operation: &str) -> Checked<Self> {
        match operation {
            "convert" => Ok(Self::Convert),
            "and" => Ok(Self::And),
            "or" => Ok(Self::Or),
            "xor" => Ok(Self::Xor),
            "not" => Ok(Self::Not),
            "shift_left" => Ok(Self::ShiftLeft),
            "shift_right_logical" => Ok(Self::ShiftRightLogical),
            "shift_right_arithmetic" => Ok(Self::ShiftRightArithmetic),
            "rotate_left" => Ok(Self::RotateLeft),
            "rotate_right" => Ok(Self::RotateRight),
            "twos_complement" => Ok(Self::TwosComplement),
            _ => Err(MathError::Unsupported),
        }
    }

    fn arity(self) -> usize {
        match self {
            Self::Convert | Self::Not | Self::TwosComplement => 1,
            _ => 2,
        }
    }

    fn method(self) -> (&'static str, &'static str) {
        match self {
            Self::Convert => ("fixed_width_conversion", "word = a mod 2^w"),
            Self::And => ("fixed_width_and", "word = a AND b"),
            Self::Or => ("fixed_width_or", "word = a OR b"),
            Self::Xor => ("fixed_width_xor", "word = a XOR b"),
            Self::Not => ("fixed_width_not", "word = a XOR (2^w-1)"),
            Self::ShiftLeft => ("fixed_width_left_shift", "word = (a*2^k) mod 2^w"),
            Self::ShiftRightLogical => (
                "fixed_width_logical_right_shift",
                "word = floor(unsigned(a)/2^k)",
            ),
            Self::ShiftRightArithmetic => (
                "fixed_width_arithmetic_right_shift",
                "word = floor(signed(a)/2^k) mod 2^w",
            ),
            Self::RotateLeft => (
                "fixed_width_rotate_left",
                "r = k mod w, word = ((a << r) OR (a >> (w-r))) mod 2^w",
            ),
            Self::RotateRight => (
                "fixed_width_rotate_right",
                "r = k mod w, word = ((a >> r) OR (a << (w-r))) mod 2^w",
            ),
            Self::TwosComplement => ("fixed_width_twos_complement", "word = (-a) mod 2^w"),
        }
    }
}

fn move_bits(
    operation: Operation,
    spec: &WordSpec,
    word: &BigUint,
    count: &Count<'_>,
    constraints: &mut Vec<String>,
) -> BigUint {
    let width = spec.width;
    let amount = count.capped;
    match operation {
        Operation::ShiftLeft => {
            constraints.push("Left shift discards bits outside the selected word width".to_owned());
            (word << amount) & &spec.mask
        }
        Operation::ShiftRightLogical => {
            constraints.push("Logical right shift inserts zero bits".to_owned());
            word >> amount
        }
        Operation::ShiftRightArithmetic => {
            constraints.push("Arithmetic right shift copies the most significant bit".to_owned());
            let mut result = word >> amount;
            if spec.has_sign_bit(word) {
                result |= &spec.mask ^ (&spec.mask >> amount);
            }
            result
        }
        Operation::RotateLeft | Operation::RotateRight => {
            let offset = count.remainder;
            constraints.push(format!("Effective rotation count: {offset}"));
            if offset == 0 {
                return word.clone();
            }
            if matches!(operation, Operation::RotateLeft) {
                ((word << offset) & &spec.mask) | (word >> (width - offset))
            } else {
                (word >> offset) | ((word << (width - offset)) & &spec.mask)
            }
        }
        _ => unreachable!("bit movement needs a count"),
    }
}

fn binding(variables: &mut BTreeMap<String, String>, name: &str, value: &str, description: &str) {
    let text = if value.len() <= 256 {
        value
    } else {
        description
    };
    variables.insert(name.to_owned(), text.to_owned());
}

pub(super) fn evaluate(operation: &str, input: &str, options: &Value) -> Checked<Computation> {
    if input.len() > 4096 {
        return Err(MathError::Limit);
    }
    let operation = Operation::read(operation)?;
    let spec = WordSpec::read(options)?;
    let operands: Vec<_> = input.split_whitespace().take(3).collect();
    if operands.len() != operation.arity() {
        return Err(MathError::InvalidInput);
    }
    let first = spec.parse_word(operands[0])?;
    let mut variables = BTreeMap::new();
    binding(
        &mut variables,
        "a",
        &spec.decimal(&first),
        "Exact word from input",
    );
    let mut constraints = vec![
        format!("Word width: {} bits", spec.width),
        format!("Input base: {}", spec.base),
        if spec.signed {
            "Signed decimal interpretation".to_owned()
        } else {
            "Unsigned decimal interpretation".to_owned()
        },
    ];
    let result = match operation {
        Operation::Convert => first,
        Operation::And | Operation::Or | Operation::Xor => {
            let second = spec.parse_word(operands[1])?;
            binding(
                &mut variables,
                "b",
                &spec.decimal(&second),
                "Exact word from input",
            );
            match operation {
                Operation::And => first & second,
                Operation::Or => first | second,
                Operation::Xor => first ^ second,
                _ => unreachable!("binary bitwise operator"),
            }
        }
        Operation::Not => first ^ &spec.mask,
        Operation::TwosComplement => {
            constraints.push("Two's complement negation wraps modulo 2^width".to_owned());
            if spec.signed && first == spec.half {
                constraints.push("The minimum signed value retains its bit pattern".to_owned());
            }
            if first.is_zero() {
                first
            } else {
                &spec.modulus - first
            }
        }
        _ => {
            let count = Count::read(operands[1], spec.width)?;
            binding(
                &mut variables,
                "count",
                count.digits,
                "Exact decimal count from input",
            );
            if count.capped == spec.width
                && !matches!(operation, Operation::RotateLeft | Operation::RotateRight)
            {
                constraints.push("Shift count is at least the word width".to_owned());
            }
            move_bits(operation, &spec, &first, &count, &mut constraints)
        }
    };
    let (method, formula) = operation.method();
    Ok(Computation {
        result: spec.render(&result),
        exactness: Exactness::Exact,
        normalized: input.trim().to_owned(),
        method,
        domain: "fixed_width_integer",
        formula: Some(formula),
        precision: None,
        tolerance: None,
        error_bound: None,
        constraints,
        variables,
        units: BTreeMap::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn calculation(operation: &str, input: &str, options: Value) -> Computation {
        evaluate(operation, input, &options).unwrap()
    }

    fn decimal(operation: &str, input: &str, options: Value) -> String {
        calculation(operation, input, options)
            .result
            .split("; ")
            .nth(2)
            .unwrap()
            .strip_prefix("decimal=")
            .unwrap()
            .to_owned()
    }

    #[test]
    fn named_words_pad_in_each_base() {
        let default = calculation("convert", "42", json!({}));
        assert_eq!(
            default.result,
            "binary=00000000000000000000000000101010; octal=00000000052; decimal=42; hexadecimal=0000002A"
        );
        assert_eq!(default.domain, "fixed_width_integer");
        assert!(
            default.units.is_empty()
                && default.precision.is_none()
                && default.error_bound.is_none()
        );
        assert_eq!(
            calculation("convert", "0O17", json!({"base":8,"width":5})).result,
            "binary=01111; octal=17; decimal=15; hexadecimal=0F"
        );
        assert_eq!(
            calculation("convert", "0B101", json!({"base":2,"width":9})).result,
            "binary=000000101; octal=005; decimal=5; hexadecimal=005"
        );
        assert_eq!(
            calculation("convert", "0Xab", json!({"base":16,"width":17})).result,
            "binary=00000000010101011; octal=000253; decimal=171; hexadecimal=000AB"
        );
        assert_eq!(decimal("convert", "0B", json!({"base":16,"width":8})), "11");
    }

    #[test]
    fn signed_range_distinguishes_values_and_bit_patterns() {
        for (input, base, expected) in [
            ("-128", 10, "-128"),
            ("127", 10, "127"),
            ("-0x80", 16, "-128"),
            ("+0x7f", 16, "127"),
            ("80", 16, "-128"),
            ("11111111", 2, "-1"),
            ("0377", 8, "-1"),
            ("−0", 10, "0"),
        ] {
            assert_eq!(
                decimal(
                    "convert",
                    input,
                    json!({"width":8,"base":base,"signed":true})
                ),
                expected
            );
        }
        assert_eq!(decimal("convert", "255", json!({"width":8})), "255");
        assert_eq!(decimal("convert", "−0", json!({"width":8})), "0");
        assert_eq!(
            decimal("convert", "1", json!({"base":2,"width":1,"signed":true})),
            "-1"
        );
        assert_eq!(
            decimal(
                "convert",
                "10000000000000000",
                json!({"base":16,"width":65,"signed":true})
            ),
            "-18446744073709551616"
        );
    }

    #[test]
    fn bitwise_and_modular_negation_preserve_width() {
        let options = json!({"base":16,"width":8});
        for (operation, input, expected) in [
            ("and", "F0 AA", "160"),
            ("or", "F0 0F", "255"),
            ("xor", "F0	0F", "255"),
            ("not", "AA", "85"),
            ("not", "00", "255"),
            ("twos_complement", "7f", "129"),
            ("twos_complement", "0", "0"),
        ] {
            assert_eq!(decimal(operation, input, options.clone()), expected);
        }
        let min = calculation("twos_complement", "-128", json!({"width":8,"signed":true}));
        assert_eq!(
            min.result,
            "binary=10000000; octal=200; decimal=-128; hexadecimal=80"
        );
        assert!(
            min.constraints
                .contains(&"The minimum signed value retains its bit pattern".to_owned())
        );
        assert_eq!(
            decimal("twos_complement", "-1", json!({"width":1,"signed":true})),
            "-1"
        );
        assert_eq!(decimal("twos_complement", "1", json!({"width":1})), "1");
    }

    #[test]
    fn shifts_use_the_selected_word_boundary() {
        let options = json!({"base":16,"width":8});
        for (name, input, expected) in [
            ("shift_left", "A5 1", "74"),
            ("shift_left", "FF 8", "0"),
            ("shift_right_logical", "A5 1", "82"),
            ("shift_right_logical", "A5 8", "0"),
            ("shift_right_arithmetic", "A5 1", "210"),
            ("shift_right_arithmetic", "A5 8", "255"),
            ("shift_right_arithmetic", "23 9", "0"),
            ("shift_right_arithmetic", "A5 -0", "165"),
        ] {
            assert_eq!(decimal(name, input, options.clone()), expected);
        }
        assert_eq!(
            decimal(
                "shift_right_arithmetic",
                "-3 1",
                json!({"width":8,"signed":true})
            ),
            "-2"
        );
        let proof = calculation("shift_left", " 1  +0008 ", json!({"width":8}));
        assert_eq!(proof.normalized, "1  +0008");
        assert_eq!(proof.variables["count"], "8");
        assert!(
            proof
                .constraints
                .contains(&"Shift count is at least the word width".to_owned())
        );
    }

    #[test]
    fn rotations_use_non_machine_decimal_counts_and_replay() {
        for (operation, input, expected) in [
            ("rotate_left", "65 1", "3"),
            ("rotate_right", "3 8", "65"),
            ("rotate_left", "1 18446744073709551616", "4"),
            ("rotate_right", "99 0", "99"),
            ("rotate_left", "99 21", "99"),
        ] {
            let result = calculation(operation, input, json!({"width":7}));
            assert_eq!(
                result.result.split("; ").nth(2).unwrap(),
                format!("decimal={expected}")
            );
            assert_eq!(
                calculation(operation, &result.normalized, json!({"width":7})).result,
                result.result
            );
        }
        let huge = format!("1 1{}3", "0".repeat(1022));
        let actual = calculation("rotate_left", &huge, json!({"width":8}));
        assert_eq!(
            actual.result,
            "binary=00001000; octal=010; decimal=8; hexadecimal=08"
        );
        assert!(
            actual
                .constraints
                .contains(&"Effective rotation count: 3".to_owned())
        );
        assert_eq!(actual.variables["count"], "Exact decimal count from input");
    }

    #[test]
    fn thousand_bit_words_do_not_use_host_word_size() {
        let options = json!({"base":2,"width":1024});
        let pattern = "1".repeat(1024);
        let exact = calculation("convert", &pattern, options.clone());
        let expected = (BigUint::one() << 1024usize) - 1u8;
        let fields: Vec<_> = exact.result.split("; ").collect();
        assert_eq!(fields[0], format!("binary={pattern}"));
        assert_eq!(fields[1].strip_prefix("octal=").unwrap().len(), 342);
        assert_eq!(fields[2], format!("decimal={expected}"));
        assert_eq!(fields[3], format!("hexadecimal={}", "F".repeat(256)));
        assert_eq!(exact.variables["a"], "Exact word from input");
        assert_eq!(decimal("not", &pattern, options), "0");
    }

    #[test]
    fn validation_distinguishes_domain_syntax_and_limits() {
        let cases = [
            ("convert", "256", json!({"width":8}), MathError::Domain),
            ("convert", "-1", json!({"width":8}), MathError::Domain),
            (
                "convert",
                "128",
                json!({"width":8,"signed":true}),
                MathError::Domain,
            ),
            (
                "convert",
                "-129",
                json!({"width":8,"signed":true}),
                MathError::Domain,
            ),
            (
                "convert",
                "+0x80",
                json!({"base":16,"width":8,"signed":true}),
                MathError::Domain,
            ),
            (
                "convert",
                "-0x81",
                json!({"base":16,"width":8,"signed":true}),
                MathError::Domain,
            ),
            ("convert", "1", json!({"width":0}), MathError::Domain),
            ("convert", "1", json!({"width":1025}), MathError::Limit),
            ("convert", "1", json!({"base":32}), MathError::InvalidInput),
            (
                "convert",
                "1",
                json!({"width":"8"}),
                MathError::InvalidInput,
            ),
            ("convert", "1", json!({"signed":1}), MathError::InvalidInput),
            (
                "convert",
                "1",
                json!({"precision":32}),
                MathError::InvalidInput,
            ),
            ("convert", "1", json!(null), MathError::InvalidInput),
            ("convert", "0x", json!({"base":16}), MathError::InvalidInput),
            ("convert", "0x1", json!({"base":2}), MathError::InvalidInput),
            ("convert", "10_000", json!({}), MathError::InvalidInput),
            ("convert", "1.0", json!({}), MathError::InvalidInput),
            ("convert", "1 2", json!({}), MathError::InvalidInput),
            ("xor", "1", json!({}), MathError::InvalidInput),
            ("or", "1 2 3 4", json!({}), MathError::InvalidInput),
            ("rotate_left", "1 -1", json!({}), MathError::Domain),
            (
                "shift_right_logical",
                "1 0b10",
                json!({"base":2}),
                MathError::InvalidInput,
            ),
            ("evaluate", "1", json!({}), MathError::Unsupported),
        ];
        for (operation, input, options, error) in cases {
            assert_eq!(
                evaluate(operation, input, &options).err(),
                Some(error),
                "{operation}: {input}"
            );
        }
        assert_eq!(
            evaluate("convert", &"0".repeat(1025), &json!({})).err(),
            Some(MathError::Limit)
        );
        assert_eq!(
            evaluate(
                "rotate_right",
                &format!("1 {}", "1".repeat(1025)),
                &json!({})
            )
            .err(),
            Some(MathError::Limit)
        );
        assert_eq!(
            evaluate("convert", &" ".repeat(4097), &json!({})).err(),
            Some(MathError::Limit)
        );
    }
}
