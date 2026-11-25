use super::MathError;
use super::polynomial::{Coefficient, NAMES, Poly, Powers, checked_coefficient, coefficient};
use num_bigint::BigInt;
use num_integer::Integer;
use num_traits::{One, Signed, ToPrimitive, Zero};
use std::cmp::Ordering;
use std::collections::BTreeSet;

const MAX_DIVISOR_SEARCH: u64 = 1_000_000;
const MAX_CANDIDATE_PAIRS: usize = 4096;

#[derive(Clone, Debug)]
pub(super) enum Root {
    Rational(Coefficient),
    Quadratic {
        center: Coefficient,
        radius_squared: Coefficient,
        negative: bool,
        nonreal: bool,
    },
}

fn radical(value: &Coefficient) -> Option<Coefficient> {
    if value.is_negative() {
        return None;
    }
    let n = value.numer().sqrt();
    let d = value.denom().sqrt();
    (&n * &n == *value.numer() && &d * &d == *value.denom()).then(|| Coefficient::new(n, d))
}

impl Root {
    pub(super) fn text(&self) -> String {
        match self {
            Self::Rational(value) => value.to_string(),
            Self::Quadratic {
                center,
                radius_squared,
                negative,
                nonreal,
            } => {
                let distance = match radical(radius_squared) {
                    Some(distance) if distance.is_one() && *nonreal => String::from("i"),
                    Some(distance) if *nonreal => format!("{distance}*i"),
                    Some(distance) => distance.to_string(),
                    None if *nonreal => format!("sqrt({radius_squared})*i"),
                    None => format!("sqrt({radius_squared})"),
                };
                let sign = if *negative { "-" } else { "+" };
                if center.is_zero() {
                    if *negative {
                        format!("-{distance}")
                    } else {
                        distance
                    }
                } else {
                    format!("{center}{sign}{distance}")
                }
            }
        }
    }

    pub(super) fn cmp_real_rational(&self, rational: &Coefficient) -> Ordering {
        match self {
            Self::Rational(value) => value.cmp(rational),
            Self::Quadratic {
                center,
                radius_squared,
                negative,
                nonreal: false,
            } => {
                let difference = rational - center;
                if *negative {
                    if difference.is_negative() {
                        radius_squared.cmp(&(&difference * &difference)).reverse()
                    } else {
                        Ordering::Less
                    }
                } else if difference.is_positive() {
                    radius_squared.cmp(&(&difference * &difference))
                } else {
                    Ordering::Greater
                }
            }
            Self::Quadratic { nonreal: true, .. } => Ordering::Greater,
        }
    }

    // All non-rational roots in a solve or admitted sign chart come from one quadratic.
    pub(super) fn cmp_from_one_quadratic(&self, right: &Self) -> Ordering {
        match (self, right) {
            (_, Self::Rational(value)) => self.cmp_real_rational(value),
            (Self::Rational(value), _) => right.cmp_real_rational(value).reverse(),
            (Self::Quadratic { negative: a, .. }, Self::Quadratic { negative: b, .. }) => b.cmp(a),
        }
    }

    pub(super) fn is_zero_of(&self, polynomial: &Poly, variable: usize) -> Result<bool, MathError> {
        if let Self::Rational(value) = self {
            return Ok(evaluate(polynomial, variable, value)?.is_zero());
        }
        let Self::Quadratic {
            center,
            radius_squared,
            nonreal,
            ..
        } = self
        else {
            return Err(MathError::Unsupported);
        };
        // A non-rational quadratic root is zero for a rational polynomial exactly when its
        // monic minimal polynomial divides that polynomial.
        let direction = if *nonreal {
            coefficient(1)
        } else {
            coefficient(-1)
        };
        let constant = checked_coefficient(center * center + direction * radius_squared)?;
        let linear =
            Poly::variable(variable).scale(&checked_coefficient(-center * coefficient(2))?)?;
        let divisor = Poly::variable(variable)
            .pow(2)?
            .add(&linear)?
            .add(&Poly::value(constant))?;
        Ok(polynomial.clone().long_division(&divisor)?.1.is_zero())
    }
}

pub(super) fn evaluate(
    poly: &Poly,
    variable: usize,
    value: &Coefficient,
) -> Result<Coefficient, MathError> {
    let degree = poly.degree() as u8;
    let mut result = poly.coefficient_for(variable, degree);
    for degree in (0..degree).rev() {
        result = checked_coefficient(result * value + poly.coefficient_for(variable, degree))?;
    }
    Ok(result)
}

