#[cfg(feature = "business")]
mod business;
#[cfg(any(feature = "financial", feature = "loans"))]
#[path = "financial/cash_flow.rs"]
mod cash_flow;
mod comparison;
#[cfg(feature = "financial")]
mod financial;
#[cfg(feature = "investment")]
mod investment;
#[cfg(feature = "loans")]
mod loans;
mod metric_catalog;
#[cfg(feature = "tax")]
mod tax;

use crate::{Computation, Exactness, MathError};
#[cfg(any(
    feature = "financial",
    feature = "investment",
    feature = "loans",
    feature = "tax",
    test
))]
use jiff::civil::Date;
use num_bigint::BigInt;
use num_integer::Integer;
use num_rational::BigRational;
use num_traits::{One, Signed};
use serde::de::DeserializeOwned;
use serde_json::{Map, Value};
use std::collections::BTreeMap;

pub(super) type Rational = BigRational;

pub(super) const ISO_CURRENCIES: &str = "https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html";

pub(super) const MODULES: &[&str] = &["financial", "investment", "loans", "tax", "business"];

pub(super) fn dispatch(
    module: &str,
    operation: &str,
    input: &str,
    options: &Map<String, Value>,
) -> Result<(Computation, &'static str, &'static [&'static str]), MathError> {
    macro_rules! run {
        ($tool:ident, $version:literal, $references:expr) => {{
            let result = if operation == "scenario_compare" {
                comparison::evaluate(module, input, options)?
            } else {
                $tool::evaluate(operation, input, options)?
            };
            let version = if operation == "scenario_compare" {
                "finance-comparison/2"
            } else {
                $version
            };
            Ok((result, version, $references))
        }};
    }
    match module {
        #[cfg(feature = "financial")]
        "financial" => run!(
            financial,
            "financial/1",
            &[
                ISO_CURRENCIES,
                "https://nvlpubs.nist.gov/nistpubs/hb/2025/NIST.HB.135e2025.pdf",
                "https://www.isda.org/2008/12/22/30-360-day-count-conventions/",
            ]
        ),
        #[cfg(feature = "investment")]
        "investment" => run!(
            investment,
            "investment/1",
            &[
                ISO_CURRENCIES,
                "https://www.bcb.gov.br/estatisticas/remuneradepositospoupanca",
                "https://www.tesourodireto.com.br/sobre-o-tesouro/regras-e-regulamento",
                "https://www.ibge.gov.br/explica/inflacao.php",
            ]
        ),
        #[cfg(feature = "loans")]
        "loans" => run!(
            loans,
            "loans/1",
            &[
                ISO_CURRENCIES,
                "https://www3.bcb.gov.br/CALCIDADAO/publico/exibirMetodologiaFinanciamentoPrestacoesFixas.do?method=exibirMetodologiaFinanciamentoPrestacoesFixas",
                "https://www.bcb.gov.br/content/estabilidadefinanceira/especialnor/Resolu%C3%A7%C3%A3o4881.pdf",
            ]
        ),
        #[cfg(feature = "tax")]
        "tax" => run!(
            tax,
            "tax/1",
            &[
                ISO_CURRENCIES,
                "https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026",
                "https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal/",
            ]
        ),
        #[cfg(feature = "business")]
        "business" => run!(
            business,
            "business/1",
            &[
                ISO_CURRENCIES,
                "https://conteudo.cvm.gov.br/legislacao/resolucoes/resol156.html",
                "https://www.sba.gov/counseling/plan-your-business/break-even-point-calculator/",
                "https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows.html/",
            ]
        ),
        _ => Err(MathError::Unsupported),
    }
}

fn evaluate_scenario(
    module: &str,
    operation: &str,
    input: &str,
    options: &Map<String, Value>,
    raw: &mut metric_catalog::RawMetrics,
) -> Result<Computation, MathError> {
    match module {
        #[cfg(feature = "financial")]
        "financial" => financial::evaluate_with_metrics(operation, input, options, Some(raw)),
        #[cfg(feature = "investment")]
        "investment" => investment::evaluate_with_metrics(operation, input, options, Some(raw)),
        #[cfg(feature = "loans")]
        "loans" => loans::evaluate_with_metrics(operation, input, options, Some(raw)),
        #[cfg(feature = "tax")]
        "tax" => {
            let _ = raw;
            tax::evaluate(operation, input, options)
        }
        #[cfg(feature = "business")]
        "business" => business::evaluate_with_metrics(operation, input, options, Some(raw)),
        _ => Err(MathError::Unsupported),
    }
}

pub(super) fn parse<T: DeserializeOwned>(input: &str) -> Result<T, MathError> {
    serde_json::from_str(input).map_err(|_| MathError::InvalidInput)
}

pub(super) fn decimal(input: &str) -> Result<Rational, MathError> {
    bounded_decimal(input, 18, 12)
}

fn bounded_decimal(
    input: &str,
    integer_digits: usize,
    fractional_digits: usize,
) -> Result<Rational, MathError> {
    let negative = input.starts_with('-');
    let unsigned = input.strip_prefix(['-', '+']).unwrap_or(input);
    let (whole, fraction) = unsigned.split_once('.').unwrap_or((unsigned, ""));
    if unsigned.is_empty()
        || (whole.is_empty() && fraction.is_empty())
        || (unsigned.contains('.') && fraction.is_empty())
        || !whole
            .bytes()
            .chain(fraction.bytes())
            .all(|b| b.is_ascii_digit())
    {
        return Err(MathError::InvalidInput);
    }
    if whole.len() > integer_digits || fraction.len() > fractional_digits {
        return Err(MathError::Limit);
    }
    let digits = BigInt::parse_bytes(format!("{whole}{fraction}").as_bytes(), 10)
        .ok_or(MathError::InvalidInput)?;
    Ok(Rational::new(
        if negative { -digits } else { digits },
        BigInt::from(10).pow(fraction.len() as u32),
    ))
}

pub(super) fn number(value: i64) -> Rational {
    Rational::from_integer(value.into())
}

#[cfg(any(
    feature = "financial",
    feature = "investment",
    feature = "loans",
    feature = "tax",
    test
))]
pub(super) fn date(input: &str) -> Result<Date, MathError> {
    let calendar = input.parse::<Date>().map_err(|_| MathError::InvalidInput)?;
    if input.len() != 10 || calendar.to_string() != input || calendar.year() < 1 {
        return Err(MathError::InvalidInput);
    }
    Ok(calendar)
}

