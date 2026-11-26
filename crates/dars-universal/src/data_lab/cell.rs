use super::*;
use jiff::civil::{Date, DateTime, Time};
use num_traits::{Signed, ToPrimitive};
use std::{borrow::Cow, sync::Arc};

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub(super) enum SourceType {
    Text,
    Number,
    Boolean,
    Date,
    Error,
    Empty,
    Null,
    Absent,
}

#[derive(Clone, Copy, Debug)]
pub(super) enum Grammar {
    Text,
    Json,
    Xlsx,
    Canonical,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum DerivationOp {
    FillMissing,
    Calculate,
    Text,
    Join,
    Group,
}

#[derive(Clone, Copy, Debug, Serialize)]
struct Derivation {
    operation: DerivationOp,
    #[serde(skip_serializing_if = "Option::is_none")]
    from_missing: Option<Origin>,
}

#[derive(Clone, Copy, Debug, Serialize)]
pub(super) enum Epoch {
    #[serde(rename = "1900")]
    Excel1900,
    #[serde(rename = "1904")]
    Excel1904,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum DateRepresentation {
    Serial,
    Iso,
}

#[derive(Clone, Copy, Debug)]
pub(super) struct DateOrigin {
    pub(super) representation: DateRepresentation,
    pub(super) epoch: Epoch,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub(super) enum CacheStatus {
    Stored,
    Empty,
    Missing,
    Error,
}

#[derive(Clone, Copy, Debug)]
pub(super) enum ExcelType {
    Number,
    Shared,
    Inline,
    Text,
    Boolean,
    Date,
    Error,
}

impl ExcelType {
    pub(super) fn id(self) -> &'static str {
        match self {
            Self::Number => "n",
            Self::Shared => "s",
            Self::Inline => "inlineStr",
            Self::Text => "str",
            Self::Boolean => "b",
            Self::Date => "d",
            Self::Error => "e",
        }
    }
}

#[derive(Debug)]
pub(super) struct NumberFormat {
    pub(super) id: u32,
    pub(super) code: Option<String>,
    pub(super) temporal: bool,
    pub(super) has_time: bool,
}

#[derive(Clone, Debug)]
pub(super) struct WorkbookMeta {
    pub(super) cell_type: ExcelType,
    pub(super) style_index: Option<usize>,
    pub(super) format: Option<Arc<NumberFormat>>,
    pub(super) has_raw_value: bool,
    pub(super) differing_raw_value: Option<String>,
    pub(super) cache: Option<CacheStatus>,
    pub(super) date: Option<DateOrigin>,
}

#[derive(Clone, Debug)]
pub(super) struct Cell {
    pub(super) value: String,
    pub(super) origin: Origin,
    pub(super) formula: Option<String>,
    pub(super) source_type: SourceType,
    pub(super) grammar: Grammar,
    pub(super) workbook: Option<Box<WorkbookMeta>>,
    intrinsic: Origin,
    derivation: Option<Derivation>,
}

struct Temporal {
    iso: String,
    discarded_subnanosecond_precision: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
enum DateStatus {
    Valid,
    Invalid,
    #[serde(rename = "fictitious_1900_leap_day")]
    Fictitious1900LeapDay,
    Unavailable,
}

#[derive(Serialize)]
struct DateView {
    representation: DateRepresentation,
    epoch: Epoch,
    status: DateStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    iso: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    discarded_subnanosecond_precision: Option<bool>,
}

#[derive(Serialize)]
struct CacheView<'a> {
    status: CacheStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<&'a str>,
}

#[derive(Serialize)]
struct WorkbookView<'a> {
    cell_type: &'static str,
    style_index: Option<usize>,
    number_format_id: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    number_format_code: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    raw_value: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cache: Option<CacheView<'a>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    date: Option<DateView>,
}

#[derive(Serialize)]
pub(super) struct CellView<'a> {
    value: &'a str,
    origin: Origin,
    source_origin: Origin,
    source_type: SourceType,
    requested_type: Kind,
    notation: &'static str,
    canonical: Option<Cow<'a, str>>,
    validity: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    formula: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    derivation: Option<Derivation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    workbook: Option<WorkbookView<'a>>,
}

