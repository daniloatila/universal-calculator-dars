use jiff::civil::Date;

pub(super) const FIRST: Date = jiff::civil::date(2026, 1, 1);
pub(super) const LAST: Date = jiff::civil::date(2026, 12, 31);
pub(super) const VERIFIED: &str = "2026-11-25";
pub(super) const VERSION: &str = "BR-2026.1";

const RFB_2026_TABLES: &str =
    "https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026";
const LAW_15270: &str = "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm";
const LAW_9430_ART67: &str = "https://www.planalto.gov.br/ccivil_03/leis/l9430compilada.htm#art67";
const INSS_TABLE: &str = "https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal/";
const INSS_ROUNDING: &str = "https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026-com-marcacoes.pdf";
const LAW_11033: &str = "https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm";
const LAW_8981_SAVINGS: &str = "https://www.planalto.gov.br/ccivil_03/leis/l8981.htm#art68";
const RFB_IN_1585: &str =
    "https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=67494";
const IOF_DECREE: &str =
    "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306compilado.htm#art32";
const LCI_LCA_RULE: &str = "https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=5215&tipo=RESOLU%C3%87%C3%83O+CMN";

pub(super) struct Rule {
    pub(super) id: &'static str,
    pub(super) jurisdiction: &'static str,
    pub(super) scope: &'static str,
    pub(super) exclusions: &'static str,
    pub(super) formula: &'static str,
    pub(super) rounding_id: &'static str,
    pub(super) rounding: &'static str,
    pub(super) sources: &'static [&'static str],
}

pub(super) const INSS: Rule = Rule {
    id: "br_inss_employee_2026",
    jurisdiction: "BR",
    scope: "Portaria Interministerial MPS/MF 13/2026, article 7 and Annex II; one ordinary month and one employee, domestic employee or casual worker (trabalhador avulso) RGPS contribution basis.",
    exclusions: "Multiple jobs, mixed payroll bases, individual or voluntary contributor, 13th salary, special rates, employer contributions, and payment adjustments are outside this rule.",
    formula: "INSS = sum of each marginal band contribution truncated to cents below the contribution cap",
    rounding_id: "toward_zero_each_inss_band",
    rounding: "eSocial S-5001 truncates each marginal band to two decimal places before summing.",
    sources: &[INSS_TABLE, INSS_ROUNDING],
};

pub(super) const IRRF: Rule = Rule {
    id: "br_irrf_monthly_2026",
    jurisdiction: "BR",
    scope: "Resident individual, one payer, ordinary monthly income subject to annual adjustment. The caller supplies all eligible legal deductions apart from dependents.",
    exclusions: "Multiple payers, 13th salary, vacation payroll, withholding offsets, arrears, PLR, dividends, foreign income, and special regimes are outside this rule.",
    formula: "base = gross - min(gross,max(legal,simplified)); computed tax = progressive(base) - relief(gross); withholding is waived when computed tax <= BRL 10.00",
    rounding_id: "half_up_tax_and_relief",
    rounding: "Simulation rounds progressive tax and tax relief separately to BRL cents, nearest cent with ties away from zero.",
    sources: &[RFB_2026_TABLES, LAW_15270, LAW_9430_ART67],
};

pub(super) const IRPF: Rule = Rule {
    id: "br_irpf_annual_2026",
    jurisdiction: "BR",
    scope: "Resident individual; 2026 calendar income subject to 2027 ordinary annual adjustment. Education input covers one eligible person. The caller supplies other eligible deductions and directly creditable withholding.",
    exclusions: "Mixed, foreign, exempt or exclusive-tax income, high-income minimum, incentive credits, carryovers, declaration preparation and collection rules are outside this calculation.",
    formula: "base = gross - min(gross,max(legal,simplified)); estimated balance = progressive(base) - relief(gross) - withheld",
    rounding_id: "half_up_tax_and_relief",
    rounding: "Simulation rounds the simplified deduction, progressive tax and relief individually to BRL cents, nearest cent with ties away from zero. The statutory formula yields BRL 0.02 of relief at BRL 88,200.00.",
    sources: &[RFB_2026_TABLES, LAW_15270],
};

