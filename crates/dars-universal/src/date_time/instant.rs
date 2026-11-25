use super::{Checked, civil};
use crate::MathError;
use jiff::{
    civil::{Date, DateTime, Time},
    tz::{AmbiguousOffset, Offset, TimeZone},
};

const NANOS_PER_SECOND: i128 = 1_000_000_000;
const SECONDS_PER_DAY: i128 = 86_400;
const EPOCH: Date = jiff::civil::date(1970, 1, 1);

fn local_datetime(input: &str, require_seconds: bool) -> Checked<DateTime> {
    if !input.is_ascii() || input.len() < 16 || input.len() > 29 || input.as_bytes()[10] != b'T' {
        return Err(MathError::InvalidInput);
    }
    let date = civil::parse(&input[..10])?;
    let (clock, fraction) = match input[11..].split_once('.') {
        Some((clock, fraction)) => (clock, Some(fraction)),
        None => (&input[11..], None),
    };
    let seconds_present = clock.len() == 8 && clock.as_bytes()[5] == b':';
    if !(seconds_present || (!require_seconds && clock.len() == 5 && fraction.is_none()))
        || clock.as_bytes()[2] != b':'
    {
        return Err(MathError::InvalidInput);
    }
    let hour = civil::digits(&clock[..2])? as i8;
    let minute = civil::digits(&clock[3..5])? as i8;
    let second = if seconds_present {
        civil::digits(&clock[6..8])? as i8
    } else {
        0
    };
    if second >= 60 {
        return Err(MathError::InvalidInput);
    }
    let nanos = if let Some(fraction) = fraction {
        if fraction.len() > 9 {
            return Err(MathError::InvalidInput);
        }
        civil::digits(fraction)? * 10u32.pow((9 - fraction.len()) as u32)
    } else {
        0
    };
    let time =
        Time::new(hour, minute, second, nanos as i32).map_err(|_| MathError::InvalidInput)?;
    Ok(date.to_datetime(time))
}

fn format_datetime(value: DateTime) -> String {
    let mut output = format!(
        "{}T{:02}:{:02}:{:02}",
        value.date(),
        value.hour(),
        value.minute(),
        value.second()
    );
    let nanos = value.subsec_nanosecond();
    if nanos != 0 {
        let fraction = format!("{nanos:09}");
        output.push('.');
        output.push_str(fraction.trim_end_matches('0'));
    }
    output
}

fn numeric_offset(input: &str) -> Checked<i64> {
    let bytes = input.as_bytes();
    if bytes.len() != 6
        || !input.is_ascii()
        || !matches!(bytes[0], b'+' | b'-')
        || bytes[3] != b':'
        || input == "-00:00"
    {
        return Err(MathError::InvalidInput);
    }
    let hours = civil::digits(&input[1..3])?;
    let minutes = civil::digits(&input[4..6])?;
    if hours > 23 || minutes > 59 {
        return Err(MathError::InvalidInput);
    }
    let seconds = i64::from(hours * 3600 + minutes * 60);
    Ok(if bytes[0] == b'-' { -seconds } else { seconds })
}

pub(super) fn rfc3339_nanoseconds(value: &str) -> Checked<i128> {
    let (local, offset) = if let Some(local) = value.strip_suffix('Z') {
        (local, 0)
    } else {
        let split = value.len().checked_sub(6).ok_or(MathError::InvalidInput)?;
        let local = value.get(..split).ok_or(MathError::InvalidInput)?;
        let offset = value.get(split..).ok_or(MathError::InvalidInput)?;
        (local, numeric_offset(offset)?)
    };
    let local = local_datetime(local, true)?;
    let date_delta = i128::from(civil::distance(EPOCH, local.date()));
    let local_seconds = i128::from(local.hour()) * 3600
        + i128::from(local.minute()) * 60
        + i128::from(local.second());
    let utc_seconds = date_delta * SECONDS_PER_DAY + local_seconds - i128::from(offset);
    let first = i128::from(civil::distance(EPOCH, civil::MIN)) * SECONDS_PER_DAY;
    let exclusive_last = (i128::from(civil::distance(EPOCH, civil::MAX)) + 1) * SECONDS_PER_DAY;
    if !(first..exclusive_last).contains(&utc_seconds) {
        return Err(MathError::Domain);
    }
    Ok(utc_seconds * NANOS_PER_SECOND + i128::from(local.subsec_nanosecond()))
}

