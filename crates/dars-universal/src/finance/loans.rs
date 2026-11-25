use super::cash_flow::{bounded, calendar_days, estimated_dated_rate, power};
use super::{Money, Rational, date, decimal, display, finish, money, number, parse};
use crate::{Computation, Exactness, MathError};
use jiff::civil::Date;
use num_traits::{Signed, Zero};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;

const MAX_PERIODS: u32 = 600;
const MAX_PAGE_SIZE: u32 = 40;

#[derive(Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum Method {
    Price,
    Sac,
    Uniform,
    Bullet,
    SinglePayment,
}

impl Method {
    fn as_str(self) -> &'static str {
        match self {
            Self::Price => "price",
            Self::Sac => "sac",
            Self::Uniform => "uniform",
            Self::Bullet => "bullet",
            Self::SinglePayment => "single_payment",
        }
    }

    fn formula(self) -> &'static str {
        match self {
            Self::Price => "PMT = B i / [1−(1+i)^−n]; at i=0, PMT = B/n; interest = B i",
            Self::Sac => "amortization = B/n when initialized or recast; interest = B i",
            Self::Uniform => "amortization = fixed payment − interest; interest = B i",
            Self::Bullet => "interest = B i; scheduled principal is due at maturity",
            Self::SinglePayment => {
                "B_after = B_before(1+i) until maturity; scheduled principal and interest are due at maturity"
            }
        }
    }
}

#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Grace {
    Capitalize,
    #[default]
    InterestOnly,
}

#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ExtraPolicy {
    #[default]
    ReduceTerm,
    ReducePayment,
}

#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
enum RoundingScope {
    #[default]
    Final,
    PerRow,
}

