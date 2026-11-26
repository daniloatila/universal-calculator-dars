use super::{Money, Rational, decimal};
use crate::{Computation, Exactness};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::str::FromStr;
const CANONICAL_BITS: u64 = 16_384;
const CANONICAL_TEXT_BYTES: usize = 9_900;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum RateRecipe {
    Effective { periods_per_year: u16 },
    Nominal { periods_per_year: u16 },
}

pub(super) struct Metric {
    pub key: &'static str,
    pub semantic_id: &'static str,
    pub unit: &'static str,
    pub context: Map<String, Value>,
    pub required_context: &'static [&'static str],
    pub value: Option<Rational>,
    pub presentation: Option<String>,
    pub source: &'static str,
    pub exactness: Exactness,
    pub decimal_places: Option<u32>,
    pub rate: Option<RateRecipe>,
}

#[derive(Default)]
pub(super) struct RawMetrics {
    values: BTreeMap<&'static str, (Rational, Exactness)>,
    terminal_date: Option<String>,
    loan_dates: Option<(String, String)>,
}

impl RawMetrics {
    /// Collection is opt-in. Large fractions remain usable at the declared display precision.
    #[cfg(any(
        feature = "financial",
        feature = "investment",
        feature = "loans",
        feature = "business",
        test
    ))]
    pub(super) fn capture(
        sink: &mut Option<&mut Self>,
        exactness: Exactness,
        values: &[(&'static str, &Rational)],
    ) {
        if let Some(sink) = sink.as_deref_mut() {
            for (name, value) in values {
                if value.numer().bits() <= CANONICAL_BITS && value.denom().bits() <= CANONICAL_BITS
                {
                    sink.values.insert(name, ((*value).clone(), exactness));
                }
            }
        }
    }

    #[cfg(feature = "investment")]
    pub(super) fn terminal_date(&mut self, date: Option<jiff::civil::Date>) {
        self.terminal_date = date.map(|date| date.to_string());
    }

    #[cfg(feature = "loans")]
    pub(super) fn loan_payment_dates(
        &mut self,
        first: Option<jiff::civil::Date>,
        last: Option<jiff::civil::Date>,
    ) {
        self.loan_dates = first
            .zip(last)
            .map(|(first, last)| (first.to_string(), last.to_string()));
    }
}

type Context = Map<String, Value>;

#[derive(Clone, Copy)]
struct Definition {
    key: &'static str,
    id: &'static str,
    unit: &'static str,
    basis: &'static str,
    require: &'static [&'static str],
}

macro_rules! metric {
    ($key:literal, $id:literal, $unit:literal, $basis:literal, $require:expr) => {
        Definition {
            key: $key,
            id: $id,
            unit: $unit,
            basis: $basis,
            require: $require,
        }
    };
}

fn set(context: &mut Context, key: &str, value: impl Into<Value>) {
    context.insert(key.into(), value.into());
}

fn copy(context: &mut Context, key: &str, source: &Context, field: &str) {
    if let Some(value) = source.get(field).filter(|value| !value.is_null()) {
        set(context, key, value.clone());
    }
}

fn numeric(context: &mut Context, key: &str, source: &Context, field: &str, default: Option<&str>) {
    if let Some(value) = source
        .get(field)
        .and_then(Value::as_str)
        .or(default)
        .and_then(|text| decimal(text).ok())
    {
        set(context, key, value.to_string());
    }
}

fn canonical_rational(value: &str) -> Option<Rational> {
    // Only engine-produced strings are accepted here. Do not parse JS numbers as financial values.
    (value.len() <= CANONICAL_TEXT_BYTES)
        .then(|| Rational::from_str(value).ok())
        .flatten()
        .filter(|value| {
            value.numer().bits() <= CANONICAL_BITS && value.denom().bits() <= CANONICAL_BITS
        })
}

fn presentation(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) if number.is_i64() || number.is_u64() => Some(number.to_string()),
        _ => None,
    }
}

struct Catalog<'a> {
    metrics: Vec<Metric>,
    raw: &'a RawMetrics,
    currency: &'a Money,
    operation: &'a str,
    engine: &'a Computation,
}

impl Catalog<'_> {
    fn add(&mut self, definition: Definition, context: &Context, output: &Context) {
        self.add_at(definition, context, output, definition.key, None);
    }

    fn add_at(
        &mut self,
        definition: Definition,
        base_context: &Context,
        output: &Context,
        output_key: &'static str,
        recipe: Option<RateRecipe>,
    ) {
        let Some(entry) = output.get(output_key) else {
            return;
        };
        let mut context = base_context.clone();
        set(&mut context, "calculation_basis", definition.basis);
        let display = presentation(entry);
        let scale = display.as_ref().map(|text| {
            text.split_once('.')
                .map_or(0, |(_, decimals)| decimals.len() as u32)
        });
        let rounding = if definition.unit == "money" {
            self.engine
                .variables
                .get("rounding_policy")
                .map_or(self.currency.rounding.id(), String::as_str)
        } else {
            "half_even"
        };
        set(&mut context, "rounding_policy", rounding);

        let reported = display.as_deref().and_then(|text| {
            if text.contains('.') {
                super::bounded_decimal(text, 1024, 40).ok()
            } else {
                canonical_rational(text)
            }
        });
        let exact_text = output
            .get(&format!("{output_key}_exact"))
            .and_then(Value::as_str)
            .and_then(canonical_rational);
        let statutory = self.operation.starts_with("br_");
        let exact_integer = entry.is_number() && reported.is_some();
        let (value, exactness, source) =
            if let Some((value, exactness)) = self.raw.values.get(definition.key) {
                (Some(value.clone()), *exactness, "canonical")
            } else if let Some(value) = exact_text {
                (Some(value), Exactness::Exact, "canonical")
            } else if statutory && reported.is_some() {
                let source = if definition.unit == "money" {
                    "statutory_quantized"
                } else {
                    "canonical"
                };
                (reported, Exactness::Exact, source)
            } else if exact_integer {
                (reported, Exactness::Exact, "canonical")
            } else if let Some(value) = reported {
                (Some(value), Exactness::Approximate, "presentation_rounded")
            } else {
                (None, self.engine.exactness, "undefined")
            };
        self.metrics.push(Metric {
            key: definition.key,
            semantic_id: definition.id,
            unit: definition.unit,
            context,
            required_context: definition.require,
            value,
            presentation: display,
            exactness,
            source,
            decimal_places: scale,
            rate: recipe,
        });
    }

    fn add_all(&mut self, definitions: &[Definition], context: &Context, result: &Context) {
        for &definition in definitions {
            self.add(definition, context, result);
        }
    }
}

const HORIZON: &[&str] = &["periodicity", "horizon", "reference_date"];
const FLOW_HORIZON: &[&str] = &["periodicity", "horizon", "reference_date", "day_count"];
const FLOW_UNIT: &[&str] = &["periodicity", "day_count"];
const SETTLEMENT: &[&str] = &[
    "periodicity",
    "horizon",
    "reference_date",
    "principal_financed",
    "first_payment_date",
    "last_payment_date",
    "repayment_scope",
    "payment_periods",
    "rounding_scope",
    "settlement_rounding",
];

