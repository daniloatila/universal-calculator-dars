use super::integer::{Checked, checked};
use crate::MathError;
use num_bigint::{BigInt, BigUint};
use num_integer::Integer;
use num_traits::{One, Signed, ToPrimitive, Zero};

const BASES: [u64; 12] = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
const RHO_TOTAL: usize = 600_000;
const RHO_ATTEMPT: usize = 120_000;
const RHO_BATCH: u64 = 64;

#[derive(Debug, PartialEq, Eq)]
pub(super) enum Primality {
    NotPrime,
    Prime,
    Divisible(u64),
    Witness(u64),
    ProbablePrime,
}

fn multiply(a: u64, b: u64, modulus: u64) -> u64 {
    (u128::from(a) * u128::from(b) % u128::from(modulus)) as u64
}

fn power(mut base: u64, mut exponent: u64, modulus: u64) -> u64 {
    let mut result = 1;
    while exponent > 0 {
        if exponent % 2 == 1 {
            result = multiply(result, base, modulus);
        }
        exponent /= 2;
        if exponent != 0 {
            base = multiply(base, base, modulus);
        }
    }
    result
}

fn passes_u64(n: u64, base: u64, odd: u64, twos: u32) -> bool {
    let mut residue = power(base, odd, n);
    if residue == 1 || residue == n - 1 {
        return true;
    }
    for _ in 1..twos {
        residue = multiply(residue, residue, n);
        if residue == n - 1 {
            return true;
        }
    }
    false
}

fn primality_u64(value: u64) -> Primality {
    if value < 2 {
        return Primality::NotPrime;
    }
    for prime in BASES {
        if value == prime {
            return Primality::Prime;
        }
        if value.is_multiple_of(prime) {
            return Primality::Divisible(prime);
        }
    }
    let twos = (value - 1).trailing_zeros();
    let odd = (value - 1) >> twos;
    for base in BASES {
        if !passes_u64(value, base, odd, twos) {
            return Primality::Witness(base);
        }
    }
    Primality::Prime
}

fn passes_big(n: &BigUint, last: &BigUint, base: u64, odd: &BigUint, twos: u64) -> bool {
    let mut residue = BigUint::from(base).modpow(odd, n);
    if residue.is_one() || residue == *last {
        return true;
    }
    for _ in 1..twos {
        residue = (&residue * &residue) % n;
        if residue == *last {
            return true;
        }
    }
    false
}

pub(super) fn prime(value: &BigInt) -> Checked<Primality> {
    if value <= &BigInt::one() {
        return Ok(Primality::NotPrime);
    }
    if let Some(machine) = value.to_u64() {
        return Ok(primality_u64(machine));
    }
    if value.bits() > 1024 {
        return Err(MathError::Limit);
    }
    let n = value.magnitude();
    for prime in BASES {
        if (n % prime).is_zero() {
            return Ok(Primality::Divisible(prime));
        }
    }
    let last = n - 1u32;
    let twos = last.trailing_zeros().ok_or(MathError::NoConvergence)?;
    let odd = &last >> twos;
    for base in BASES {
        if !passes_big(n, &last, base, &odd, twos) {
            return Ok(Primality::Witness(base));
        }
    }
    Ok(Primality::ProbablePrime)
}

fn step(value: u64, constant: u64, modulus: u64, budget: &mut usize) -> Option<u64> {
    *budget = budget.checked_sub(1)?;
    let x = u128::from(value);
    Some(((x * x + u128::from(constant)) % u128::from(modulus)) as u64)
}

fn brent(n: u64, constant: u64, seed: u64, budget: &mut usize) -> Option<u64> {
    let mut y = seed % n;
    let mut length = 1u64;
    loop {
        let x = y;
        for _ in 0..length {
            y = step(y, constant, n, budget)?;
        }
        let mut consumed = 0;
        while consumed < length {
            let checkpoint = y;
            let span = RHO_BATCH.min(length - consumed);
            let mut product = 1;
            for _ in 0..span {
                y = step(y, constant, n, budget)?;
                product = multiply(product, x.abs_diff(y), n);
            }
            let factor = product.gcd(&n);
            if factor == n {
                let mut restore = checkpoint;
                for _ in 0..span {
                    restore = step(restore, constant, n, budget)?;
                    let divisor = x.abs_diff(restore).gcd(&n);
                    if divisor > 1 && divisor < n {
                        return Some(divisor);
                    }
                }
                return None;
            }
            if factor > 1 {
                return Some(factor);
            }
            consumed += span;
        }
        length = length.checked_mul(2)?;
    }
}

