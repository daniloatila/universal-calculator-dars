use std::collections::{BTreeMap, BTreeSet};

use jiff::{Span, civil::Date};
use num_bigint::BigInt;
use num_traits::{One, Signed, Zero};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use super::metric_catalog::RawMetrics;
use super::{Money, Rational, date, decimal, display, finish, money, number, parse};
use crate::{Computation, Exactness, MathError};

const RATE_PRECISION: u32 = 18;
const MAX_PERIODS: u32 = 252;
const MAX_ROW_BYTES: usize = 18_000;
const BCB_SAVINGS: &str = "https://www.bcb.gov.br/estatisticas/remuneradepositospoupanca";
const BCB_SAVINGS_METHOD: &str = "https://www3.bcb.gov.br/CALCIDADAO/publico/metodologiaCorrigirPelaPoupanca.do?method=metodologiaCorrigirPelaPoupanca";
const B3_CDB: &str = "https://www.b3.com.br/data/files/E9/24/20/40/0D331610D1820216790D8AA8/Manual-do-Produto-Certificado-de-Deposito-Bancario-CDB.pdf";
const TREASURY: &str = "https://www.tesourodireto.com.br/sobre-o-tesouro/regras-e-regulamento";

#[derive(Clone, Copy, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
enum Product {
    #[default]
    Generic,
    Cdb,
    Rdb,
    Lci,
    Lca,
    TreasuryFixed,
    TreasurySelic,
    TreasuryIpca,
    Savings,
}

impl Product {
    fn treasury(self) -> bool {
        matches!(
            self,
            Self::TreasuryFixed | Self::TreasurySelic | Self::TreasuryIpca
        )
    }
}

#[derive(Clone, Copy, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
enum Basis {
    #[default]
    #[serde(alias = "fixed")]
    Effective,
    DailyDi,
    SelicSpread,
    IpcaSpread,
    SavingsAnniversary,
    SavingsSelicTr,
}

impl Basis {
    fn savings(self) -> bool {
        matches!(self, Self::SavingsAnniversary | Self::SavingsSelicTr)
    }

    fn needs_index(self) -> bool {
        matches!(
            self,
            Self::DailyDi | Self::SelicSpread | Self::IpcaSpread | Self::SavingsSelicTr
        )
    }
}

#[derive(Clone, Copy, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
enum PeriodKind {
    #[default]
    Period,
    Day,
    BusinessDay,
    Month,
    Quarter,
    Year,
}

