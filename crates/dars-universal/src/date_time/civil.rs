use super::Checked;
use crate::MathError;
use jiff::{Span, civil::Date};

pub(super) const MIN: Date = jiff::civil::date(1, 1, 1);
pub(super) const MAX: Date = jiff::civil::date(9999, 12, 31);

pub(super) fn digits(value: &str) -> Checked<u32> {
    if value.is_empty() || !value.bytes().all(|digit| digit.is_ascii_digit()) {
        return Err(MathError::InvalidInput);
    }
    value.parse().map_err(|_| MathError::InvalidInput)
}

pub(super) fn parse(value: &str) -> Checked<Date> {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(index, byte)| !matches!(index, 4 | 7) && !byte.is_ascii_digit())
    {
        return Err(MathError::InvalidInput);
    }
    let year = digits(&value[..4])? as i16;
    let month = digits(&value[5..7])? as i8;
    let day = digits(&value[8..])? as i8;
    if year == 0 {
        return Err(MathError::InvalidInput);
    }
    Date::new(year, month, day).map_err(|_| MathError::InvalidInput)
}

pub(super) fn distance(start: Date, end: Date) -> i64 {
    end.duration_since(start).as_secs() / 86_400
}

pub(super) fn add_days(date: Date, days: i64) -> Checked<Date> {
    let span = Span::new().try_days(days).map_err(|_| MathError::Domain)?;
    let result = date.checked_add(span).map_err(|_| MathError::Domain)?;
    if result < MIN {
        return Err(MathError::Domain);
    }
    Ok(result)
}

pub(super) fn add_months(date: Date, months: i64, clamp: bool) -> Checked<Date> {
    let zero_indexed = (i64::from(date.year()) - 1) * 12 + i64::from(date.month()) - 1 + months;
    if !(0..9999 * 12).contains(&zero_indexed) {
        return Err(MathError::Domain);
    }
    let year = (zero_indexed / 12 + 1) as i16;
    let month = (zero_indexed % 12 + 1) as i8;
    let first = Date::new(year, month, 1).map_err(|_| MathError::Domain)?;
    let last_day = first.days_in_month();
    if !clamp && date.day() > last_day {
        return Err(MathError::Domain);
    }
    Date::new(year, month, date.day().min(last_day)).map_err(|_| MathError::Domain)
}

pub(super) fn age(birth: Date, reference: Date) -> Checked<(i64, i64, i64)> {
    if birth > reference {
        return Err(MathError::Domain);
    }
    let mut months = (i64::from(reference.year()) - i64::from(birth.year())) * 12
        + i64::from(reference.month())
        - i64::from(birth.month());
    let mut anchor = add_months(birth, months, true)?;
    if anchor > reference {
        months -= 1;
        anchor = add_months(birth, months, true)?;
    }
    Ok((months / 12, months % 12, distance(anchor, reference)))
}
