mod currency;
mod scalar;
mod units;

use crate::{Computation, Exactness, MathError};
use num_traits::{Signed, Zero};
use scalar::{Checked, Rational, checked};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use units::{Family, Model, Ratio, Unit};

struct Answer {
    value: String,
    exactness: Exactness,
    method: &'static str,
    formula: &'static str,
    domain: &'static str,
    precision: Option<u32>,
    constraints: Vec<String>,
    variables: BTreeMap<String, String>,
    units: BTreeMap<String, String>,
}

impl Answer {
    fn physical(
        value: String,
        from: &Unit,
        to: &Unit,
        method: &'static str,
        formula: &'static str,
    ) -> Self {
        Self {
            value,
            exactness: Exactness::Exact,
            method,
            formula,
            domain: from.family.name(),
            precision: None,
            constraints: Vec::new(),
            variables: BTreeMap::new(),
            units: unit_bindings(from.code.clone(), to.code.clone()),
        }
    }

    fn finish(self, input: &str) -> Computation {
        Computation {
            result: self.value,
            exactness: self.exactness,
            normalized: input.trim().to_owned(),
            method: self.method,
            domain: self.domain,
            formula: Some(self.formula),
            precision: self.precision,
            error_bound: None,
            tolerance: None,
            constraints: self.constraints,
            variables: self.variables,
            units: self.units,
        }
    }
}

fn unit_bindings(from: String, to: String) -> BTreeMap<String, String> {
    BTreeMap::from([("from".to_owned(), from), ("to".to_owned(), to)])
}

fn option_unit(options: &Map<String, Value>, name: &str) -> Checked<Unit> {
    options
        .get(name)
        .and_then(Value::as_str)
        .and_then(units::find)
        .ok_or(MathError::InvalidInput)
}

fn ratio(value: Rational, from: Ratio, to: Ratio) -> Checked<Rational> {
    checked(value * (from.rational() / to.rational()))
}

fn pressure_nominal(
    value: Rational,
    from: &Unit,
    to: &Unit,
    source: Ratio,
    target: Ratio,
) -> Checked<Answer> {
    const NOMINAL_DIGITS: u32 = 7;
    const FORMULA: &str = "y = x*s_from/s_to";
    if from.code == to.code || value.is_zero() {
        return Ok(Answer::physical(
            value.to_string(),
            from,
            to,
            "exact_linear_unit_ratio",
            FORMULA,
        ));
    }
    let converted = ratio(value, source, target)?;
    let mut answer = Answer::physical(
        scalar::significant_decimal(&converted, NOMINAL_DIGITS),
        from,
        to,
        "nominal_pressure_factor",
        FORMULA,
    );
    answer.exactness = Exactness::Approximate;
    answer.precision = Some(NOMINAL_DIGITS);
    answer
        .constraints
        .push("NIST rounded nominal factor: 1 mmHg = 133.3224 Pa".to_owned());
    answer
        .constraints
        .push("Nominal result rounded to seven significant digits, ties to even".to_owned());
    Ok(answer)
}

