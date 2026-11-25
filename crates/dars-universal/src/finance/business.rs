use super::{Money, Rational, decimal, display, finish, money, number, parse};
use crate::{Computation, MathError};
use num_traits::{Signed, Zero};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;

const RATE_PLACES: u32 = 12;
const MAX_PERIODS: u16 = 120;
const MAX_PAGE_SIZE: u16 = 40;
const MAX_ROW_BYTES: usize = 24_000;

pub(super) fn evaluate(
    operation: &str,
    input: &str,
    options: &Map<String, Value>,
) -> Result<Computation, MathError> {
    let currency = money(options)?;
    let (mut result, method, formula, conditions) = match operation {
        "price" => (
            price(parse(input)?, &currency)?,
            "unit_price_and_contribution",
            "P=C(1+markup) or C/(1-margin); contribution=P(1-sales_cost_rate)-C",
            vec!["Gross margin is divided by selling price. Markup is divided by unit cost."],
        ),
        "margins" => (
            margins(parse(input)?, &currency)?,
            "accrual_profit_waterfall",
            "gross=R-COGS; contribution=R-variable_costs; net=EBIT-net_finance_cost-income_tax",
            vec![
                "Assign each expense once. Depreciation excludes amounts already included in COGS.",
                "Margins use revenue as their denominator. Net finance cost may be negative.",
            ],
        ),
        "break_even" => (
            break_even(parse(input)?, &currency)?,
            "single_product_break_even",
            "units=fixed/(unit_price-variable_unit_cost); sales=units*unit_price",
            vec![
                "Accounting fixed costs include noncash charges. Cash fixed costs exclude them and include the specified fixed cash outlays.",
                "Whole units round upward before pricing. Nonpositive unit contribution cannot fund positive fixed costs.",
            ],
        ),
        "ratios" => (
            ratios(parse(input)?, &currency)?,
            "matched_period_business_ratios",
            "ROA=net_profit/average_assets; ROE=net_profit/average_equity; ROIC=NOPAT/average_invested_capital",
            vec![
                "Quick ratio excludes inventory and prepaid expenses. Leverage is total liabilities divided by total assets.",
                "ROE is undefined with a nonpositive equity balance at either endpoint. Profit and balances must reflect the same entity and period.",
            ],
        ),
        "ebitda" => (
            ebitda(parse(input)?, &currency)?,
            "cvm_156_unadjusted_reconciliation",
            "EBIT=net_income+income_tax+net_finance_cost; EBITDA=EBIT+depreciation_amortization_depletion",
            vec![
                "Reconciliation follows CVM Resolution 156 article 3 using supplied statement figures. No discretionary adjustments are made.",
                "Include depreciation, amortization and depletion together. EBITDA is an accrual measure distinct from cash flow.",
            ],
        ),
        "cycle" => (
            cycle(parse(input)?)?,
            "matched_period_cash_conversion_cycle",
            "DIO=days*inventory/COGS; DSO=days*receivables/credit_sales; DPO=days*payables/credit_purchases; CCC=DIO+DSO-DPO",
            vec![
                "All balances are averages. Denominators and day count cover the same period. Credit purchases are supplied directly.",
            ],
        ),
        "plan" => (
            plan(parse(input)?, &currency)?,
            "periodic_accrual_and_cash_budget",
            "profit=earned_revenue-cost-expenses; cash_close=cash_open+receipts-payments; NPV=-investment+sum(net_cash/(1+rate)^t)",
            vec![
                "Base amounts apply in period 1. Growth compounds after each period. Planned overrides affect only their selected period.",
                "Cash receipts and payments are independent assumptions. The initial investment is a period-zero cash outflow. Realized figures do not alter forecasts.",
                "Sensitivity changes the revenue growth assumption alone. Viability uses the sign of net present value. The minimum cash includes the outlay at period zero.",
            ],
        ),
        _ => return Err(MathError::Unsupported),
    };
    let object = result.as_object_mut().ok_or(MathError::InvalidInput)?;
    object.insert("currency".into(), json!(currency.code));
    object.insert("currency_scale".into(), json!(currency.scale));
    object.insert("ratio_display_places".into(), json!(RATE_PLACES));
    let mut computation = finish(input, options, result, method, formula)?;
    computation
        .constraints
        .extend(conditions.into_iter().map(str::to_owned));
    computation.constraints.push(
        "Exact rational arithmetic before presentation. Money uses the selected currency rounding; ratios and days use half-even display precision.".into(),
    );
    Ok(computation)
}