fn iso_date(text: &str) -> Option<String> {
    if text.len() < 10 || !text.as_bytes()[..4].iter().all(u8::is_ascii_digit) {
        return None;
    }
    if text.len() == 10 {
        let date = text.parse::<Date>().ok()?;
        return (date.to_string() == text).then(|| text.into());
    }
    if !matches!(text.as_bytes().get(10), Some(b'T' | b't')) {
        return None;
    }
    let time = text[11..].split(['+', '-', 'Z', 'z']).next()?;
    let (clock, fraction) = time.split_once(['.', ',']).unwrap_or((time, ""));
    if fraction.len() > 9 || clock.as_bytes().get(6..8) == Some(b"60") {
        return None;
    }
    if text.ends_with(['Z', 'z']) || text[11..].contains(['+', '-']) {
        text.parse::<jiff::Timestamp>()
            .ok()
            .map(|value| value.to_string())
    } else {
        text.parse::<DateTime>().ok().map(|value| value.to_string())
    }
}

fn serial_date(text: &str, epoch: Epoch, has_time: bool) -> Result<Temporal, DateStatus> {
    let fraction = exact_native_number(text).map_err(|_| DateStatus::Invalid)?;
    if fraction.is_negative() {
        return Err(DateStatus::Invalid);
    }
    let day = fraction.to_integer();
    let day_count = day.to_i64().ok_or(DateStatus::Invalid)?;
    let (base, days) = match epoch {
        Epoch::Excel1900 => {
            if day_count == 60 {
                return Err(DateStatus::Fictitious1900LeapDay);
            }
            (
                Date::constant(1899, 12, 31),
                day_count - i64::from(day_count > 60),
            )
        }
        Epoch::Excel1904 => (Date::constant(1904, 1, 1), day_count),
    };
    if days > 3_000_000 {
        return Err(DateStatus::Invalid);
    }
    let date = base
        .checked_add(jiff::Span::new().days(days))
        .map_err(|_| DateStatus::Invalid)?;
    let remaining = fraction - BigRational::from_integer(day);
    if remaining.is_zero() && !has_time {
        return Ok(Temporal {
            iso: date.to_string(),
            discarded_subnanosecond_precision: false,
        });
    }
    let nanos = remaining * num_bigint::BigInt::from(86_400_000_000_000i64);
    let discarded_subnanosecond_precision = !nanos.is_integer();
    let nanos = nanos.to_integer().to_u64().ok_or(DateStatus::Invalid)?;
    let hours = nanos / 3_600_000_000_000;
    let minutes = nanos / 60_000_000_000 % 60;
    let seconds = nanos / 1_000_000_000 % 60;
    let subsec = nanos % 1_000_000_000;
    let time = Time::new(hours as i8, minutes as i8, seconds as i8, subsec as i32)
        .map_err(|_| DateStatus::Invalid)?;
    Ok(Temporal {
        iso: format!("{date}T{time}"),
        discarded_subnanosecond_precision,
    })
}

fn exact_native_number(value: &str) -> Checked<BigRational> {
    // The structured formats use dot-decimal literals. The shared rational
    // parser also admits fractions and Unicode signs for user-entered text.
    if !value
        .bytes()
        .all(|b| b.is_ascii_digit() || matches!(b, b'.' | b'e' | b'E' | b'+' | b'-'))
    {
        return Err(MathError::InvalidInput);
    }
    number(value, Decimal::Point)
}

impl Cell {
    pub(super) fn absent() -> Self {
        Self {
            value: String::new(),
            origin: Origin::Absent,
            formula: None,
            source_type: SourceType::Absent,
            grammar: Grammar::Text,
            workbook: None,
            intrinsic: Origin::Absent,
            derivation: None,
        }
    }

    pub(super) fn native(
        value: &str,
        origin: Origin,
        source_type: SourceType,
        grammar: Grammar,
    ) -> Checked<Self> {
        let mut cell = Self::new(value, origin)?;
        cell.source_type = source_type;
        cell.grammar = grammar;
        Ok(cell)
    }

    pub(super) fn new(value: &str, origin: Origin) -> Checked<Self> {
        if value.len() > MAX_FIELD {
            return Err(MathError::Limit);
        }
        let source_type = match origin {
            Origin::Empty => SourceType::Empty,
            Origin::Null => SourceType::Null,
            Origin::Absent => SourceType::Absent,
            Origin::Error => SourceType::Error,
            Origin::IsoDate | Origin::DateSerial1900 | Origin::DateSerial1904 => SourceType::Date,
            _ => SourceType::Text,
        };
        Ok(Self {
            value: value.to_owned(),
            origin,
            formula: None,
            source_type,
            grammar: Grammar::Text,
            workbook: None,
            intrinsic: origin,
            derivation: None,
        })
    }

