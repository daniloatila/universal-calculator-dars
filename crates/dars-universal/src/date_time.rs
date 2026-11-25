mod business;
mod civil;
mod instant;

use crate::{Computation, Exactness, MathError};
use jiff::civil::Date;
use serde_json::{Map, Value};
use std::collections::BTreeMap;

type Checked<T> = Result<T, MathError>;

const GREGORIAN_VERSION: &str = "proleptic-gregorian-v1";
const MAX_COMPONENT: i64 = 4_000_000;
const BUSINESS_WEEKDAYS: &str = "1,2,3,4,5";

struct Answer {
    result: String,
    method: &'static str,
    formula: &'static str,
    domain: &'static str,
    variables: BTreeMap<String, String>,
    units: BTreeMap<String, String>,
    constraints: Vec<String>,
}

impl Answer {
    fn new(
        result: String,
        method: &'static str,
        formula: &'static str,
        domain: &'static str,
    ) -> Self {
        Self {
            result,
            method,
            formula,
            domain,
            variables: BTreeMap::new(),
            units: BTreeMap::new(),
            constraints: Vec::new(),
        }
    }

    fn gregorian(result: String, method: &'static str, formula: &'static str) -> Self {
        let mut answer = Self::new(result, method, formula, "civil_date");
        answer.variable("calendar_version", GREGORIAN_VERSION);
        answer
            .constraints
            .push("Proleptic Gregorian calendar".to_owned());
        answer
    }

    fn variable(&mut self, key: &str, value: impl std::fmt::Display) {
        self.variables.insert(key.to_owned(), value.to_string());
    }

    fn unit(&mut self, key: &str, value: &str) {
        self.units.insert(key.to_owned(), value.to_owned());
    }

    fn business_calendar(&mut self, calendar: &business::Calendar) {
        self.variable("calendar_version", business::CALENDAR_VERSION);
        self.variable("weekdays", calendar.weekday_text());
        let holidays = calendar.holiday_text();
        if !holidays.is_empty() {
            self.variable("holidays", holidays);
        }
        self.constraints
            .push("Business calendar uses only the supplied weekday and holiday rules".to_owned());
    }

    fn finish(self, input: &str) -> Computation {
        Computation {
            result: self.result,
            exactness: Exactness::Exact,
            normalized: input.trim().to_owned(),
            method: self.method,
            domain: self.domain,
            formula: Some(self.formula),
            precision: None,
            tolerance: None,
            error_bound: None,
            constraints: self.constraints,
            variables: self.variables,
            units: self.units,
        }
    }
}

struct Options<'a>(&'a Map<String, Value>);

impl<'a> Options<'a> {
    fn read(operation: &str, value: &'a Value) -> Checked<Self> {
        let accepted: &[&str] = match operation {
            "difference" | "age" | "calendar" | "duration" => &[],
            "period" => &["years", "months", "weeks", "days", "overflow"],
            "business_days" => &["weekdays", "holidays"],
            "deadline" => &["count", "basis", "weekdays", "holidays"],
            "timezone" => &["from", "to", "disambiguation"],
            _ => return Err(MathError::Unsupported),
        };
        let map = value.as_object().ok_or(MathError::InvalidInput)?;
        if map.keys().any(|key| !accepted.contains(&key.as_str())) {
            return Err(MathError::InvalidInput);
        }
        Ok(Self(map))
    }

    fn text(&self, key: &str, default: Option<&'a str>) -> Checked<&'a str> {
        match self.0.get(key) {
            Some(value) => value.as_str().ok_or(MathError::InvalidInput),
            None => default.ok_or(MathError::InvalidInput),
        }
    }

    fn integer(&self, key: &str, default: Option<&'a str>) -> Checked<i64> {
        let value = self.text(key, default)?;
        let (negative, digits) = match value.strip_prefix(['-', '−']) {
            Some(digits) => (true, digits),
            None => (false, value.strip_prefix('+').unwrap_or(value)),
        };
        if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err(MathError::InvalidInput);
        }
        let magnitude = digits.parse::<i64>().map_err(|_| MathError::Limit)?;
        if magnitude > MAX_COMPONENT {
            return Err(MathError::Limit);
        }
        Ok(if negative { -magnitude } else { magnitude })
    }

    fn calendar(&self) -> Checked<business::Calendar> {
        business::Calendar::read(
            self.text("weekdays", Some(BUSINESS_WEEKDAYS))?,
            self.text("holidays", Some(""))?,
        )
    }
}

