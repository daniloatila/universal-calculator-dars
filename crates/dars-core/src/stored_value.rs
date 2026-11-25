use std::{collections::BTreeMap, fmt};

use num_bigint::BigInt;
use num_integer::Integer;
use num_traits::{One, Signed};
use serde::{
    Deserialize, Deserializer,
    de::{MapAccess, Visitor},
};

use crate::{
    Error,
    arithmetic::{MAX_BITS, Rational, Value},
};

const MAX_BINDINGS: usize = 256;
const MAX_INTEGER_DIGITS: usize = 2467;
const MAX_VALUE_BYTES: usize = 10_000;
const MAX_BINDINGS_BYTES: usize = MAX_BINDINGS * (MAX_VALUE_BYTES + 20) + 2;

/// A canonical, nonzero decimal ID used in both the parser and the binding map.
pub(crate) fn reference_id(input: &str) -> Option<u32> {
    if input.is_empty()
        || input.len() > 10
        || input.starts_with('0')
        || !input.bytes().all(|byte| byte.is_ascii_digit())
    {
        return None;
    }
    input.parse().ok()
}

struct Binding<'a> {
    encoded: &'a str,
    decoded: Option<Value>,
}

#[derive(Default)]
pub(crate) struct Bindings<'a>(BTreeMap<u32, Binding<'a>>);

impl<'a> Bindings<'a> {
    pub(crate) fn decode(input: &'a str) -> Result<Self, Error> {
        if input.len() > MAX_BINDINGS_BYTES {
            return Err(Error::InputLimit);
        }
        serde_json::from_str(input).map_err(|_| Error::InvalidBindings)
    }

    pub(crate) fn resolve(&mut self, id: u32) -> Result<Value, Error> {
        let binding = self.0.get_mut(&id).ok_or(Error::MissingBinding)?;
        if let Some(value) = &binding.decoded {
            return Ok(value.clone());
        }
        // Parse and normalize each used value at most once per request.
        let value = decode(binding.encoded)?;
        binding.decoded = Some(value.clone());
        Ok(value)
    }

    pub(crate) fn used_values(&self) -> impl Iterator<Item = (u32, &'a str)> + '_ {
        self.0
            .iter()
            .filter(|(_, binding)| binding.decoded.is_some())
            .map(|(&id, binding)| (id, binding.encoded))
    }
}

impl<'de> Deserialize<'de> for Bindings<'de> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct BindingVisitor;

        impl<'de> Visitor<'de> for BindingVisitor {
            type Value = Bindings<'de>;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a bounded table of canonical decimal IDs and opaque values")
            }

            fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
                let mut bindings = BTreeMap::new();
                while let Some((key, encoded)) = map.next_entry::<&str, &str>()? {
                    let id = reference_id(key)
                        .ok_or_else(|| serde::de::Error::custom("invalid binding ID"))?;
                    if bindings.len() == MAX_BINDINGS
                        || bindings
                            .insert(
                                id,
                                Binding {
                                    encoded,
                                    decoded: None,
                                },
                            )
                            .is_some()
                    {
                        return Err(serde::de::Error::custom("too many or duplicate bindings"));
                    }
                }
                Ok(Bindings(bindings))
            }
        }

        // Values emitted by encode use safe ASCII, allowing borrowed strings.
        deserializer.deserialize_map(BindingVisitor)
    }
}

pub(crate) fn encode(value: &Value) -> String {
    match value {
        Value::Exact(value) => format!("q:{}/{}", value.numer(), value.denom()),
        Value::Interval { lower, upper } => format!(
            "i:{}/{}:{}/{}",
            lower.numer(),
            lower.denom(),
            upper.numer(),
            upper.denom()
        ),
    }
}

pub(crate) fn decode(input: &str) -> Result<Value, Error> {
    if input.len() > MAX_VALUE_BYTES {
        return Err(Error::InputLimit);
    }
    match input.split_once(':') {
        Some(("q", fraction)) => fraction_value(fraction).map(Value::Exact),
        Some(("i", endpoints)) => {
            let (lower, upper) = endpoints.split_once(':').ok_or(Error::InvalidValue)?;
            let lower = fraction_value(lower)?;
            let upper = fraction_value(upper)?;
            if lower >= upper {
                return Err(Error::InvalidValue);
            }
            // Preserve the endpoints supplied by a previous numerical operation.
            // Rounding them again would lose information on every recall.
            Ok(Value::Interval { lower, upper })
        }
        _ => Err(Error::InvalidValue),
    }
}

fn fraction_value(input: &str) -> Result<Rational, Error> {
    let (numerator, denominator) = input.split_once('/').ok_or(Error::InvalidValue)?;
    let numerator = integer_value(numerator)?;
    let denominator = integer_value(denominator)?;
    if !denominator.is_positive() || !numerator.gcd(&denominator).is_one() {
        return Err(Error::InvalidValue);
    }
    Ok(Rational::new_raw(numerator, denominator))
}

fn integer_value(input: &str) -> Result<BigInt, Error> {
    let digits = input.strip_prefix('-').unwrap_or(input);
    if digits.is_empty()
        || digits.len() > MAX_INTEGER_DIGITS
        || (digits.starts_with('0') && input != "0")
        || !digits.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(Error::InvalidValue);
    }
    let value = BigInt::parse_bytes(input.as_bytes(), 10).ok_or(Error::InvalidValue)?;
    if value.bits() > MAX_BITS {
        return Err(Error::InvalidValue);
    }
    Ok(value)
}