fn loan_context(input: &Context, summary: &Context, raw: &RawMetrics, currency: &Money) -> Context {
    let mut context = Context::new();
    let start = input
        .get("start_date")
        .and_then(Value::as_str)
        .unwrap_or_default();
    set(&mut context, "periodicity", "month");
    set(
        &mut context,
        "capitalization",
        "contractual_effective_rate_per_period",
    );
    set(&mut context, "purchasing_power", "nominal");
    set(&mut context, "reference_date", start);
    if let Some((first, last)) = &raw.loan_dates {
        set(&mut context, "first_payment_date", first.as_str());
        set(&mut context, "last_payment_date", last.as_str());
    }
    copy(&mut context, "horizon", summary, "contract_periods");
    copy(&mut context, "payment_periods", summary, "actual_periods");
    copy(&mut context, "method", summary, "method");
    copy(&mut context, "rounding_scope", summary, "rounding_scope");
    if let Some((principal, _)) = raw.values.get("principal") {
        set(&mut context, "principal_financed", principal.to_string());
    }
    let settlement = if summary.get("rounding_scope").and_then(Value::as_str) == Some("per_row") {
        currency.rounding.id()
    } else {
        "unrounded_ledger"
    };
    set(&mut context, "settlement_rounding", settlement);
    if let Some(payoff) = input.get("payoff_at").filter(|value| !value.is_null()) {
        set(&mut context, "repayment_scope", payoff.clone());
    } else {
        set(&mut context, "repayment_scope", "contractual_schedule");
    }
    for (key, default) in [("extra_policy", "reduce_term"), ("grace", "interest_only")] {
        set(
            &mut context,
            key,
            input.get(key).and_then(Value::as_str).unwrap_or(default),
        );
    }
    set(
        &mut context,
        "grace_periods",
        input
            .get("grace_periods")
            .and_then(Value::as_u64)
            .unwrap_or(0),
    );
    numeric(&mut context, "upfront_fee", input, "upfront_fee", Some("0"));
    for (key, target) in [
        ("fees", "scheduled_fee_count"),
        ("extra", "extra_payment_count"),
        ("rates", "rate_change_count"),
    ] {
        set(
            &mut context,
            target,
            input.get(key).and_then(Value::as_array).map_or(0, Vec::len),
        );
    }
    context
}

fn loans(catalog: &mut Catalog, input: &Context, result: &Context) {
    let Some(summary) = result.get("summary").and_then(Value::as_object) else {
        return;
    };
    let context = loan_context(input, summary, catalog.raw, catalog.currency);
    catalog.add_all(
        &[
            metric!(
                "principal",
                "loan_principal_financed",
                "money",
                "contract_principal",
                &[]
            ),
            metric!(
                "contract_periods",
                "loan_contract_month_count",
                "period",
                "stated_number_of_installments",
                &["periodicity"]
            ),
            metric!(
                "actual_periods",
                "loan_repayment_month_count",
                "period",
                "modeled_number_of_installments",
                &["periodicity"]
            ),
            metric!(
                "interest",
                "loan_nominal_interest",
                "money",
                "sum_of_interest_accrued",
                SETTLEMENT
            ),
            metric!(
                "amortization",
                "loan_principal_amortized",
                "money",
                "sum_of_scheduled_principal_payments",
                SETTLEMENT
            ),
            metric!(
                "fees",
                "loan_nominal_total_fees",
                "money",
                "upfront_and_installment_fees",
                SETTLEMENT
            ),
            metric!(
                "upfront_fee",
                "loan_upfront_fee",
                "money",
                "transaction_fee_at_disbursement",
                &["principal_financed", "reference_date"]
            ),
            metric!(
                "extra",
                "loan_extra_principal_payments",
                "money",
                "sum_of_extra_principal_payments",
                SETTLEMENT
            ),
            metric!(
                "total_paid",
                "loan_nominal_total_paid",
                "money",
                "undiscounted_installments_and_upfront_fee",
                SETTLEMENT
            ),
            metric!(
                "total_cost",
                "loan_nominal_total_cost",
                "money",
                "total_paid_less_principal",
                SETTLEMENT
            ),
            metric!(
                "capitalized",
                "loan_capitalized_interest",
                "money",
                "interest_incorporated_in_principal",
                SETTLEMENT
            ),
            metric!(
                "balance_end",
                "loan_end_balance",
                "money",
                "outstanding_loan_balance",
                SETTLEMENT
            ),
        ],
        &context,
        summary,
    );
    let mut cost = context;
    set(&mut cost, "periodicity", "year");
    set(&mut cost, "rate_nature", "effective");
    set(&mut cost, "capitalization", "discrete_compounding");
    set(&mut cost, "day_count", "act_365f");
    set(
        &mut cost,
        "gross_or_net",
        "net_disbursement_and_projected_fees",
    );
    catalog.add(
        metric!(
            "effective_cost",
            "loan_economic_effective_cost",
            "rate",
            "net_disbursement_and_dated_payments",
            &["periodicity", "day_count", "currency"]
        ),
        &cost,
        result,
    );
}

fn flow_context(input: &Context, engine: &Computation) -> Context {
    let mut context = Context::new();
    if let Some(dates) = input.get("dates").and_then(Value::as_array) {
        let mut dates = dates.iter().filter_map(Value::as_str).collect::<Vec<_>>();
        dates.sort_unstable();
        if let (Some(first), Some(last)) = (dates.first(), dates.last()) {
            set(&mut context, "reference_date", *first);
            set(&mut context, "horizon", *last);
        }
        set(&mut context, "periodicity", "year");
        if let Some(day_count) = engine.variables.get("day_count") {
            set(&mut context, "day_count", day_count.as_str());
        }
    } else {
        set(&mut context, "reference_date", "t0");
        set(&mut context, "day_count", "not_applicable");
        set(&mut context, "periodicity", "abstract_period");
        if let Some(flows) = input.get("flows").and_then(Value::as_array) {
            set(&mut context, "horizon", flows.len().saturating_sub(1));
        }
    }
    for key in ["rate", "finance_rate", "reinvest_rate"] {
        numeric(&mut context, key, input, key, None);
    }
    context
}