impl RoundingScope {
    fn apply(self, money: &Money, value: Rational) -> Rational {
        match self {
            Self::Final => value,
            Self::PerRow => money.round(&value),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Final => "final",
            Self::PerRow => "per_row",
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DatedAmount {
    period: u32,
    amount: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DatedRate {
    period: u32,
    rate: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LoanInput {
    method: Option<Method>,
    principal: String,
    rate: String,
    periods: u32,
    start_date: String,
    first_date: Option<String>,
    #[serde(default)]
    grace_periods: u32,
    #[serde(default)]
    grace: Grace,
    #[serde(default)]
    extra: Vec<DatedAmount>,
    #[serde(default)]
    rates: Vec<DatedRate>,
    #[serde(default)]
    fees: Vec<DatedAmount>,
    upfront_fee: Option<String>,
    #[serde(default)]
    extra_policy: ExtraPolicy,
    #[serde(default)]
    rounding_scope: RoundingScope,
    page: Option<u32>,
    page_size: Option<u32>,
    payment: Option<String>,
    payoff_at: Option<u32>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Compare {
    proposals: Vec<LoanInput>,
}

struct Schedule {
    method: Method,
    rows: Vec<Row>,
    totals: Totals,
    upfront_fee: Rational,
    principal: Rational,
    start: Date,
    contract_periods: u32,
    rounding: RoundingScope,
}

struct Row {
    period: u32,
    date: Date,
    rate: Rational,
    balance_start: Rational,
    interest: Rational,
    amortization: Rational,
    fees: Rational,
    extra: Rational,
    payment: Rational,
    balance_end: Rational,
    capitalized: Rational,
}

#[derive(Default)]
struct Totals {
    interest: Rational,
    amortization: Rational,
    fees: Rational,
    extra: Rational,
    paid: Rational,
    capitalized: Rational,
}

fn nonnegative(value: &str) -> Result<Rational, MathError> {
    let value = decimal(value)?;
    if value.is_negative() {
        return Err(MathError::Domain);
    }
    Ok(value)
}

fn index<T>(
    items: impl Iterator<Item = (u32, Result<T, MathError>)>,
    periods: u32,
) -> Result<BTreeMap<u32, T>, MathError> {
    let mut values = BTreeMap::new();
    for (period, value) in items {
        if period == 0 || period > periods {
            return Err(MathError::Domain);
        }
        if values.insert(period, value?).is_some() {
            return Err(MathError::InvalidInput);
        }
    }
    Ok(values)
}

fn month_date(anchor: Date, offset: u32) -> Result<Date, MathError> {
    let month = i32::from(anchor.month()) - 1 + offset as i32;
    let year =
        i16::try_from(i32::from(anchor.year()) + month / 12).map_err(|_| MathError::Domain)?;
    if !(1..=9999).contains(&year) {
        return Err(MathError::Domain);
    }
    let month = (month % 12 + 1) as i8;
    let first = Date::new(year, month, 1).map_err(|_| MathError::Domain)?;
    Date::new(year, month, anchor.day().min(first.days_in_month())).map_err(|_| MathError::Domain)
}

fn price_payment(balance: &Rational, rate: &Rational, periods: u32) -> Result<Rational, MathError> {
    if rate.is_zero() {
        return bounded(balance / number(i64::from(periods)));
    }
    let growth = power(&(number(1) + rate), periods)?;
    bounded(balance * rate / (number(1) - growth.recip()))
}

impl Schedule {
    fn generate(
        request: &LoanInput,
        method: Method,
        money: &Money,
        payoff_at: Option<u32>,
    ) -> Result<Self, MathError> {
        if request.periods > MAX_PERIODS {
            return Err(MathError::Limit);
        }
        if request.periods == 0
            || request.grace_periods >= request.periods
            || payoff_at.is_some_and(|p| p == 0 || p > request.periods)
        {
            return Err(MathError::Domain);
        }
        if request.payment.is_some() != (method == Method::Uniform) {
            return Err(MathError::InvalidInput);
        }
        let rounding = request.rounding_scope;
        let amount = |value: &str| nonnegative(value).map(|amount| rounding.apply(money, amount));
        let principal = amount(&request.principal)?;
        if !principal.is_positive() {
            return Err(MathError::Domain);
        }
        let rate = nonnegative(&request.rate)?;
        let start = date(&request.start_date)?;
        let (anchor, offset) = match request.first_date.as_deref() {
            Some(first) => {
                let first = date(first)?;
                if first <= start {
                    return Err(MathError::Domain);
                }
                (first, 0)
            }
            None => (start, 1),
        };
        let extras = index(
            request
                .extra
                .iter()
                .map(|event| (event.period, amount(&event.amount))),
            request.periods,
        )?;
        let fees = index(
            request
                .fees
                .iter()
                .map(|event| (event.period, amount(&event.amount))),
            request.periods,
        )?;
        let rates = index(
            request
                .rates
                .iter()
                .map(|event| (event.period, nonnegative(&event.rate))),
            request.periods,
        )?;
        let zero = number(0);
        let upfront_fee = request
            .upfront_fee
            .as_deref()
            .map(amount)
            .transpose()?
            .unwrap_or_else(|| zero.clone());
        let mut installment = request
            .payment
            .as_deref()
            .map(amount)
            .transpose()?
            .unwrap_or_else(|| zero.clone());
        if method == Method::Uniform && !installment.is_positive() {
            return Err(MathError::Domain);
        }
        let mut balance = principal.clone();
        let mut totals = Totals::default();
        let mut rows = Vec::with_capacity(request.periods as usize);
        let mut rate = rate;
        let mut recast = true;
        let last = payoff_at.unwrap_or(request.periods);
        for period in 1..=last {
            let due_date = month_date(anchor, offset + period - 1)?;
            let rate_changed = if let Some(value) = rates.get(&period) {
                let changed = rate != *value;
                rate = value.clone();
                changed
            } else {
                false
            };
            let balance_start = balance.clone();
            let interest = rounding.apply(money, bounded(&balance * &rate)?);
            let in_grace = period <= request.grace_periods && period != last;
            let capitalized = if period != last
                && (method == Method::SinglePayment
                    || in_grace && matches!(request.grace, Grace::Capitalize))
            {
                interest.clone()
            } else {
                zero.clone()
            };
            balance = bounded(balance + &capitalized)?;
            let remaining = request.periods - period + 1;
            let amortization = if period == last {
                balance.clone()
            } else if in_grace || matches!(method, Method::Bullet | Method::SinglePayment) {
                zero.clone()
            } else {
                if recast || (rate_changed && method == Method::Price) {
                    match method {
                        Method::Price => installment = price_payment(&balance, &rate, remaining)?,
                        Method::Sac => {
                            installment = bounded(&balance / number(i64::from(remaining)))?
                        }
                        Method::Uniform | Method::Bullet | Method::SinglePayment => {}
                    }
                }
                let principal_payment = if method == Method::Sac {
                    installment.clone()
                } else {
                    rounding.apply(money, installment.clone()) - &interest
                };
                if principal_payment.is_negative() {
                    return Err(MathError::Domain);
                }
                rounding
                    .apply(money, principal_payment)
                    .min(balance.clone())
            };
            balance = bounded(balance - &amortization)?;
            let extra = extras.get(&period).unwrap_or(&zero).min(&balance).clone();
            balance = bounded(balance - &extra)?;
            let fees = fees.get(&period).unwrap_or(&zero).clone();
            let payment = bounded(&interest - &capitalized + &amortization + &extra + &fees)?;
            totals.interest = bounded(totals.interest + &interest)?;
            totals.amortization = bounded(totals.amortization + &amortization)?;
            totals.fees = bounded(totals.fees + &fees)?;
            totals.extra = bounded(totals.extra + &extra)?;
            totals.paid = bounded(totals.paid + &payment)?;
            totals.capitalized = bounded(totals.capitalized + &capitalized)?;
            rows.push(Row {
                period,
                date: due_date,
                rate: rate.clone(),
                balance_start,
                interest,
                amortization,
                fees,
                extra,
                payment,
                balance_end: balance.clone(),
                capitalized,
            });
            recast = in_grace || extra_recast(&rows, request.extra_policy);
            if balance.is_zero() {
                break;
            }
        }
        Ok(Self {
            method,
            rows,
            totals,
            upfront_fee,
            principal,
            start,
            contract_periods: request.periods,
            rounding,
        })
    }

    fn paid(&self) -> Rational {
        &self.totals.paid + &self.upfront_fee
    }

    fn summary(&self, money: &Money) -> Value {
        let paid = self.paid();
        let fees = &self.totals.fees + &self.upfront_fee;
        let borrowing_cost = &paid - &self.principal;
        let balance = self
            .rows
            .last()
            .map(|row| row.balance_end.clone())
            .unwrap_or_else(|| self.principal.clone());
        json!({
            "method": self.method.as_str(), "principal": money.format(&self.principal),
            "interest": money.format(&self.totals.interest), "amortization": money.format(&self.totals.amortization),
            "fees": money.format(&fees), "upfront_fee": money.format(&self.upfront_fee),
            "extra": money.format(&self.totals.extra), "total_paid": money.format(&paid),
            "total_cost": money.format(&borrowing_cost), "capitalized": money.format(&self.totals.capitalized),
            "balance_end": money.format(&balance), "contract_periods": self.contract_periods,
            "actual_periods": self.rows.len(), "start_date": self.start.to_string(),
            "rounding_scope": self.rounding.as_str(),
        })
    }

    fn result(&self, money: &Money, page: u32, page_size: u32) -> Result<Value, MathError> {
        if page == 0 || page_size == 0 {
            return Err(MathError::Domain);
        }
        if page_size > MAX_PAGE_SIZE {
            return Err(MathError::Limit);
        }
        let row_count = self.rows.len();
        let offset = (u64::from(page) - 1) * u64::from(page_size);
        if offset >= row_count as u64 {
            return Err(MathError::Domain);
        }
        let rows = self
            .rows
            .iter()
            .skip(offset as usize)
            .take(page_size as usize)
            .map(|row| row.json(money))
            .collect::<Vec<_>>();
        Ok(
            json!({"summary": self.summary(money), "rows": rows, "page":{
                "number": page, "size": page_size, "total_rows": row_count,
                "total_pages": row_count.div_ceil(page_size as usize),
            }}),
        )
    }

    fn effective_rate(&self) -> Result<(Rational, bool), MathError> {
        let net_disbursement = &self.principal - &self.upfront_fee;
        if !net_disbursement.is_positive() {
            return Err(MathError::Domain);
        }
        let mut series = vec![(number(0), net_disbursement.clone())];
        series.extend(self.rows.iter().map(|row| {
            (
                number(calendar_days(self.start, row.date)) / number(365),
                -&row.payment,
            )
        }));
        let exact = self.totals.paid == net_disbursement;
        Ok((estimated_dated_rate(&series)?, exact))
    }
}

fn extra_recast(rows: &[Row], policy: ExtraPolicy) -> bool {
    matches!(policy, ExtraPolicy::ReducePayment)
        && rows.last().is_some_and(|row| row.extra.is_positive())
}

impl Row {
    fn json(&self, money: &Money) -> Value {
        json!({"period": self.period, "date": self.date.to_string(), "rate": display(&self.rate, 12),
            "balance_start": money.format(&self.balance_start), "interest": money.format(&self.interest),
            "amortization": money.format(&self.amortization), "fees": money.format(&self.fees),
            "extra": money.format(&self.extra), "payment": money.format(&self.payment),
            "balance_end": money.format(&self.balance_end), "capitalized": money.format(&self.capitalized),
        })
    }
}

fn describe(result: &mut Computation) {
    result.constraints.extend([
        "Each installment accrues one contractual period at the applicable nonnegative rate. Civil dates use a fixed monthly day, clamped when the month is shorter.".to_owned(),
        "Interest and fees are computed before principal and extra payments. Extra payments are capped at the open balance. Scheduled rows and charges end when that balance is zero.".to_owned(),
        "Price reinstates the remaining-term payment at a rate change; extra reduce_payment also recasts Price and SAC. Uniform keeps its supplied payment until the closing installment; bullet repays scheduled principal at maturity.".to_owned(),
        "Single-payment loans capitalize all interest until the closing installment. Optional fees and extra principal are separate cash flows if supplied.".to_owned(),
        "In per_row mode principal, fees, uniform payment and extras enter the ledger at currency scale, and each row rounds interest and principal. Final mode retains rational amounts and rounds each displayed figure independently.".to_owned(),
        "The closing payment settles the remaining balance. A payment on payoff_at includes the interest and fee accrued for that installment.".to_owned(),
    ]);
}

pub(super) fn evaluate(
    operation: &str,
    input: &str,
    options: &Map<String, Value>,
) -> Result<Computation, MathError> {
    let currency = money(options)?;
    if operation == "compare" {
        let comparison: Compare = parse(input)?;
        if comparison.proposals.len() < 2 {
            return Err(MathError::Domain);
        }
        if comparison.proposals.len() > 6 {
            return Err(MathError::Limit);
        }
        let mut proposals = Vec::with_capacity(comparison.proposals.len());
        let mut costs = Vec::with_capacity(comparison.proposals.len());
        for request in comparison.proposals {
            if request.payoff_at.is_some() || request.page.is_some() || request.page_size.is_some()
            {
                return Err(MathError::InvalidInput);
            }
            let method = request.method.ok_or(MathError::InvalidInput)?;
            let schedule = Schedule::generate(&request, method, &currency, None)?;
            proposals.push(schedule.summary(&currency));
            costs.push(schedule.paid() - &schedule.principal);
        }
        let lowest = costs.iter().min().ok_or(MathError::Domain)?;
        let least_cost = costs
            .iter()
            .enumerate()
            .filter(|(_, cost)| *cost == lowest)
            .map(|(index, _)| index + 1)
            .collect::<Vec<_>>();
        let result = json!({"proposals": proposals, "least_total_cost_proposals": least_cost});
        let mut computation = finish(
            input,
            options,
            result,
            "loan_proposal_comparison",
            "nominal cost = total paid − principal; rank by nominal cost",
        )?;
        describe(&mut computation);
        computation.constraints.push("Proposal numbers follow input order, starting at 1. Nominal cost is undiscounted and depends on the amount financed and schedule.".to_owned());
        return Ok(computation);
    }
    let requested_method = match operation {
        "price" => Some(Method::Price),
        "sac" => Some(Method::Sac),
        "uniform" => Some(Method::Uniform),
        "bullet" => Some(Method::Bullet),
        "single_payment" => Some(Method::SinglePayment),
        "schedule" | "payoff" | "effective_cost" => None,
        _ => return Err(MathError::Unsupported),
    };
    let request: LoanInput = parse(input)?;
    let method = requested_method
        .or(request.method)
        .ok_or(MathError::InvalidInput)?;
    if request.method.is_some_and(|declared| declared != method)
        || (operation == "payoff") != request.payoff_at.is_some()
    {
        return Err(MathError::InvalidInput);
    }
    let schedule = Schedule::generate(&request, method, &currency, request.payoff_at)?;
    let page = request.page.unwrap_or(1);
    let size = request.page_size.unwrap_or(MAX_PAGE_SIZE);
    let mut result = schedule.result(&currency, page, size)?;
    let (algorithm, formula, exact) = if operation == "effective_cost" {
        let (rate, exact) = schedule.effective_rate()?;
        result["effective_cost"] = json!(display(&rate, 16));
        result["cost_kind"] = json!("economic_estimate");
        result["day_count"] = json!("act_365f");
        (
            "annual_effective_borrowing_cost",
            "net disbursement = Σ payment_t / (1+i)^(calendar_days_t/365)",
            exact,
        )
    } else if operation == "payoff" {
        let row = schedule.rows.last().ok_or(MathError::Domain)?;
        result["payoff"] = row.json(&currency);
        result["requested_payoff_period"] = json!(request.payoff_at);
        (
            "projected_loan_payoff",
            "payoff = balance at start of installment + interest + fee",
            true,
        )
    } else {
        ("loan_amortization_schedule", method.formula(), true)
    };
    let mut computation = finish(input, options, result, algorithm, formula)?;
    describe(&mut computation);
    computation
        .variables
        .insert("loan_method".to_owned(), method.as_str().to_owned());
    computation.variables.insert(
        "rounding_scope".to_owned(),
        request.rounding_scope.as_str().to_owned(),
    );
    if operation == "effective_cost" {
        computation.constraints.push("Economic estimate only. It uses contractual projected payments, deducts the upfront fee at disbursement and discounts by Actual/365 Fixed. Regulatory CET is outside this calculation.".to_owned());
        if !exact {
            computation.exactness = Exactness::Approximate;
            computation.precision = Some(320);
            computation.tolerance = Some("0.000000000001".to_owned());
            computation.constraints.push("The dated rate uses a numerical sign bracket of width at most 1e−12. No certified numeric error bound is asserted.".to_owned());
        }
    }
    Ok(computation)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn example() -> Value {
        json!({"principal":"1000","rate":"0.01","periods":3,"start_date":"2027-01-31"})
    }

    fn run(operation: &str, request: &Value) -> (Value, Computation) {
        let result = evaluate(operation, &request.to_string(), &Map::new()).unwrap();
        (serde_json::from_str(&result.result).unwrap(), result)
    }

    #[test]
    fn price_and_sac_follow_contractual_rates_and_month_anchors() {
        let (price, _) = run("price", &example());
        assert_eq!(price["rows"][0]["payment"], "340.02");
        assert_eq!(price["rows"][1]["payment"], "340.02");
        assert_eq!(price["summary"]["total_paid"], "1020.07");
        assert_eq!(price["rows"][0]["date"], "2027-02-28");
        assert_eq!(price["rows"][1]["date"], "2027-03-31");
        let (sac, _) = run("sac", &example());
        assert_eq!(sac["rows"][0]["payment"], "343.33");
        assert_eq!(sac["rows"][1]["payment"], "340.00");
        assert_eq!(sac["summary"]["total_paid"], "1020.00");
        let mut zero = example();
        zero["rate"] = json!("0");
        let (zero, _) = run("price", &zero);
        assert_eq!(zero["summary"]["total_paid"], "1000.00");
        let (single, _) = run("single_payment", &example());
        assert_eq!(single["rows"][0]["payment"], "0.00");
        assert_eq!(single["rows"][1]["payment"], "0.00");
        assert_eq!(single["rows"][2]["payment"], "1030.30");
    }

    #[test]
    fn per_row_ledger_reconciles_capitalization_fees_and_extra_principal() {
        let mut request = example();
        request["periods"] = json!(5);
        request["grace"] = json!("capitalize");
        request["grace_periods"] = json!(1);
        request["extra"] = json!([{"period":2,"amount":"107.415"}]);
        request["fees"] = json!([{"period":3,"amount":"14.125"}]);
        request["rates"] = json!([{"period":3,"rate":"0.02"}]);
        request["upfront_fee"] = json!("10.315");
        request["rounding_scope"] = json!("per_row");
        request["extra_policy"] = json!("reduce_payment");
        let (result, _) = run("price", &request);
        assert_eq!(result["rows"][0]["capitalized"], "10.00");
        assert_eq!(result["rows"][0]["payment"], "0.00");
        assert_eq!(result["rows"][1]["extra"], "107.42");
        assert_eq!(result["rows"][2]["fees"], "14.12");
        assert_eq!(result["summary"]["balance_end"], "0.00");
        let mut paid = decimal(result["summary"]["upfront_fee"].as_str().unwrap()).unwrap();
        for row in result["rows"].as_array().unwrap() {
            let get = |key: &str| decimal(row[key].as_str().unwrap()).unwrap();
            assert_eq!(
                get("balance_start") + get("capitalized") - get("amortization") - get("extra"),
                get("balance_end")
            );
            assert_eq!(
                get("interest") - get("capitalized")
                    + get("amortization")
                    + get("extra")
                    + get("fees"),
                get("payment")
            );
            paid += get("payment");
        }
        assert_eq!(
            paid,
            decimal(result["summary"]["total_paid"].as_str().unwrap()).unwrap()
        );
    }

    #[test]
    fn prepayment_variants_and_cost_use_actual_cash_flows() {
        let mut request = example();
        request["method"] = json!("sac");
        request["periods"] = json!(6);
        request["extra"] = json!([{"period":1,"amount":"470"}]);
        let (reduce_term, _) = run("schedule", &request);
        request["extra_policy"] = json!("reduce_payment");
        let (reduce_payment, _) = run("schedule", &request);
        assert_eq!(reduce_term["summary"]["actual_periods"], 4);
        assert_eq!(reduce_payment["summary"]["actual_periods"], 6);
        assert!(
            reduce_term["summary"]["total_cost"]
                .as_str()
                .unwrap()
                .parse::<f64>()
                .unwrap()
                < reduce_payment["summary"]["total_cost"]
                    .as_str()
                    .unwrap()
                    .parse::<f64>()
                    .unwrap()
        );
        request["payoff_at"] = json!(2);
        let (payoff, _) = run("payoff", &request);
        assert_eq!(payoff["payoff"]["period"], 2);
        assert_eq!(payoff["payoff"]["balance_end"], "0.00");
        let mut one = example();
        one["method"] = json!("bullet");
        one["periods"] = json!(1);
        one["first_date"] = json!("2028-01-31");
        one["upfront_fee"] = json!("10");
        let (cost, proof) = run("effective_cost", &one);
        let annual = cost["effective_cost"]
            .as_str()
            .unwrap()
            .parse::<f64>()
            .unwrap();
        assert!((annual - (1010.0 / 990.0 - 1.0)).abs() < 1e-12);
        assert_eq!(cost["cost_kind"], "economic_estimate");
        assert_eq!(proof.exactness, Exactness::Approximate);
    }
}
