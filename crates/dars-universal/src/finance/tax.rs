mod rules;
#[cfg(test)]
mod tests;

use super::{Money, Rational, Rounding, date, decimal, finish, money, number, parse};
use crate::{Computation, MathError};
use jiff::{Span, civil::Date};
use num_traits::{Signed, Zero};
use rules::{ANNUAL_INCOME_TAX, MONTHLY_INCOME_TAX, Rule};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

const BRL: Money = Money {
    code: "BRL",
    scale: 2,
    rounding: Rounding::HalfUp,
};
const INSS_ROUNDING: Money = Money {
    rounding: Rounding::TowardZero,
    ..BRL
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Gross {
    date: String,
    gross: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MonthlyIncome {
    date: String,
    gross: String,
    legal_deductions: Option<String>,
    #[serde(default)]
    dependents: u8,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AnnualIncome {
    date: String,
    gross: String,
    legal_deductions: Option<String>,
    #[serde(default)]
    dependents: u8,
    education_expenses: Option<String>,
    withheld_tax: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Payroll {
    date: String,
    gross: String,
    #[serde(default)]
    dependents: u8,
    other_deductible: Option<String>,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Product {
    Cdb,
    Rdb,
    Tesouro,
    Lci,
    Lca,
    Savings,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Redemption {
    product: Product,
    purchase_date: String,
    redemption_date: String,
    principal: String,
    redemption: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IbsCbs {
    date: String,
    base: String,
    ancillary_obligations_met: bool,
}

pub(super) fn evaluate(
    operation: &str,
    input: &str,
    options: &Map<String, Value>,
) -> Result<Computation, MathError> {
    let supplied = money(options)?;
    if supplied.code != "BRL"
        || options
            .get("rounding")
            .is_some_and(|value| value.as_str() != Some("half_up"))
    {
        return Err(MathError::Unsupported);
    }
    let (rule, event, result) = match operation {
        "br_inss" => inss(input)?,
        "br_irrf" => monthly_income_tax(input)?,
        "br_irpf" => annual_income_tax(input)?,
        "br_payroll" => payroll(input)?,
        "br_investment_tax" => investment_tax(input, false)?,
        "br_iof" => investment_tax(input, true)?,
        "br_icms" => icms(input)?,
        "br_ibs_cbs" => ibs_cbs(input)?,
        _ => return Err(MathError::Unsupported),
    };

    let mut computation = finish(input, options, Value::Object(result), rule.id, rule.formula)?;
    computation.domain = "brazil_tax_simulation";
    computation.constraints = vec![
        rule.scope.to_owned(),
        rule.exclusions.to_owned(),
        rule.rounding.to_owned(),
    ];
    computation
        .constraints
        .extend(rule.sources.iter().map(|source| source.to_string()));
    computation.variables = [
        ("rounding_policy", rule.rounding_id.to_owned()),
        ("minor_unit_scale", "2".to_owned()),
        ("rule_version", rules::VERSION.to_owned()),
        ("jurisdiction", rule.jurisdiction.to_owned()),
        ("regime", rule.id.to_owned()),
        ("event_date", event.to_string()),
        ("effective_from", rules::FIRST.to_string()),
        ("supported_through", rules::LAST.to_string()),
        ("last_verified", rules::VERIFIED.to_owned()),
    ]
    .into_iter()
    .map(|(key, value)| (key.to_owned(), value))
    .collect();
    Ok(computation)
}

type Answer = (&'static Rule, Date, Map<String, Value>);

fn answer(rule: &'static Rule, event: Date, result: Value) -> Answer {
    let Value::Object(mut result) = result else {
        unreachable!("tax results are objects")
    };
    result.extend([
        ("currency".to_owned(), json!("BRL")),
        ("rule_version".to_owned(), json!(rules::VERSION)),
        ("event_date".to_owned(), json!(event.to_string())),
    ]);
    (rule, event, result)
}

fn taxable_date(input: &str) -> Result<Date, MathError> {
    let result = date(input)?;
    if (rules::FIRST..=rules::LAST).contains(&result) {
        Ok(result)
    } else {
        Err(MathError::Unsupported)
    }
}

fn cents(value: i64) -> Rational {
    Rational::new(value.into(), 100.into())
}

fn ppm(value: i64) -> Rational {
    Rational::new(value.into(), 1_000_000.into())
}

fn brl(input: &str) -> Result<Rational, MathError> {
    let value = decimal(input)?;
    if value.is_negative() || !(&value * number(100)).is_integer() {
        return Err(MathError::Domain);
    }
    Ok(value)
}

fn optional_brl(input: Option<&str>) -> Result<Rational, MathError> {
    brl(input.unwrap_or("0"))
}

fn legal_deductions(
    gross: &Rational,
    other: Rational,
    dependents: u8,
    each: i64,
) -> Result<Rational, MathError> {
    if &other > gross || dependents > 30 {
        return Err(MathError::Domain);
    }
    Ok(other + cents(each * i64::from(dependents)))
}

fn employee_contribution(gross: &Rational) -> Rational {
    let mut previous = Rational::zero();
    let mut contribution = Rational::zero();
    for (maximum, rate) in rules::INSS_BANDS {
        let maximum = cents(maximum);
        let amount = gross.min(&maximum) - &previous;
        if amount <= Rational::zero() {
            break;
        }
        contribution += INSS_ROUNDING.round(&(amount * ppm(rate)));
        previous = maximum;
    }
    contribution
}

fn inss(input: &str) -> Result<Answer, MathError> {
    let request: Gross = parse(input)?;
    let event = taxable_date(&request.date)?;
    let gross = brl(&request.gross)?;
    let contribution = employee_contribution(&gross);
    Ok(answer(
        &rules::INSS,
        event,
        json!({
            "gross": BRL.format(&gross),
            "contribution_basis": BRL.format(&gross.min(cents(rules::INSS_CAP))),
            "inss": BRL.format(&contribution),
        }),
    ))
}

struct IncomeTax {
    base: Rational,
    bracket_rate: Rational,
    deduction: Rational,
    deduction_mode: &'static str,
    before_relief: Rational,
    relief: Rational,
    after_relief: Rational,
}

impl IncomeTax {
    fn calculate(gross: &Rational, legal: Rational, table: &rules::IncomeTaxTable) -> Self {
        let simplified = table.simplified_rate.map_or_else(
            || cents(table.simplified_cap),
            |rate| {
                BRL.round(&(gross * ppm(rate)))
                    .min(cents(table.simplified_cap))
            },
        );
        let (deduction, deduction_mode) = if legal >= simplified {
            (legal, "legal")
        } else {
            (simplified, "simplified")
        };
        let deduction = deduction.min(gross.clone());
        let base = gross - &deduction;
        let bracket = table
            .brackets
            .iter()
            .find(|bracket| base <= cents(bracket.upper_cents))
            .unwrap_or(&table.top_bracket);
        let bracket_rate = ppm(bracket.rate);
        let before_relief = BRL
            .round(&(&base * &bracket_rate - cents(bracket.deduction_cents)))
            .max(Rational::zero());
        let allowed_relief = if gross <= &cents(table.full_relief_upper) {
            cents(table.full_relief_cap)
        } else if gross <= &cents(table.partial_relief_upper) {
            BRL.round(
                &(cents(table.partial_relief_offset) - gross * ppm(table.partial_relief_rate)),
            )
            .max(Rational::zero())
        } else {
            Rational::zero()
        };
        let relief = allowed_relief.min(before_relief.clone());
        let after_relief = &before_relief - &relief;
        Self {
            base,
            bracket_rate,
            deduction,
            deduction_mode,
            before_relief,
            relief,
            after_relief,
        }
    }

    fn withheld(&self) -> Rational {
        if self.after_relief <= cents(rules::MONTHLY_WITHHOLDING_MINIMUM) {
            Rational::zero()
        } else {
            self.after_relief.clone()
        }
    }

    fn breakdown(&self) -> Map<String, Value> {
        Map::from_iter([
            ("deduction".to_owned(), json!(BRL.format(&self.deduction))),
            ("deduction_mode".to_owned(), json!(self.deduction_mode)),
            ("taxable_basis".to_owned(), json!(BRL.format(&self.base))),
            (
                "bracket_rate".to_owned(),
                json!(super::display(&self.bracket_rate, 4)),
            ),
            (
                "tax_before_relief".to_owned(),
                json!(BRL.format(&self.before_relief)),
            ),
            ("tax_relief".to_owned(), json!(BRL.format(&self.relief))),
            (
                "tax_after_relief".to_owned(),
                json!(BRL.format(&self.after_relief)),
            ),
        ])
    }
}

fn monthly_income_tax(input: &str) -> Result<Answer, MathError> {
    let request: MonthlyIncome = parse(input)?;
    let event = taxable_date(&request.date)?;
    let gross = brl(&request.gross)?;
    let legal = legal_deductions(
        &gross,
        optional_brl(request.legal_deductions.as_deref())?,
        request.dependents,
        rules::MONTHLY_DEPENDENT_DEDUCTION,
    )?;
    let tax = IncomeTax::calculate(&gross, legal, &MONTHLY_INCOME_TAX);
    let mut result = tax.breakdown();
    result.insert("gross".to_owned(), json!(BRL.format(&gross)));
    result.insert(
        "withholding_tax".to_owned(),
        json!(BRL.format(&tax.withheld())),
    );
    Ok(answer(&rules::IRRF, event, Value::Object(result)))
}

fn annual_income_tax(input: &str) -> Result<Answer, MathError> {
    let request: AnnualIncome = parse(input)?;
    let event = taxable_date(&request.date)?;
    let gross = brl(&request.gross)?;
    if gross > cents(rules::HIGH_INCOME_THRESHOLD) {
        return Err(MathError::Unsupported);
    }
    let legal = legal_deductions(
        &gross,
        optional_brl(request.legal_deductions.as_deref())?,
        request.dependents,
        rules::ANNUAL_DEPENDENT_DEDUCTION,
    )?;
    let education = optional_brl(request.education_expenses.as_deref())?
        .min(cents(rules::ANNUAL_EDUCATION_LIMIT));
    let withheld = optional_brl(request.withheld_tax.as_deref())?;
    if withheld > gross {
        return Err(MathError::Domain);
    }
    let tax = IncomeTax::calculate(&gross, legal + &education, &ANNUAL_INCOME_TAX);
    let balance = &tax.after_relief - &withheld;
    let mut result = tax.breakdown();
    result.extend([
        ("gross".to_owned(), json!(BRL.format(&gross))),
        ("calendar_year".to_owned(), json!(event.year())),
        ("assessment_year".to_owned(), json!(event.year() + 1)),
        (
            "eligible_education_expense".to_owned(),
            json!(BRL.format(&education)),
        ),
        ("withheld_tax".to_owned(), json!(BRL.format(&withheld))),
        ("balance".to_owned(), json!(BRL.format(&balance))),
        (
            "tax_due".to_owned(),
            json!(BRL.format(&balance.clone().max(Rational::zero()))),
        ),
        (
            "refund".to_owned(),
            json!(BRL.format(&(-balance).max(Rational::zero()))),
        ),
    ]);
    Ok(answer(&rules::IRPF, event, Value::Object(result)))
}

fn payroll(input: &str) -> Result<Answer, MathError> {
    let request: Payroll = parse(input)?;
    let event = taxable_date(&request.date)?;
    let gross = brl(&request.gross)?;
    let contribution = employee_contribution(&gross);
    let legal = legal_deductions(
        &gross,
        &contribution + optional_brl(request.other_deductible.as_deref())?,
        request.dependents,
        rules::MONTHLY_DEPENDENT_DEDUCTION,
    )?;
    let tax = IncomeTax::calculate(&gross, legal, &MONTHLY_INCOME_TAX);
    let withholding = tax.withheld();
    let net = &gross - &contribution - &withholding;
    let mut result = tax.breakdown();
    result.extend([
        ("gross".to_owned(), json!(BRL.format(&gross))),
        ("inss".to_owned(), json!(BRL.format(&contribution))),
        (
            "withholding_tax".to_owned(),
            json!(BRL.format(&withholding)),
        ),
        (
            "net_after_inss_and_irrf".to_owned(),
            json!(BRL.format(&net)),
        ),
    ]);
    Ok(answer(&rules::PAYROLL, event, Value::Object(result)))
}

fn investment_tax(input: &str, iof_only: bool) -> Result<Answer, MathError> {
    let request: Redemption = parse(input)?;
    let event = taxable_date(&request.redemption_date)?;
    let purchase = date(&request.purchase_date)?;
    let days = event.duration_since(purchase).as_secs() / 86_400;
    if !(1..=36_600).contains(&days) {
        return Err(MathError::Domain);
    }
    let principal = brl(&request.principal)?;
    let redemption = brl(&request.redemption)?;
    if principal.is_zero() {
        return Err(MathError::Domain);
    }

    let taxable = matches!(
        request.product,
        Product::Cdb | Product::Rdb | Product::Tesouro
    );
    if !taxable && iof_only {
        return Err(MathError::Unsupported);
    }
    if matches!(request.product, Product::Lci | Product::Lca) {
        let minimum = purchase
            .checked_add(Span::new().months(rules::LCI_LCA_MIN_MONTHS))
            .map_err(|_| MathError::Domain)?;
        // Law 810/1949, Art. 3: an absent matching day rolls to the following day.
        let minimum = if minimum.day() < purchase.day() {
            minimum.tomorrow().map_err(|_| MathError::Domain)?
        } else {
            minimum
        };
        if purchase < rules::LCI_LCA_FIRST_PURCHASE || event < minimum {
            return Err(MathError::Unsupported);
        }
    }
    let gain = &redemption - &principal;
    let positive_gain = gain.clone().max(Rational::zero());
    let iof_limit_rate = if taxable && days < 30 {
        rules::IOF_GAIN_LIMITS[days as usize - 1]
    } else {
        0
    };
    let iof = BRL.round(&((&redemption * cents(days)).min(&positive_gain * cents(iof_limit_rate))));
    let mut result = json!({
        "product": request.product,
        "holding_days": days,
        "principal": BRL.format(&principal),
        "gross_redemption": BRL.format(&redemption),
        "gross_gain": BRL.format(&gain),
        "iof_gain_limit_rate": super::display(&cents(iof_limit_rate), 4),
        "iof": BRL.format(&iof),
    });
    if iof_only {
        return Ok(answer(&rules::IOF, event, result));
    }

    let (rate, taxable_gain) = if taxable {
        (rules::fixed_income_ir_rate(days), positive_gain - &iof)
    } else {
        (0, Rational::zero())
    };
    let income_tax = BRL.round(&(&taxable_gain * ppm(rate)));
    let net = &redemption - &iof - &income_tax;
    result["income_tax_basis"] = json!(BRL.format(&taxable_gain));
    result["income_tax_rate"] = json!(super::display(&ppm(rate), 4));
    result["income_tax"] = json!(BRL.format(&income_tax));
    result["net_redemption"] = json!(BRL.format(&net));
    result["net_gain"] = json!(BRL.format(&(net - principal)));
    Ok(answer(&rules::INVESTMENT, event, result))
}

fn icms(input: &str) -> Result<Answer, MathError> {
    let request: Gross = parse(input)?;
    let event = taxable_date(&request.date)?;
    let gross = brl(&request.gross)?;
    let rate = ppm(rules::SP_STANDARD_ICMS);
    let included_tax = BRL.round(&(&gross * &rate));
    Ok(answer(
        &rules::ICMS,
        event,
        json!({
            "gross": BRL.format(&gross),
            "rate": super::display(&rate, 4),
            "included_icms": BRL.format(&included_tax),
            "price_less_icms": BRL.format(&(gross - included_tax)),
        }),
    ))
}

fn ibs_cbs(input: &str) -> Result<Answer, MathError> {
    let request: IbsCbs = parse(input)?;
    let event = taxable_date(&request.date)?;
    let base = brl(&request.base)?;
    let ibs = BRL.round(&(&base * ppm(rules::IBS_TEST_RATE)));
    let cbs = BRL.round(&(&base * ppm(rules::CBS_TEST_RATE)));
    Ok(answer(
        &rules::IBS_CBS,
        event,
        json!({
            "base": BRL.format(&base),
            "nominal_ibs_state_rate": super::display(&ppm(rules::IBS_TEST_RATE), 4),
            "nominal_ibs_municipal_rate": "0.0000",
            "nominal_cbs_rate": super::display(&ppm(rules::CBS_TEST_RATE), 4),
            "nominal_ibs_state": BRL.format(&ibs),
            "nominal_ibs_municipal": "0.00",
            "nominal_cbs": BRL.format(&cbs),
            "total_nominal": BRL.format(&(ibs + cbs)),
            "payment_status": if request.ancillary_obligations_met { "dispensed" } else { "undetermined" },
            "payable_ibs_cbs": request.ancillary_obligations_met.then_some("0.00"),
        }),
    ))
}