fn financial(catalog: &mut Catalog, input: &Context, result: &Context) {
    let mut context = Context::new();
    set(&mut context, "purchasing_power", "nominal");
    set(&mut context, "periodicity", "abstract_period");
    set(&mut context, "reference_date", "t0");
    copy(&mut context, "horizon", input, "periods");
    copy(&mut context, "payment_timing", input, "timing");
    copy(&mut context, "capitalization", input, "convention");
    numeric(&mut context, "rate", input, "rate", None);
    match catalog.operation {
        "simple_interest" | "compound_interest" => {
            set(
                &mut context,
                "capitalization",
                if catalog.operation == "simple_interest" {
                    "simple"
                } else {
                    "discrete_compounding"
                },
            );
            catalog.add_all(
                &[
                    metric!(
                        "amount",
                        "loan_or_deposit_final_value",
                        "money",
                        "principal_and_interest_at_horizon",
                        HORIZON
                    ),
                    metric!(
                        "interest",
                        "lump_sum_interest_earned",
                        "money",
                        "final_value_less_initial_principal",
                        HORIZON
                    ),
                ],
                &context,
                result,
            );
        }
        "present_value" => catalog.add(
            metric!(
                "amount",
                "lump_sum_present_value",
                "money",
                "discounted_terminal_cash_flow",
                HORIZON
            ),
            &context,
            result,
        ),
        "future_value" => catalog.add(
            metric!(
                "amount",
                "lump_sum_future_value",
                "money",
                "compounded_initial_cash_flow",
                HORIZON
            ),
            &context,
            result,
        ),
        "annuity_present_value" => catalog.add(
            metric!(
                "amount",
                "annuity_present_value",
                "money",
                "present_value_of_equal_payments",
                HORIZON
            ),
            &context,
            result,
        ),
        "annuity_future_value" => catalog.add(
            metric!(
                "amount",
                "annuity_future_value",
                "money",
                "future_value_of_equal_payments",
                HORIZON
            ),
            &context,
            result,
        ),
        "annuity_payment" => catalog.add(
            metric!(
                "payment",
                "annuity_level_payment",
                "money",
                "equal_payment_of_annuity",
                &["periodicity", "horizon", "payment_timing"]
            ),
            &context,
            result,
        ),
        "discount" => catalog.add_all(
            &[
                metric!(
                    "present",
                    "discounted_face_value",
                    "money",
                    "present_value_under_selected_discount_convention",
                    HORIZON
                ),
                metric!(
                    "discount",
                    "face_value_discount",
                    "money",
                    "face_value_less_present_value",
                    HORIZON
                ),
            ],
            &context,
            result,
        ),
        "periods" => catalog.add(
            metric!(
                "periods",
                "lump_sum_period_count",
                "period",
                "logarithmic_number_of_model_periods",
                &["periodicity"]
            ),
            &context,
            result,
        ),
        "rate" => {
            context.remove("periodicity");
            set(&mut context, "rate_nature", "effective");
            set(&mut context, "capitalization", "discrete_compounding");
            catalog.add(
                metric!(
                    "rate",
                    "financial_compounding_rate",
                    "rate",
                    "implied_effective_rate_per_unspecified_period",
                    &["periodicity", "rate_nature", "capitalization"]
                ),
                &context,
                result,
            );
        }
        "equivalent_rate" | "nominal_effective" => {
            set(&mut context, "capitalization", "discrete_compounding");
            let compounds = input
                .get("compounds")
                .and_then(Value::as_u64)
                .and_then(|value| u16::try_from(value).ok());
            let recipe = match (
                catalog.operation,
                input.get("direction").and_then(Value::as_str),
                compounds,
            ) {
                ("equivalent_rate", _, _) => input
                    .get("to_periods_per_year")
                    .and_then(Value::as_u64)
                    .and_then(|value| u16::try_from(value).ok())
                    .map(|periods_per_year| RateRecipe::Effective { periods_per_year }),
                (_, Some("nominal_to_effective"), Some(_)) => Some(RateRecipe::Effective {
                    periods_per_year: 1,
                }),
                (_, Some("effective_to_nominal"), Some(periods_per_year)) => {
                    Some(RateRecipe::Nominal { periods_per_year })
                }
                _ => None,
            };
            match recipe {
                Some(RateRecipe::Effective { periods_per_year }) => {
                    set(&mut context, "periodicity", periods_per_year);
                    set(&mut context, "rate_nature", "effective");
                }
                Some(RateRecipe::Nominal { periods_per_year }) => {
                    set(&mut context, "periodicity", 1u16);
                    set(&mut context, "rate_nature", "nominal");
                    set(&mut context, "compounds_per_year", periods_per_year);
                }
                None => {
                    context.remove("periodicity");
                }
            }
            copy(
                &mut context,
                "input_periods_per_year",
                input,
                "from_periods_per_year",
            );
            copy(&mut context, "input_compounds_per_year", input, "compounds");
            copy(&mut context, "conversion_direction", input, "direction");
            catalog.add_at(
                metric!(
                    "rate",
                    "financial_compounding_rate",
                    "rate",
                    "discrete_equivalent_compounding_rate",
                    &["periodicity", "rate_nature", "capitalization"]
                ),
                &context,
                result,
                "rate",
                recipe,
            );
        }
        "npv" | "mirr" | "payback" | "discounted_payback" | "profitability_index" => {
            let mut context = flow_context(input, catalog.engine);
            set(&mut context, "purchasing_power", "nominal");
            match catalog.operation {
                "npv" => catalog.add(
                    metric!(
                        "npv",
                        "discounted_cash_flow_npv",
                        "money",
                        "discounted_cash_flows_from_earliest_point",
                        FLOW_HORIZON
                    ),
                    &context,
                    result,
                ),
                "mirr" => {
                    if context.get("periodicity").and_then(Value::as_str) == Some("abstract_period")
                    {
                        context.remove("periodicity");
                    }
                    set(&mut context, "rate_nature", "effective");
                    set(&mut context, "capitalization", "discrete_compounding");
                    catalog.add(
                        metric!(
                            "mirr",
                            "modified_internal_return",
                            "rate",
                            "terminal_reinvestment_over_initial_financing",
                            FLOW_UNIT
                        ),
                        &context,
                        result,
                    );
                }
                "payback" => catalog.add(
                    metric!(
                        "payback",
                        "simple_cash_flow_payback",
                        "period",
                        "linear_cumulative_cash_flow_recovery",
                        FLOW_UNIT
                    ),
                    &context,
                    result,
                ),
                "discounted_payback" => catalog.add(
                    metric!(
                        "payback",
                        "discounted_cash_flow_payback",
                        "period",
                        "linear_discounted_cash_flow_recovery",
                        FLOW_UNIT
                    ),
                    &context,
                    result,
                ),
                _ => catalog.add(
                    metric!(
                        "profitability_index",
                        "discounted_cash_flow_profitability_index",
                        "ratio",
                        "present_receipts_over_present_outlays",
                        FLOW_HORIZON
                    ),
                    &context,
                    result,
                ),
            }
        }
        // IRR returns zero or more roots. Selecting one automatically changes the measure.
        _ => {}
    }
}

fn investment(catalog: &mut Catalog, input: &Context, result: &Context) {
    if catalog.operation != "project" {
        return;
    }
    let mut context = Context::new();
    copy(&mut context, "periodicity", result, "period_kind");
    copy(&mut context, "horizon", result, "elapsed_periods");
    set(
        &mut context,
        "reference_date",
        input
            .get("start_date")
            .and_then(Value::as_str)
            .unwrap_or("t0"),
    );
    copy(&mut context, "end_date_limit", input, "end_date");
    copy(&mut context, "product", result, "product");
    if let Some(policy) = result.get("policy").and_then(Value::as_object) {
        copy(&mut context, "capitalization", policy, "basis");
        copy(&mut context, "flow_timing", policy, "flow_timing");
        copy(&mut context, "reinvest", policy, "reinvest");
        copy(
            &mut context,
            "rate_reference_date",
            policy,
            "reference_date",
        );
        copy(&mut context, "valuation", policy, "valuation");
    }
    if context.get("periodicity").and_then(Value::as_str) == Some("business_day") {
        let mut holidays = input
            .get("holidays")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>();
        holidays.sort_unstable();
        set(&mut context, "day_count", "weekdays_and_supplied_holidays");
        // The evaluated terminal date is captured by the engine; holiday inputs remain in the replay.
        set(&mut context, "holiday_count", holidays.len());
    }
    if let Some(actual) = &catalog.raw.terminal_date {
        set(&mut context, "terminal_date", actual.as_str());
    } else if context.get("periodicity").and_then(Value::as_str) == Some("period") {
        set(&mut context, "terminal_date", "end_of_model_periods");
    }
    for key in [
        "initial",
        "contribution",
        "withdrawal",
        "inflation",
        "fee_rate",
        "fixed_fee",
        "tax_rate",
    ] {
        numeric(&mut context, key, input, key, None);
    }
    set(
        &mut context,
        "period_override_count",
        input
            .get("overrides")
            .and_then(Value::as_array)
            .map_or(0, Vec::len),
    );
    set(
        &mut context,
        "tax_rule",
        "manual_tax_on_positive_period_earnings",
    );
    let horizon: &[&str] = &["periodicity", "horizon", "reference_date", "terminal_date"];
    let performance: &[&str] = &[
        "periodicity",
        "horizon",
        "reference_date",
        "terminal_date",
        "flow_timing",
        "reinvest",
    ];
    let mut nominal = context.clone();
    set(&mut nominal, "purchasing_power", "nominal");
    let mut gross = nominal.clone();
    set(&mut gross, "gross_or_net", "gross_before_fees_and_taxes");
    set(&mut nominal, "gross_or_net", "net_after_fees_and_taxes");
    let mut real = nominal.clone();
    set(&mut real, "purchasing_power", "real_at_scenario_start");
    catalog.add_all(
        &[
            metric!(
                "final_balance",
                "investment_nominal_net_balance",
                "money",
                "projected_ending_balance",
                horizon
            ),
            metric!(
                "distributions",
                "investment_nominal_net_distributions",
                "money",
                "total_distributed_over_horizon",
                horizon
            ),
            metric!(
                "net_profit",
                "investment_nominal_net_profit",
                "money",
                "net_balance_and_flows_less_contributions",
                horizon
            ),
            metric!(
                "simple_net_return",
                "investment_accumulated_nominal_net_return",
                "rate",
                "nominal_net_profit_over_total_contributions_not_annualized",
                performance
            ),
            metric!(
                "fees",
                "investment_nominal_fees",
                "money",
                "scenario_fees_over_horizon",
                horizon
            ),
            metric!(
                "taxes",
                "investment_nominal_taxes",
                "money",
                "user_assumed_tax_over_horizon",
                horizon
            ),
        ],
        &nominal,
        result,
    );
    catalog.add_all(
        &[
            metric!(
                "gross_final_balance",
                "investment_nominal_gross_balance",
                "money",
                "projected_ending_balance_before_fees_and_taxes",
                horizon
            ),
            metric!(
                "gross_distributions",
                "investment_nominal_gross_distributions",
                "money",
                "total_distributed_before_fees_and_taxes",
                horizon
            ),
            metric!(
                "gross_profit",
                "investment_nominal_gross_profit",
                "money",
                "gross_balance_and_flows_less_contributions",
                horizon
            ),
            metric!(
                "simple_gross_return",
                "investment_accumulated_nominal_gross_return",
                "rate",
                "nominal_gross_profit_over_total_contributions_not_annualized",
                performance
            ),
        ],
        &gross,
        result,
    );
    catalog.add_all(
        &[
            metric!(
                "real_final_balance",
                "investment_real_net_balance",
                "money",
                "ending_balance_deflated_to_start",
                horizon
            ),
            metric!(
                "real_net_profit",
                "investment_real_net_profit",
                "money",
                "individual_cash_flows_deflated_to_start",
                horizon
            ),
            metric!(
                "simple_real_net_return",
                "investment_accumulated_real_net_return",
                "rate",
                "real_net_profit_over_deflated_contributions_not_annualized",
                performance
            ),
        ],
        &real,
        result,
    );
    catalog.add_all(
        &[
            metric!(
                "contributions",
                "investment_nominal_additional_contributions",
                "money",
                "nominal_contributions_excluding_initial",
                horizon
            ),
            metric!(
                "total_contributed",
                "investment_nominal_total_contributed",
                "money",
                "nominal_contributions_including_initial",
                horizon
            ),
            metric!(
                "withdrawals",
                "investment_nominal_withdrawals",
                "money",
                "nominal_withdrawals_over_horizon",
                horizon
            ),
            metric!(
                "cumulative_inflation",
                "investment_accumulated_inflation",
                "rate",
                "product_of_period_inflation_factors_less_one",
                horizon
            ),
            metric!(
                "elapsed_periods",
                "investment_elapsed_periods",
                "period",
                "modeled_investment_period_count",
                &["periodicity"]
            ),
            metric!(
                "requested_periods",
                "investment_requested_periods",
                "period",
                "requested_investment_period_count",
                &["periodicity"]
            ),
        ],
        &context,
        result,
    );
}