fn pair(input: &str) -> Checked<(&str, &str)> {
    let (first, second) = input.split_once('|').ok_or(MathError::InvalidInput)?;
    Ok((first.trim(), second.trim()))
}

fn date_pair(input: &str) -> Checked<(Date, Date)> {
    let (start, end) = pair(input)?;
    Ok((civil::parse(start)?, civil::parse(end)?))
}

fn difference(input: &str) -> Checked<Answer> {
    let (start, end) = date_pair(input)?;
    let days = civil::distance(start, end);
    let mut answer = Answer::gregorian(
        format!(
            "days={days}; weeks={}; remaining_days={}",
            days / 7,
            days % 7
        ),
        "gregorian_civil_day_difference",
        "days = civil_day(end) - civil_day(start)",
    );
    answer.variable("start", start);
    answer.variable("end", end);
    answer.unit("days", "day");
    answer.unit("weeks", "week");
    answer.unit("remaining_days", "day");
    answer
        .constraints
        .push("Weeks truncate toward zero with a signed remainder".to_owned());
    Ok(answer)
}

fn age(input: &str) -> Checked<Answer> {
    let (birth, reference) = date_pair(input)?;
    let (years, months, days) = civil::age(birth, reference)?;
    let total_days = civil::distance(birth, reference);
    let mut answer = Answer::gregorian(
        format!("years={years}; months={months}; days={days}; total_days={total_days}"),
        "clamped_gregorian_age",
        "age = completed calendar months plus remaining days",
    );
    answer.variable("birth", birth);
    answer.variable("reference", reference);
    answer.unit("years", "year");
    answer.unit("months", "month");
    answer.unit("days", "day");
    answer.unit("total_days", "day");
    answer
        .constraints
        .push("Age uses completed clamped months before residual days".to_owned());
    Ok(answer)
}

fn period(input: &str, options: &Options<'_>) -> Checked<Answer> {
    let start = civil::parse(input)?;
    let years = options.integer("years", Some("0"))?;
    let months = options.integer("months", Some("0"))?;
    let weeks = options.integer("weeks", Some("0"))?;
    let days = options.integer("days", Some("0"))?;
    let overflow = options.text("overflow", Some("clamp"))?;
    let clamp = match overflow {
        "clamp" => true,
        "reject" => false,
        _ => return Err(MathError::InvalidInput),
    };
    let midpoint = civil::add_months(start, years * 12 + months, clamp)?;
    let date = civil::add_days(midpoint, weeks * 7 + days)?;
    let mut answer = Answer::gregorian(
        format!("date={date}"),
        "gregorian_period_arithmetic",
        "date = add_days(add_months(start,12*years+months),7*weeks+days)",
    );
    for (key, value) in [
        ("years", years),
        ("months", months),
        ("weeks", weeks),
        ("days", days),
    ] {
        answer.variable(key, value);
    }
    answer.variable("start", start);
    answer.variable("overflow", overflow);
    answer
        .constraints
        .push(format!("End-of-month policy: {overflow}"));
    Ok(answer)
}

fn calendar(input: &str) -> Checked<Answer> {
    let date = civil::parse(input)?;
    let iso_date = date.iso_week_date();
    let mut answer = Answer::gregorian(
        format!(
            "weekday={}; day_of_year={}; iso_year={:04}; iso_week={}; leap_year={}; days_in_month={}",
            date.weekday().to_monday_one_offset(),
            date.day_of_year(),
            iso_date.year(),
            iso_date.week(),
            date.days_in_year() == 366,
            date.days_in_month(),
        ),
        "iso_week_calendar",
        "ISO week 1 contains January 4 and starts Monday",
    );
    answer.variable("date", date);
    answer.unit("days_in_month", "day");
    Ok(answer)
}

fn business_days(input: &str, options: &Options<'_>) -> Checked<Answer> {
    let (start, end) = date_pair(input)?;
    let calendar = options.calendar()?;
    let count = calendar.difference(start, end)?;
    let mut answer = Answer::gregorian(
        format!("business_days={count}"),
        "custom_business_day_count",
        "signed count of eligible dates in (earlier,later]",
    );
    answer.variable("start", start);
    answer.variable("end", end);
    answer.unit("business_days", "business_day");
    answer.business_calendar(&calendar);
    answer.constraints.push(
        "Business-day interval excludes the earlier day and includes the later day".to_owned(),
    );
    Ok(answer)
}