pub(super) fn seconds_decimal(nanoseconds: i128) -> String {
    let magnitude = nanoseconds.unsigned_abs();
    let unit = NANOS_PER_SECOND as u128;
    let sign = if nanoseconds < 0 { "-" } else { "" };
    format!("{sign}{}.{:09}", magnitude / unit, magnitude % unit)
}

fn find_zone(name: &str) -> Checked<TimeZone> {
    if name.len() > 64
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'+' | b'/'))
    {
        return Err(MathError::InvalidInput);
    }
    let (canonical, data) = jiff_tzdb::get(name).ok_or(MathError::InvalidInput)?;
    if name != canonical {
        return Err(MathError::InvalidInput);
    }
    TimeZone::tzif(canonical, data).map_err(|_| MathError::NoConvergence)
}

fn offset_text(offset: Offset) -> String {
    let total = offset.seconds().unsigned_abs();
    let sign = if offset.seconds() < 0 { "-" } else { "+" };
    let (hour, minute, second) = (total / 3600, (total % 3600) / 60, total % 60);
    if second == 0 {
        format!("{sign}{hour:02}:{minute:02}")
    } else {
        format!("{sign}{hour:02}:{minute:02}:{second:02}")
    }
}

#[derive(Clone, Copy)]
pub(super) enum Disambiguation {
    Reject,
    Earlier,
    Later,
}

impl Disambiguation {
    pub(super) fn read(value: &str) -> Checked<Self> {
        match value {
            "reject" => Ok(Self::Reject),
            "earlier" => Ok(Self::Earlier),
            "later" => Ok(Self::Later),
            _ => Err(MathError::InvalidInput),
        }
    }
}

pub(super) fn translate(
    input: &str,
    from: &str,
    to: &str,
    policy: Disambiguation,
) -> Checked<String> {
    let datetime = local_datetime(input, false)?;
    let from_zone = find_zone(from)?;
    let to_zone = find_zone(to)?;
    let ambiguous = from_zone.to_ambiguous_timestamp(datetime);
    let (timestamp, resolution) = match ambiguous.offset() {
        AmbiguousOffset::Unambiguous { .. } => (ambiguous.unambiguous(), "unambiguous"),
        AmbiguousOffset::Gap { .. } => return Err(MathError::NonexistentLocalTime),
        AmbiguousOffset::Fold { .. } => match policy {
            Disambiguation::Reject => return Err(MathError::AmbiguousLocalTime),
            Disambiguation::Earlier => (ambiguous.earlier(), "earlier"),
            Disambiguation::Later => (ambiguous.later(), "later"),
        },
    };
    let timestamp = timestamp.map_err(|_| MathError::Domain)?;
    let utc = TimeZone::UTC.to_datetime(timestamp);
    let target = to_zone.to_datetime(timestamp);
    if utc.year() < 1 || target.year() < 1 {
        return Err(MathError::Domain);
    }
    let from_info = from_zone.to_offset_info(timestamp);
    let to_info = to_zone.to_offset_info(timestamp);
    Ok(format!(
        "local={}; utc={}Z; from_offset={}; to_offset={}; from_dst={}; to_dst={}; resolution={resolution}",
        format_datetime(target),
        format_datetime(utc),
        offset_text(from_info.offset()),
        offset_text(to_info.offset()),
        from_info.dst().is_dst(),
        to_info.dst().is_dst(),
    ))
}