fn tax(catalog: &mut Catalog, input: &Context, result: &Context) {
    let mut context = Context::new();
    for (key, source) in [
        ("jurisdiction", "jurisdiction"),
        ("tax_rule", "rule_version"),
        ("regime", "regime"),
        ("reference_date", "event_date"),
    ] {
        if let Some(value) = catalog.engine.variables.get(source) {
            set(&mut context, key, value.as_str());
        }
    }
    let event = context
        .get("reference_date")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let (period, period_key) = match catalog.operation {
        "br_inss" | "br_irrf" | "br_payroll" => {
            ("month", event.get(..7).unwrap_or_default().to_owned())
        }
        "br_irpf" | "br_ibs_cbs" => ("year", event.get(..4).unwrap_or_default().to_owned()),
        _ => ("taxable_event", event.to_owned()),
    };
    set(&mut context, "tax_period", period_key);
    set(&mut context, "periodicity", period);
    set(&mut context, "purchasing_power", "nominal");
    copy(&mut context, "tax_product", result, "product");
    copy(&mut context, "deduction_mode", result, "deduction_mode");
    copy(&mut context, "payment_status", result, "payment_status");
    copy(&mut context, "purchase_date", input, "purchase_date");
    copy(&mut context, "horizon", result, "holding_days");
    copy(
        &mut context,
        "ancillary_obligations_met",
        input,
        "ancillary_obligations_met",
    );

    const TAX: &[&str] = &["jurisdiction", "tax_rule", "regime", "tax_period"];
    const HOLDING: &[&str] = &[
        "jurisdiction",
        "tax_rule",
        "regime",
        "tax_period",
        "tax_product",
    ];
    match catalog.operation {
        "br_inss" => catalog.add_all(
            &[
                metric!(
                    "gross",
                    "tax_employment_gross_pay",
                    "money",
                    "gross_monthly_pay",
                    TAX
                ),
                metric!(
                    "contribution_basis",
                    "tax_inss_contribution_basis",
                    "money",
                    "gross_subject_to_contribution_cap",
                    TAX
                ),
                metric!(
                    "inss",
                    "tax_employee_inss_due",
                    "money",
                    "progressive_employee_payroll_contribution",
                    TAX
                ),
            ],
            &context,
            result,
        ),
        "br_irrf" | "br_irpf" | "br_payroll" => {
            catalog.add_all(
                &[
                    metric!(
                        "gross",
                        "tax_gross_income",
                        "money",
                        "gross_income_for_income_tax_regime",
                        TAX
                    ),
                    metric!(
                        "deduction",
                        "tax_income_deduction",
                        "money",
                        "eligible_income_tax_deduction_under_selected_mode",
                        TAX
                    ),
                    metric!(
                        "taxable_basis",
                        "tax_income_taxable_basis",
                        "money",
                        "gross_less_selected_deductions",
                        TAX
                    ),
                    metric!(
                        "bracket_rate",
                        "tax_income_marginal_bracket_rate",
                        "rate",
                        "statutory_marginal_rate_not_effective_tax_burden",
                        TAX
                    ),
                    metric!(
                        "tax_before_relief",
                        "tax_income_before_relief",
                        "money",
                        "income_tax_after_bracket_deduction_before_relief",
                        TAX
                    ),
                    metric!(
                        "tax_relief",
                        "tax_income_relief",
                        "money",
                        "statutory_income_tax_relief",
                        TAX
                    ),
                    metric!(
                        "tax_after_relief",
                        "tax_income_after_relief",
                        "money",
                        "income_tax_less_reduction_before_settlement",
                        TAX
                    ),
                    metric!(
                        "withholding_tax",
                        "tax_income_payroll_withheld",
                        "money",
                        "monthly_tax_withheld_after_minimum_threshold",
                        TAX
                    ),
                    metric!(
                        "withheld_tax",
                        "tax_annual_prior_withholdings",
                        "money",
                        "prior_tax_withheld",
                        TAX
                    ),
                    metric!(
                        "eligible_education_expense",
                        "tax_annual_eligible_education_expenses",
                        "money",
                        "education_deduction_subject_to_cap",
                        TAX
                    ),
                    metric!(
                        "balance",
                        "tax_annual_settlement_balance",
                        "money",
                        "calculated_tax_less_prior_withholding",
                        TAX
                    ),
                    metric!(
                        "tax_due",
                        "tax_annual_amount_due",
                        "money",
                        "positive_settlement_balance",
                        TAX
                    ),
                    metric!(
                        "refund",
                        "tax_annual_refund",
                        "money",
                        "absolute_value_of_negative_settlement_balance",
                        TAX
                    ),
                    metric!(
                        "inss",
                        "tax_employee_inss_due",
                        "money",
                        "progressive_employee_payroll_contribution",
                        TAX
                    ),
                    metric!(
                        "net_after_inss_and_irrf",
                        "tax_net_after_employee_contribution_and_withholding",
                        "money",
                        "gross_less_employee_inss_and_irrf",
                        TAX
                    ),
                ],
                &context,
                result,
            );
        }
        "br_investment_tax" | "br_iof" => catalog.add_all(
            &[
                metric!(
                    "principal",
                    "tax_investment_principal",
                    "money",
                    "principal_at_purchase",
                    HOLDING
                ),
                metric!(
                    "holding_days",
                    "tax_investment_holding_days",
                    "period",
                    "calendar_days_from_purchase_to_redemption",
                    &["jurisdiction", "tax_rule", "regime"]
                ),
                metric!(
                    "gross_redemption",
                    "tax_investment_gross_redemption",
                    "money",
                    "redemption_before_tax",
                    HOLDING
                ),
                metric!(
                    "gross_gain",
                    "tax_investment_gross_gain",
                    "money",
                    "redemption_less_principal",
                    HOLDING
                ),
                metric!(
                    "iof_gain_limit_rate",
                    "tax_iof_gain_limit_rate",
                    "rate",
                    "statutory_limit_as_fraction_of_gain",
                    HOLDING
                ),
                metric!(
                    "iof",
                    "tax_investment_iof_due",
                    "money",
                    "iof_due_on_eligible_redemption",
                    HOLDING
                ),
                metric!(
                    "income_tax_basis",
                    "tax_investment_income_basis",
                    "money",
                    "positive_gain_less_iof_for_taxable_products",
                    HOLDING
                ),
                metric!(
                    "income_tax_rate",
                    "tax_investment_withholding_rate",
                    "rate",
                    "statutory_rate_on_taxable_gain",
                    HOLDING
                ),
                metric!(
                    "income_tax",
                    "tax_investment_income_tax_due",
                    "money",
                    "income_tax_due_after_iof",
                    HOLDING
                ),
                metric!(
                    "net_redemption",
                    "tax_investment_net_redemption",
                    "money",
                    "redemption_less_iof_and_income_tax",
                    HOLDING
                ),
                metric!(
                    "net_gain",
                    "tax_investment_net_gain",
                    "money",
                    "net_redemption_less_principal",
                    HOLDING
                ),
            ],
            &context,
            result,
        ),
        "br_icms" => catalog.add_all(
            &[
                metric!(
                    "gross",
                    "tax_icms_gross_price",
                    "money",
                    "price_including_icms",
                    TAX
                ),
                metric!(
                    "rate",
                    "tax_icms_inclusive_rate",
                    "rate",
                    "statutory_tax_inclusive_rate",
                    TAX
                ),
                metric!(
                    "included_icms",
                    "tax_icms_included",
                    "money",
                    "included_tax_rounded_under_icms_rule",
                    TAX
                ),
                metric!(
                    "price_less_icms",
                    "tax_icms_excluded_price",
                    "money",
                    "gross_price_less_included_icms",
                    TAX
                ),
            ],
            &context,
            result,
        ),
        "br_ibs_cbs" => catalog.add_all(
            &[
                metric!(
                    "base",
                    "tax_ibs_cbs_basis",
                    "money",
                    "supplied_test_year_base",
                    TAX
                ),
                metric!(
                    "nominal_ibs_state_rate",
                    "tax_nominal_state_ibs_rate",
                    "rate",
                    "test_year_state_ibs_nominal_rate",
                    TAX
                ),
                metric!(
                    "nominal_ibs_municipal_rate",
                    "tax_nominal_municipal_ibs_rate",
                    "rate",
                    "test_year_municipal_ibs_nominal_rate",
                    TAX
                ),
                metric!(
                    "nominal_cbs_rate",
                    "tax_nominal_cbs_rate",
                    "rate",
                    "test_year_cbs_nominal_rate",
                    TAX
                ),
                metric!(
                    "nominal_ibs_state",
                    "tax_nominal_state_ibs_amount",
                    "money",
                    "test_year_state_ibs_nominal_amount",
                    TAX
                ),
                metric!(
                    "nominal_ibs_municipal",
                    "tax_nominal_municipal_ibs_amount",
                    "money",
                    "test_year_municipal_ibs_nominal_amount",
                    TAX
                ),
                metric!(
                    "nominal_cbs",
                    "tax_nominal_cbs_amount",
                    "money",
                    "test_year_cbs_nominal_amount",
                    TAX
                ),
                metric!(
                    "total_nominal",
                    "tax_ibs_cbs_total_nominal",
                    "money",
                    "sum_of_nominal_tax_components",
                    TAX
                ),
                metric!(
                    "payable_ibs_cbs",
                    "tax_ibs_cbs_amount_payable",
                    "money",
                    "payment_dispensed_only_for_confirmed_obligations",
                    TAX
                ),
            ],
            &context,
            result,
        ),
        _ => {}
    }
}

