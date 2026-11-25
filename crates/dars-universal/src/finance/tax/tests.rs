use super::*;

fn request(operation: &str, input: Value) -> Computation {
    evaluate(operation, &input.to_string(), &Map::new()).unwrap()
}

fn result(operation: &str, input: Value) -> Value {
    parse(&request(operation, input).result).unwrap()
}

#[test]
fn inss_truncates_each_band_and_caps_the_contribution() {
    // Portaria MPS/MF 13 table, with cents truncated per S-5001. At the cap the four
    // bands are 121.57, 115.36, 174.17 and 576.97, totaling 988.07.
    for (gross, expected) in [
        ("0", "0.00"),
        ("1621.00", "121.57"),
        ("1621.01", "121.57"),
        ("2902.84", "236.93"),
        ("2902.85", "236.93"),
        ("3000", "248.58"),
        ("4354.27", "411.10"),
        ("4354.28", "411.10"),
        ("8475.55", "988.07"),
        ("20000", "988.07"),
    ] {
        assert_eq!(
            result("br_inss", json!({"date":"2026-01-01","gross":gross}))["inss"],
            expected
        );
    }
}

#[test]
fn monthly_income_tax_matches_receita_examples_and_cents_waiver() {
    // RFB examples for Lei 15.270/2025 supply legal deductions independently.
    for (gross, deduction, before_relief, relief, withholding) in [
        ("4000", "373.41", "114.76", "114.76", "0.00"),
        ("5000", "509.60", "312.89", "312.89", "0.00"),
        ("6000", "649.60", "562.63", "179.75", "382.88"),
        ("7607.20", "0", "1016.27", "0.00", "1016.27"),
    ] {
        let tax = result(
            "br_irrf",
            json!({
                "date":"2026-01-02", "gross":gross, "legal_deductions":deduction,
            }),
        );
        assert_eq!(tax["tax_before_relief"], before_relief);
        assert_eq!(tax["tax_relief"], relief);
        assert_eq!(tax["withholding_tax"], withholding);
    }
    assert_eq!(
        result("br_irrf", json!({"date":"2026-01-01","gross":"7350"}))["tax_relief"],
        "0.00"
    );
    assert_eq!(
        result("br_irrf", json!({"date":"2026-01-01","gross":"7350.01"}))["tax_relief"],
        "0.00"
    );

    let model = |deduction| {
        result(
            "br_irrf",
            json!({
                "date":"2026-01-01", "gross":"5027.94", "legal_deductions":deduction,
            }),
        )
    };
    let at_waiver = model("607.21");
    assert_eq!(at_waiver["tax_after_relief"], "10.00");
    assert_eq!(at_waiver["withholding_tax"], "0.00");
    assert_eq!(model("607.20")["withholding_tax"], "10.01");
}

#[test]
fn annual_adjustment_uses_calendar_year_and_pre_deduction_income_for_relief() {
    let model = |gross, withheld| {
        result(
            "br_irpf",
            json!({
                "date":"2026-12-31", "gross":gross, "withheld_tax":withheld,
            }),
        )
    };
    let exempt = model("60000", "1234.56");
    assert_eq!(exempt["calendar_year"], 2026);
    assert_eq!(exempt["assessment_year"], 2027);
    assert_eq!(exempt["tax_after_relief"], "0.00");
    assert_eq!(exempt["refund"], "1234.56");
    let partial = model("72000", "0");
    assert_eq!(partial["deduction"], "14400.00");
    assert_eq!(partial["taxable_basis"], "57600.00");
    assert_eq!(partial["tax_before_relief"], "4935.34");
    assert_eq!(partial["tax_relief"], "1548.33");
    assert_eq!(partial["tax_due"], "3387.01");
    assert_eq!(model("88200", "0")["tax_relief"], "0.02");
    assert_eq!(model("88200.01", "0")["tax_relief"], "0.00");

    let legal = result(
        "br_irpf",
        json!({"date":"2026-12-31","gross":"70000",
        "legal_deductions":"16000","dependents":1,"education_expenses":"9999"}),
    );
    assert_eq!(legal["deduction_mode"], "legal");
    assert_eq!(legal["eligible_education_expense"], "3561.50");
    assert_eq!(legal["deduction"], "21836.58");
}