pub(super) const PAYROLL: Rule = Rule {
    id: "br_payroll_employee_2026",
    jurisdiction: "BR",
    scope: "Resident RGPS employee with only one ordinary monthly payroll and one source; gross is the shared INSS and IRRF income basis. Other eligible deductions are applied only to the IRRF basis.",
    exclusions: "Different payment and contribution months, 13th salary, vacation, allowances, discounts, FGTS, employer charges, and multiple jobs are outside this scope.",
    formula: "Net after listed taxes = gross - capped progressive INSS - monthly withholding after applicable relief and waiver",
    rounding_id: "inss_truncate_bands_irrf_half_up",
    rounding: "INSS truncates each marginal band to cents. For IRRF, the progressive tax and tax relief each round to BRL cents, nearest cent with ties away from zero.",
    sources: &[
        INSS_TABLE,
        INSS_ROUNDING,
        RFB_2026_TABLES,
        LAW_15270,
        LAW_9430_ART67,
    ],
};

pub(super) const INVESTMENT: Rule = Rule {
    id: "br_fixed_income_resident_2026",
    jurisdiction: "BR",
    scope: "One realized redemption by a resident individual. CDB, RDB and Tesouro Direto without coupons use the fixed-income schedule. Non-price-indexed LCI and LCA bought at issue since 2025-05-26, held at least six calendar months, and savings interest are exempt from income tax.",
    exclusions: "Inputs are actual acquisition and redemption before withholding. Longer contractual lockups, price-indexed LCI/LCA, tax-loss carryovers, secondary sale, multiple lots, fees, coupons, other assets or investor categories are outside the rule.",
    formula: "gain = redemption - principal; IOF = min(positive gain times annex limit, redemption times 0.01 times days) before day 30; IR = positive gain net of IOF times holding-period rate",
    rounding_id: "half_up_iof_then_income_tax",
    rounding: "Round the actual modeled IOF to BRL cents before deducting it from realized gain. Round resulting IR to BRL cents. Nearest cent with ties away from zero.",
    sources: &[
        LAW_11033,
        RFB_IN_1585,
        IOF_DECREE,
        LAW_8981_SAVINGS,
        LCI_LCA_RULE,
    ],
};

pub(super) const IOF: Rule = Rule {
    id: "br_iof_selected_redemption_2026",
    jurisdiction: "BR",
    scope: "Decree 6306/2007 article 32 and annex; ordinary qualifying redemption of one CDB, RDB or Tesouro Direto lot by a resident individual, using elapsed calendar days.",
    exclusions: "Credit, exchange, insurance, funds with special rules, short-sale, secondary transfers, coupon, repurchase exceptions and same-day redemption are outside this rule.",
    formula: "before day 30: IOF = min(redemption times 0.01 times days, positive gain times annex limit); day 30 onward: zero",
    rounding_id: "half_up_at_iof",
    rounding: "The modeled IOF rounds to BRL cents after applying both limits, nearest cent with ties away from zero.",
    sources: &[IOF_DECREE],
};

pub(super) const ICMS: Rule = Rule {
    id: "br_sp_icms_internal_general_2026",
    jurisdiction: "BR-SP",
    scope: "Ordinary SP internal sale of goods subject to the general rate under RICMS/SP article 52(I), using the full ICMS-inclusive operation base under LC 87/1996 Article 13.",
    exclusions: "Interstate, reduced or special rates, exemptions, FCP, substitution, Simples Nacional, credit offsets, additional invoice charges and other taxes are outside this rule.",
    formula: "included ICMS = gross operation basis times 0.18; price less ICMS = gross basis - included ICMS",
    rounding_id: "half_up_at_icms",
    rounding: "The modeled amount for one operation rounds to BRL cents, nearest cent with ties away from zero.",
    sources: &[
        "https://legislacao.fazenda.sp.gov.br/Paginas/art052.aspx",
        "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp87.htm#art13",
    ],
};

pub(super) const IBS_CBS: Rule = Rule {
    id: "br_ibs_cbs_2026_test_transition",
    jurisdiction: "BR",
    scope: "Ordinary national 2026 test operation with caller-supplied eligible Article 12 basis; LC 214/2025 Articles 343, 346 and 348 as consolidated after LC 227/2026.",
    exclusions: "Determination of compliance, credits, legacy contributions, Simples, fuels, differentiated regimes, actual collection when dispensation is unconfirmed and 2027+ periods are outside this snapshot.",
    formula: "nominal state IBS = basis times 0.001; municipal IBS = 0; nominal CBS = basis times 0.009; Article 348(1) payment dispensation if accessory obligations were met",
    rounding_id: "half_up_separate_ibs_cbs",
    rounding: "Each nominal tax is rounded separately to BRL cents, nearest cent with ties away from zero, before totaling.",
    sources: &[
        "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm#art343",
        "https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/reforma-tributaria-do-consumo/entenda/entenda-a-reforma-tributaria-do-consumo",
    ],
};

