mod roots;

use super::cash_flow::{
    Numeric, bounded, calendar_days, dated_factor, estimated_dated_rate, nth_root, power,
    sign_variations,
};
use super::{Money, Rational, date, decimal, display, finish, money, number, parse};
use crate::{Computation, Exactness, MathError};
use num_integer::Integer;
use num_traits::{Signed, ToPrimitive, Zero};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;

const MAX_PERIODS: u32 = 600;
const RATE_SCALE: u32 = 16;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Interest {
    principal: String,
    rate: String,
    periods: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ValueAt {
    amount: String,
    rate: String,
    periods: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum Timing {
    Begin,
    End,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Annuity {
    payment: String,
    rate: String,
    periods: u32,
    timing: Timing,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Payment {
    principal: String,
    rate: String,
    periods: u32,
    timing: Timing,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum Conversion {
    NominalToEffective,
    EffectiveToNominal,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Nominal {
    rate: String,
    compounds: u32,
    direction: Conversion,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Equivalent {
    rate: String,
    from_periods_per_year: u32,
    to_periods_per_year: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RateInput {
    present: String,
    future: String,
    periods: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PeriodsInput {
    present: String,
    future: String,
    rate: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum Convention {
    CommercialSimple,
    RationalSimple,
    RationalCompound,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Discount {
    amount: String,
    rate: String,
    periods: u32,
    convention: Convention,
}

#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
enum DayCount {
    #[default]
    #[serde(rename = "act_365f")]
    Act365f,
    #[serde(rename = "act_360")]
    Act360,
    #[serde(rename = "30e_360")]
    ThirtyE360,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FlowInput {
    flows: Vec<String>,
    rate: Option<String>,
    finance_rate: Option<String>,
    reinvest_rate: Option<String>,
    dates: Option<Vec<String>>,
    day_count: Option<DayCount>,
}

struct FlowSeries {
    values: Vec<(Rational, Rational)>,
    day_count: Option<DayCount>,
}

fn duration(periods: u32, allow_zero: bool) -> Result<u32, MathError> {
    if periods == 0 && !allow_zero {
        return Err(MathError::Domain);
    }
    if periods > MAX_PERIODS {
        return Err(MathError::Limit);
    }
    Ok(periods)
}

fn positive(value: &str) -> Result<Rational, MathError> {
    let value = decimal(value)?;
    if !value.is_positive() {
        return Err(MathError::Domain);
    }
    Ok(value)
}

fn rate(value: &str) -> Result<Rational, MathError> {
    let value = decimal(value)?;
    if value <= -number(1) {
        return Err(MathError::Domain);
    }
    Ok(value)
}

fn money_values(money: &Money, values: &[(&str, &Rational)], exact: bool) -> Value {
    let mut result = Map::new();
    for (name, value) in values {
        result.insert((*name).to_owned(), json!(money.format(value)));
        if exact {
            result.insert(format!("{name}_exact"), json!(value.to_string()));
        }
    }
    Value::Object(result)
}

fn scalar(name: &str, value: &Rational, exact: bool) -> Value {
    let mut result = Map::new();
    result.insert(name.to_owned(), json!(display(value, RATE_SCALE)));
    if exact {
        result.insert(format!("{name}_exact"), json!(value.to_string()));
    }
    Value::Object(result)
}

fn report(
    input: &str,
    options: &Map<String, Value>,
    result: Value,
    method: &'static str,
    formula: &'static str,
    exact: bool,
) -> Result<Computation, MathError> {
    let mut computation = finish(input, options, result, method, formula)?;
    if !exact {
        computation.exactness = Exactness::Approximate;
        computation.precision = Some(320);
        computation.constraints.push("Non-rational factors use 320-bit floating-point arithmetic. No certified numeric error bound is asserted for those factors.".to_owned());
    }
    Ok(computation)
}

fn annuity_factor(
    rate: &Rational,
    periods: u32,
    timing: Timing,
    present: bool,
) -> Result<Rational, MathError> {
    if rate.is_zero() {
        return Ok(number(i64::from(periods)));
    }
    let base = number(1) + rate;
    let growth = power(&base, periods)?;
    let mut factor = (&growth - number(1)) / rate;
    if present {
        factor /= growth;
    }
    if matches!(timing, Timing::Begin) {
        factor *= base;
    }
    bounded(factor)
}

pub(super) fn evaluate(
    operation: &str,
    input: &str,
    options: &Map<String, Value>,
) -> Result<Computation, MathError> {
    let currency = money(options)?;
    let (result, method, formula, exact) = match operation {
        "simple_interest" | "compound_interest" => {
            let request: Interest = parse(input)?;
            let principal = positive(&request.principal)?;
            let rate = rate(&request.rate)?;
            let n = duration(request.periods, true)?;
            let (factor, formula) = if operation == "simple_interest" {
                (
                    number(1) + &rate * number(i64::from(n)),
                    "FV = PV(1 + i n); interest = FV − PV",
                )
            } else {
                (
                    power(&(number(1) + rate), n)?,
                    "FV = PV(1 + i)^n; interest = FV − PV",
                )
            };
            if factor.is_negative() {
                return Err(MathError::Domain);
            }
            let amount = bounded(&principal * factor)?;
            let interest = &amount - principal;
            (
                money_values(
                    &currency,
                    &[("amount", &amount), ("interest", &interest)],
                    true,
                ),
                "interest_factor",
                formula,
                true,
            )
        }
        "present_value" | "future_value" => {
            let request: ValueAt = parse(input)?;
            let rate = rate(&request.rate)?;
            let amount = decimal(&request.amount)?;
            let growth = power(&(number(1) + rate), duration(request.periods, true)?)?;
            let (amount, formula) = if operation == "present_value" {
                (bounded(amount / growth)?, "PV = FV / (1 + i)^n")
            } else {
                (bounded(amount * growth)?, "FV = PV(1 + i)^n")
            };
            (
                money_values(&currency, &[("amount", &amount)], true),
                "lump_sum_value",
                formula,
                true,
            )
        }
        "annuity_present_value" | "annuity_future_value" => {
            let request: Annuity = parse(input)?;
            let present = operation == "annuity_present_value";
            let rate = rate(&request.rate)?;
            let factor = annuity_factor(
                &rate,
                duration(request.periods, true)?,
                request.timing,
                present,
            )?;
            let result = bounded(decimal(&request.payment)? * factor)?;
            let formula = if present {
                "PV = PMT Σ(1+i)^−t"
            } else {
                "FV = PMT Σ(1+i)^(n−t)"
            };
            (
                money_values(&currency, &[("amount", &result)], true),
                "annuity_factor",
                formula,
                true,
            )
        }
        "annuity_payment" => {
            let request: Payment = parse(input)?;
            let rate = rate(&request.rate)?;
            let factor = annuity_factor(
                &rate,
                duration(request.periods, false)?,
                request.timing,
                true,
            )?;
            let payment = bounded(positive(&request.principal)? / factor)?;
            (
                money_values(&currency, &[("payment", &payment)], true),
                "inverse_annuity_factor",
                "PMT = PV / Σ(1+i)^−t",
                true,
            )
        }
        "nominal_effective" => {
            let request: Nominal = parse(input)?;
            let n = duration(request.compounds, false)?;
            let m = number(i64::from(n));
            let (result, exact, formula) = match request.direction {
                Conversion::NominalToEffective => {
                    let base = number(1) + decimal(&request.rate)? / &m;
                    if !base.is_positive() {
                        return Err(MathError::Domain);
                    }
                    (
                        power(&base, n)? - number(1),
                        true,
                        "i_eff = (1 + j/m)^m − 1",
                    )
                }
                Conversion::EffectiveToNominal => {
                    let (root, exact) = nth_root(&(number(1) + rate(&request.rate)?), n)?;
                    (
                        m * (root - number(1)),
                        exact,
                        "j = m[(1 + i_eff)^(1/m) − 1]",
                    )
                }
            };
            (
                scalar("rate", &result, exact),
                "nominal_effective_conversion",
                formula,
                exact,
            )
        }
        "equivalent_rate" => {
            let request: Equivalent = parse(input)?;
            let from = duration(request.from_periods_per_year, false)?;
            let to = duration(request.to_periods_per_year, false)?;
            let divisor = from.gcd(&to);
            let base = number(1) + rate(&request.rate)?;
            let (root, exact) = nth_root(&base, to / divisor)?;
            let factor = if exact {
                power(&root, from / divisor)?
            } else {
                Numeric::new()?
                    .fractional_power(&base, &(number(i64::from(from)) / number(i64::from(to))))?
            };
            (
                scalar("rate", &(factor - number(1)), exact),
                "equivalent_rate_conversion",
                "i_to = (1 + i_from)^(m_from/m_to) − 1",
                exact,
            )
        }
        "rate" => {
            let request: RateInput = parse(input)?;
            let ratio = positive(&request.future)? / positive(&request.present)?;
            let (factor, exact) = nth_root(&ratio, duration(request.periods, false)?)?;
            (
                scalar("rate", &(factor - number(1)), exact),
                "inverse_lump_sum_rate",
                "i = (FV/PV)^(1/n) − 1",
                exact,
            )
        }
        "periods" => {
            let request: PeriodsInput = parse(input)?;
            let ratio = positive(&request.future)? / positive(&request.present)?;
            let rate = rate(&request.rate)?;
            if rate.is_zero()
                || (ratio < number(1) && rate.is_positive())
                || (ratio > number(1) && rate.is_negative())
            {
                return Err(MathError::Domain);
            }
            let base = number(1) + rate;
            let periods = if ratio == number(1) {
                number(0)
            } else {
                Numeric::new()?.logarithm(&ratio, &base)?
            };
            let whole = periods.round();
            let exact = whole
                .to_integer()
                .to_u32()
                .is_some_and(|n| power(&base, n).is_ok_and(|factor| factor == ratio));
            let result = if exact { whole } else { periods };
            (
                scalar("periods", &result, exact),
                "inverse_lump_sum_periods",
                "n = ln(FV/PV)/ln(1+i)",
                exact,
            )
        }
        "discount" => {
            let request: Discount = parse(input)?;
            let rate = rate(&request.rate)?;
            let amount = positive(&request.amount)?;
            let n = duration(request.periods, true)?;
            let (factor, formula) = match request.convention {
                Convention::CommercialSimple => (
                    number(1) - rate * number(i64::from(n)),
                    "PV = FV(1 − i n); discount = FV − PV",
                ),
                Convention::RationalSimple => {
                    let denominator = number(1) + rate * number(i64::from(n));
                    if !denominator.is_positive() {
                        return Err(MathError::Domain);
                    }
                    (denominator.recip(), "PV = FV/(1 + i n); discount = FV − PV")
                }
                Convention::RationalCompound => (
                    power(&(number(1) + rate), n)?.recip(),
                    "PV = FV/(1 + i)^n; discount = FV − PV",
                ),
            };
            if factor.is_negative() {
                return Err(MathError::Domain);
            }
            let present = bounded(&amount * factor)?;
            let discount = amount - &present;
            (
                money_values(
                    &currency,
                    &[("present", &present), ("discount", &discount)],
                    true,
                ),
                "financial_discount",
                formula,
                true,
            )
        }
        "npv" | "irr" | "mirr" | "payback" | "discounted_payback" | "profitability_index" => {
            return evaluate_flows(operation, input, options, &currency);
        }
        _ => return Err(MathError::Unsupported),
    };
    let mut result = report(input, options, result, method, formula, exact)?;
    if operation.starts_with("annuity_") {
        result.constraints.push("For timing begin, cash flows occur at t=0 through n−1. For timing end, they occur at t=1 through n.".to_owned());
    }
    Ok(result)
}

impl FlowSeries {
    fn new(request: &FlowInput) -> Result<Self, MathError> {
        if request.flows.is_empty() {
            return Err(MathError::InvalidInput);
        }
        if request.flows.len() > 128 {
            return Err(MathError::Limit);
        }
        let flows = request
            .flows
            .iter()
            .map(|amount| decimal(amount))
            .collect::<Result<Vec<_>, _>>()?;
        if let Some(dates) = &request.dates {
            if dates.len() != flows.len() {
                return Err(MathError::InvalidInput);
            }
            let dates = dates
                .iter()
                .map(|value| date(value))
                .collect::<Result<Vec<_>, _>>()?;
            let start = dates.iter().min().copied().ok_or(MathError::InvalidInput)?;
            let end = dates.iter().max().copied().ok_or(MathError::InvalidInput)?;
            if calendar_days(start, end) > 36_600 {
                return Err(MathError::Limit);
            }
            let convention = request.day_count.unwrap_or_default();
            let mut combined = BTreeMap::<Rational, Rational>::new();
            for (date, cash) in dates.into_iter().zip(flows) {
                let elapsed = match convention {
                    DayCount::Act365f => number(calendar_days(start, date)) / number(365),
                    DayCount::Act360 => number(calendar_days(start, date)) / number(360),
                    DayCount::ThirtyE360 => {
                        let elapsed = i64::from(date.year() - start.year()) * 360
                            + (i64::from(date.month()) - i64::from(start.month())) * 30
                            + i64::from(date.day().min(30))
                            - i64::from(start.day().min(30));
                        number(elapsed) / number(360)
                    }
                };
                *combined.entry(elapsed).or_insert_with(|| number(0)) += cash;
            }
            Ok(Self {
                values: combined.into_iter().collect(),
                day_count: Some(convention),
            })
        } else {
            if request.day_count.is_some() {
                return Err(MathError::InvalidInput);
            }
            let values = flows
                .into_iter()
                .enumerate()
                .map(|(n, cash)| (number(n as i64), cash))
                .collect();
            Ok(Self {
                values,
                day_count: None,
            })
        }
    }

    fn discounted(&self, rate: &Rational) -> Result<(Vec<(Rational, Rational)>, bool), MathError> {
        let base = number(1) + rate;
        let mut numeric = Numeric::new()?;
        let mut exact = true;
        let values = self
            .values
            .iter()
            .map(|(time, cash)| {
                let value = if cash.is_zero() || rate.is_zero() || time.is_zero() {
                    cash.clone()
                } else if time.is_integer() {
                    let n = time.to_integer().to_u32().ok_or(MathError::Limit)?;
                    bounded(cash / power(&base, n)?)?
                } else {
                    exact = false;
                    bounded(cash * dated_factor(&mut numeric, &base, &(-time))?)?
                };
                Ok((time.clone(), value))
            })
            .collect::<Result<Vec<_>, MathError>>()?;
        Ok((values, exact))
    }
}

fn sum(flows: impl Iterator<Item = Rational>) -> Result<Rational, MathError> {
    flows
        .into_iter()
        .try_fold(number(0), |sum, cash| bounded(sum + cash))
}

fn evaluate_flows(
    operation: &str,
    input: &str,
    options: &Map<String, Value>,
    currency: &Money,
) -> Result<Computation, MathError> {
    let request: FlowInput = parse(input)?;
    let series = FlowSeries::new(&request)?;
    let needs_discount = matches!(
        operation,
        "npv" | "discounted_payback" | "profitability_index"
    );
    if needs_discount != request.rate.is_some()
        || ((operation == "mirr") != request.finance_rate.is_some())
        || ((operation == "mirr") != request.reinvest_rate.is_some())
    {
        return Err(MathError::InvalidInput);
    }
    let (discounted, exact) = if let Some(value) = request.rate.as_ref() {
        let (values, exact) = series.discounted(&rate(value)?)?;
        (Some(values), exact)
    } else {
        (None, true)
    };
    let flows = discounted.as_ref().unwrap_or(&series.values);
    let (value, method, formula, exact) = match operation {
        "npv" => {
            let net = sum(flows.iter().map(|(_, cash)| cash.clone()))?;
            (
                money_values(currency, &[("npv", &net)], exact),
                "net_present_value",
                "NPV = Σ C_t/(1+i)^t",
                exact,
            )
        }
        "irr" => return irr(input, options, &series),
        "mirr" => {
            let finance_rate = rate(
                request
                    .finance_rate
                    .as_deref()
                    .ok_or(MathError::InvalidInput)?,
            )?;
            let reinvest_rate = rate(
                request
                    .reinvest_rate
                    .as_deref()
                    .ok_or(MathError::InvalidInput)?,
            )?;
            let (rate, exact) = mirr(&series, finance_rate, reinvest_rate)?;
            (
                scalar("mirr", &rate, exact),
                "modified_internal_rate_of_return",
                "MIRR = (FV_positive / abs(PV_negative))^(1/T) − 1",
                exact,
            )
        }
        "payback" | "discounted_payback" => {
            let unit = if series.day_count.is_some() {
                "years"
            } else {
                "periods"
            };
            let mut value = match payback(flows)? {
                Some(result) => scalar("payback", &result, exact),
                None => json!({"payback":null}),
            };
            value["unit"] = json!(unit);
            value["status"] = json!(if value["payback"].is_null() {
                "not_recovered"
            } else {
                "recovered"
            });
            (
                value,
                if needs_discount {
                    "discounted_payback"
                } else {
                    "simple_payback"
                },
                "First cumulative recovery; linear interpolation in the crossing interval",
                exact,
            )
        }
        "profitability_index" => {
            let receipts = sum(flows
                .iter()
                .filter(|(_, cash)| cash.is_positive())
                .map(|(_, cash)| cash.clone()))?;
            let outlays = sum(flows
                .iter()
                .filter(|(_, cash)| cash.is_negative())
                .map(|(_, cash)| -cash))?;
            if outlays.is_zero() {
                return Err(MathError::Domain);
            }
            (
                scalar("profitability_index", &bounded(receipts / outlays)?, exact),
                "profitability_index",
                "PI = PV(positive cash flows) / abs(PV(negative cash flows))",
                exact,
            )
        }
        _ => return Err(MathError::Unsupported),
    };
    let mut result = report(input, options, value, method, formula, exact)?;
    describe_times(&mut result, &series);
    Ok(result)
}

fn describe_times(result: &mut Computation, series: &FlowSeries) {
    if let Some(day_count) = series.day_count {
        let basis = match day_count {
            DayCount::Act365f => "act_365f",
            DayCount::Act360 => "act_360",
            DayCount::ThirtyE360 => "30e_360",
        };
        result
            .variables
            .insert("day_count".to_owned(), basis.to_owned());
        result.constraints.push("Dated cash flows are sorted, measured from the earliest date and combined when elapsed times coincide. Rates are effective annual rates.".to_owned());
    } else {
        result.constraints.push("Periodic cash flows begin at t=0 with one period between entries. Rates apply per period.".to_owned());
    }
}

fn payback(flows: &[(Rational, Rational)]) -> Result<Option<Rational>, MathError> {
    let (mut previous, first) = flows
        .first()
        .ok_or(MathError::Domain)
        .map(|(time, cash)| (time.clone(), cash))?;
    if !first.is_negative() {
        return Err(MathError::Domain);
    }
    let mut cumulative = first.clone();
    for (time, cash) in flows.iter().skip(1) {
        let next = bounded(&cumulative + cash)?;
        if !next.is_negative() {
            return Ok(Some(bounded(
                &previous + (time - &previous) * (-cumulative / cash),
            )?));
        }
        cumulative = next;
        previous = time.clone();
    }
    Ok(None)
}

fn mirr(
    series: &FlowSeries,
    finance_rate: Rational,
    reinvest_rate: Rational,
) -> Result<(Rational, bool), MathError> {
    let (horizon, _) = series.values.last().ok_or(MathError::Domain)?;
    if horizon.is_zero() {
        return Err(MathError::Domain);
    }
    let finance = number(1) + finance_rate;
    let reinvest = number(1) + reinvest_rate;
    let mut numeric = Numeric::new()?;
    let mut present = number(0);
    let mut future = number(0);
    let mut exact = true;
    for (time, cash) in &series.values {
        if cash.is_negative() {
            let factor = if time.is_integer() {
                power(
                    &finance,
                    time.to_integer().to_u32().ok_or(MathError::Limit)?,
                )?
                .recip()
            } else {
                exact &= finance == number(1);
                dated_factor(&mut numeric, &finance, &(-time))?
            };
            present = bounded(present - cash * factor)?;
        } else if cash.is_positive() {
            let remaining = horizon - time;
            let factor = if remaining.is_integer() {
                power(
                    &reinvest,
                    remaining.to_integer().to_u32().ok_or(MathError::Limit)?,
                )?
            } else {
                exact &= reinvest == number(1);
                dated_factor(&mut numeric, &reinvest, &remaining)?
            };
            future = bounded(future + cash * factor)?;
        }
    }
    if present.is_zero() || future.is_zero() {
        return Err(MathError::Domain);
    }
    let ratio = bounded(future / present)?;
    let (rate, exact) = if horizon.is_integer() {
        let (factor, root_exact) = nth_root(
            &ratio,
            horizon.to_integer().to_u32().ok_or(MathError::Limit)?,
        )?;
        (factor - number(1), exact && root_exact)
    } else if ratio == number(1) {
        (number(0), exact)
    } else {
        (
            numeric.fractional_power(&ratio, &horizon.recip())? - number(1),
            false,
        )
    };
    Ok((rate, exact))
}

fn irr(
    input: &str,
    options: &Map<String, Value>,
    series: &FlowSeries,
) -> Result<Computation, MathError> {
    let changes = sign_variations(series.values.iter().map(|(_, cash)| cash));
    let all_zero = series.values.iter().all(|(_, cash)| cash.is_zero());
    let mut exact = true;
    let mut certified_intervals = false;
    let mut dated_estimate = false;
    let mut values = Vec::new();
    let status = if all_zero {
        "indeterminate"
    } else if changes == 0 {
        "none"
    } else if series.day_count.is_some() {
        if changes != 1 {
            "completeness_uncertified"
        } else {
            match estimated_dated_rate(&series.values) {
                Ok(rate) => {
                    exact = series
                        .values
                        .iter()
                        .map(|(_, cash)| cash)
                        .sum::<Rational>()
                        .is_zero();
                    dated_estimate = !exact;
                    let mut root = scalar("rate", &rate, exact);
                    root["multiplicity"] = json!(1);
                    values.push(root);
                    "solved"
                }
                Err(MathError::NoConvergence | MathError::Limit) => "not_resolved_in_search",
                Err(error) => return Err(error),
            }
        }
    } else {
        let flows = series
            .values
            .iter()
            .map(|(_, cash)| cash.clone())
            .collect::<Vec<_>>();
        match roots::periodic(&flows) {
            Ok(roots) => {
                for root in roots {
                    let is_exact = root.lower == root.upper;
                    exact &= is_exact;
                    certified_intervals |= !is_exact;
                    let middle = (&root.lower + &root.upper) / number(2);
                    let mut value = scalar("rate", &middle, is_exact);
                    value["multiplicity"] = json!(root.multiplicity);
                    if !is_exact {
                        value["lower_exact"] = json!(root.lower.to_string());
                        value["upper_exact"] = json!(root.upper.to_string());
                    }
                    values.push(value);
                }
                if values.is_empty() { "none" } else { "solved" }
            }
            Err(MathError::Limit | MathError::NoConvergence) => "completeness_uncertified",
            Err(error) => return Err(error),
        }
    };
    let method = if series.day_count.is_some() {
        "dated_irr_single_sign_change"
    } else {
        "periodic_irr_rational_root_isolation"
    };
    let result = json!({"status":status, "roots":values});
    let mut proof = if certified_intervals {
        let mut proof = finish(input, options, result, method, "Σ C_t/(1+i)^t = 0, i > −1")?;
        proof.exactness = Exactness::Approximate;
        proof.error_bound = Some("0.000000000001".to_owned());
        proof.constraints.push("Periodic root isolation uses exact rational sign counts and endpoints. The displayed rate and its enclosing rational endpoints are supplied for each isolated root.".to_owned());
        proof
    } else {
        report(
            input,
            options,
            result,
            method,
            "Σ C_t/(1+i)^t = 0, i > −1",
            exact,
        )?
    };
    if dated_estimate {
        proof.tolerance = Some("0.000000000001".to_owned());
        proof.constraints.push("For a single sign variation, the dated root is structurally unique. The numeric search uses a sign bracket of width at most 1e−12 in [−0.999999999999, 10000].".to_owned());
    }
    if matches!(
        status,
        "completeness_uncertified" | "not_resolved_in_search"
    ) {
        proof.exactness = Exactness::Approximate;
        proof.constraints.push("The result leaves the solution set open. An empty roots array under this status does not establish the absence of roots.".to_owned());
    }
    describe_times(&mut proof, series);
    Ok(proof)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(operation: &str, input: Value) -> (Value, Computation) {
        let proof = evaluate(operation, &input.to_string(), &Map::new()).unwrap();
        (serde_json::from_str(&proof.result).unwrap(), proof)
    }

    #[test]
    fn cash_flow_roots_preserve_multiple_and_repeated_solutions() {
        let (multiple, proof) = run("irr", json!({"flows":["-100","230","-132"]}));
        assert_eq!(proof.exactness, Exactness::Exact);
        assert_eq!(multiple["roots"][0]["rate_exact"], "1/10");
        assert_eq!(multiple["roots"][1]["rate_exact"], "1/5");
        let (repeated, _) = run("irr", json!({"flows":["-100","220","-121"]}));
        assert_eq!(repeated["roots"][0]["rate_exact"], "1/10");
        assert_eq!(repeated["roots"][0]["multiplicity"], 2);
        let (triple, _) = run("irr", json!({"flows":["-1000","3300","-3630","1331"]}));
        assert_eq!(triple["roots"][0]["rate_exact"], "1/10");
        assert_eq!(triple["roots"][0]["multiplicity"], 3);
        let (none, _) = run("irr", json!({"flows":["-100","20","-100"]}));
        assert_eq!(none["status"], "none");
        let (indeterminate, _) = run("irr", json!({"flows":["0","0"]}));
        assert_eq!(indeterminate["status"], "indeterminate");
    }

    #[test]
    fn irrational_root_has_certified_rational_enclosure() {
        let (result, proof) = run("irr", json!({"flows":["-100","0","200"]}));
        let root = &result["roots"][0];
        assert_eq!(proof.exactness, Exactness::Approximate);
        let lower: Rational = root["lower_exact"].as_str().unwrap().parse().unwrap();
        let upper: Rational = root["upper_exact"].as_str().unwrap().parse().unwrap();
        assert!((&lower + number(1)).pow(2) < number(2));
        assert!((&upper + number(1)).pow(2) > number(2));
        assert!(&upper - &lower <= decimal("0.000000000001").unwrap());
    }

    #[test]
    fn dated_conventions_round_trip_and_expose_uncertified_root_sets() {
        let (value, proof) = run(
            "npv",
            json!({"flows":["110","-100"],"dates":["2028-01-01","2027-01-01"],"rate":"0.1"}),
        );
        assert_eq!(value["npv_exact"], "0");
        assert_eq!(proof.variables["day_count"], "act_365f");
        let (dated, proof) = run(
            "irr",
            json!({"flows":["-100","110"],"dates":["2027-01-01","2028-01-01"]}),
        );
        let root: f64 = dated["roots"][0]["rate"].as_str().unwrap().parse().unwrap();
        assert!((root - 0.1).abs() < 1e-12);
        assert_eq!(proof.exactness, Exactness::Approximate);
        let (dated, _) = run(
            "irr",
            json!({"flows":["-100","230","-132"],"dates":["2027-01-01","2028-01-01","2029-01-01"]}),
        );
        assert_eq!(dated["status"], "completeness_uncertified");
        let (value, _) = run(
            "npv",
            json!({"flows":["-100","40","70"],"dates":["2027-01-01","2027-12-27","2027-12-27"],"day_count":"act_360","rate":"0.1"}),
        );
        assert_eq!(value["npv_exact"], "0");
        let (value, _) = run(
            "npv",
            json!({"flows":["-100","110"],"dates":["2027-01-31","2028-01-30"],"day_count":"30e_360","rate":"0.1"}),
        );
        assert_eq!(value["npv_exact"], "0");
    }

    #[test]
    fn financial_factors_keep_exactness_and_domain_constraints() {
        let (interest, _) = run(
            "compound_interest",
            json!({"principal":"1000","rate":"0.02","periods":3}),
        );
        assert_eq!(interest["amount"], "1061.21");
        assert_eq!(interest["amount_exact"], "132651/125");
        let (periods, proof) = run(
            "periods",
            json!({"present":"100","future":"121","rate":"0.1"}),
        );
        assert_eq!(periods["periods_exact"], "2");
        assert_eq!(proof.exactness, Exactness::Exact);
        let (rate, _) = run("rate", json!({"present":"100","future":"121","periods":2}));
        assert_eq!(rate["rate_exact"], "1/10");
        let (rate, proof) = run("rate", json!({"present":"100","future":"200","periods":2}));
        let rate: f64 = rate["rate"].as_str().unwrap().parse().unwrap();
        assert!((rate - (2_f64.sqrt() - 1.0)).abs() < 1e-14);
        assert_eq!(proof.exactness, Exactness::Approximate);
        let (annuity, _) = run(
            "annuity_present_value",
            json!({"payment":"100","rate":"0.1","periods":2,"timing":"begin"}),
        );
        assert_eq!(annuity["amount_exact"], "2100/11");
        let (recovery, _) = run("payback", json!({"flows":["-100","40","80"]}));
        assert_eq!(recovery["payback_exact"], "7/4");
        let (ratio, _) = run(
            "profitability_index",
            json!({"flows":["-100","60","66"],"rate":"0.1"}),
        );
        assert_eq!(ratio["profitability_index_exact"], "12/11");
        let (mirr, _) = run(
            "mirr",
            json!({"flows":["-100","0","121"],"finance_rate":"0.05","reinvest_rate":"0.09"}),
        );
        assert_eq!(mirr["mirr_exact"], "1/10");
    }
}