fn physical(value: Rational, options: &Map<String, Value>) -> Checked<Answer> {
    if options
        .keys()
        .any(|key| !matches!(key.as_str(), "from" | "to"))
    {
        return Err(MathError::InvalidInput);
    }
    let from = option_unit(options, "from")?;
    let to = option_unit(options, "to")?;
    if from.family != to.family {
        return Err(MathError::Domain);
    }
    let mut answer = match (from.model, to.model) {
        (Model::Linear(source), Model::Linear(target)) => {
            let (method, formula) = if from.family == Family::TemperatureDifference {
                (
                    "exact_temperature_difference",
                    "delta_y = delta_x*s_from/s_to",
                )
            } else {
                ("exact_linear_unit_ratio", "y = x*s_from/s_to")
            };
            let converted = ratio(value.clone(), source, target)?;
            Answer::physical(converted.to_string(), &from, &to, method, formula)
        }
        (Model::Approximate(source), Model::Linear(target) | Model::Approximate(target))
        | (Model::Linear(source), Model::Approximate(target)) => {
            pressure_nominal(value.clone(), &from, &to, source, target)?
        }
        (
            Model::Affine {
                scale: source,
                offset: source_offset,
            },
            Model::Affine {
                scale: target,
                offset: target_offset,
            },
        ) => {
            let kelvin = checked(&value * source.rational() + source_offset.rational())?;
            if kelvin.is_negative() {
                return Err(MathError::Domain);
            }
            let converted = checked((kelvin - target_offset.rational()) / target.rational())?;
            let mut result = Answer::physical(
                converted.to_string(),
                &from,
                &to,
                "exact_affine_temperature",
                "K = x*s_from+o_from, y = (K-o_to)/s_to",
            );
            result
                .constraints
                .push("Absolute temperature is at least zero kelvin".to_owned());
            result
        }
        (
            Model::Angle {
                scale: source,
                pi: source_pi,
            },
            Model::Angle {
                scale: target,
                pi: target_pi,
            },
        ) => {
            let converted = ratio(value.clone(), source, target)?;
            let pi_exponent = source_pi - target_pi;
            let mut result = Answer::physical(
                scalar::symbolic_pi(&converted, pi_exponent),
                &from,
                &to,
                "exact_angle_unit_ratio",
                "y = x*(s_from/s_to)*pi^(p_from-p_to)",
            );
            if pi_exponent != 0 && !converted.is_zero() {
                result.exactness = Exactness::Symbolic;
            }
            result
        }
        (
            Model::Fuel {
                scale: source,
                consumption: source_consumption,
            },
            Model::Fuel {
                scale: target,
                consumption: target_consumption,
            },
        ) => {
            if value.is_negative() {
                return Err(MathError::Domain);
            }
            if source_consumption == target_consumption {
                let converted = ratio(value.clone(), source, target)?;
                Answer::physical(
                    converted.to_string(),
                    &from,
                    &to,
                    "exact_linear_fuel_ratio",
                    "y = x*s_from/s_to",
                )
            } else {
                if value.is_zero() {
                    return Err(MathError::Domain);
                }
                let converted =
                    checked(((&value * source.rational()) * target.rational()).recip())?;
                let mut result = Answer::physical(
                    converted.to_string(),
                    &from,
                    &to,
                    "exact_reciprocal_fuel_conversion",
                    "y = 1/(x*s_from*s_to)",
                );
                result
                    .constraints
                    .push("Reciprocal fuel conversion requires a positive input".to_owned());
                result
            }
        }
        _ => return Err(MathError::Unsupported),
    };
    let value = value.to_string();
    answer.variables.insert(
        "value".to_owned(),
        if value.len() <= 256 {
            value
        } else {
            "Exact value from input".to_owned()
        },
    );
    Ok(answer)
}

fn exchange(value: Rational, options: &Map<String, Value>) -> Checked<Answer> {
    let result = currency::convert(value, options)?;
    Ok(Answer {
        value: format!("amount={}; status={}", result.amount, result.status),
        exactness: Exactness::Exact,
        method: "manual_currency_quote",
        formula: "amount_to = amount_from*rate",
        domain: "currency",
        precision: None,
        constraints: vec![
            "Manual offline quote".to_owned(),
            "Rate expressed as target currency per source currency".to_owned(),
            result.validity.to_owned(),
        ],
        variables: result.variables,
        units: unit_bindings(result.from, result.to),
    })
}