// Legal table amounts are integer BRL cents, while fractional rates are parts per million.
pub(super) const INSS_CAP: i64 = 847_555;
pub(super) const INSS_BANDS: [(i64, i64); 4] = [
    (162_100, 75_000),
    (290_284, 90_000),
    (435_427, 120_000),
    (INSS_CAP, 140_000),
];

pub(super) const MONTHLY_DEPENDENT_DEDUCTION: i64 = 18_959;
pub(super) const MONTHLY_WITHHOLDING_MINIMUM: i64 = 1_000;
pub(super) const ANNUAL_DEPENDENT_DEDUCTION: i64 = 227_508;
pub(super) const ANNUAL_EDUCATION_LIMIT: i64 = 356_150;
pub(super) const HIGH_INCOME_THRESHOLD: i64 = 60_000_000;
pub(super) const LCI_LCA_FIRST_PURCHASE: Date = jiff::civil::date(2025, 5, 26);
pub(super) const LCI_LCA_MIN_MONTHS: i64 = 6;

pub(super) struct Bracket {
    pub(super) upper_cents: i64,
    pub(super) rate: i64,
    pub(super) deduction_cents: i64,
}

const fn bracket(upper_cents: i64, rate: i64, deduction_cents: i64) -> Bracket {
    Bracket {
        upper_cents,
        rate,
        deduction_cents,
    }
}

pub(super) struct IncomeTaxTable {
    pub(super) brackets: [Bracket; 4],
    pub(super) top_bracket: Bracket,
    pub(super) simplified_cap: i64,
    pub(super) simplified_rate: Option<i64>,
    pub(super) full_relief_upper: i64,
    pub(super) full_relief_cap: i64,
    pub(super) partial_relief_upper: i64,
    pub(super) partial_relief_offset: i64,
    pub(super) partial_relief_rate: i64,
}

pub(super) const MONTHLY_INCOME_TAX: IncomeTaxTable = IncomeTaxTable {
    brackets: [
        bracket(242_880, 0, 0),
        bracket(282_665, 75_000, 18_216),
        bracket(375_105, 150_000, 39_416),
        bracket(466_468, 225_000, 67_549),
    ],
    top_bracket: bracket(i64::MAX, 275_000, 90_873),
    simplified_cap: 60_720,
    simplified_rate: None,
    full_relief_upper: 500_000,
    full_relief_cap: 31_289,
    partial_relief_upper: 735_000,
    partial_relief_offset: 97_862,
    partial_relief_rate: 133_145,
};

pub(super) const ANNUAL_INCOME_TAX: IncomeTaxTable = IncomeTaxTable {
    brackets: [
        bracket(2_914_560, 0, 0),
        bracket(3_391_980, 75_000, 218_592),
        bracket(4_501_260, 150_000, 472_991),
        bracket(5_597_616, 225_000, 810_585),
    ],
    top_bracket: bracket(i64::MAX, 275_000, 1_090_466),
    simplified_cap: 1_764_000,
    simplified_rate: Some(200_000),
    full_relief_upper: 6_000_000,
    full_relief_cap: 269_415,
    partial_relief_upper: 8_820_000,
    partial_relief_offset: 842_973,
    partial_relief_rate: 95_575,
};

pub(super) const IOF_GAIN_LIMITS: [i64; 29] = [
    96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20,
    16, 13, 10, 6, 3,
];

pub(super) fn fixed_income_ir_rate(days: i64) -> i64 {
    match days {
        ..=180 => 225_000,
        181..=360 => 200_000,
        361..=720 => 175_000,
        _ => 150_000,
    }
}

pub(super) const SP_STANDARD_ICMS: i64 = 180_000;
pub(super) const IBS_TEST_RATE: i64 = 1_000;
pub(super) const CBS_TEST_RATE: i64 = 9_000;