#[derive(Clone, Copy, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
enum Timing {
    Start,
    #[default]
    End,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Project {
    initial: String,
    periods: u32,
    rate: String,
    contribution: Option<String>,
    withdrawal: Option<String>,
    inflation: Option<String>,
    fee_rate: Option<String>,
    fixed_fee: Option<String>,
    tax_rate: Option<String>,
    reinvest: Option<bool>,
    #[serde(default)]
    timing: Timing,
    #[serde(default)]
    product: Product,
    rate_basis: Option<Basis>,
    index_rate: Option<String>,
    source: Option<String>,
    reference_date: Option<String>,
    period_kind: Option<PeriodKind>,
    start_date: Option<String>,
    end_date: Option<String>,
    #[serde(default)]
    holidays: Vec<String>,
    #[serde(default)]
    overrides: Vec<Override>,
    page_start: Option<u32>,
    page_size: Option<u32>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Override {
    period: u32,
    rate: Option<String>,
    contribution: Option<String>,
    withdrawal: Option<String>,
    inflation: Option<String>,
    fee_rate: Option<String>,
    fixed_fee: Option<String>,
    tax_rate: Option<String>,
    index_rate: Option<String>,
}

struct Terms {
    rate: Rational,
    contribution: Rational,
    withdrawal: Rational,
    inflation: Option<Rational>,
    fee_rate: Rational,
    fixed_fee: Rational,
    tax_rate: Rational,
    index_rate: Option<Rational>,
}

impl Terms {
    fn initial(input: &Project) -> Result<Self, MathError> {
        Ok(Self {
            rate: decimal(&input.rate)?,
            contribution: read(&input.contribution)?.unwrap_or_default(),
            withdrawal: read(&input.withdrawal)?.unwrap_or_default(),
            inflation: read(&input.inflation)?,
            fee_rate: read(&input.fee_rate)?.unwrap_or_default(),
            fixed_fee: read(&input.fixed_fee)?.unwrap_or_default(),
            tax_rate: read(&input.tax_rate)?.unwrap_or_default(),
            index_rate: read(&input.index_rate)?,
        })
    }

    fn for_period(&self, changes: Option<&Override>) -> Result<Self, MathError> {
        let field = |value: Option<&String>, base: &Rational| {
            value.map_or_else(|| Ok(base.clone()), |value| decimal(value))
        };
        let optional = |value: Option<&String>, base: &Option<Rational>| {
            value.map_or_else(|| Ok(base.clone()), |value| decimal(value).map(Some))
        };
        Ok(Self {
            rate: field(changes.and_then(|row| row.rate.as_ref()), &self.rate)?,
            contribution: field(
                changes.and_then(|row| row.contribution.as_ref()),
                &self.contribution,
            )?,
            withdrawal: field(
                changes.and_then(|row| row.withdrawal.as_ref()),
                &self.withdrawal,
            )?,
            inflation: optional(
                changes.and_then(|row| row.inflation.as_ref()),
                &self.inflation,
            )?,
            fee_rate: field(
                changes.and_then(|row| row.fee_rate.as_ref()),
                &self.fee_rate,
            )?,
            fixed_fee: field(
                changes.and_then(|row| row.fixed_fee.as_ref()),
                &self.fixed_fee,
            )?,
            tax_rate: field(
                changes.and_then(|row| row.tax_rate.as_ref()),
                &self.tax_rate,
            )?,
            index_rate: optional(
                changes.and_then(|row| row.index_rate.as_ref()),
                &self.index_rate,
            )?,
        })
    }

    fn validate(&self, basis: Basis) -> Result<(), MathError> {
        if [&self.contribution, &self.withdrawal, &self.fixed_fee]
            .into_iter()
            .any(Signed::is_negative)
            || [&self.fee_rate, &self.tax_rate]
                .into_iter()
                .any(|rate| rate.is_negative() || rate > &Rational::one())
            || self
                .inflation
                .as_ref()
                .is_some_and(|rate| !valid_growth(rate))
            || basis.needs_index() != self.index_rate.is_some()
            || (basis.savings()
                && (!self.fee_rate.is_zero()
                    || !self.fixed_fee.is_zero()
                    || !self.tax_rate.is_zero()))
        {
            return Err(MathError::Domain);
        }
        Ok(())
    }

    fn effective_rate(&self, basis: Basis) -> Result<(Rational, bool), MathError> {
        self.validate(basis)?;
        let index = self.index_rate.as_ref();
        let one = Rational::one();
        let (rate, approximate) = match basis {
            Basis::Effective | Basis::SavingsAnniversary => (self.rate.clone(), false),
            Basis::DailyDi => {
                let index = index.ok_or(MathError::InvalidInput)?;
                if self.rate.is_negative() || self.rate > number(10) || !valid_growth(index) {
                    return Err(MathError::Domain);
                }
                (&self.rate * index, false)
            }
            Basis::SelicSpread | Basis::IpcaSpread => {
                let index = index.ok_or(MathError::InvalidInput)?;
                if !valid_growth(&self.rate) || !valid_growth(index) {
                    return Err(MathError::Domain);
                }
                ((&one + &self.rate) * (&one + index) - &one, false)
            }
            Basis::SavingsSelicTr => {
                let tr = index.ok_or(MathError::InvalidInput)?;
                if self.rate.is_negative() || self.rate > number(10) || tr.is_negative() {
                    return Err(MathError::Domain);
                }
                let (additional_factor, approximate) = if self.rate > decimal("0.085")? {
                    (&one + decimal("0.005")?, false)
                } else {
                    let annual_factor = &one + &self.rate * decimal("0.7")?;
                    monthly_factor(&annual_factor)
                };
                ((&one + tr) * additional_factor - &one, approximate)
            }
        };
        if !valid_growth(&rate) || (basis.savings() && rate.is_negative()) {
            return Err(MathError::Domain);
        }
        Ok((rate, approximate))
    }

    fn inflation(&self, basis: Basis) -> Rational {
        self.inflation
            .clone()
            .or_else(|| {
                if basis == Basis::IpcaSpread {
                    self.index_rate.clone()
                } else {
                    None
                }
            })
            .unwrap_or_default()
    }
}

fn read(input: &Option<String>) -> Result<Option<Rational>, MathError> {
    input.as_deref().map(decimal).transpose()
}

fn valid_growth(rate: &Rational) -> bool {
    rate > &number(-1) && rate <= &number(10)
}

// Enclose the monthly equivalent on an exact decimal grid. The lower factor
// differs from the mathematical root by less than one unit on this grid.
fn monthly_factor(annual: &Rational) -> (Rational, bool) {
    let scale = BigInt::from(10).pow(RATE_PRECISION);
    let target = annual.numer() * scale.pow(12);
    let mut low = scale.clone();
    let mut high = &scale * 2;
    while &high - &low > BigInt::one() {
        let candidate: BigInt = (&high + &low) / 2;
        if candidate.pow(12) * annual.denom() <= target {
            low = candidate;
        } else {
            high = candidate;
        }
    }
    let approximate = low.pow(12) * annual.denom() != target;
    (Rational::new(low, scale), approximate)
}

struct Calendar {
    kind: PeriodKind,
    anchor: Option<Date>,
    current: Option<Date>,
    end: Option<Date>,
    holidays: BTreeSet<Date>,
}

fn advance(start: Date, span: Span) -> Result<Date, MathError> {
    start.checked_add(span).map_err(|_| MathError::Domain)
}

impl Calendar {
    fn new(input: &Project, basis: Basis) -> Result<Self, MathError> {
        let kind = input.period_kind.unwrap_or(match basis {
            Basis::DailyDi => PeriodKind::BusinessDay,
            _ if basis.savings() => PeriodKind::Month,
            _ => PeriodKind::Period,
        });
        let initial = input.start_date.as_deref().map(date).transpose()?;
        let end = input.end_date.as_deref().map(date).transpose()?;
        if (basis.savings() && (kind != PeriodKind::Month || initial.is_none()))
            || (basis == Basis::DailyDi && (kind != PeriodKind::BusinessDay || initial.is_none()))
            || (kind == PeriodKind::Period && (initial.is_some() || end.is_some()))
            || (kind != PeriodKind::Period && initial.is_none())
            || (end.is_some() && end < initial)
            || (kind != PeriodKind::BusinessDay && !input.holidays.is_empty())
        {
            return Err(MathError::InvalidInput);
        }
        let mut holidays = BTreeSet::new();
        for item in &input.holidays {
            if !holidays.insert(date(item)?) {
                return Err(MathError::InvalidInput);
            }
        }
        let mut anchor = initial;
        if let Some(start) = initial {
            if basis == Basis::SavingsSelicTr && start < date("2012-05-04")? {
                return Err(MathError::Unsupported);
            }
            if basis.savings() && start.day() >= 29 {
                let month_start =
                    Date::new(start.year(), start.month(), 1).map_err(|_| MathError::Domain)?;
                anchor = Some(advance(month_start, Span::new().months(1))?);
            }
        }
        Ok(Self {
            kind,
            anchor,
            current: initial,
            end,
            holidays,
        })
    }

    fn next(&mut self, period: u32) -> Result<Option<Date>, MathError> {
        let Some(anchor) = self.anchor else {
            return Ok(None);
        };
        let count = i64::from(period);
        let next = match self.kind {
            PeriodKind::Period => return Ok(None),
            PeriodKind::Day => advance(anchor, Span::new().days(count))?,
            PeriodKind::BusinessDay => {
                let mut day = advance(self.current.ok_or(MathError::Domain)?, Span::new().days(1))?;
                while day.weekday().to_monday_one_offset() > 5 || self.holidays.contains(&day) {
                    day = advance(day, Span::new().days(1))?;
                }
                day
            }
            PeriodKind::Month => advance(anchor, Span::new().months(count))?,
            PeriodKind::Quarter => advance(anchor, Span::new().months(3 * count))?,
            PeriodKind::Year => advance(anchor, Span::new().years(count))?,
        };
        self.current = Some(next);
        Ok(Some(next))
    }
}

#[derive(Default)]
struct Ledger {
    balance: Rational,
    distributed: Rational,
    fees: Rational,
    taxes: Rational,
}

struct PeriodAmounts {
    earnings: Rational,
    fees: Rational,
    taxes: Rational,
    distribution: Rational,
}

impl Ledger {
    fn flow(&mut self, net_flow: &Rational) -> Result<(), MathError> {
        self.balance += net_flow;
        if self.balance.is_negative() {
            return Err(MathError::Domain);
        }
        Ok(())
    }

    fn step(
        &mut self,
        rate: &Rational,
        terms: &Terms,
        reinvest: bool,
        gross: bool,
    ) -> Result<PeriodAmounts, MathError> {
        let zero = Rational::zero();
        let earnings = &self.balance * rate;
        let fees = if gross {
            zero.clone()
        } else {
            (&self.balance + &earnings) * &terms.fee_rate + &terms.fixed_fee
        };
        let taxes = if gross || earnings.is_negative() {
            zero.clone()
        } else {
            &earnings * &terms.tax_rate
        };
        let after_tax = &earnings - &taxes;
        let distribution = if reinvest || after_tax.is_negative() {
            zero
        } else {
            after_tax.clone()
        };
        self.flow(&(after_tax - &fees - &distribution))?;
        self.distributed += &distribution;
        self.fees += &fees;
        self.taxes += &taxes;
        Ok(PeriodAmounts {
            earnings,
            fees,
            taxes,
            distribution,
        })
    }
}

struct Totals {
    net: Ledger,
    gross: Ledger,
    deposits: Rational,
    withdrawals: Rational,
    real_contributed: Rational,
    real_operating_flows: Rational,
    inflation_factor: Rational,
}

impl Totals {
    fn new(initial: &Rational) -> Self {
        let ledger = || Ledger {
            balance: initial.clone(),
            ..Ledger::default()
        };
        Self {
            net: ledger(),
            gross: ledger(),
            deposits: Rational::zero(),
            withdrawals: Rational::zero(),
            real_contributed: initial.clone(),
            real_operating_flows: Rational::zero(),
            inflation_factor: Rational::one(),
        }
    }

    fn flow(&mut self, terms: &Terms) -> Result<(), MathError> {
        let flow = &terms.contribution - &terms.withdrawal;
        self.net.flow(&flow)?;
        self.gross.flow(&flow)?;
        self.deposits += &terms.contribution;
        self.withdrawals += &terms.withdrawal;
        self.real_contributed += &terms.contribution / &self.inflation_factor;
        self.real_operating_flows -= flow / &self.inflation_factor;
        Ok(())
    }

    fn bound(&self) -> Result<(), MathError> {
        if [
            &self.net.balance,
            &self.gross.balance,
            &self.net.distributed,
            &self.gross.distributed,
            &self.net.fees,
            &self.net.taxes,
            &self.real_contributed,
            &self.real_operating_flows,
            &self.inflation_factor,
        ]
        .into_iter()
        .any(|value| value.numer().bits() > 24_576 || value.denom().bits() > 24_576)
        {
            return Err(MathError::Limit);
        }
        Ok(())
    }
}

struct Rows {
    start: u32,
    size: u32,
    bytes: usize,
    values: Vec<Value>,
    next: Option<u32>,
}

impl Rows {
    fn push(&mut self, period: u32, row: impl FnOnce() -> Value) {
        if period < self.start || self.next.is_some() {
            return;
        }
        if self.values.len() >= self.size as usize {
            self.next = Some(period);
            return;
        }
        let row = row();
        let size = row.to_string().len() + 1;
        if !self.values.is_empty() && self.bytes + size > MAX_ROW_BYTES {
            self.next = Some(period);
        } else {
            self.bytes += size;
            self.values.push(row);
        }
    }
}

fn product_basis(product: Product, supplied: Option<Basis>) -> Result<Basis, MathError> {
    let basis = supplied.unwrap_or(match product {
        Product::TreasurySelic => Basis::SelicSpread,
        Product::TreasuryIpca => Basis::IpcaSpread,
        Product::Savings => Basis::SavingsAnniversary,
        _ => Basis::Effective,
    });
    let compatible = match product {
        Product::Generic => !basis.savings(),
        Product::Cdb | Product::Rdb | Product::Lci | Product::Lca => {
            matches!(basis, Basis::Effective | Basis::DailyDi | Basis::IpcaSpread)
        }
        Product::TreasuryFixed => basis == Basis::Effective,
        Product::TreasurySelic => basis == Basis::SelicSpread,
        Product::TreasuryIpca => basis == Basis::IpcaSpread,
        Product::Savings => basis.savings(),
    };
    if compatible {
        Ok(basis)
    } else {
        Err(MathError::Unsupported)
    }
}

fn source(input: &Project, basis: Basis) -> Result<Option<Date>, MathError> {
    let reference = input.reference_date.as_deref().map(date).transpose()?;
    if input.source.as_ref().is_some_and(|source| {
        source.trim().is_empty() || source.len() > 256 || source.chars().any(char::is_control)
    }) || input.source.is_some() != reference.is_some()
        || ((basis.needs_index() || basis.savings()) && reference.is_none())
    {
        return Err(MathError::InvalidInput);
    }
    Ok(reference)
}

fn references(product: Product, basis: Basis) -> Vec<&'static str> {
    let mut urls = match product {
        Product::Generic => Vec::new(),
        Product::Cdb => vec![B3_CDB],
        Product::Rdb => vec![
            "https://www.b3.com.br/pt_br/produtos-e-servicos/registro/renda-fixa-e-valores-mobiliarios/recibo-de-deposito-bancario.htm",
        ],
        Product::Lci => vec![
            "https://www.b3.com.br/pt_br/produtos-e-servicos/central-depositaria/renda-fixa-e-valores-mobiliarios/letra-de-credito-imobiliario.htm",
        ],
        Product::Lca => vec![
            "https://www.b3.com.br/pt_br/produtos-e-servicos/registro/renda-fixa-e-valores-mobiliarios/letras-de-credito-do-agronegocio.htm",
        ],
        Product::TreasuryFixed | Product::TreasurySelic | Product::TreasuryIpca => vec![TREASURY],
        Product::Savings => vec![
            BCB_SAVINGS,
            BCB_SAVINGS_METHOD,
            "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12703.htm",
            "https://www.caixa.gov.br/Downloads/poupanca-integrada/regulamento-poupanca.pdf",
        ],
    };
    if basis == Basis::DailyDi {
        urls.push("https://www.b3.com.br/pt_br/market-data-e-indices/indices/indices-de-segmentos-e-setoriais/di/metodologia-de-calculo-do-indice-di/");
    } else if urls.is_empty() {
        urls.push("https://www3.bcb.gov.br/CALCIDADAO/publico/exibirMetodologiaAplicacaoDepositosRegulares.do?method=exibirMetodologiaAplicacaoDepositosRegulares");
    }
    urls
}

fn product_scope(product: Product) -> &'static str {
    match product {
        Product::Generic => "User-supplied scenarios define the return and cash flows.",
        Product::Cdb => {
            "CDB is a bank deposit security. The scenario uses supplied rates and omits issuer liquidity, early redemption terms and guarantee eligibility."
        }
        Product::Rdb => {
            "RDB is a non-transferable bank deposit security. The scenario uses supplied rates and omits issuer liquidity, early redemption terms and guarantee eligibility."
        }
        Product::Lci => {
            "LCI is backed by real-estate credit. The scenario uses supplied rates and omits contract lock-in, early redemption terms and guarantee eligibility."
        }
        Product::Lca => {
            "LCA is backed by agribusiness credit. The scenario uses supplied rates and omits contract lock-in, early redemption terms and guarantee eligibility."
        }
        Product::TreasuryFixed | Product::TreasurySelic | Product::TreasuryIpca => {
            "Treasury calculations estimate maturity balances from assumed inputs. Early sale requires market prices, which this offline projection does not provide."
        }
        Product::Savings => {
            "Savings represents a single monthly credit cohort for an individual or nonprofit investor."
        }
    }
}