fn business(catalog: &mut Catalog, input: &Context, result: &Context) {
    let mut context = Context::new();
    set(&mut context, "purchasing_power", "nominal");
    match catalog.operation {
        "price" => {
            set(&mut context, "periodicity", "per_unit");
            copy(&mut context, "pricing_basis", result, "basis");
            copy(&mut context, "quote_to_minor", result, "quote_to_minor");
            catalog.add_all(
                &[
                    metric!(
                        "unit_cost",
                        "business_unit_cost",
                        "money",
                        "cost_per_unit",
                        &["periodicity"]
                    ),
                    metric!(
                        "price",
                        "business_unit_selling_price",
                        "money",
                        "selling_price_per_unit_after_quote_policy",
                        &["periodicity"]
                    ),
                    metric!(
                        "gross_profit",
                        "business_unit_gross_profit",
                        "money",
                        "selling_price_less_unit_cost",
                        &["periodicity"]
                    ),
                    metric!(
                        "variable_sales_cost",
                        "business_unit_variable_sales_cost",
                        "money",
                        "sales_cost_as_fraction_of_unit_price",
                        &["periodicity"]
                    ),
                    metric!(
                        "margin",
                        "business_unit_gross_margin",
                        "rate",
                        "unit_gross_profit_over_selling_price",
                        &["periodicity"]
                    ),
                    metric!(
                        "markup",
                        "business_unit_markup",
                        "rate",
                        "unit_gross_profit_over_unit_cost",
                        &["periodicity"]
                    ),
                    metric!(
                        "contribution",
                        "business_unit_contribution",
                        "money",
                        "unit_price_less_unit_cost_and_sales_cost",
                        &["periodicity"]
                    ),
                    metric!(
                        "contribution_margin",
                        "business_unit_contribution_margin",
                        "rate",
                        "unit_contribution_over_selling_price",
                        &["periodicity"]
                    ),
                ],
                &context,
                result,
            );
        }
        "margins" => {
            set(
                &mut context,
                "reporting_scope",
                "single_supplied_statement_unlabelled_period",
            );
            catalog.add_all(
                &[
                    metric!(
                        "revenue",
                        "business_statement_revenue",
                        "money",
                        "accrued_revenue",
                        &["accounting_period"]
                    ),
                    metric!(
                        "gross_profit",
                        "business_statement_gross_profit",
                        "money",
                        "revenue_less_cogs",
                        &["accounting_period"]
                    ),
                    metric!(
                        "contribution",
                        "business_statement_contribution",
                        "money",
                        "revenue_less_variable_expenses",
                        &["accounting_period"]
                    ),
                    metric!(
                        "operating_profit",
                        "business_operating_profit",
                        "money",
                        "accrued_operating_profit",
                        &["accounting_period"]
                    ),
                    metric!(
                        "net_profit",
                        "business_net_profit",
                        "money",
                        "profit_after_finance_cost_and_income_tax",
                        &["accounting_period"]
                    ),
                    metric!(
                        "ebit",
                        "business_ebit_from_operating_profit",
                        "money",
                        "accrued_operating_profit",
                        &["accounting_period"]
                    ),
                    metric!(
                        "ebitda",
                        "business_ebitda_from_operating_profit",
                        "money",
                        "operating_profit_plus_depreciation",
                        &["accounting_period"]
                    ),
                    metric!(
                        "gross_margin",
                        "business_statement_gross_margin",
                        "rate",
                        "gross_profit_over_revenue",
                        &[]
                    ),
                    metric!(
                        "contribution_margin",
                        "business_statement_contribution_margin",
                        "rate",
                        "accrual_contribution_over_revenue",
                        &[]
                    ),
                    metric!(
                        "operating_margin",
                        "business_statement_operating_margin",
                        "rate",
                        "operating_profit_over_revenue",
                        &[]
                    ),
                    metric!(
                        "net_margin",
                        "business_statement_net_margin",
                        "rate",
                        "net_profit_over_revenue",
                        &[]
                    ),
                    metric!(
                        "ebitda_margin",
                        "business_statement_ebitda_margin",
                        "rate",
                        "accrual_ebitda_over_revenue",
                        &[]
                    ),
                ],
                &context,
                result,
            );
        }
        "ratios" => {
            set(
                &mut context,
                "reporting_scope",
                "supplied_balances_unlabelled_period",
            );
            catalog.add_all(
                &[
                    metric!(
                        "roi",
                        "business_accumulated_roi",
                        "rate",
                        "investment_proceeds_less_cost_over_cost",
                        &["horizon"]
                    ),
                    metric!(
                        "roe",
                        "business_roe",
                        "rate",
                        "net_profit_over_average_equity",
                        &["accounting_period"]
                    ),
                    metric!(
                        "roa",
                        "business_roa",
                        "rate",
                        "net_profit_over_average_assets",
                        &["accounting_period"]
                    ),
                    metric!(
                        "roic",
                        "business_roic",
                        "rate",
                        "nopat_over_average_invested_capital",
                        &["accounting_period"]
                    ),
                    metric!(
                        "current_ratio",
                        "business_current_ratio",
                        "ratio",
                        "current_assets_over_current_liabilities",
                        &[]
                    ),
                    metric!(
                        "quick_ratio",
                        "business_quick_ratio",
                        "ratio",
                        "current_assets_less_inventory_and_prepaid_over_current_liabilities",
                        &[]
                    ),
                    metric!(
                        "liabilities_to_assets",
                        "business_liabilities_to_assets",
                        "ratio",
                        "total_liabilities_over_total_assets",
                        &[]
                    ),
                    metric!(
                        "working_capital",
                        "business_working_capital",
                        "money",
                        "current_assets_less_current_liabilities",
                        &["reference_date"]
                    ),
                ],
                &context,
                result,
            );
        }
        "ebitda" => {
            copy(&mut context, "convention", result, "convention");
            set(
                &mut context,
                "reporting_scope",
                "single_supplied_statement_unlabelled_period",
            );
            catalog.add_all(
                &[
                    metric!(
                        "net_income",
                        "business_reconciliation_net_income",
                        "money",
                        "profit_after_finance_cost_and_income_tax",
                        &["accounting_period"]
                    ),
                    metric!(
                        "income_tax",
                        "business_reconciliation_income_tax",
                        "money",
                        "supplied_income_tax",
                        &["accounting_period"]
                    ),
                    metric!(
                        "net_finance_cost",
                        "business_reconciliation_net_finance_cost",
                        "money",
                        "supplied_net_finance_cost",
                        &["accounting_period"]
                    ),
                    metric!(
                        "depreciation_amortization_depletion",
                        "business_reconciliation_non_cash_expenses",
                        "money",
                        "supplied_depreciation_amortization_and_depletion",
                        &["accounting_period"]
                    ),
                    metric!(
                        "ebit",
                        "business_reconciled_ebit",
                        "money",
                        "net_income_plus_tax_and_finance_cost",
                        &["accounting_period", "convention"]
                    ),
                    metric!(
                        "ebitda",
                        "business_reconciled_ebitda",
                        "money",
                        "reconciled_ebit_plus_non_cash_expenses",
                        &["accounting_period", "convention"]
                    ),
                    metric!(
                        "ebit_margin",
                        "business_reconciled_ebit_margin",
                        "rate",
                        "reconciled_ebit_over_revenue",
                        &["convention"]
                    ),
                    metric!(
                        "ebitda_margin",
                        "business_reconciled_ebitda_margin",
                        "rate",
                        "reconciled_ebitda_over_revenue",
                        &["convention"]
                    ),
                ],
                &context,
                result,
            );
        }
        "cycle" => {
            set(&mut context, "periodicity", "day");
            copy(&mut context, "horizon", input, "days");
            catalog.add_all(
                &[
                    metric!(
                        "inventory_days",
                        "business_inventory_turnover_days",
                        "period",
                        "period_days_times_inventory_over_cost_of_goods",
                        &["periodicity", "horizon"]
                    ),
                    metric!(
                        "receivables_days",
                        "business_receivables_collection_days",
                        "period",
                        "period_days_times_receivables_over_credit_sales",
                        &["periodicity", "horizon"]
                    ),
                    metric!(
                        "payables_days",
                        "business_payables_payment_days",
                        "period",
                        "period_days_times_payables_over_credit_purchases",
                        &["periodicity", "horizon"]
                    ),
                    metric!(
                        "operating_cycle_days",
                        "business_operating_cycle_days",
                        "period",
                        "inventory_days_plus_receivables_days",
                        &["periodicity", "horizon"]
                    ),
                    metric!(
                        "financial_cycle_days",
                        "business_financial_cycle_days",
                        "period",
                        "operating_cycle_days_less_payables_days",
                        &["periodicity", "horizon"]
                    ),
                ],
                &context,
                result,
            );
        }
        "plan" => {
            set(&mut context, "periodicity", "abstract_period");
            set(&mut context, "reference_date", "t0");
            copy(&mut context, "horizon", result, "periods");
            numeric(&mut context, "discount_rate", input, "discount_rate", None);
            catalog.add_all(
                &[
                    metric!(
                        "periods",
                        "business_plan_period_count",
                        "period",
                        "forecast_period_count",
                        &["periodicity"]
                    ),
                    metric!(
                        "revenue",
                        "business_plan_accrued_revenue",
                        "money",
                        "earned_revenue_during_forecast",
                        HORIZON
                    ),
                    metric!(
                        "cost",
                        "business_plan_accrued_cost",
                        "money",
                        "accrued_product_cost_during_forecast",
                        HORIZON
                    ),
                    metric!(
                        "expenses",
                        "business_plan_accrued_expenses",
                        "money",
                        "accrued_expenses_during_forecast",
                        HORIZON
                    ),
                    metric!(
                        "profit",
                        "business_plan_accrued_profit",
                        "money",
                        "earned_revenue_less_cost_and_expenses",
                        HORIZON
                    ),
                    metric!(
                        "cash_receipts",
                        "business_plan_cash_receipts",
                        "money",
                        "received_cash_during_forecast",
                        HORIZON
                    ),
                    metric!(
                        "cash_payments",
                        "business_plan_cash_payments",
                        "money",
                        "paid_cash_during_forecast",
                        HORIZON
                    ),
                    metric!(
                        "cash_close",
                        "business_plan_closing_cash",
                        "money",
                        "undiscounted_cash_at_forecast_close",
                        HORIZON
                    ),
                    metric!(
                        "minimum_cash",
                        "business_plan_minimum_cash",
                        "money",
                        "minimum_modeled_cash_including_period_zero",
                        HORIZON
                    ),
                    metric!(
                        "net_present_value",
                        "business_plan_discounted_cash_flow_npv",
                        "money",
                        "discounted_cash_forecast_less_initial_investment",
                        HORIZON
                    ),
                ],
                &context,
                result,
            );
        }
        "break_even" => {
            set(&mut context, "periodicity", "per_unit");
            catalog.add_all(
                &[
                    metric!(
                        "unit_contribution",
                        "business_break_even_unit_contribution",
                        "money",
                        "unit_price_less_variable_unit_cost",
                        &["periodicity"]
                    ),
                    metric!(
                        "accounting_fixed",
                        "business_break_even_accounting_fixed_cost",
                        "money",
                        "fixed_cost_including_non_cash",
                        &["accounting_period"]
                    ),
                    metric!(
                        "cash_fixed",
                        "business_break_even_cash_fixed_cost",
                        "money",
                        "fixed_cost_excluding_non_cash_plus_fixed_outlays",
                        &["accounting_period"]
                    ),
                ],
                &context,
                result,
            );
            for (field, definition, sales) in [
                (
                    "accounting",
                    metric!(
                        "accounting_units",
                        "business_accounting_break_even_units",
                        "count",
                        "accounting_fixed_cost_over_unit_contribution",
                        &["accounting_period"]
                    ),
                    metric!(
                        "accounting_sales",
                        "business_accounting_break_even_sales",
                        "money",
                        "accounting_break_even_quantity_times_unit_price",
                        &["accounting_period"]
                    ),
                ),
                (
                    "financial",
                    metric!(
                        "cash_units",
                        "business_cash_break_even_units",
                        "count",
                        "cash_fixed_cost_over_unit_contribution",
                        &["accounting_period"]
                    ),
                    metric!(
                        "cash_sales",
                        "business_cash_break_even_sales",
                        "money",
                        "cash_break_even_quantity_times_unit_price",
                        &["accounting_period"]
                    ),
                ),
            ] {
                if let Some(nested) = result.get(field).and_then(Value::as_object) {
                    catalog.add_at(definition, &context, nested, "units", None);
                    catalog.add_at(sales, &context, nested, "sales", None);
                }
            }
        }
        _ => {}
    }
}

