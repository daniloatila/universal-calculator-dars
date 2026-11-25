use crate::MathError;
use num_bigint::{BigInt, BigUint};
use num_traits::{One, ToPrimitive, Zero};

pub(super) type Checked<T> = Result<T, MathError>;
pub(super) const MAX_INPUT_BITS: u64 = 4096;
pub(super) const MAX_RESULT_BITS: u64 = 65_536;
pub(super) const MAX_COUNT: u32 = 4096;
pub(super) const MAX_INDEX: u32 = 32_768;

pub(super) fn parse(input: &str) -> Checked<BigInt> {
    let (negative, digits) = match input.strip_prefix(['-', '−']) {
        Some(digits) => (true, digits),
        None => (false, input.strip_prefix('+').unwrap_or(input)),
    };
    if digits.is_empty() || !digits.bytes().all(|digit| digit.is_ascii_digit()) {
        return Err(MathError::InvalidInput);
    }
    if digits.len() > 1234 {
        return Err(MathError::Limit);
    }
    let value = BigInt::parse_bytes(digits.as_bytes(), 10).ok_or(MathError::InvalidInput)?;
    if value.bits() > MAX_INPUT_BITS {
        return Err(MathError::Limit);
    }
    Ok(if negative { -value } else { value })
}

pub(super) fn values(input: &str, minimum: usize, maximum: usize) -> Checked<Vec<BigInt>> {
    let tokens: Vec<_> = input.split_whitespace().take(maximum + 1).collect();
    if tokens.len() < minimum {
        return Err(MathError::InvalidInput);
    }
    if tokens.len() > maximum {
        return Err(if minimum == maximum {
            MathError::InvalidInput
        } else {
            MathError::Limit
        });
    }
    tokens.into_iter().map(parse).collect()
}

pub(super) fn bound(value: &BigInt, maximum: u32) -> Checked<u32> {
    if value.sign() == num_bigint::Sign::Minus {
        return Err(MathError::Domain);
    }
    value
        .to_u32()
        .filter(|value| *value <= maximum)
        .ok_or(MathError::Limit)
}

pub(super) fn checked(value: BigInt) -> Checked<BigInt> {
    if value.bits() > MAX_RESULT_BITS {
        Err(MathError::Limit)
    } else {
        Ok(value)
    }
}

pub(super) fn falling(n: u32, k: u32) -> BigUint {
    if k > n {
        return BigUint::zero();
    }
    (n - k + 1..=n).fold(BigUint::one(), |product, factor| product * factor)
}

pub(super) fn choose(n: u32, k: u32) -> BigUint {
    if k > n {
        return BigUint::zero();
    }
    let k = k.min(n - k);
    (1..=k).fold(BigUint::one(), |coefficient, index| {
        coefficient * (n - k + index) / index
    })
}

pub(super) fn multiset(input: &[BigInt]) -> Checked<BigUint> {
    let mut seen = 0;
    let mut answer = BigUint::one();
    for value in input {
        let size = bound(value, MAX_COUNT)?;
        seen += size;
        if seen > MAX_COUNT {
            return Err(MathError::Limit);
        }
        answer *= choose(seen, size);
    }
    Ok(answer)
}

pub(super) fn bounded_power(mut base: BigInt, mut exponent: u32) -> Checked<BigInt> {
    let mut answer = BigInt::one();
    while exponent > 0 {
        if exponent % 2 == 1 {
            answer = checked(answer * &base)?;
        }
        exponent /= 2;
        if exponent != 0 {
            base = checked(&base * &base)?;
        }
    }
    Ok(answer)
}

pub(super) fn fibonacci_pair(index: u32) -> (BigUint, BigUint) {
    if index == 0 {
        return (BigUint::zero(), BigUint::one());
    }
    let (a, b) = fibonacci_pair(index / 2);
    let c = &a * ((&b << 1usize) - &a);
    let d = &a * &a + &b * &b;
    if index % 2 == 1 {
        let next = &c + &d;
        (d, next)
    } else {
        (c, d)
    }
}