fn quadratic_parts(poly: &Poly, variable: usize) -> Result<(Coefficient, Coefficient), MathError> {
    let a = poly.coefficient_for(variable, 2);
    let b = poly.coefficient_for(variable, 1);
    let c = poly.coefficient_for(variable, 0);
    let twice_a = &a * coefficient(2);
    let center = checked_coefficient(-&b / &twice_a)?;
    let discriminant = &b * &b - coefficient(4) * &a * &c;
    let radius_squared = checked_coefficient(discriminant / (&twice_a * &twice_a))?;
    Ok((center, radius_squared))
}

fn divisors(value: u64) -> Vec<u64> {
    let mut result = Vec::new();
    let mut divisor = 1;
    while divisor <= value / divisor {
        if value.is_multiple_of(divisor) {
            result.push(divisor);
            let pair = value / divisor;
            if pair != divisor {
                result.push(pair);
            }
        }
        divisor += 1;
    }
    result
}

fn primitive_endpoints(poly: &Poly, variable: usize) -> Result<(u64, u64), MathError> {
    let degree = poly.degree() as u8;
    let coefficients: Vec<_> = (0..=degree)
        .map(|power| poly.coefficient_for(variable, power))
        .collect();
    let mut common_denominator = BigInt::one();
    for c in &coefficients {
        common_denominator = common_denominator.lcm(c.denom());
        if common_denominator.bits() > 4096 {
            return Err(MathError::Limit);
        }
    }
    let integers: Vec<_> = coefficients
        .iter()
        .map(|entry| entry.numer() * (&common_denominator / entry.denom()))
        .collect();
    let content = integers
        .iter()
        .fold(BigInt::zero(), |gcd, coefficient| gcd.gcd(coefficient));
    let endpoint = |entry: &BigInt| {
        (entry.abs() / &content)
            .to_u64()
            .filter(|value| (1..=MAX_DIVISOR_SEARCH).contains(value))
            .ok_or(MathError::Limit)
    };
    Ok((
        endpoint(&integers[0])?,
        endpoint(&integers[usize::from(degree)])?,
    ))
}

fn rational_root(poly: &Poly, variable: usize) -> Result<Option<Coefficient>, MathError> {
    if poly.coefficient_for(variable, 0).is_zero() {
        return Ok(Some(coefficient(0)));
    }
    match poly.degree() {
        0 => return Ok(None),
        1 => {
            return Ok(Some(checked_coefficient(
                -poly.coefficient_for(variable, 0) / poly.coefficient_for(variable, 1),
            )?));
        }
        2 => {
            let (center, radius_squared) = quadratic_parts(poly, variable)?;
            return radical(&radius_squared)
                .map(|radius| checked_coefficient(center - radius))
                .transpose();
        }
        _ => {}
    }
    let (constant, leading) = primitive_endpoints(poly, variable)?;
    let numerators = divisors(constant);
    let denominators = divisors(leading);
    if numerators.len() * denominators.len() > MAX_CANDIDATE_PAIRS {
        return Err(MathError::Limit);
    }
    let mut checked = BTreeSet::new();
    for numerator in numerators {
        for denominator in &denominators {
            let value = Coefficient::new(numerator.into(), (*denominator).into());
            if !checked.insert(value.clone()) {
                continue;
            }
            if evaluate(poly, variable, &value)?.is_zero() {
                return Ok(Some(value));
            }
            if evaluate(poly, variable, &-value.clone())?.is_zero() {
                return Ok(Some(-value));
            }
        }
    }
    Ok(None)
}

pub(super) type Factors = Vec<(Coefficient, u16)>;

pub(super) fn rational_factors(
    mut poly: Poly,
    variable: usize,
) -> Result<(Factors, Poly), MathError> {
    let mut factors = Vec::new();
    while poly.degree() != 0 {
        let Some(root) = rational_root(&poly, variable)? else {
            break;
        };
        let factor = Poly::variable(variable).sub(&Poly::value(root.clone()))?;
        let mut multiplicity = 0;
        while poly.degree() != 0 {
            let (quotient, remainder) = poly.clone().long_division(&factor)?;
            if !remainder.is_zero() {
                break;
            }
            multiplicity += 1;
            poly = quotient;
        }
        if multiplicity == 0 {
            return Err(MathError::NoConvergence);
        }
        factors.push((root, multiplicity));
    }
    factors.sort_by(|(a, _), (b, _)| a.cmp(b));
    Ok((factors, poly))
}