pub(super) fn evaluate(operation: &str, input: &str, options: &Value) -> Checked<Computation> {
    if input.len() > 4096 {
        return Err(MathError::Limit);
    }
    if !matches!(operation, "convert" | "currency") {
        return Err(MathError::Unsupported);
    }
    let options = options.as_object().ok_or(MathError::InvalidInput)?;
    let value = scalar::parse(input)?;
    let answer = match operation {
        "convert" => physical(value, options),
        "currency" => exchange(value, options),
        _ => return Err(MathError::Unsupported),
    }?;
    Ok(answer.finish(input))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn convert(input: &str, from: &str, to: &str) -> Computation {
        evaluate("convert", input, &json!({"from":from,"to":to})).unwrap()
    }

    #[test]
    fn physical_definitions_produce_exact_fractional_results() {
        let cases = [
            ("1", "in", "cm", "127/50"),
            ("2", "nmi", "km", "463/125"),
            ("1", "acre", "ft^2", "43560"),
            ("1", "in^2", "cm^2", "16129/2500"),
            ("1", "ft^3", "in^3", "1728"),
            ("1", "gal_us", "fl_oz_us", "128"),
            ("1", "gal_imp", "L", "454609/100000"),
            ("1", "st", "oz", "224"),
            ("1", "wk", "min", "10080"),
            ("1", "mph", "m/s", "1397/3125"),
            ("1", "g0", "m/s^2", "196133/20000"),
            ("1", "psi", "Pa", "8896443230521/1290320000"),
            ("1", "atm", "Torr", "760"),
            ("1", "kWh", "J", "3600000"),
            ("1", "BTU_IT", "J", "52752792631/50000000"),
            ("1", "eV", "J", "801088317/5000000000000000000000000000"),
            ("1", "hp_metric", "W", "588399/800"),
            ("1", "lbf", "N", "8896443230521/2000000000000"),
            ("1", "dyn", "N", "1/100000"),
        ];
        for (input, from, to, result) in cases {
            let converted = convert(input, from, to);
            assert_eq!(converted.result, result, "{from} to {to}");
            assert_eq!(converted.exactness, Exactness::Exact, "{from} to {to}");
        }
    }

    #[test]
    fn aliases_keep_canonical_units_and_data_rates_stay_distinct() {
        let area = convert("  1.2e-2  ", "cm²", "m2");
        assert_eq!(area.result, "3/2500000");
        assert_eq!(area.normalized, "1.2e-2");
        assert_eq!(
            area.units,
            unit_bindings("cm^2".to_owned(), "m^2".to_owned())
        );
        assert_eq!(convert("1", "KB", "B").result, "1000");
        assert_eq!(convert("1", "KiB", "B").result, "1024");
        assert_eq!(convert("1", "KiB", "kB").result, "128/125");
        let rate = convert("8", "Mbps", "MB/s");
        assert_eq!(rate.result, "1");
        assert_eq!(rate.units["from"], "Mbit/s");
        assert_eq!(rate.domain, "transfer_rate");
        assert_eq!(convert("1", "MiB/s", "Mbit/s").result, "131072/15625");
    }

    #[test]
    fn temperature_distinguishes_offsets_and_differences() {
        for (input, from, to, expected) in [
            ("0", "degC", "degF", "32"),
            ("212", "degF", "degC", "100"),
            ("-40", "degF", "degC", "-40"),
            ("−273.15", "°C", "K", "0"),
            ("-459.67", "degF", "degR", "0"),
            ("0", "degR", "degF", "-45967/100"),
            ("-18", "delta_F", "delta_K", "-10"),
            ("1", "delta_K", "delta_degR", "9/5"),
            ("-99", "ΔK", "Δ°C", "-99"),
        ] {
            assert_eq!(convert(input, from, to).result, expected, "{input} {from}");
        }
        for (input, from, to) in [
            ("-1e-20", "K", "K"),
            ("-273.1500000001", "degC", "K"),
            ("-459.6700000001", "degF", "degR"),
            ("-1e-10", "degR", "K"),
            ("1", "degC", "delta_degC"),
        ] {
            assert_eq!(
                evaluate("convert", input, &json!({"from":from,"to":to})).err(),
                Some(MathError::Domain)
            );
        }
    }

    #[test]
    fn angle_pi_cancels_only_when_dimension_scale_allows_it() {
        let ninety = convert("90", "°", "rad");
        assert_eq!(ninety.exactness, Exactness::Symbolic);
        assert_eq!(ninety.result, "pi/2");
        assert_eq!(convert("-180", "deg", "rad").result, "-pi");
        assert_eq!(convert("1", "turn", "rad").result, "2*pi");
        assert_eq!(convert("1", "rad", "deg").result, "180/pi");
        assert_eq!(convert("1/7", "rad", "arcmin").result, "10800/(7*pi)");
        assert_eq!(convert("0", "rad", "grad").exactness, Exactness::Exact);
        assert_eq!(convert("200", "grad", "deg").result, "180");
        assert_eq!(convert("60", "arcsec", "arcmin").result, "1");
    }

    #[test]
    fn fuel_reciprocity_keeps_efficiency_and_consumption_domains() {
        let reciprocal = convert("8", "L/100 km", "km/L");
        assert_eq!(reciprocal.result, "25/2");
        assert_eq!(reciprocal.method, "exact_reciprocal_fuel_conversion");
        assert_eq!(convert(&reciprocal.result, "km/L", "L/100km").result, "8");
        assert_eq!(convert("8", "L/100km", "L/km").result, "2/25");
        assert_eq!(convert("0", "mpg_us", "mpg_imp").result, "0");
        assert_ne!(
            convert("1", "mpg_us", "km/L").result,
            convert("1", "mpg_imp", "km/L").result
        );
        for (input, from, to) in [("0", "mpg_us", "L/100km"), ("-1", "km/L", "km/L")] {
            assert_eq!(
                evaluate("convert", input, &json!({"from":from,"to":to})).err(),
                Some(MathError::Domain)
            );
        }
    }

    #[test]
    fn rounded_nominal_factor_has_explicit_precision_and_no_bound() {
        let one = convert("1", "mmHg", "Pa");
        assert_eq!(one.result, "133.3224");
        assert_eq!(one.exactness, Exactness::Approximate);
        assert_eq!(one.precision, Some(7));
        assert_eq!(one.error_bound, None);
        assert_eq!(convert("1", "Pa", "mmHg").result, "0.007500615");
        assert_eq!(convert("1/3", "mmHg", "mmHg").exactness, Exactness::Exact);
        assert_eq!(convert("0", "mmHg", "Pa").exactness, Exactness::Exact);
        for (input, rounded) in [
            ("1.2345665", "1.234566"),
            ("1.2345675", "1.234568"),
            ("-1.2345675", "-1.234568"),
            ("9.9999995", "10"),
            ("12345675", "12345680"),
            ("1e-230", &format!("0.{}1", "0".repeat(229))),
        ] {
            assert_eq!(
                scalar::significant_decimal(&scalar::parse(input).unwrap(), 7),
                rounded,
                "{input}"
            );
        }
    }

    fn quote() -> Value {
        json!({
            "from":"USD","to":"BRL","rate":"3.75","source":"Manual sample",
            "as_of":"2024-02-29","valid_until":"2024-03-02","reference_date":"2024-03-01"
        })
    }

    #[test]
    fn currency_quotes_replay_with_inclusive_dated_validity() {
        for (date, status) in [
            ("2024-02-28", "not_yet_valid"),
            ("2024-02-29", "within_validity"),
            ("2024-03-02", "within_validity"),
            ("2024-03-03", "expired"),
        ] {
            let mut options = quote();
            options["reference_date"] = json!(date);
            let result = evaluate("currency", "-10", &options).unwrap();
            assert_eq!(result.result, format!("amount=-75/2; status={status}"));
            assert_eq!(result.exactness, Exactness::Exact);
            assert_eq!(result.variables["rate"], "15/4");
            assert_eq!(result.variables["source"], "Manual sample");
            assert_eq!(result.variables["as_of"], "2024-02-29");
            assert_eq!(result.variables["valid_until"], "2024-03-02");
            assert_eq!(result.variables["reference_date"], date);
            assert_eq!(result.units["to"], "BRL");
        }
        let mut options = quote();
        options.as_object_mut().unwrap().remove("valid_until");
        let undated = evaluate("currency", "1/3", &options).unwrap();
        assert_eq!(undated.result, "amount=5/4; status=unverified_validity");
        assert!(!undated.variables.contains_key("valid_until"));
        options["from"] = json!("BRL");
        options["rate"] = json!("1.00");
        assert_eq!(
            evaluate("currency", "1/3", &options).unwrap().result,
            "amount=1/3; status=unverified_validity"
        );
    }

    #[test]
    fn validation_rejects_invalid_dimensions_rates_and_gregorian_dates() {
        let cases = [
            (
                "convert",
                "1",
                json!({"from":"B","to":"B/s"}),
                MathError::Domain,
            ),
            (
                "convert",
                "1",
                json!({"from":"m","to":"m^2"}),
                MathError::Domain,
            ),
            (
                "convert",
                "1",
                json!({"from":"gal","to":"L"}),
                MathError::InvalidInput,
            ),
            (
                "convert",
                "1",
                json!({"from":10,"to":"cm"}),
                MathError::InvalidInput,
            ),
            (
                "convert",
                "1",
                json!({"from":"m","to":"cm","rate":"1"}),
                MathError::InvalidInput,
            ),
            (
                "convert",
                "1/0",
                json!({"from":"m","to":"cm"}),
                MathError::Domain,
            ),
            (
                "convert",
                "1e257",
                json!({"from":"m","to":"cm"}),
                MathError::Limit,
            ),
            (
                "convert",
                "1 + 2",
                json!({"from":"m","to":"cm"}),
                MathError::InvalidInput,
            ),
        ];
        for (operation, input, options, error) in cases {
            assert_eq!(evaluate(operation, input, &options).err(), Some(error));
        }
        for (field, value, error) in [
            ("as_of", json!("1900-02-29"), MathError::InvalidInput),
            ("as_of", json!("0000-01-01"), MathError::InvalidInput),
            ("valid_until", json!("2024-02-28"), MathError::Domain),
            ("valid_until", json!("2024-04-31"), MathError::InvalidInput),
            (
                "reference_date",
                json!("2024-3-01"),
                MathError::InvalidInput,
            ),
            (
                "reference_date",
                json!("2024-03-01T00:00:00Z"),
                MathError::InvalidInput,
            ),
            ("source", json!("quotes\nprovided"), MathError::InvalidInput),
            ("source", json!(" ".repeat(81)), MathError::InvalidInput),
            ("rate", json!("0"), MathError::Domain),
            ("rate", json!("-1"), MathError::Domain),
            ("rate", json!(3), MathError::InvalidInput),
            ("to", json!("USD"), MathError::Domain),
            ("from", json!("usd"), MathError::InvalidInput),
        ] {
            let mut options = quote();
            options[field] = value;
            assert_eq!(
                evaluate("currency", "10", &options).err(),
                Some(error),
                "{field}: {}",
                options[field]
            );
        }
        let leap_century = json!({
            "from":"EUR","to":"JPY","rate":"160","source":"Manual sample",
            "as_of":"2000-02-29","valid_until":"2000-02-29","reference_date":"2000-02-29"
        });
        assert_eq!(
            evaluate("currency", "1", &leap_century).unwrap().result,
            "amount=160; status=within_validity"
        );
    }
}