fn deadline(input: &str, options: &Options<'_>) -> Checked<Answer> {
    let start = civil::parse(input)?;
    let count = options.integer("count", None)?;
    let basis = options.text("basis", Some("business"))?;
    let mut answer = match basis {
        "business" => {
            let calendar = options.calendar()?;
            let date = calendar.deadline(start, count)?;
            let mut result = Answer::gregorian(
                format!("date={date}"),
                "custom_business_deadline",
                "first date reached after abs(count) eligible days in the specified direction",
            );
            result.business_calendar(&calendar);
            result
        }
        "civil" => {
            if options.0.contains_key("weekdays") || options.0.contains_key("holidays") {
                return Err(MathError::InvalidInput);
            }
            let date = civil::add_days(start, count)?;
            Answer::gregorian(
                format!("date={date}"),
                "gregorian_civil_deadline",
                "date = add_days(start,count)",
            )
        }
        _ => return Err(MathError::InvalidInput),
    };
    answer.variable("start", start);
    answer.variable("count", count);
    answer.variable("basis", basis);
    answer
        .constraints
        .push("Deadline excludes the starting day when count is nonzero".to_owned());
    Ok(answer)
}

fn timezone(input: &str, options: &Options<'_>) -> Checked<Answer> {
    let from = options.text("from", None)?;
    let to = options.text("to", None)?;
    let disambiguation = options.text("disambiguation", Some("reject"))?;
    let policy = instant::Disambiguation::read(disambiguation)?;
    let result = instant::translate(input, from, to, policy)?;
    let mut answer = Answer::new(
        result,
        "iana_bundled_timezone_conversion",
        "local_to = zone_to(instant_from(local_from))",
        "zoned_datetime",
    );
    answer.variable("local", input);
    answer.variable("from", from);
    answer.variable("to", to);
    answer.variable("disambiguation", disambiguation);
    answer.variable("tzdb_version", jiff_tzdb::VERSION);
    answer.variable("tzdb_format", "rearguard");
    answer
        .constraints
        .push(format!("Bundled IANA tzdb: {}", jiff_tzdb::VERSION));
    answer
        .constraints
        .push("Nonexistent local times are rejected".to_owned());
    answer
        .constraints
        .push("IANA rearguard daylight-saving flags".to_owned());
    Ok(answer)
}

fn duration(input: &str) -> Checked<Answer> {
    let (start, end) = pair(input)?;
    let nanos = instant::rfc3339_nanoseconds(end)? - instant::rfc3339_nanoseconds(start)?;
    let mut answer = Answer::new(
        format!("seconds={}", instant::seconds_decimal(nanos)),
        "rfc3339_nanosecond_duration",
        "seconds = (utc_nanoseconds(end)-utc_nanoseconds(start))/1000000000",
        "absolute_time",
    );
    answer.variable("start", start);
    answer.variable("end", end);
    answer.unit("seconds", "s");
    answer
        .constraints
        .push("Explicit offsets define the UTC instants".to_owned());
    Ok(answer)
}