fn validate_calendar(input: &Project, currency: &Money, basis: Basis) -> Result<(), MathError> {
    if (input.product != Product::Generic && currency.code != "BRL")
        || (basis.savings() && !input.reinvest.unwrap_or(true))
    {
        return Err(MathError::Unsupported);
    }
    Ok(())
}

pub(super) fn evaluate(
    operation: &str,
    input: &str,
    options: &Map<String, Value>,
) -> Result<Computation, MathError> {
    evaluate_with_metrics(operation, input, options, None)
}

pub(super) fn evaluate_with_metrics(
    operation: &str,
    input: &str,
    options: &Map<String, Value>,
    mut raw: Option<&mut RawMetrics>,
) -> Result<Computation, MathError> {
    if operation != "project" {
        return Err(MathError::Unsupported);
    }
    let data: Project = parse(input)?;
    let currency = money(options)?;
    let basis = product_basis(data.product, data.rate_basis)?;
    validate_calendar(&data, &currency, basis)?;
    let reference = source(&data, basis)?;
    let mut calendar = Calendar::new(&data, basis)?;
    let opening = decimal(&data.initial)?;
    let size = data.page_size.unwrap_or(24);
    let start = data.page_start.unwrap_or(1);
    if !(1..=MAX_PERIODS).contains(&data.periods) || !(1..=40).contains(&size) {
        return Err(MathError::Limit);
    }
    if opening.is_negative() || !(1..=data.periods).contains(&start) {
        return Err(MathError::Domain);
    }
    let terms = Terms::initial(&data)?;
    let mut overrides = BTreeMap::new();
    for replacement in &data.overrides {
        if !(1..=data.periods).contains(&replacement.period)
            || overrides.insert(replacement.period, replacement).is_some()
        {
            return Err(MathError::InvalidInput);
        }
    }
    let mut totals = Totals::new(&opening);
    let mut rows = Rows {
        start,
        size,
        bytes: 0,
        values: Vec::new(),
        next: None,
    };
    let mut approximate = false;
    let mut elapsed = 0;
    let mut terminal_date = calendar.current;
    for period in 1..=data.periods {
        let terms = terms.for_period(overrides.get(&period).copied())?;
        let (rate, derived) = terms.effective_rate(basis)?;
        if calendar
            .end
            .zip(calendar.current)
            .is_some_and(|(end, current)| current >= end)
        {
            continue;
        }
        let period_date = match calendar.next(period) {
            Ok(period_date) => period_date,
            // An out-of-range next date is beyond every supported end date.
            Err(MathError::Domain) if calendar.end.is_some() => continue,
            Err(error) => return Err(error),
        };
        if calendar.end.is_some_and(|end| period_date > Some(end)) {
            // Validate supplied terms in the unused tail as well.
            continue;
        }
        elapsed = period;
        terminal_date = period_date;
        approximate |= derived;
        if data.timing == Timing::Start {
            totals.flow(&terms)?;
        }
        let reinvest = data.reinvest.unwrap_or(true);
        let row = totals.net.step(&rate, &terms, reinvest, false)?;
        totals.gross.step(&rate, &terms, reinvest, true)?;
        totals.inflation_factor *= Rational::one() + terms.inflation(basis);
        totals.real_operating_flows += &row.distribution / &totals.inflation_factor;
        if data.timing == Timing::End {
            totals.flow(&terms)?;
        }
        totals.bound()?;
        rows.push(period, || {
            json!({
                "period": period,
                "date": period_date.map(|date| date.to_string()),
                "effective_rate": display(&rate, RATE_PRECISION),
                "contribution": currency.format(&terms.contribution),
                "withdrawal": currency.format(&terms.withdrawal),
                "earnings": currency.format(&row.earnings),
                "fee": currency.format(&row.fees),
                "tax": currency.format(&row.taxes),
                "distribution": currency.format(&row.distribution),
                "balance": currency.format(&totals.net.balance),
            })
        });
    }
    let invested = &opening + &totals.deposits;
    let net_profit =
        &totals.net.balance + &totals.net.distributed + &totals.withdrawals - &invested;
    let gross_profit =
        &totals.gross.balance + &totals.gross.distributed + &totals.withdrawals - &invested;
    let real_final = &totals.net.balance / &totals.inflation_factor;
    let real_profit = &real_final + &totals.real_operating_flows - &opening;
    let mut simple_return = |key, profit: &Rational, contribution: &Rational, exactness| {
        (!contribution.is_zero()).then(|| {
            let rate = profit / contribution;
            RawMetrics::capture(&mut raw, exactness, &[(key, &rate)]);
            display(&rate, RATE_PRECISION)
        })
    };
    let performance_exactness = if approximate {
        Exactness::Approximate
    } else {
        Exactness::Exact
    };
    let nominal_gross = simple_return(
        "simple_gross_return",
        &gross_profit,
        &invested,
        performance_exactness,
    );
    let nominal_net = simple_return(
        "simple_net_return",
        &net_profit,
        &invested,
        performance_exactness,
    );
    let real_net = simple_return(
        "simple_real_net_return",
        &real_profit,
        &totals.real_contributed,
        performance_exactness,
    );
    let inflation = &totals.inflation_factor - Rational::one();
    RawMetrics::capture(
        &mut raw,
        performance_exactness,
        &[
            ("final_balance", &totals.net.balance),
            ("gross_final_balance", &totals.gross.balance),
            ("real_final_balance", &real_final),
            ("distributions", &totals.net.distributed),
            ("gross_distributions", &totals.gross.distributed),
            ("fees", &totals.net.fees),
            ("taxes", &totals.net.taxes),
            ("net_profit", &net_profit),
            ("gross_profit", &gross_profit),
            ("real_net_profit", &real_profit),
        ],
    );
    RawMetrics::capture(
        &mut raw,
        Exactness::Exact,
        &[
            ("contributions", &totals.deposits),
            ("total_contributed", &invested),
            ("withdrawals", &totals.withdrawals),
            ("cumulative_inflation", &inflation),
        ],
    );
    if let Some(raw) = raw {
        raw.terminal_date(terminal_date);
    }
    let mut output = finish(
        input,
        options,
        json!({
            "product": data.product,
            "period_kind": calendar.kind,
            "elapsed_periods": elapsed,
            "requested_periods": data.periods,
            "final_balance": currency.format(&totals.net.balance),
            "gross_final_balance": currency.format(&totals.gross.balance),
            "real_final_balance": currency.format(&real_final),
            "distributions": currency.format(&totals.net.distributed),
            "gross_distributions": currency.format(&totals.gross.distributed),
            "contributions": currency.format(&totals.deposits),
            "total_contributed": currency.format(&invested),
            "withdrawals": currency.format(&totals.withdrawals),
            "fees": currency.format(&totals.net.fees),
            "taxes": currency.format(&totals.net.taxes),
            "net_profit": currency.format(&net_profit),
            "gross_profit": currency.format(&gross_profit),
            "real_net_profit": currency.format(&real_profit),
            "simple_gross_return": nominal_gross,
            "simple_net_return": nominal_net,
            "simple_real_net_return": real_net,
            "cumulative_inflation": display(&inflation, RATE_PRECISION),
            "currency": currency.code,
            "page_start": rows.start,
            "next_page": rows.next,
            "rows": rows.values,
            "policy": {
                "basis": basis,
                "flow_timing": data.timing,
                "reinvest": data.reinvest.unwrap_or(true),
                "data_mode": "manual_offline",
                "source": data.source,
                "reference_date": reference.map(|reference| reference.to_string()),
                "valuation": if data.product.treasury() { "maturity_projection_no_market_valuation" } else { "cash_flow_projection" },
                "rule_references": references(data.product, basis),
            },
        }),
        "dated_rational_investment_projection",
        "G = B × r; F = (B + G) × fee_rate + fixed_fee; T = max(G,0) × tax_rate; B′ = B + G − F − T − distributions + contributions − withdrawals; real balance = B′ / ∏(1 + inflation)",
    )?;
    output.constraints.extend([
        "Rates are manually supplied scenarios. The input source and reference date describe those values, which this offline calculator does not retrieve or independently verify.".to_owned(),
        "A period override replaces that period's scheduled value. Contributions and withdrawals occur together on the selected period boundary; distributions occur at the end.".to_owned(),
        "The aggregate fee applies to the balance after return and before tax, plus a fixed per-period fee. Optional scenario tax applies to positive period earnings. Actual redemption tax, statutory exemption, and product-specific fee schedules require separate data.".to_owned(),
        "Gross uses the same external flows and reinvestment policy with zero fees and tax. Real profit deflates each dated cash flow. Simple returns divide the matching profit by contributions, using individually deflated contributions for the real rate. Simple returns are not annualised.".to_owned(),
        "Outputs use the selected monetary rounding without per-period monetary settlement rounding.".to_owned(),
    ]);
    output
        .constraints
        .push(product_scope(data.product).to_owned());
    match basis {
        Basis::DailyDi => output.constraints.push(
            "Daily DI uses a manually entered effective daily index, multiplied by participation (1.05 means 105% of DI). Business days exclude weekends and user-supplied holidays. B3 contractual day-count, factor settlement precision, and bank details require a separate contract.".to_owned(),
        ),
        Basis::SelicSpread | Basis::IpcaSpread => output.constraints.push(
            "Index and spread must refer to the same period and compound multiplicatively. Treasury scenarios omit actual purchase price, unit quotations, coupons, custody rules and early-sale market price. IPCA defaults to the index as the real deflator unless inflation is supplied.".to_owned(),
        ),
        Basis::SavingsAnniversary | Basis::SavingsSelicTr => output.constraints.push(
            "Savings uses monthly anniversaries for an individual or nonprofit deposit. Days 29–31 use day 1 of the next month as the base. Every projection represents one cohort with boundary-only flows and in-period retention; separately dated cohorts and contractual bank posting rules require separate treatment.".to_owned(),
        ),
        Basis::Effective => {}
    }
    if basis == Basis::SavingsSelicTr {
        output.constraints.push(
            "For eligible savings deposits from 2012-05-04, annual Selic above 8.5% uses 0.5% each anniversary; the alternative annual additional rate is 70% of Selic converted to a monthly factor. TR for the anniversary and the corresponding annual Selic are supplied by the user.".to_owned(),
        );
    }
    if approximate {
        output.exactness = Exactness::Approximate;
        output.precision = Some(RATE_PRECISION);
        output.constraints.push(
            "The monthly savings additional factor is bounded between the 18-place decimal lower endpoint used and that endpoint plus 0.000000000000000001. This bound applies to each factor, independently of the projected currency total.".to_owned(),
        );
    }
    Ok(output)
}
