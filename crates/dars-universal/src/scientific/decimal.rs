use super::MathError;
use astro_float_num::{BigFloat, Consts, Radix, RoundingMode, Sign};
use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{One, Signed, Zero};

#[derive(Clone, Copy, PartialEq)]
pub(super) enum Notation {
    Auto,
    Scientific,
    Engineering,
}

pub(super) fn literal(source: &str) -> Result<BigRational, MathError> {
    const MAX_LITERAL_DIGITS: usize = 256;
    const MAX_LITERAL_EXPONENT: i32 = 2048;
    let (mantissa, exponent) = match source.split_once(['e', 'E']) {
        Some((mantissa, exponent)) => (
            mantissa,
            exponent.parse::<i32>().map_err(|_| MathError::Limit)?,
        ),
        None => (source, 0),
    };
    let (whole, fraction) = mantissa.split_once('.').unwrap_or((mantissa, ""));
    if whole.is_empty() && fraction.is_empty() {
        return Err(MathError::InvalidInput);
    }
    if whole.len() + fraction.len() > MAX_LITERAL_DIGITS
        || exponent.unsigned_abs() > MAX_LITERAL_EXPONENT as u32
    {
        return Err(MathError::Limit);
    }
    let digits = format!("{whole}{fraction}");
    let numerator = BigInt::parse_bytes(digits.as_bytes(), 10).ok_or(MathError::InvalidInput)?;
    let scale = exponent - fraction.len() as i32;
    let base = BigInt::from(10u8).pow(scale.unsigned_abs());
    if scale >= 0 {
        Ok(BigRational::from_integer(numerator * base))
    } else {
        Ok(BigRational::new(numerator, base))
    }
}

fn mantissa(mut digits: String, point: i32) -> String {
    let length = digits.len() as i32;
    if point <= 0 {
        return format!("0.{}{digits}", "0".repeat((-point) as usize));
    }
    if point >= length {
        digits.extend(std::iter::repeat_n('0', (point - length) as usize));
    } else {
        digits.insert(point as usize, '.');
    }
    digits
}

fn render(digits: String, exponent: i32, negative: bool, notation: Notation) -> String {
    let sign = if negative { "-" } else { "" };
    if notation == Notation::Auto && (-6..=12).contains(&exponent) {
        return format!("{sign}{}", mantissa(digits, exponent + 1));
    }
    let written_exponent = if notation == Notation::Engineering {
        exponent.div_euclid(3) * 3
    } else {
        exponent
    };
    format!(
        "{sign}{}e{written_exponent:+}",
        mantissa(digits, exponent - written_exponent + 1)
    )
}

fn trim(mut digits: String) -> String {
    let len = digits.trim_end_matches('0').len();
    digits.truncate(len.max(1));
    digits
}

pub(super) fn exact(value: &BigRational, notation: Notation) -> String {
    if notation == Notation::Auto || value.is_zero() {
        return value.to_string();
    }

    // A finite decimal is exact only when the reduced denominator has factors two and five.
    let twos = value.denom().trailing_zeros().unwrap_or(0);
    let mut denominator = value.denom() >> twos;
    let five = BigInt::from(5u8);
    let mut fives = 0;
    while (&denominator % &five).is_zero() {
        denominator /= &five;
        fives += 1;
    }
    if !denominator.is_one() {
        return value.to_string();
    }
    let scale = twos.max(fives);
    // Some exact fractions have too many decimal digits for a useful view.
    if scale > 4096 {
        return value.to_string();
    }
    let decimal_value = (value.numer().abs() << (scale - twos)) * five.pow((scale - fives) as u32);
    let digits = decimal_value.to_string();
    let exponent = digits.len() as i32 - 1 - scale as i32;
    render(trim(digits), exponent, value.is_negative(), notation)
}

pub(super) fn approximate(
    value: &BigFloat,
    precision: u32,
    notation: Notation,
    consts: &mut Consts,
) -> Result<String, MathError> {
    if value.is_zero() {
        return Ok("0".to_string());
    }
    // Export the finite dyadic value first. The decimal converter in astro-float-num 0.3.6
    // can panic on wasm32; using integer arithmetic also makes decimal rounding target-independent.
    let (sign, bits, binary_exponent) = value
        .convert_to_radix(Radix::Bin, RoundingMode::None, consts)
        .map_err(|_| MathError::NoConvergence)?;
    let significand =
        BigInt::from_radix_be(num_bigint::Sign::Plus, &bits, 2).ok_or(MathError::NoConvergence)?;
    let shift = binary_exponent - bits.len() as i32;
    let (decimal, scale) = if shift >= 0 {
        (significand << shift as u32, 0)
    } else {
        (
            significand * BigInt::from(5u8).pow(shift.unsigned_abs()),
            -shift,
        )
    };
    let mut digits: Vec<u8> = decimal
        .to_string()
        .bytes()
        .map(|digit| digit - b'0')
        .collect();
    let mut exponent = digits.len() as i32 - scale - 1;
    let precision = precision as usize;
    if digits.len() > precision {
        let tail = &digits[precision..];
        let increment = tail[0] > 5
            || (tail[0] == 5
                && (!digits[precision - 1].is_multiple_of(2)
                    || tail[1..].iter().any(|digit| *digit != 0)));
        digits.truncate(precision);
        if increment {
            if let Some(index) = digits.iter().rposition(|digit| *digit < 9) {
                digits[index] += 1;
                digits[index + 1..].fill(0);
            } else {
                digits.clear();
                digits.push(1);
                exponent += 1;
            }
        }
    }
    let digits: String = digits
        .into_iter()
        .map(|digit| char::from(b'0' + digit))
        .collect();
    Ok(render(trim(digits), exponent, sign == Sign::Neg, notation))
}