fn zero_text() -> String {
    "0".into()
}

fn nonnegative(text: &str) -> Result<Rational, MathError> {
    let value = decimal(text)?;
    if value.is_negative() {
        return Err(MathError::Domain);
    }
    Ok(value)
}

fn ratio(value: &Rational, divisor: &Rational) -> Option<String> {
    divisor
        .is_positive()
        .then(|| display(&(value / divisor), RATE_PLACES))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PriceInput {
    unit_cost: String,
    markup: Option<String>,
    margin: Option<String>,
    selling_price: Option<String>,
    #[serde(default = "zero_text")]
    sales_cost_rate: String,
    #[serde(default)]
    quote_to_minor: bool,
}

fn price(input: PriceInput, money: &Money) -> Result<Value, MathError> {
    let cost = nonnegative(&input.unit_cost)?;
    let sales_cost = nonnegative(&input.sales_cost_rate)?;
    let one = number(1);
    if sales_cost >= one {
        return Err(MathError::Domain);
    }
    let (proposed, basis) = match (
        input.markup.as_deref(),
        input.margin.as_deref(),
        input.selling_price.as_deref(),
    ) {
        (Some(markup), None, None) => (&cost * (&one + decimal(markup)?), "markup_on_cost"),
        (None, Some(margin), None) => {
            let denominator = &one - decimal(margin)?;
            if !denominator.is_positive() || cost.is_zero() {
                return Err(MathError::Domain);
            }
            (&cost / denominator, "gross_margin_on_revenue")
        }
        (None, None, Some(price)) => (nonnegative(price)?, "entered_price"),
        _ => return Err(MathError::InvalidInput),
    };
    if !proposed.is_positive() {
        return Err(MathError::Domain);
    }
    let price = if input.quote_to_minor {
        money.round(&proposed)
    } else {
        proposed.clone()
    };
    if !price.is_positive() {
        return Err(MathError::Domain);
    }
    let unit_gross_profit = &price - &cost;
    let variable_sales_cost = &price * &sales_cost;
    let contribution = &unit_gross_profit - &variable_sales_cost;
    Ok(json!({
        "basis": basis, "unit_cost": money.format(&cost), "price": money.format(&price),
        "price_exact": price.to_string(), "unrounded_price_exact": proposed.to_string(),
        "quote_to_minor": input.quote_to_minor,
        "gross_profit": money.format(&unit_gross_profit), "variable_sales_cost": money.format(&variable_sales_cost),
        "margin": ratio(&unit_gross_profit, &price), "markup": ratio(&unit_gross_profit, &cost),
        "contribution": money.format(&contribution), "contribution_margin": ratio(&contribution, &price),
        "markup_undefined": cost.is_zero(),
    }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MarginInput {
    revenue: String,
    cogs: String,
    variable_cogs: Option<String>,
    #[serde(default = "zero_text")]
    variable_expenses: String,
    #[serde(default = "zero_text")]
    fixed_expenses: String,
    #[serde(default = "zero_text")]
    depreciation: String,
    #[serde(default = "zero_text")]
    net_finance_cost: String,
    #[serde(default = "zero_text")]
    income_tax: String,
}

fn margins(input: MarginInput, money: &Money) -> Result<Value, MathError> {
    let revenue = nonnegative(&input.revenue)?;
    let cogs = nonnegative(&input.cogs)?;
    let variable_cogs = match input.variable_cogs {
        Some(value) => nonnegative(&value)?,
        None => cogs.clone(),
    };
    if variable_cogs > cogs {
        return Err(MathError::Domain);
    }
    let variable_expenses = nonnegative(&input.variable_expenses)?;
    let fixed_expenses = nonnegative(&input.fixed_expenses)?;
    let depreciation = nonnegative(&input.depreciation)?;
    let net_finance_cost = decimal(&input.net_finance_cost)?;
    let income_tax = decimal(&input.income_tax)?;
    let gross_profit = &revenue - &cogs;
    let contribution = &revenue - variable_cogs - &variable_expenses;
    let operating_profit = &gross_profit - variable_expenses - fixed_expenses - &depreciation;
    let net_profit = &operating_profit - net_finance_cost - income_tax;
    let ebitda = &operating_profit + depreciation;
    Ok(json!({
        "revenue": money.format(&revenue), "gross_profit": money.format(&gross_profit),
        "contribution": money.format(&contribution), "operating_profit": money.format(&operating_profit),
        "net_profit": money.format(&net_profit), "ebit": money.format(&operating_profit),
        "ebitda": money.format(&ebitda), "gross_margin": ratio(&gross_profit, &revenue),
        "contribution_margin": ratio(&contribution, &revenue), "operating_margin": ratio(&operating_profit, &revenue),
        "net_margin": ratio(&net_profit, &revenue), "ebitda_margin": ratio(&ebitda, &revenue),
        "margin_undefined": revenue.is_zero(),
    }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BreakEvenInput {
    unit_price: String,
    variable_unit_cost: String,
    fixed_accounting: String,
    #[serde(default = "zero_text")]
    non_cash_fixed: String,
    #[serde(default = "zero_text")]
    fixed_cash_extra: String,
}

fn break_even(input: BreakEvenInput, money: &Money) -> Result<Value, MathError> {
    let price = nonnegative(&input.unit_price)?;
    let contribution = &price - nonnegative(&input.variable_unit_cost)?;
    let accounting_fixed = nonnegative(&input.fixed_accounting)?;
    let non_cash = nonnegative(&input.non_cash_fixed)?;
    if !price.is_positive() || non_cash > accounting_fixed {
        return Err(MathError::Domain);
    }
    let cash_fixed = &accounting_fixed - non_cash + nonnegative(&input.fixed_cash_extra)?;
    let threshold = |fixed: &Rational| {
        if !contribution.is_positive() && !fixed.is_zero() {
            return json!({"status":"unreachable_positive_fixed_cost","units":null,"whole_units":null,"sales":null,"whole_sales":null});
        }
        let units = if fixed.is_zero() {
            number(0)
        } else {
            fixed / &contribution
        };
        let whole = units.ceil();
        let status = if !contribution.is_positive() {
            "zero_volume_only_or_no_recovery"
        } else {
            "reachable"
        };
        json!({"status":status,"units":display(&units,RATE_PLACES),"units_exact":units.to_string(),
            "whole_units":whole.to_integer().to_string(),"sales":money.format(&(&units*&price)),
            "whole_sales":money.format(&(whole*&price))})
    };
    Ok(
        json!({"unit_contribution":money.format(&contribution),"accounting_fixed":money.format(&accounting_fixed),
        "cash_fixed":money.format(&cash_fixed),"accounting":threshold(&accounting_fixed),"financial":threshold(&cash_fixed)}),
    )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RatiosInput {
    net_profit: Option<String>,
    initial_assets: Option<String>,
    final_assets: Option<String>,
    initial_equity: Option<String>,
    final_equity: Option<String>,
    nopat: Option<String>,
    average_invested_capital: Option<String>,
    current_assets: Option<String>,
    current_liabilities: Option<String>,
    inventory: Option<String>,
    prepaid: Option<String>,
    total_liabilities: Option<String>,
    total_assets: Option<String>,
    investment_cost: Option<String>,
    investment_proceeds: Option<String>,
}

fn amount(value: Option<String>, signed: bool) -> Result<Option<Rational>, MathError> {
    value
        .as_deref()
        .map(|text| {
            if signed {
                decimal(text)
            } else {
                nonnegative(text)
            }
        })
        .transpose()
}

fn average(left: Option<Rational>, right: Option<Rational>) -> Option<Rational> {
    left.zip(right)
        .map(|(left, right)| (left + right) / number(2))
}

fn set_ratio(
    result: &mut Map<String, Value>,
    undefined: &mut Map<String, Value>,
    name: &str,
    numerator: Option<&Rational>,
    denominator: Option<&Rational>,
    invalid_base: Option<&str>,
) {
    let (value, reason) = match (numerator, denominator, invalid_base) {
        (Some(_), Some(_), Some(reason)) => (None, Some(reason)),
        (Some(top), Some(bottom), None) => (
            ratio(top, bottom),
            (!bottom.is_positive()).then_some("nonpositive_denominator"),
        ),
        _ => (None, Some("missing_inputs")),
    };
    result.insert(name.into(), json!(value));
    if let Some(reason) = reason {
        undefined.insert(name.into(), json!(reason));
    }
}

fn ratios(input: RatiosInput, money: &Money) -> Result<Value, MathError> {
    let net_profit = amount(input.net_profit, true)?;
    let average_assets = average(
        amount(input.initial_assets, false)?,
        amount(input.final_assets, false)?,
    );
    let initial_equity = amount(input.initial_equity, true)?;
    let final_equity = amount(input.final_equity, true)?;
    let equity_invalid = initial_equity
        .as_ref()
        .zip(final_equity.as_ref())
        .is_some_and(|(left, right)| !left.is_positive() || !right.is_positive());
    let average_equity = average(initial_equity, final_equity);
    let nopat = amount(input.nopat, true)?;
    let average_invested = amount(input.average_invested_capital, true)?;
    let current_assets = amount(input.current_assets, false)?;
    let current_liabilities = amount(input.current_liabilities, false)?;
    let inventory = amount(input.inventory, false)?;
    let prepaid = amount(input.prepaid, false)?;
    let quick_assets = current_assets
        .as_ref()
        .zip(inventory.as_ref())
        .zip(prepaid.as_ref())
        .map(|((assets, inventory), prepaid)| assets - inventory - prepaid);
    if quick_assets.as_ref().is_some_and(Signed::is_negative) {
        return Err(MathError::Domain);
    }
    let total_liabilities = amount(input.total_liabilities, false)?;
    let total_assets = amount(input.total_assets, false)?;
    let investment_cost = amount(input.investment_cost, false)?;
    let investment_proceeds = amount(input.investment_proceeds, true)?;
    let profit = investment_proceeds
        .as_ref()
        .zip(investment_cost.as_ref())
        .map(|(proceeds, cost)| proceeds - cost);
    let mut output = Map::new();
    let mut undefined = Map::new();
    for (name, numerator, denominator, invalid) in [
        ("roi", profit.as_ref(), investment_cost.as_ref(), None),
        (
            "roe",
            net_profit.as_ref(),
            average_equity.as_ref(),
            equity_invalid.then_some("nonpositive_endpoint_equity"),
        ),
        ("roa", net_profit.as_ref(), average_assets.as_ref(), None),
        ("roic", nopat.as_ref(), average_invested.as_ref(), None),
        (
            "current_ratio",
            current_assets.as_ref(),
            current_liabilities.as_ref(),
            None,
        ),
        (
            "quick_ratio",
            quick_assets.as_ref(),
            current_liabilities.as_ref(),
            None,
        ),
        (
            "liabilities_to_assets",
            total_liabilities.as_ref(),
            total_assets.as_ref(),
            None,
        ),
    ] {
        set_ratio(
            &mut output,
            &mut undefined,
            name,
            numerator,
            denominator,
            invalid,
        );
    }
    let working_capital = current_assets
        .as_ref()
        .zip(current_liabilities.as_ref())
        .map(|(assets, liabilities)| money.format(&(assets - liabilities)));
    if working_capital.is_none() {
        undefined.insert("working_capital".into(), json!("missing_inputs"));
    }
    if undefined.values().all(|value| value == "missing_inputs") && undefined.len() == 8 {
        return Err(MathError::InvalidInput);
    }
    output.insert("working_capital".into(), json!(working_capital));
    output.insert("undefined".into(), Value::Object(undefined));
    Ok(Value::Object(output))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EbitdaInput {
    net_income: String,
    income_tax: String,
    net_finance_cost: String,
    depreciation: String,
    revenue: Option<String>,
}

fn ebitda(input: EbitdaInput, money: &Money) -> Result<Value, MathError> {
    let net_income = decimal(&input.net_income)?;
    let income_tax = decimal(&input.income_tax)?;
    let finance_cost = decimal(&input.net_finance_cost)?;
    let depreciation = nonnegative(&input.depreciation)?;
    let ebit = &net_income + &income_tax + &finance_cost;
    let ebitda = &ebit + &depreciation;
    let revenue = amount(input.revenue, false)?;
    Ok(
        json!({ "net_income":money.format(&net_income),"income_tax":money.format(&income_tax),
        "net_finance_cost":money.format(&finance_cost),"depreciation_amortization_depletion":money.format(&depreciation),
        "ebit":money.format(&ebit),"ebitda":money.format(&ebitda),
        "ebit_margin":revenue.as_ref().and_then(|value|ratio(&ebit,value)),
        "ebitda_margin":revenue.as_ref().and_then(|value|ratio(&ebitda,value)),
        "convention":"cvm_156_article_3_unadjusted" }),
    )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CycleInput {
    days: u16,
    average_inventory: String,
    cogs: String,
    average_receivables: String,
    credit_sales: String,
    average_payables: String,
    credit_purchases: String,
}

fn cycle(input: CycleInput) -> Result<Value, MathError> {
    if !(1..=3660).contains(&input.days) {
        return Err(MathError::Domain);
    }
    let days = number(i64::from(input.days));
    let compute = |balance: &str, volume: &str| -> Result<_, MathError> {
        let balance = nonnegative(balance)?;
        let volume = nonnegative(volume)?;
        Ok(volume.is_positive().then(|| &days * balance / volume))
    };
    let dio = compute(&input.average_inventory, &input.cogs)?;
    let dso = compute(&input.average_receivables, &input.credit_sales)?;
    let dpo = compute(&input.average_payables, &input.credit_purchases)?;
    let operating = dio
        .as_ref()
        .zip(dso.as_ref())
        .map(|(inventory, receivable)| inventory + receivable);
    let financial = operating
        .as_ref()
        .zip(dpo.as_ref())
        .map(|(operating, payable)| operating - payable);
    let show = |value: Option<Rational>| value.map(|value| display(&value, RATE_PLACES));
    let undefined = [
        ("inventory_days", &dio),
        ("receivables_days", &dso),
        ("payables_days", &dpo),
        ("operating_cycle_days", &operating),
        ("financial_cycle_days", &financial),
    ]
    .into_iter()
    .filter_map(|(name, value)| value.is_none().then_some(name))
    .collect::<Vec<_>>();
    Ok(
        json!({"period_days":input.days,"inventory_days":show(dio),"receivables_days":show(dso),
        "payables_days":show(dpo),"operating_cycle_days":show(operating),"financial_cycle_days":show(financial),
        "undefined_due_to_zero_volume":undefined}),
    )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PlanInput {
    periods: u16,
    revenue: String,
    cost: String,
    expenses: String,
    cash_receipts: String,
    cash_payments: String,
    #[serde(default = "zero_text")]
    revenue_growth: String,
    #[serde(default = "zero_text")]
    cost_growth: String,
    #[serde(default = "zero_text")]
    expense_growth: String,
    #[serde(default = "zero_text")]
    receipt_growth: String,
    #[serde(default = "zero_text")]
    payment_growth: String,
    #[serde(default = "zero_text")]
    initial_cash: String,
    #[serde(default = "zero_text")]
    initial_investment: String,
    #[serde(default = "zero_text")]
    discount_rate: String,
    sensitivity_step: Option<String>,
    #[serde(default)]
    overrides: Vec<PlanOverride>,
    #[serde(default = "first_page")]
    page_start: u16,
    #[serde(default = "normal_page")]
    page_size: u16,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PlanOverride {
    period: u16,
    revenue: Option<String>,
    cost: Option<String>,
    expenses: Option<String>,
    cash_receipts: Option<String>,
    cash_payments: Option<String>,
    realized_revenue: Option<String>,
    realized_cost: Option<String>,
    realized_expenses: Option<String>,
    realized_cash_receipts: Option<String>,
    realized_cash_payments: Option<String>,
}

fn first_page() -> u16 {
    1
}
fn normal_page() -> u16 {
    24
}

struct Growth {
    trend: Rational,
    factor: Rational,
}

impl Growth {
    fn new(value: &str, rate: &str) -> Result<Self, MathError> {
        Ok(Self {
            trend: nonnegative(value)?,
            factor: growth_factor(rate)?,
        })
    }

    fn next(&mut self, override_value: Option<&str>) -> Result<Rational, MathError> {
        let value = match override_value {
            Some(value) => nonnegative(value)?,
            None => self.trend.clone(),
        };
        self.trend *= &self.factor;
        Ok(value)
    }
}

fn growth_factor(rate: &str) -> Result<Rational, MathError> {
    let rate = decimal(rate)?;
    if rate < number(-1) || rate > number(10) {
        return Err(MathError::Domain);
    }
    Ok(number(1) + rate)
}

fn realized_and_variance(
    realized: Option<&str>,
    projected: &Rational,
    money: &Money,
) -> Result<Option<(String, String)>, MathError> {
    realized
        .map(|value| {
            nonnegative(value)
                .map(|value| (money.format(&value), money.format(&(value - projected))))
        })
        .transpose()
}

fn plan(input: PlanInput, money: &Money) -> Result<Value, MathError> {
    if !(1..=MAX_PERIODS).contains(&input.periods)
        || !(1..=MAX_PAGE_SIZE).contains(&input.page_size)
        || !(1..=input.periods).contains(&input.page_start)
    {
        return Err(MathError::Limit);
    }
    let mut overrides = BTreeMap::new();
    for row in &input.overrides {
        if !(1..=input.periods).contains(&row.period) || overrides.insert(row.period, row).is_some()
        {
            return Err(MathError::InvalidInput);
        }
    }
    let mut revenue = Growth::new(&input.revenue, &input.revenue_growth)?;
    let mut cost = Growth::new(&input.cost, &input.cost_growth)?;
    let mut expenses = Growth::new(&input.expenses, &input.expense_growth)?;
    let mut receipts = Growth::new(&input.cash_receipts, &input.receipt_growth)?;
    let mut payments = Growth::new(&input.cash_payments, &input.payment_growth)?;
    let investment = nonnegative(&input.initial_investment)?;
    let discount_factor = growth_factor(&input.discount_rate)?;
    // A bounded discount floor keeps exact denominators and displayed projections useful.
    if discount_factor < number(1) / number(2) {
        return Err(MathError::Domain);
    }
    let mut discount = number(1);
    let mut cash = decimal(&input.initial_cash)? - &investment;
    let mut minimum_cash = cash.clone();
    let mut net_present = -&investment;
    let mut earned = number(0);
    let mut total_cost = number(0);
    let mut total_expenses = number(0);
    let mut received = number(0);
    let mut paid = number(0);
    let mut rows = Vec::new();
    let mut row_bytes = 0;
    let mut next_page = None;
    let step = input
        .sensitivity_step
        .as_deref()
        .map(nonnegative)
        .transpose()?;
    let mut sensitivity = if let Some(step) = step {
        let low = &revenue.factor - &step;
        let high = &revenue.factor + &step;
        if low.is_negative() || high > number(11) {
            return Err(MathError::Domain);
        }
        Some((
            [low, high],
            [revenue.trend.clone(), revenue.trend.clone()],
            [number(0), number(0)],
        ))
    } else {
        None
    };

    for period in 1..=input.periods {
        let choices = overrides.get(&period);
        let sales = revenue.next(choices.and_then(|row| row.revenue.as_deref()))?;
        let product_cost = cost.next(choices.and_then(|row| row.cost.as_deref()))?;
        let expenses = expenses.next(choices.and_then(|row| row.expenses.as_deref()))?;
        let cash_in = receipts.next(choices.and_then(|row| row.cash_receipts.as_deref()))?;
        let cash_out = payments.next(choices.and_then(|row| row.cash_payments.as_deref()))?;
        let profit = &sales - &product_cost - &expenses;
        let flow = &cash_in - &cash_out;
        cash += &flow;
        if cash < minimum_cash {
            minimum_cash = cash.clone();
        }
        discount *= &discount_factor;
        net_present += &flow / &discount;
        earned += &sales;
        total_cost += &product_cost;
        total_expenses += &expenses;
        received += &cash_in;
        paid += &cash_out;
        if let Some((factors, trends, totals)) = &mut sensitivity {
            for index in 0..2 {
                totals[index] += if choices.is_some_and(|row| row.revenue.is_some()) {
                    &sales
                } else {
                    &trends[index]
                };
                trends[index] *= &factors[index];
            }
        }
        let mut actual = Map::new();
        let mut variances = Map::new();
        if let Some(choices) = choices {
            for (key, value, projected) in [
                ("revenue", &choices.realized_revenue, &sales),
                ("cost", &choices.realized_cost, &product_cost),
                ("expenses", &choices.realized_expenses, &expenses),
                ("cash_receipts", &choices.realized_cash_receipts, &cash_in),
                ("cash_payments", &choices.realized_cash_payments, &cash_out),
            ] {
                if let Some((realized, delta)) =
                    realized_and_variance(value.as_deref(), projected, money)?
                {
                    actual.insert(key.into(), json!(realized));
                    variances.insert(key.into(), json!(delta));
                }
            }
        }
        if period >= input.page_start && next_page.is_none() {
            if rows.len() >= usize::from(input.page_size) {
                next_page = Some(period);
                continue;
            }
            let row = json!({"period":period,"revenue":money.format(&sales),"cost":money.format(&product_cost),
                "expenses":money.format(&expenses),"profit":money.format(&profit),"cash_receipts":money.format(&cash_in),
                "cash_payments":money.format(&cash_out),"net_cash":money.format(&flow),"cash_close":money.format(&cash),
                "realized":actual,"realized_minus_projection":variances});
            let size = row.to_string().len() + 1;
            if !rows.is_empty() && row_bytes + size > MAX_ROW_BYTES {
                next_page = Some(period);
            } else {
                row_bytes += size;
                rows.push(row);
            }
        }
    }
    let total_profit = &earned - &total_cost - &total_expenses;
    let sensitivity = sensitivity.map(|(_, _, totals)| {
        json!({
            "lower_revenue_growth_profit":money.format(&(&totals[0]-&total_cost-&total_expenses)),
            "higher_revenue_growth_profit":money.format(&(&totals[1]-&total_cost-&total_expenses)),
        })
    });
    Ok(
        json!({"periods":input.periods,"page_start":input.page_start,
        "next_page":next_page,"rows":rows,"revenue":money.format(&earned),
        "cost":money.format(&total_cost),"expenses":money.format(&total_expenses),"profit":money.format(&total_profit),
        "cash_receipts":money.format(&received),"cash_payments":money.format(&paid),"cash_close":money.format(&cash),
        "minimum_cash":money.format(&minimum_cash),
        "net_present_value":money.format(&net_present),
        "npv_sign":if net_present.is_positive() {"positive"} else if net_present.is_negative() {"negative"} else {"zero"},
        "sensitivity":sensitivity,
        "variance_convention":"realized_minus_projected"}),
    )
}