fn divisor(n: u64, available: &mut usize) -> Option<u64> {
    for constant in [1, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37] {
        if *available == 0 {
            break;
        }
        let attempt = (*available).min(RHO_ATTEMPT);
        let mut budget = attempt;
        let factor = brent(n, constant, constant + 2, &mut budget);
        *available -= attempt - budget;
        if factor.is_some() {
            return factor;
        }
    }
    None
}

pub(super) fn factor(value: &BigInt) -> Checked<Vec<u64>> {
    let original = value.magnitude().to_u64().ok_or(MathError::Limit)?;
    if original == 0 {
        return Err(MathError::Domain);
    }
    let mut remaining = original;
    let mut factors = Vec::new();
    for small in BASES {
        while remaining.is_multiple_of(small) {
            factors.push(small);
            remaining /= small;
        }
    }
    let mut stack = vec![remaining];
    let mut available = RHO_TOTAL;
    while let Some(n) = stack.pop() {
        if n == 1 {
            continue;
        }
        if let Primality::Prime = primality_u64(n) {
            factors.push(n);
            continue;
        }
        let factor = divisor(n, &mut available).ok_or(MathError::NoConvergence)?;
        if factor <= 1 || factor >= n || !n.is_multiple_of(factor) {
            return Err(MathError::NoConvergence);
        }
        stack.extend([factor, n / factor]);
    }
    factors.sort_unstable();
    let recomposed = factors
        .iter()
        .try_fold(1u64, |product, &factor| product.checked_mul(factor));
    if recomposed != Some(original) {
        return Err(MathError::NoConvergence);
    }
    Ok(factors)
}

pub(super) fn gcd(values: &[BigInt]) -> BigInt {
    values
        .iter()
        .fold(BigInt::zero(), |divisor, value| divisor.gcd(value))
}

pub(super) fn lcm(values: &[BigInt]) -> Checked<BigInt> {
    if values.iter().any(Zero::is_zero) {
        return Ok(BigInt::zero());
    }
    values.iter().try_fold(BigInt::one(), |multiple, value| {
        let common = multiple.gcd(value);
        checked(((multiple / common) * value).abs())
    })
}

fn inverse(value: &BigInt, modulus: &BigInt) -> Checked<BigInt> {
    if modulus <= &BigInt::one() {
        return Err(MathError::Domain);
    }
    let result = value.mod_floor(modulus).extended_gcd(modulus);
    if !result.gcd.is_one() {
        return Err(MathError::Domain);
    }
    Ok(result.x.mod_floor(modulus))
}

pub(super) fn modular(mode: &str, values: &[BigInt]) -> Checked<BigInt> {
    let first = &values[0];
    let modulus = values.last().ok_or(MathError::InvalidInput)?;
    if !modulus.is_positive() {
        return Err(MathError::Domain);
    }
    let second = &values[1];
    match mode {
        "remainder" => Ok(first.mod_floor(modulus)),
        "inverse" => inverse(first, modulus),
        "add" => Ok((first.mod_floor(modulus) + second.mod_floor(modulus)).mod_floor(modulus)),
        "mul" => Ok((first.mod_floor(modulus) * second.mod_floor(modulus)).mod_floor(modulus)),
        "pow" => {
            if second.bits() > 1024 || modulus.bits() > 2048 {
                return Err(MathError::Limit);
            }
            let base = if second.is_negative() {
                inverse(first, modulus)?
            } else {
                first.mod_floor(modulus)
            };
            Ok(base.modpow(&second.abs(), modulus))
        }
        _ => Err(MathError::InvalidInput),
    }
}