pub(super) fn solve_roots(
    poly: Poly,
    variable: usize,
    complex: bool,
) -> Result<Vec<(Root, u16)>, MathError> {
    let (rational, remaining) = rational_factors(poly, variable)?;
    let mut roots: Vec<_> = rational
        .into_iter()
        .map(|(value, m)| (Root::Rational(value), m))
        .collect();
    match remaining.degree() {
        0 => {}
        2 => {
            let (center, delta) = quadratic_parts(&remaining, variable)?;
            let nonreal = delta.is_negative();
            if complex || !nonreal {
                for negative in [true, false] {
                    roots.push((
                        Root::Quadratic {
                            center: center.clone(),
                            radius_squared: delta.abs(),
                            negative,
                            nonreal,
                        },
                        1,
                    ));
                }
            }
        }
        _ => return Err(MathError::Unsupported),
    }
    roots.sort_by(|(left, _), (right, _)| left.cmp_from_one_quadratic(right));
    Ok(roots)
}

fn factor_text(factors: Factors, residual: Poly, variable: usize) -> Result<String, MathError> {
    let mut parts = Vec::new();
    let leading = residual.leading().ok_or(MathError::Domain)?.1.clone();
    if !leading.is_one() {
        parts.push(leading.to_string());
    }
    for (root, power) in factors.into_iter().rev() {
        let factor = if root.is_zero() {
            NAMES[variable].to_owned()
        } else {
            let polynomial = Poly::variable(variable).sub(&Poly::value(root))?;
            format!("({})", polynomial.text())
        };
        parts.push(if power == 1 {
            factor
        } else {
            format!("{factor}^{power}")
        });
    }
    if residual.degree() > 0 {
        let residual = residual.monic()?.text();
        if parts.is_empty() {
            return Ok(residual);
        }
        parts.push(format!("({residual})"));
    }
    Ok(if parts.is_empty() {
        "1".to_owned()
    } else {
        parts.join("*")
    })
}

fn square_monomial(powers: Powers, value: &Coefficient) -> Option<Poly> {
    if powers.0.into_iter().any(|power| !power.is_multiple_of(2)) {
        return None;
    }
    let mut powers = powers;
    for exponent in &mut powers.0 {
        *exponent /= 2;
    }
    Some(Poly::monomial(powers, radical(&value.abs())?))
}

fn multivariate_factors(poly: Poly) -> Result<String, MathError> {
    let common = poly.common_monomial();
    let inner = poly.divide_by_monomial(common);
    let mut parts = Vec::new();
    if common.0.iter().any(|power| *power != 0) {
        parts.push(Poly::monomial(common, coefficient(1)).text());
    }
    if inner.0.len() == 2 {
        let mut iter = inner.0.iter().rev();
        let (left, a) = iter.next().expect("the polynomial has two terms");
        let (right, b) = iter.next().expect("the polynomial has two terms");
        if a.is_positive() != b.is_positive()
            && let (Some(left), Some(right)) =
                (square_monomial(*left, a), square_monomial(*right, b))
        {
            let (positive, negative) = if a.is_positive() {
                (left, right)
            } else {
                (right, left)
            };
            parts.push(format!("({})", positive.clone().sub(&negative)?.text()));
            parts.push(format!("({})", positive.add(&negative)?.text()));
            return Ok(parts.join("*"));
        }
    }
    if parts.is_empty() {
        Ok(inner.text())
    } else {
        parts.push(format!("({})", inner.text()));
        Ok(parts.join("*"))
    }
}

pub(super) fn factor(poly: Poly) -> Result<(String, bool), MathError> {
    if poly.degree() == 0 {
        return Ok((poly.text(), false));
    }
    let mask = poly.variables();
    if mask.count_ones() > 1 {
        return Ok((multivariate_factors(poly)?, true));
    }
    let variable = mask.trailing_zeros() as usize;
    let (factors, residual) = rational_factors(poly, variable)?;
    let partial = residual.degree() >= 3;
    Ok((factor_text(factors, residual, variable)?, partial))
}

pub(super) fn univariate_variable(mask: u8) -> Result<usize, MathError> {
    if mask == 0 {
        Ok(0)
    } else if mask.count_ones() == 1 && mask < (1 << NAMES.len()) {
        Ok(mask.trailing_zeros() as usize)
    } else {
        Err(MathError::Unsupported)
    }
}