pub(super) fn evaluate(operation: &str, input: &str, options: &Value) -> Checked<Computation> {
    if input.len() > 4096 {
        return Err(MathError::Limit);
    }
    let options = Options::read(operation, options)?;
    let input = input.trim();
    let answer = match operation {
        "difference" => difference(input),
        "age" => age(input),
        "period" => period(input, &options),
        "calendar" => calendar(input),
        "business_days" => business_days(input, &options),
        "deadline" => deadline(input, &options),
        "timezone" => timezone(input, &options),
        "duration" => duration(input),
        _ => return Err(MathError::Unsupported),
    }?;
    Ok(answer.finish(input))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn calculate(operation: &str, input: &str, options: Value) -> Computation {
        evaluate(operation, input, &options).unwrap()
    }

    fn result(operation: &str, input: &str, options: Value) -> String {
        calculate(operation, input, options).result
    }

    #[test]
    fn date_differences_use_signed_civil_days() {
        let result = calculate("difference", "  2024-03-05 | 2024-02-26  ", json!({}));
        assert_eq!(result.result, "days=-8; weeks=-1; remaining_days=-1");
        assert_eq!(result.normalized, "2024-03-05 | 2024-02-26");
        assert_eq!(result.units["days"], "day");
        assert_eq!(result.variables["calendar_version"], GREGORIAN_VERSION);
        assert_eq!(
            calculate("difference", "0001-01-01|9999-12-31", json!({})).result,
            "days=3652058; weeks=521722; remaining_days=4"
        );
        assert_eq!(
            calculate("difference", "1900-02-28|1900-03-01", json!({})).result,
            "days=1; weeks=0; remaining_days=1"
        );
        assert_eq!(
            calculate("difference", "2000-02-28|2000-03-01", json!({})).result,
            "days=2; weeks=0; remaining_days=2"
        );
    }

    #[test]
    fn calendar_and_age_keep_iso_week_and_clamped_anniversary_rules() {
        assert_eq!(
            result("calendar", "2021-01-01", json!({})),
            "weekday=5; day_of_year=1; iso_year=2020; iso_week=53; leap_year=false; days_in_month=31"
        );
        assert_eq!(
            result("calendar", "2000-02-29", json!({})),
            "weekday=2; day_of_year=60; iso_year=2000; iso_week=9; leap_year=true; days_in_month=29"
        );
        assert_eq!(
            result("calendar", "0001-01-01", json!({})),
            "weekday=1; day_of_year=1; iso_year=0001; iso_week=1; leap_year=false; days_in_month=31"
        );
        assert_eq!(
            result("age", "2000-02-29|2001-02-28", json!({})),
            "years=1; months=0; days=0; total_days=365"
        );
        assert_eq!(
            result("age", "2024-01-31|2024-03-30", json!({})),
            "years=0; months=1; days=30; total_days=59"
        );
        assert_eq!(
            result("age", "2024-02-29|2024-02-29", json!({})),
            "years=0; months=0; days=0; total_days=0"
        );
        assert_eq!(
            evaluate("age", "2024-02-29|2024-02-28", &json!({})).err(),
            Some(MathError::Domain)
        );
    }

    #[test]
    fn periods_keep_order_signed_components_and_end_of_month_policy() {
        let clamped = calculate("period", "2024-01-31", json!({"months":"1"}));
        assert_eq!(clamped.result, "date=2024-02-29");
        assert_eq!(clamped.variables["overflow"], "clamp");
        assert_eq!(clamped.variables["days"], "0");
        assert_eq!(
            result(
                "period",
                "2024-02-29",
                json!({"years":"1","months":"-12","weeks":"1","days":"−8"})
            ),
            "date=2024-02-28"
        );
        assert_eq!(
            result("period", "2024-03-31", json!({"months":"-1","days":"+1"})),
            "date=2024-03-01"
        );
        assert_eq!(
            result(
                "period",
                "2024-01-31",
                json!({"days":"1","overflow":"reject"})
            ),
            "date=2024-02-01"
        );
        assert_eq!(
            evaluate(
                "period",
                "2024-01-31",
                &json!({"months":"1","overflow":"reject"})
            )
            .err(),
            Some(MathError::Domain)
        );
        assert_eq!(
            evaluate("period", "0001-01-01", &json!({"days":"-1"})).err(),
            Some(MathError::Domain)
        );
    }

    #[test]
    fn business_calendar_deduplicates_and_counts_in_both_directions() {
        let options = json!({"weekdays":"5,1,1,7","holidays":"2024-01-08,2024-01-06,2024-01-08"});
        let count = calculate("business_days", "2024-01-05|2024-01-12", options.clone());
        assert_eq!(count.result, "business_days=2");
        assert_eq!(count.variables["weekdays"], "1,5,7");
        assert_eq!(count.variables["holidays"], "2024-01-06,2024-01-08");
        assert_eq!(
            count.variables["calendar_version"],
            business::CALENDAR_VERSION
        );
        assert_eq!(
            result("business_days", "2024-01-12|2024-01-05", options),
            "business_days=-2"
        );
        assert_eq!(
            result("business_days", "2024-01-06|2024-01-06", json!({})),
            "business_days=0"
        );
        assert_eq!(
            result("business_days", "2024-01-05|2024-01-08", json!({})),
            "business_days=1"
        );
        assert_eq!(
            result(
                "business_days",
                "0001-01-01|9999-12-31",
                json!({"weekdays":"1,2,3,4,5,6,7"})
            ),
            "business_days=3652058"
        );
    }

    #[test]
    fn deadlines_skip_start_and_find_the_exact_target() {
        assert_eq!(
            result(
                "deadline",
                "2023-12-22",
                json!({"count":"1","holidays":"2023-12-25"})
            ),
            "date=2023-12-26"
        );
        assert_eq!(
            result("deadline", "2023-12-25", json!({"count":"-1"})),
            "date=2023-12-22"
        );
        assert_eq!(
            result(
                "deadline",
                "2023-12-25",
                json!({"count":"-1","weekdays":"7"})
            ),
            "date=2023-12-24"
        );
        assert_eq!(
            result("deadline", "2023-12-24", json!({"count":"0"})),
            "date=2023-12-24"
        );
        assert_eq!(
            result(
                "deadline",
                "2023-12-22",
                json!({"count":"3","basis":"civil"})
            ),
            "date=2023-12-25"
        );
        assert_eq!(
            result(
                "deadline",
                "0001-01-01",
                json!({"count":"3652058","weekdays":"1,2,3,4,5,6,7"})
            ),
            "date=9999-12-31"
        );
        assert_eq!(
            evaluate("deadline", "0001-01-01", &json!({"count":"-1"})).err(),
            Some(MathError::Domain)
        );
        assert_eq!(
            evaluate("deadline", "2023-12-25", &json!({"count":"4000000"})).err(),
            Some(MathError::Domain)
        );
    }

    #[test]
    fn durations_use_explicit_offsets_and_preserve_nanoseconds() {
        for (input, expected) in [
            (
                "2024-03-10T00:00:00-05:00|2024-03-11T00:00:00-04:00",
                "seconds=82800.000000000",
            ),
            (
                "2024-11-03T00:00:00-04:00|2024-11-04T00:00:00-05:00",
                "seconds=90000.000000000",
            ),
            (
                "2024-01-01T00:00:00.000000001Z|2024-01-01T00:00:00Z",
                "seconds=-0.000000001",
            ),
            (
                "1969-12-31T23:59:59.999999999Z|1970-01-01T02:00:00+02:00",
                "seconds=0.000000001",
            ),
            (
                "2024-04-01T00:01:00.1234+05:45|2024-03-31T18:16:00.123400000Z",
                "seconds=0.000000000",
            ),
            (
                "0001-01-01T00:00:00Z|9999-12-31T23:59:59.999999999Z",
                "seconds=315537897599.999999999",
            ),
        ] {
            assert_eq!(result("duration", input, json!({})), expected);
        }
    }

    #[test]
    fn timezone_conversion_uses_actual_bundled_transitions_and_offsets() {
        let sample = calculate(
            "timezone",
            "2026-07-01T12:00:00.000000001",
            json!({"from":"America/Sao_Paulo","to":"Asia/Kathmandu","disambiguation":"reject"}),
        );
        assert_eq!(
            sample.result,
            "local=2026-07-01T20:45:00.000000001; utc=2026-07-01T15:00:00.000000001Z; from_offset=-03:00; to_offset=+05:45; from_dst=false; to_dst=false; resolution=unambiguous"
        );
        assert_eq!(sample.variables["tzdb_version"], "2026f");
        assert_eq!(
            result(
                "timezone",
                "1880-01-01T00:00",
                json!({"from":"Europe/Paris","to":"UTC"})
            ),
            "local=1879-12-31T23:50:39; utc=1879-12-31T23:50:39Z; from_offset=+00:09:21; to_offset=+00:00; from_dst=false; to_dst=false; resolution=unambiguous"
        );
        assert_eq!(
            result(
                "timezone",
                "2026-11-01T01:30",
                json!({"from":"America/Havana","to":"UTC"})
            ),
            "local=2026-11-01T05:30:00; utc=2026-11-01T05:30:00Z; from_offset=-04:00; to_offset=+00:00; from_dst=true; to_dst=false; resolution=unambiguous"
        );
        assert_eq!(sample.variables["tzdb_format"], "rearguard");
        assert!(
            result(
                "timezone",
                "2024-01-01T00:00:00.100",
                json!({"from":"UTC","to":"Europe/Dublin"})
            )
            .contains("to_offset=+00:00; from_dst=false; to_dst=false")
        );
        assert!(
            result(
                "timezone",
                "2024-07-01T00:00:00.100",
                json!({"from":"UTC","to":"Europe/Dublin"})
            )
            .contains("to_offset=+01:00; from_dst=false; to_dst=true")
        );
    }

    #[test]
    fn gap_and_fold_are_different_results() {
        let ny = json!({"from":"America/New_York","to":"UTC"});
        assert_eq!(
            evaluate("timezone", "2024-11-03T01:30", &ny).err(),
            Some(MathError::AmbiguousLocalTime)
        );
        for policy in ["reject", "earlier", "later"] {
            let mut options = ny.clone();
            options["disambiguation"] = json!(policy);
            assert_eq!(
                evaluate("timezone", "2024-03-10T02:30", &options).err(),
                Some(MathError::NonexistentLocalTime)
            );
        }
        assert_eq!(
            evaluate(
                "timezone",
                "2011-12-30T12:00",
                &json!({"from":"Pacific/Apia","to":"UTC"})
            )
            .err(),
            Some(MathError::NonexistentLocalTime)
        );
        let mut options = ny;
        options["disambiguation"] = json!("earlier");
        assert_eq!(
            result("timezone", "2024-11-03T01:30", options.clone()),
            "local=2024-11-03T05:30:00; utc=2024-11-03T05:30:00Z; from_offset=-04:00; to_offset=+00:00; from_dst=true; to_dst=false; resolution=earlier"
        );
        options["disambiguation"] = json!("later");
        assert_eq!(
            result("timezone", "2024-11-03T01:30", options),
            "local=2024-11-03T06:30:00; utc=2024-11-03T06:30:00Z; from_offset=-05:00; to_offset=+00:00; from_dst=false; to_dst=false; resolution=later"
        );
    }

    #[test]
    fn date_input_guard_differentiates_invalid_domain_and_limits() {
        let cases = [
            ("calendar", "2023-02-29", json!({}), MathError::InvalidInput),
            ("calendar", "0000-01-01", json!({}), MathError::InvalidInput),
            ("calendar", "2024-W01-1", json!({}), MathError::InvalidInput),
            (
                "difference",
                "2024-01-01",
                json!({}),
                MathError::InvalidInput,
            ),
            (
                "period",
                "2024-01-01",
                json!({"years":1}),
                MathError::InvalidInput,
            ),
            (
                "period",
                "2024-01-01",
                json!({"days":"4000001"}),
                MathError::Limit,
            ),
            (
                "period",
                "2024-01-01",
                json!({"days":"999999999999999999999999999"}),
                MathError::Limit,
            ),
            (
                "period",
                "2024-01-01",
                json!({"overflow":"rollover"}),
                MathError::InvalidInput,
            ),
            (
                "business_days",
                "2024-01-01|2024-01-04",
                json!({"weekdays":""}),
                MathError::InvalidInput,
            ),
            (
                "business_days",
                "2024-01-01|2024-01-04",
                json!({"weekdays":"0"}),
                MathError::InvalidInput,
            ),
            (
                "business_days",
                "2024-01-01|2024-01-04",
                json!({"holidays":"2024-01-01,"}),
                MathError::InvalidInput,
            ),
            (
                "deadline",
                "2024-01-03",
                json!({"count":"2","basis":"civil","weekdays":"1"}),
                MathError::InvalidInput,
            ),
            (
                "deadline",
                "2024-01-03",
                json!({"count":"2","basis":"other"}),
                MathError::InvalidInput,
            ),
            (
                "timezone",
                "2024-03-10T02:30Z",
                json!({"from":"UTC","to":"Asia/Tokyo"}),
                MathError::InvalidInput,
            ),
            (
                "timezone",
                "2024-03-10T02:30",
                json!({"from":"utc","to":"Asia/Tokyo"}),
                MathError::InvalidInput,
            ),
            (
                "timezone",
                "2024-03-10T02:30",
                json!({"from":"../zoneinfo","to":"UTC"}),
                MathError::InvalidInput,
            ),
            (
                "timezone",
                "0001-01-01T00:00:00",
                json!({"from":"Asia/Tokyo","to":"UTC"}),
                MathError::Domain,
            ),
            (
                "duration",
                "2024-01-01T00:00:00-00:00|2024-01-01T00:00:00Z",
                json!({}),
                MathError::InvalidInput,
            ),
            (
                "duration",
                "2024-01-01T00:00Z|2024-01-01T00:00:00Z",
                json!({}),
                MathError::InvalidInput,
            ),
            (
                "duration",
                "2016-12-31T23:59:60Z|2017-01-01T00:00:00Z",
                json!({}),
                MathError::InvalidInput,
            ),
            (
                "duration",
                "2024-01-01T00:00:00.0000000001Z|2024-01-01T00:00:00Z",
                json!({}),
                MathError::InvalidInput,
            ),
            (
                "duration",
                "0001-01-01T00:00:00+00:01|0001-01-01T00:00:00Z",
                json!({}),
                MathError::Domain,
            ),
        ];
        for (operation, input, options, error) in cases {
            assert_eq!(
                evaluate(operation, input, &options).err(),
                Some(error),
                "{operation}: {input}"
            );
        }
    }
}