#[derive(Clone, Copy)]
pub(super) enum Rounding {
    HalfEven,
    HalfUp,
    TowardZero,
}

impl Rounding {
    const fn id(self) -> &'static str {
        match self {
            Self::HalfEven => "half_even",
            Self::HalfUp => "half_up",
            Self::TowardZero => "toward_zero",
        }
    }

    fn quantize(self, value: &Rational, scale: u32) -> BigInt {
        let expanded = value.numer().abs() * BigInt::from(10).pow(scale);
        let (mut units, remainder) = expanded.div_rem(value.denom());
        let comparison = (remainder * BigInt::from(2)).cmp(value.denom());
        let increase = match self {
            Self::HalfEven => comparison.is_gt() || (comparison.is_eq() && units.is_odd()),
            Self::HalfUp => !comparison.is_lt(),
            Self::TowardZero => false,
        };
        if increase {
            units += BigInt::one();
        }
        if value.is_negative() { -units } else { units }
    }
}

pub(super) struct Money {
    pub(super) code: &'static str,
    pub(super) scale: u32,
    pub(super) rounding: Rounding,
}

impl Money {
    pub(super) fn format(&self, value: &Rational) -> String {
        fixed(self.rounding.quantize(value, self.scale), self.scale)
    }

    #[cfg(any(feature = "loans", feature = "tax", feature = "business", test))]
    pub(super) fn round(&self, value: &Rational) -> Rational {
        Rational::new(
            self.rounding.quantize(value, self.scale),
            BigInt::from(10).pow(self.scale),
        )
    }
}

pub(super) fn money(options: &Map<String, Value>) -> Result<Money, MathError> {
    if options
        .keys()
        .any(|key| !matches!(key.as_str(), "currency" | "rounding"))
    {
        return Err(MathError::InvalidInput);
    }
    let currency = options
        .get("currency")
        .map_or(Some("BRL"), Value::as_str)
        .ok_or(MathError::InvalidInput)?;
    let (code, scale) = [
        ("BRL", 2),
        ("USD", 2),
        ("EUR", 2),
        ("GBP", 2),
        ("CHF", 2),
        ("CAD", 2),
        ("AUD", 2),
        ("CNY", 2),
        ("INR", 2),
        ("MXN", 2),
        ("AED", 2),
        ("SAR", 2),
        ("JPY", 0),
        ("CLP", 0),
        ("KRW", 0),
        ("KWD", 3),
        ("BHD", 3),
        ("JOD", 3),
    ]
    .into_iter()
    .find(|(code, _)| *code == currency)
    .ok_or(MathError::Unsupported)?;
    let rounding = match options
        .get("rounding")
        .map_or(Some("half_even"), Value::as_str)
    {
        Some("half_even") => Rounding::HalfEven,
        Some("half_up") => Rounding::HalfUp,
        Some("toward_zero") => Rounding::TowardZero,
        _ => return Err(MathError::InvalidInput),
    };
    Ok(Money {
        code,
        scale,
        rounding,
    })
}