    pub(super) fn stored(value: &str) -> Checked<Self> {
        Self::new(
            value,
            if value.is_empty() {
                Origin::Empty
            } else {
                Origin::Stored
            },
        )
    }

    pub(super) fn missing(&self) -> bool {
        matches!(self.origin, Origin::Null | Origin::Absent | Origin::Empty)
    }

    pub(super) fn usable(&self) -> bool {
        matches!(
            self.origin,
            Origin::Stored
                | Origin::CachedFormula
                | Origin::IsoDate
                | Origin::DateSerial1900
                | Origin::DateSerial1904
        )
    }

    pub(super) fn numeric(&self, decimal: Decimal) -> Checked<BigRational> {
        if matches!(
            self.source_type,
            SourceType::Date | SourceType::Boolean | SourceType::Error
        ) {
            return Err(MathError::Domain);
        }
        match self.grammar {
            Grammar::Json | Grammar::Xlsx => exact_native_number(&self.value),
            Grammar::Canonical => {
                let value = self
                    .value
                    .parse::<BigRational>()
                    .map_err(|_| MathError::InvalidInput)?;
                if value.numer().bits().max(value.denom().bits()) > 4096 {
                    return Err(MathError::Limit);
                }
                Ok(value)
            }
            Grammar::Text => number(&self.value, decimal),
        }
    }

    fn temporal(&self) -> Result<Temporal, DateStatus> {
        if let Some(meta) = self.workbook.as_ref().and_then(|w| w.date) {
            if !matches!(
                self.intrinsic,
                Origin::Stored
                    | Origin::CachedFormula
                    | Origin::IsoDate
                    | Origin::DateSerial1900
                    | Origin::DateSerial1904
            ) {
                return Err(DateStatus::Unavailable);
            }
            match meta.representation {
                DateRepresentation::Serial => serial_date(
                    &self.value,
                    meta.epoch,
                    self.workbook
                        .as_ref()
                        .and_then(|w| w.format.as_ref())
                        .is_some_and(|f| f.has_time),
                ),
                DateRepresentation::Iso => iso_date(&self.value)
                    .map(|iso| Temporal {
                        iso,
                        discarded_subnanosecond_precision: false,
                    })
                    .ok_or(DateStatus::Invalid),
            }
        } else {
            iso_date(&self.value)
                .map(|iso| Temporal {
                    iso,
                    discarded_subnanosecond_precision: false,
                })
                .ok_or(DateStatus::Invalid)
        }
    }

    fn time_value(&self) -> Option<String> {
        if self.source_type == SourceType::Date {
            let date = self.temporal().ok()?;
            let (_, time) = date.iso.split_once('T')?;
            return time
                .strip_suffix('Z')
                .unwrap_or(time)
                .parse::<Time>()
                .ok()
                .map(|t| t.to_string());
        }
        self.value
            .contains(':')
            .then(|| self.value.parse::<Time>().ok())
            .flatten()
            .map(|time| time.to_string())
    }

    fn valid_for(&self, kind: Kind, decimal: Decimal) -> bool {
        match kind {
            Kind::Text => true,
            Kind::Integer => self.numeric(decimal).is_ok_and(|n| n.is_integer()),
            Kind::Decimal => self.numeric(decimal).is_ok(),
            Kind::Boolean => matches!(self.value.as_str(), "true" | "false"),
            Kind::Date => self.temporal().is_ok(),
            Kind::Time => self.time_value().is_some(),
        }
    }

    pub(super) fn interpret(&mut self, kind: Kind, decimal: Decimal) {
        self.origin = self.intrinsic;
        if self.usable() && !self.valid_for(kind, decimal) {
            self.origin = Origin::Invalid;
        }
    }

    pub(super) fn scalar(kind: Kind, value: &str, decimal: Decimal) -> Checked<Self> {
        let mut cell = Self::stored(value)?;
        cell.interpret(kind, decimal);
        if cell.origin == Origin::Invalid {
            return Err(MathError::Domain);
        }
        Ok(cell)
    }

    pub(super) fn derive(
        &mut self,
        operation: DerivationOp,
        from_missing: Option<Origin>,
        canonical: bool,
    ) {
        self.derivation = Some(Derivation {
            operation,
            from_missing,
        });
        if canonical {
            self.grammar = Grammar::Canonical;
            if self.usable() {
                self.source_type = SourceType::Number;
            }
        }
    }