#[test]
fn payroll_uses_calculated_contribution_and_not_the_receita_example_input() {
    // 6000 gives band sums 121.57+115.36+174.17+230.40. The resulting IRRF
    // base 5358.50 gives 564.86 before 179.75 of monthly relief.
    let payroll = result("br_payroll", json!({"date":"2026-01-02","gross":"6000"}));
    assert_eq!(payroll["inss"], "641.50");
    assert_eq!(payroll["taxable_basis"], "5358.50");
    assert_eq!(payroll["withholding_tax"], "385.11");
    assert_eq!(payroll["net_after_inss_and_irrf"], "4973.39");
}

fn redemption(product: &str, purchased: &str, event: &str, gross: &str) -> Value {
    json!({"product":product, "purchase_date":purchased, "redemption_date":event,
        "principal":"1000", "redemption":gross})
}

#[test]
fn fixed_income_tests_all_rate_changes_and_exemption() {
    // These hand-selected date pairs are counted in Gregorian elapsed days. A
    // BRL 100 gain after day 30 exposes each exact IR rate as a cash amount.
    for (purchased, event, days, income_tax) in [
        ("2026-01-01", "2026-06-30", 180, "22.50"),
        ("2026-01-01", "2026-07-01", 181, "20.00"),
        ("2026-01-01", "2026-12-27", 360, "20.00"),
        ("2026-01-01", "2026-12-28", 361, "17.50"),
        ("2024-02-29", "2026-02-18", 720, "17.50"),
        ("2024-02-29", "2026-02-19", 721, "15.00"),
    ] {
        let tax = result(
            "br_investment_tax",
            redemption("tesouro", purchased, event, "1100"),
        );
        assert_eq!(tax["holding_days"], days);
        assert_eq!(tax["income_tax"], income_tax);
        assert_eq!(tax["iof"], "0.00");
    }
    for product in ["lci", "lca", "savings"] {
        let tax = result(
            "br_investment_tax",
            redemption(product, "2026-01-01", "2026-07-01", "1100"),
        );
        assert_eq!(tax["income_tax"], "0.00");
        assert_eq!(tax["net_gain"], "100.00");
    }
    let end_of_month = result(
        "br_investment_tax",
        redemption("lci", "2025-08-31", "2026-02-28", "1100"),
    );
    assert_eq!(end_of_month["income_tax"], "0.00");
    for (purchased, event) in [("2025-08-31", "2026-02-27"), ("2025-05-25", "2026-11-25")] {
        let input = redemption("lca", purchased, event, "1100");
        assert_eq!(
            evaluate("br_investment_tax", &input.to_string(), &Map::new()).err(),
            Some(MathError::Unsupported)
        );
    }
}

#[test]
fn short_redemption_uses_both_iof_limits_before_ir_and_preserves_losses() {
    // At 1 day, the statutory daily limit is 11.00 for a 1100.00 redemption.
    let first = result(
        "br_iof",
        redemption("cdb", "2026-01-01", "2026-01-02", "1100"),
    );
    assert_eq!(first["iof_gain_limit_rate"], "0.9600");
    assert_eq!(first["iof"], "11.00");
    for (date, gain_limit, iof) in [
        ("2026-01-03", "0.9300", "1.86"),
        ("2026-01-16", "0.5000", "1.00"),
        ("2026-01-30", "0.0300", "0.06"),
        ("2026-01-31", "0.0000", "0.00"),
    ] {
        let tax = result("br_iof", redemption("rdb", "2026-01-01", date, "1002"));
        assert_eq!(tax["iof_gain_limit_rate"], gain_limit);
        assert_eq!(tax["iof"], iof);
    }
    let tax = result(
        "br_investment_tax",
        redemption("cdb", "2026-01-01", "2026-01-16", "1002"),
    );
    assert_eq!(tax["income_tax_basis"], "1.00");
    assert_eq!(tax["income_tax"], "0.23");
    assert_eq!(tax["net_redemption"], "1000.77");
    let loss = result(
        "br_investment_tax",
        redemption("tesouro", "2026-01-01", "2026-01-16", "900"),
    );
    assert_eq!(loss["net_gain"], "-100.00");
    assert_eq!(loss["income_tax"], "0.00");
    assert_eq!(loss["iof"], "0.00");
}