fn fixed(units: BigInt, scale: u32) -> String {
    let negative = units.is_negative();
    let digits = units.abs().to_string();
    let scale = scale as usize;
    let sign = if negative { "-" } else { "" };
    if scale == 0 {
        return format!("{sign}{digits}");
    }
    let padded = format!("{digits:0>width$}", width = scale + 1);
    let (whole, fraction) = padded.split_at(padded.len() - scale);
    format!("{sign}{whole}.{fraction}")
}

pub(super) fn display(value: &Rational, scale: u32) -> String {
    fixed(Rounding::HalfEven.quantize(value, scale), scale)
}

pub(super) fn finish(
    input: &str,
    options: &Map<String, Value>,
    result: Value,
    method: &'static str,
    formula: &'static str,
) -> Result<Computation, MathError> {
    let canonical: Map<String, Value> = parse(input)?;
    let money = money(options)?;
    Ok(Computation {
        result: result.to_string(),
        exactness: Exactness::Exact,
        normalized: Value::Object(canonical).to_string(),
        method,
        domain: "financial_decimal",
        formula: Some(formula),
        precision: None,
        tolerance: None,
        error_bound: None,
        constraints: vec![
            "Decimal inputs and rational arithmetic before presentation, with operation-specific exceptions stated below.".to_owned(),
            "Rates in canonical inputs are fractional (0.01 means 1%). One currency applies to the entire calculation.".to_owned(),
            "Monetary display follows the selected rounding rule and ISO 4217 minor-unit scale.".to_owned(),
        ],
        variables: BTreeMap::from([
            ("rounding_policy".to_owned(), money.rounding.id().to_owned()),
            ("minor_unit_scale".to_owned(), money.scale.to_string()),
        ]),
        units: BTreeMap::from([("currency".to_owned(), money.code.to_owned())]),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn bounded_decimal_grammar_and_exact_sign() {
        assert_eq!(
            decimal("-.125").unwrap(),
            Rational::new((-1).into(), 8.into())
        );
        assert_eq!(decimal("+5").unwrap(), number(5));
        for input in ["", "-", ".", "1.", "1e9", "1,25", " 1", "1.2.3", "１"] {
            assert_eq!(decimal(input), Err(MathError::InvalidInput));
        }
        assert_eq!(decimal("1.1234567890123"), Err(MathError::Limit));
        assert_eq!(decimal("1000000000000000000"), Err(MathError::Limit));
        assert_eq!(date("2024-02-29").unwrap().day(), 29);
        assert_eq!(date("2025-02-29"), Err(MathError::InvalidInput));
        assert_eq!(date("0000-12-31"), Err(MathError::InvalidInput));
    }

    #[test]
    fn three_currency_scales_round_positive_and_negative_ties() {
        for (code, rounding, input, output) in [
            ("BRL", "half_even", "2.345", "2.34"),
            ("BRL", "half_even", "2.355", "2.36"),
            ("KWD", "half_up", "-2.3455", "-2.346"),
            ("KWD", "half_up", "2.3454", "2.345"),
            ("JPY", "half_even", "-2.5", "-2"),
            ("JPY", "toward_zero", "-3.9", "-3"),
            ("JPY", "toward_zero", "-0.9", "0"),
        ] {
            let map = json!({"currency": code, "rounding": rounding});
            let money = money(map.as_object().unwrap()).unwrap();
            let value = decimal(input).unwrap();
            assert_eq!(money.format(&value), output);
            assert_eq!(money.round(&value), decimal(output).unwrap());
        }
        assert!(matches!(
            money(json!({"currency":"XAU"}).as_object().unwrap()),
            Err(MathError::Unsupported)
        ));
        assert!(matches!(
            money(json!({"rounding":"bad"}).as_object().unwrap()),
            Err(MathError::InvalidInput)
        ));
    }
}