    pub(super) fn canonical(&self, kind: Kind, decimal: Decimal) -> Checked<Option<Cow<'_, str>>> {
        if !self.usable() {
            return Ok(None);
        }
        Ok(match kind {
            Kind::Text | Kind::Boolean => Some(Cow::Borrowed(&self.value)),
            Kind::Integer | Kind::Decimal if matches!(self.grammar, Grammar::Canonical) => {
                Some(Cow::Borrowed(&self.value))
            }
            Kind::Integer | Kind::Decimal => Some(Cow::Owned(self.numeric(decimal)?.to_string())),
            Kind::Date => self.temporal().ok().map(|v| Cow::Owned(v.iso)),
            Kind::Time => self.time_value().map(Cow::Owned),
        })
    }

    pub(super) fn date_key(&self) -> Checked<(DateTime, u8)> {
        let date = self.temporal().map_err(|_| MathError::Domain)?;
        let key = if date.iso.len() == 10 {
            (
                date.iso
                    .parse::<Date>()
                    .map_err(|_| MathError::Domain)?
                    .at(0, 0, 0, 0),
                0,
            )
        } else if let Some(utc) = date.iso.strip_suffix('Z') {
            (utc.parse().map_err(|_| MathError::Domain)?, 2)
        } else {
            (date.iso.parse().map_err(|_| MathError::Domain)?, 1)
        };
        Ok(key)
    }

    pub(super) fn text_input(&self) -> Cow<'_, str> {
        if self.source_type == SourceType::Date {
            // A text transform preserves the date's semantic type across later casts.
            if let Ok(date) = self.temporal() {
                return Cow::Owned(date.iso);
            }
        }
        Cow::Borrowed(&self.value)
    }

    pub(super) fn validity(&self) -> &'static str {
        match self.origin {
            Origin::Invalid => "invalid",
            Origin::Empty => "empty",
            Origin::Null => "null",
            Origin::Absent => "absent",
            Origin::Formula => "uncached",
            Origin::Error => "error",
            _ => "valid",
        }
    }

    pub(super) fn notation(&self, decimal: Decimal) -> &'static str {
        match self.grammar {
            Grammar::Text if matches!(decimal, Decimal::Comma) => "text_comma",
            Grammar::Text => "text_point",
            Grammar::Json => "json",
            Grammar::Xlsx => "xlsx",
            Grammar::Canonical => "canonical",
        }
    }

    pub(super) fn metadata_storage_bytes(&self) -> usize {
        self.workbook.as_ref().map_or(0, |m| {
            128 + m
                .differing_raw_value
                .as_ref()
                .map_or(0, |v| budget::text(v.len()))
                + m.format.as_ref().map_or(0, |f| {
                    96 + f.code.as_ref().map_or(0, |code| budget::text(code.len()))
                })
        })
    }

    pub(super) fn view(&self, kind: Kind, decimal: Decimal) -> Checked<CellView<'_>> {
        let workbook = self.workbook.as_ref().map(|meta| {
            let raw = meta
                .has_raw_value
                .then(|| meta.differing_raw_value.as_deref().unwrap_or(&self.value));
            let date = meta.date.map(|date| {
                let (status, iso, discarded_subnanosecond_precision) = match self.temporal() {
                    Ok(value) => (
                        DateStatus::Valid,
                        Some(value.iso),
                        Some(value.discarded_subnanosecond_precision),
                    ),
                    Err(status) => (status, None, None),
                };
                DateView {
                    representation: date.representation,
                    epoch: date.epoch,
                    status,
                    iso,
                    discarded_subnanosecond_precision,
                }
            });
            WorkbookView {
                cell_type: meta.cell_type.id(),
                style_index: meta.style_index,
                number_format_id: meta.format.as_ref().map(|f| f.id),
                number_format_code: meta.format.as_ref().and_then(|f| f.code.as_deref()),
                raw_value: raw,
                cache: meta.cache.map(|status| CacheView { status, value: raw }),
                date,
            }
        });
        Ok(CellView {
            value: &self.value,
            origin: self.origin,
            source_origin: self.intrinsic,
            source_type: self.source_type,
            requested_type: kind,
            notation: self.notation(decimal),
            canonical: self.canonical(kind, decimal)?,
            validity: self.validity(),
            formula: self.formula.as_deref(),
            derivation: self.derivation,
            workbook,
        })
    }
}