#[test]
fn consumption_tax_proofs_keep_nominal_values_and_payment_status_distinct() {
    let icms = request("br_icms", json!({"date":"2026-12-31", "gross":"1000"}));
    let tax: Value = parse(&icms.result).unwrap();
    assert_eq!(tax["included_icms"], "180.00");
    assert_eq!(tax["price_less_icms"], "820.00");
    assert_eq!(icms.variables["jurisdiction"], "BR-SP");
    assert_eq!(icms.variables["rule_version"], "BR-2026.1");
    assert_eq!(icms.variables["last_verified"], "2026-11-25");
    assert!(
        icms.constraints
            .iter()
            .any(|line| line.contains("fazenda.sp.gov.br"))
    );

    let standard = |met| {
        result(
            "br_ibs_cbs",
            json!({
                "date":"2026-01-01", "base":"1000", "ancillary_obligations_met":met,
            }),
        )
    };
    let exempt = standard(true);
    assert_eq!(exempt["nominal_ibs_state"], "1.00");
    assert_eq!(exempt["nominal_ibs_municipal"], "0.00");
    assert_eq!(exempt["nominal_cbs"], "9.00");
    assert_eq!(exempt["total_nominal"], "10.00");
    assert_eq!(exempt["payment_status"], "dispensed");
    assert_eq!(exempt["payable_ibs_cbs"], "0.00");
    let unconfirmed = standard(false);
    assert_eq!(unconfirmed["payment_status"], "undetermined");
    assert_eq!(unconfirmed["total_nominal"], "10.00");
    assert!(unconfirmed["payable_ibs_cbs"].is_null());
}

#[test]
fn unsupported_period_regime_and_non_cent_inputs_return_stable_errors() {
    let error =
        |operation, input: Value| evaluate(operation, &input.to_string(), &Map::new()).err();
    assert_eq!(
        error("br_inss", json!({"date":"2025-12-31","gross":"1"})),
        Some(MathError::Unsupported)
    );
    assert_eq!(
        error("br_inss", json!({"date":"2026-02-29","gross":"1"})),
        Some(MathError::InvalidInput)
    );
    assert_eq!(
        error("br_inss", json!({"date":"2026-06-30","gross":"0.001"})),
        Some(MathError::Domain)
    );
    assert_eq!(
        error("br_inss", json!({"date":"2026-06-30","gross":100})),
        Some(MathError::InvalidInput)
    );
    assert_eq!(
        error(
            "br_inss",
            json!({"date":"2026-06-30","gross":"2000","jobs":2})
        ),
        Some(MathError::InvalidInput)
    );
    assert_eq!(
        error("br_irpf", json!({"date":"2026-12-31","gross":"600000.01"})),
        Some(MathError::Unsupported)
    );
    assert_eq!(
        error(
            "br_ibs_cbs",
            json!({"date":"2027-01-01","base":"1000","ancillary_obligations_met":true})
        ),
        Some(MathError::Unsupported)
    );
    assert_eq!(
        error(
            "br_iof",
            redemption("lci", "2026-01-01", "2026-07-01", "1100")
        ),
        Some(MathError::Unsupported)
    );
    assert_eq!(
        error(
            "br_iof",
            redemption("cdb", "2026-01-01", "2026-01-01", "1100")
        ),
        Some(MathError::Domain)
    );
    let input = r#"{"date":"2026-01-01","gross":"100.00"}"#;
    assert_eq!(
        evaluate(
            "br_inss",
            input,
            json!({"currency":"USD"}).as_object().unwrap()
        )
        .err(),
        Some(MathError::Unsupported)
    );
    assert_eq!(
        evaluate(
            "br_inss",
            input,
            json!({"rounding":"half_even"}).as_object().unwrap()
        )
        .err(),
        Some(MathError::Unsupported)
    );
    assert_eq!(
        evaluate(
            "br_inss",
            r#"{"date":"2026-01-01","gross":"100.00","gross":"100.00"}"#,
            &Map::new()
        )
        .err(),
        Some(MathError::InvalidInput)
    );
}