pub(super) fn catalog(
    module: &str,
    operation: &str,
    input: &Context,
    result: &Context,
    currency: &Money,
    calculation: &Computation,
    raw: &RawMetrics,
) -> Vec<Metric> {
    let mut catalog = Catalog {
        metrics: Vec::new(),
        raw,
        currency,
        operation,
        engine: calculation,
    };
    match module {
        "financial" => financial(&mut catalog, input, result),
        "investment" => investment(&mut catalog, input, result),
        "loans" => loans(&mut catalog, input, result),
        "tax" => tax(&mut catalog, input, result),
        "business" => business(&mut catalog, input, result),
        _ => {}
    }
    for metric in &mut catalog.metrics {
        if metric.unit == "money"
            || matches!(module, "loans" | "investment" | "tax" | "business")
            || matches!(
                operation,
                "npv"
                    | "mirr"
                    | "payback"
                    | "discounted_payback"
                    | "profitability_index"
                    | "rate"
                    | "periods"
            )
        {
            set(&mut metric.context, "currency", currency.code);
        }
    }
    catalog.metrics
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::finance::{evaluate_scenario, money, parse};
    use serde_json::json;

    fn evaluated(module: &str, operation: &str, input: Value) -> Vec<Metric> {
        let options = Map::new();
        let mut raw = RawMetrics::default();
        let calculation =
            evaluate_scenario(module, operation, &input.to_string(), &options, &mut raw).unwrap();
        let result: Context = parse(&calculation.result).unwrap();
        catalog(
            module,
            operation,
            input.as_object().unwrap(),
            &result,
            &money(&options).unwrap(),
            &calculation,
            &raw,
        )
    }

    fn find<'a>(metrics: &'a [Metric], key: &str) -> &'a Metric {
        metrics.iter().find(|metric| metric.key == key).unwrap()
    }

    #[cfg(feature = "business")]
    #[test]
    fn business_preserves_exact_quote_and_distinguishes_undefined_markup() {
        let values = evaluated(
            "business",
            "price",
            json!({"unit_cost":"0", "selling_price":"1.0001"}),
        );
        let price = find(&values, "price");
        assert_eq!(price.value, Some(decimal("1.0001").unwrap()));
        assert_eq!(price.presentation.as_deref(), Some("1.00"));
        assert_eq!(price.exactness, Exactness::Exact);
        let markup = find(&values, "markup");
        assert!(markup.value.is_none());
        assert_eq!(markup.unit, "rate");
        assert_ne!(markup.semantic_id, find(&values, "margin").semantic_id);
    }

    #[cfg(feature = "investment")]
    #[test]
    fn investment_accumulated_return_retains_precision_and_actual_terminal_date() {
        let values = evaluated(
            "investment",
            "project",
            json!({"initial":"1", "rate":"0.0001", "periods":3, "period_kind":"month",
                "start_date":"2026-01-01", "end_date":"2026-02-15"}),
        );
        let balance = find(&values, "final_balance");
        assert_eq!(balance.context["terminal_date"], "2026-02-01");
        assert_eq!(balance.context["horizon"], 1);
        assert_eq!(balance.value, Some(decimal("1.0001").unwrap()));
        assert_eq!(balance.presentation.as_deref(), Some("1.00"));
        let net = find(&values, "simple_net_return");
        let real = find(&values, "simple_real_net_return");
        let gross = find(&values, "simple_gross_return");
        assert_eq!(net.value, Some(decimal("0.0001").unwrap()));
        assert_eq!(net.context["purchasing_power"], "nominal");
        assert_eq!(real.context["purchasing_power"], "real_at_scenario_start");
        assert_ne!(net.semantic_id, real.semantic_id);
        assert_ne!(net.semantic_id, gross.semantic_id);
    }

    #[cfg(feature = "loans")]
    #[test]
    fn loans_use_amounts_before_presentation_but_after_ledger_rounding() {
        for (scope, exact) in [("final", "1.0001"), ("per_row", "1.00")] {
            let values = evaluated(
                "loans",
                "sac",
                json!({"principal":"1.0001", "rate":"0", "periods":2, "start_date":"2026-01-31",
                    "rounding_scope":scope}),
            );
            let principal = find(&values, "principal");
            assert_eq!(principal.context["first_payment_date"], "2026-02-28");
            assert_eq!(principal.context["last_payment_date"], "2026-03-31");
            assert_eq!(principal.context["rounding_scope"], scope);
            assert_eq!(principal.value, Some(decimal(exact).unwrap()));
            assert_eq!(principal.presentation.as_deref(), Some("1.00"));
        }
    }

    #[cfg(feature = "tax")]
    #[test]
    fn tax_carries_legal_event_and_current_rule_basis() {
        let values = evaluated(
            "tax",
            "br_inss",
            json!({"date":"2026-02-03", "gross":"2000"}),
        );
        let contribution = find(&values, "inss");
        assert_eq!(contribution.source, "statutory_quantized");
        assert_eq!(contribution.context["tax_period"], "2026-02");
        assert_eq!(contribution.context["reference_date"], "2026-02-03");
        assert_eq!(contribution.context["tax_rule"], "BR-2026.1");
        assert_eq!(contribution.decimal_places, Some(2));
    }

    #[cfg(feature = "financial")]
    #[test]
    fn catalog_keeps_high_precision_factor_and_marks_opaque_unbounded_fallback() {
        let values = evaluated(
            "financial",
            "compound_interest",
            json!({"principal":"1", "rate":"0.000000000001", "periods":24}),
        );
        let amount = find(&values, "amount");
        let factor = decimal("1.000000000001").unwrap();
        assert_eq!(amount.value, Some(factor.pow(24)));
        assert_eq!(amount.presentation.as_deref(), Some("1.00"));

        let options = Map::new();
        let calculation = super::super::finish("{}", &options, json!({}), "test", "test").unwrap();
        let money = money(&options).unwrap();
        let mut raw = RawMetrics::default();
        let bounded = "1".parse::<num_bigint::BigInt>().unwrap() << 16_385;
        let unsupported_precision = Rational::from_integer(bounded);
        RawMetrics::capture(
            &mut Some(&mut raw),
            Exactness::Exact,
            &[("amount", &unsupported_precision)],
        );
        let mut result = Catalog {
            metrics: Vec::new(),
            raw: &raw,
            currency: &money,
            operation: "compound_interest",
            engine: &calculation,
        };
        result.add(
            metric!("amount", "test_amount", "money", "test", &[]),
            &Map::new(),
            json!({"amount":"1.00"}).as_object().unwrap(),
        );
        let fallback = find(&result.metrics, "amount");
        assert_eq!(fallback.source, "presentation_rounded");
        assert_eq!(fallback.exactness, Exactness::Approximate);
        assert_eq!(fallback.decimal_places, Some(2));
    }
}

