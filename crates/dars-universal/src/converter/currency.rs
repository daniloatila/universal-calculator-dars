use super::scalar::{self, Checked, Rational, checked};
use crate::MathError;
use num_traits::{One, Signed};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

const CODES: &[&str] = &[
    "USD", "EUR", "BRL", "GBP", "JPY", "CHF", "CAD", "AUD", "CNY", "ARS", "MXN", "INR", "KRW",
    "NZD", "ZAR", "PLN",
];

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct Date(u16, u8, u8);

impl Date {
    fn parse(value: &str) -> Checked<Self> {
        let bytes = value.as_bytes();
        if bytes.len() != 10
            || bytes[4] != b'-'
            || bytes[7] != b'-'
            || bytes
                .iter()
                .enumerate()
                .any(|(i, byte)| !matches!(i, 4 | 7) && !byte.is_ascii_digit())
        {
            return Err(MathError::InvalidInput);
        }
        let year = value[..4]
            .parse::<u16>()
            .map_err(|_| MathError::InvalidInput)?;
        let month = value[5..7]
            .parse::<u8>()
            .map_err(|_| MathError::InvalidInput)?;
        let day = value[8..]
            .parse::<u8>()
            .map_err(|_| MathError::InvalidInput)?;
        let leap =
            year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
        let days_in_month = match month {
            1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
            4 | 6 | 9 | 11 => 30,
            2 => {
                if leap {
                    29
                } else {
                    28
                }
            }
            _ => return Err(MathError::InvalidInput),
        };
        if year == 0 || day == 0 || day > days_in_month {
            return Err(MathError::InvalidInput);
        }
        Ok(Self(year, month, day))
    }
}

fn required<'a>(options: &'a Map<String, Value>, field: &str) -> Checked<&'a str> {
    options
        .get(field)
        .and_then(Value::as_str)
        .ok_or(MathError::InvalidInput)
}

pub(super) struct Currency {
    pub(super) amount: Rational,
    pub(super) from: String,
    pub(super) to: String,
    pub(super) status: &'static str,
    pub(super) validity: &'static str,
    pub(super) variables: BTreeMap<String, String>,
}

pub(super) fn convert(value: Rational, options: &Map<String, Value>) -> Checked<Currency> {
    if options.keys().any(|key| {
        !matches!(
            key.as_str(),
            "from" | "to" | "rate" | "source" | "as_of" | "valid_until" | "reference_date"
        )
    }) {
        return Err(MathError::InvalidInput);
    }
    let from = required(options, "from")?;
    let to = required(options, "to")?;
    if !CODES.contains(&from) || !CODES.contains(&to) {
        return Err(MathError::InvalidInput);
    }
    let source = required(options, "source")?;
    if source.len() > 80 || source.trim().is_empty() || source.chars().any(char::is_control) {
        return Err(MathError::InvalidInput);
    }
    let source = source.trim();
    let rate = scalar::parse(required(options, "rate")?)?;
    if !rate.is_positive() || (from == to && !rate.is_one()) {
        return Err(MathError::Domain);
    }
    let as_of = required(options, "as_of")?;
    let reference_date = required(options, "reference_date")?;
    let until = options
        .get("valid_until")
        .map(|date| date.as_str().ok_or(MathError::InvalidInput))
        .transpose()?;
    let start = Date::parse(as_of)?;
    let reference = Date::parse(reference_date)?;
    let end = until.map(Date::parse).transpose()?;
    if end.is_some_and(|end| end < start) {
        return Err(MathError::Domain);
    }
    let (status, validity) = if reference < start {
        (
            "not_yet_valid",
            "Quote starts after the selected reference date",
        )
    } else {
        match end {
            Some(end) if reference > end => {
                ("expired", "Quote expired at the selected reference date")
            }
            Some(_) => (
                "within_validity",
                "Quote within stated validity at the selected reference date",
            ),
            None => (
                "unverified_validity",
                "Quote validity date was not supplied",
            ),
        }
    };
    let rate_text = rate.to_string();
    let rate_binding = if rate_text.len() > 256 {
        required(options, "rate")?.trim().to_owned()
    } else {
        rate_text
    };
    let amount_text = value.to_string();
    let amount_binding = if amount_text.len() > 256 {
        "Exact amount from input".to_owned()
    } else {
        amount_text
    };
    let mut variables = BTreeMap::from([
        ("amount".to_owned(), amount_binding),
        ("rate".to_owned(), rate_binding),
        ("source".to_owned(), source.to_owned()),
        ("as_of".to_owned(), as_of.to_owned()),
        ("reference_date".to_owned(), reference_date.to_owned()),
    ]);
    if let Some(until) = until {
        variables.insert("valid_until".to_owned(), until.to_owned());
    }
    Ok(Currency {
        amount: checked(value * rate)?,
        from: from.to_owned(),
        to: to.to_owned(),
        status,
        validity,
        variables,
    })
}