#[cfg(all(
    test,
    feature = "financial",
    feature = "investment",
    feature = "loans",
    feature = "tax",
    feature = "business"
))]
#[test]
fn compatibility_matrix_matches_live_metrics_in_all_five_modules() {
    use super::{evaluate_scenario, money, parse};
    use serde_json::json;
    use std::collections::BTreeSet;

    let rows = json!({"flows":["-100","40","80"]});
    let dated = json!({"flows":["-100","110"],"dates":["2026-01-01","2026-12-30"],"rate":"0.10","day_count":"act_360"});
    let principal = json!({"principal":"1000","rate":"0.05","periods":3});
    let amount = json!({"amount":"1000","rate":"0.05","periods":3});
    let annuity = json!({"payment":"100","rate":"0.05","periods":3,"timing":"end"});
    let loan = json!({"principal":"1000","rate":"0.01","periods":3,"start_date":"2026-01-31","method":"price"});
    let tax_income = json!({"date":"2026-01-31","gross":"6000"});
    let redemption = json!({"product":"cdb","purchase_date":"2026-01-01","redemption_date":"2026-01-20","principal":"1000","redemption":"1100"});
    let cases = [
        ("financial", "simple_interest", principal.clone()),
        ("financial", "compound_interest", principal),
        ("financial", "present_value", amount.clone()),
        ("financial", "future_value", amount),
        ("financial", "annuity_present_value", annuity.clone()),
        ("financial", "annuity_future_value", annuity),
        (
            "financial",
            "annuity_payment",
            json!({"principal":"1000","rate":"0.05","periods":3,"timing":"begin"}),
        ),
        (
            "financial",
            "discount",
            json!({"amount":"1000","rate":"0.05","periods":3,"convention":"rational_compound"}),
        ),
        (
            "financial",
            "rate",
            json!({"present":"100","future":"200","periods":3}),
        ),
        (
            "financial",
            "periods",
            json!({"present":"100","future":"200","rate":"0.2"}),
        ),
        (
            "financial",
            "equivalent_rate",
            json!({"rate":"0.10","from_periods_per_year":2,"to_periods_per_year":12}),
        ),
        (
            "financial",
            "nominal_effective",
            json!({"rate":"0.12","compounds":12,"direction":"nominal_to_effective"}),
        ),
        (
            "financial",
            "nominal_effective",
            json!({"rate":"0.21","compounds":2,"direction":"effective_to_nominal"}),
        ),
        ("financial", "npv", dated.clone()),
        ("financial", "payback", rows.clone()),
        ("financial", "payback", json!({"flows":["-100","10"]})),
        ("financial", "discounted_payback", dated.clone()),
        ("financial", "profitability_index", dated),
        (
            "financial",
            "mirr",
            json!({"flows":["-100","0","121"],"finance_rate":"0.05","reinvest_rate":"0.09"}),
        ),
        ("financial", "irr", rows),
        (
            "investment",
            "project",
            json!({"initial":"100","rate":"0.10","periods":2,"contribution":"10","inflation":"0.05","withdrawal":"5","fee_rate":"0.001","tax_rate":"0.20","timing":"start","reinvest":false}),
        ),
        (
            "investment",
            "project",
            json!({"initial":"100","rate":"0.10","periods":2,"period_kind":"business_day","start_date":"2026-01-01","holidays":["2026-01-02"]}),
        ),
        ("loans", "price", loan.clone()),
        ("loans", "effective_cost", loan),
        (
            "loans",
            "payoff",
            json!({"principal":"1000","rate":"0.01","periods":3,"start_date":"2026-01-31","method":"sac","payoff_at":2}),
        ),
        ("tax", "br_inss", tax_income.clone()),
        ("tax", "br_irrf", tax_income.clone()),
        ("tax", "br_irpf", tax_income),
        (
            "tax",
            "br_payroll",
            json!({"date":"2026-01-31","gross":"6000"}),
        ),
        ("tax", "br_investment_tax", redemption.clone()),
        ("tax", "br_iof", redemption),
        (
            "tax",
            "br_icms",
            json!({"date":"2026-01-21","gross":"1000"}),
        ),
        (
            "tax",
            "br_ibs_cbs",
            json!({"date":"2026-01-21","base":"1000","ancillary_obligations_met":true}),
        ),
        (
            "tax",
            "br_ibs_cbs",
            json!({"date":"2026-01-21","base":"1000","ancillary_obligations_met":false}),
        ),
        (
            "business",
            "price",
            json!({"unit_cost":"100","markup":"0.25","quote_to_minor":true}),
        ),
        (
            "business",
            "margins",
            json!({"revenue":"200","cogs":"100","variable_cogs":"80","depreciation":"5"}),
        ),
        (
            "business",
            "break_even",
            json!({"unit_price":"125","variable_unit_cost":"100","fixed_accounting":"300","non_cash_fixed":"50"}),
        ),
        (
            "business",
            "break_even",
            json!({"unit_price":"100","variable_unit_cost":"100","fixed_accounting":"300"}),
        ),
        (
            "business",
            "ratios",
            json!({"net_profit":"20","initial_assets":"100","final_assets":"120","initial_equity":"50","final_equity":"60","nopat":"25","average_invested_capital":"90","current_assets":"48","current_liabilities":"20","inventory":"10","prepaid":"3","total_liabilities":"60","total_assets":"120","investment_cost":"100","investment_proceeds":"125"}),
        ),
        (
            "business",
            "ebitda",
            json!({"net_income":"12","income_tax":"4","net_finance_cost":"3","depreciation":"2","revenue":"100"}),
        ),
        (
            "business",
            "cycle",
            json!({"days":365,"average_inventory":"20","cogs":"100","average_receivables":"30","credit_sales":"150","average_payables":"20","credit_purchases":"110"}),
        ),
        (
            "business",
            "plan",
            json!({"periods":3,"revenue":"100","cost":"40","expenses":"20","initial_cash":"25","cash_receipts":"90","cash_payments":"65","discount_rate":"0.01","initial_investment":"10"}),
        ),
    ];
    let audited: Value = serde_json::from_str(include_str!(
        "../../../../evidence/objective-04/revision-01/compatibility-matrix.json"
    ))
    .unwrap();
    let scopes = audited["modules"].as_array().unwrap();
    let mut verified = BTreeSet::new();
    let options = Map::new();
    let currency = money(&options).unwrap();
    for (module, operation, input) in cases {
        let mut raw = RawMetrics::default();
        let calculation =
            evaluate_scenario(module, operation, &input.to_string(), &options, &mut raw)
                .unwrap_or_else(|error| panic!("{module}/{operation} fixture failed: {error:?}"));
        let result: Context = parse(&calculation.result).unwrap();
        let encountered = catalog(
            module,
            operation,
            input.as_object().unwrap(),
            &result,
            &currency,
            &calculation,
            &raw,
        );
        let (scope_index, scope) = scopes
            .iter()
            .enumerate()
            .find(|(_, scope)| scope["module"] == module)
            .unwrap();
        let groups = scope["operation_groups"].as_array().unwrap();
        for actual in encountered {
            let (group_index, metric_index, anticipated) = groups
                .iter()
                .enumerate()
                .filter(|(_, scope)| {
                    scope["operations"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|candidate| candidate == operation)
                })
                .find_map(|(group_index, scope)| {
                    scope["metrics"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .enumerate()
                        .find(|(_, candidate)| candidate["key"] == actual.key)
                        .map(|(metric_index, candidate)| (group_index, metric_index, candidate))
                })
                .unwrap_or_else(|| panic!("undeclared metric {module}/{operation}/{}", actual.key));
            assert_eq!(anticipated["semantic_id"], actual.semantic_id);
            assert_eq!(anticipated["unit"], actual.unit);
            assert_eq!(
                anticipated["calculation_basis"],
                actual.context["calculation_basis"]
            );
            assert_eq!(
                anticipated["required_context"],
                json!(actual.required_context)
            );
            verified.insert((scope_index, group_index, metric_index));
        }
    }
    for (scope_index, scope) in scopes.iter().enumerate() {
        for (group_index, group) in scope["operation_groups"]
            .as_array()
            .unwrap()
            .iter()
            .enumerate()
        {
            for (metric_index, metric) in group["metrics"].as_array().unwrap().iter().enumerate() {
                assert!(
                    verified.contains(&(scope_index, group_index, metric_index)),
                    "metric not exercised: {} {} {}",
                    scope["module"],
                    group["operations"],
                    metric["key"]
                );
            }
        }
    }
    assert_eq!(json!(verified.len()), audited["definitions_total"]);
}
