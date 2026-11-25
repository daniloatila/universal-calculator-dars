# Business evidence · Objective 04

[Português brasileiro](README.pt-BR.md) · [Independent CLI results](cli-oracle.json)

## Calculation model

| Operation | Formula and scope |
| --- | --- |
| Pricing | Markup is gross profit divided by unit cost. Gross margin is gross profit divided by selling price. The price can be derived from either target or supplied directly. Contribution deducts variable sales charges, and optional quote rounding applies before computing the quoted margin. |
| Accrual margins | Revenue less cost of goods sold gives gross profit. Revenue less variable cost gives contribution. EBIT and net income incorporate the separately supplied expense and tax lines. All margins use revenue. |
| Break-even | Units equal fixed cost divided by unit contribution. The financial threshold removes noncash fixed charges and adds specified fixed cash outlays. Saleable-unit thresholds round up. |
| Financial indicators | ROI uses gains relative to cost. ROE and ROA use average equity and assets. ROIC uses NOPAT and supplied average invested capital. Liquidity, liabilities to assets and working capital use the applicable balance sheet inputs. Quick assets exclude inventory and prepayments. |
| EBITDA | The unadjusted CVM 156 reconciliation adds income taxes and net finance costs to net income for EBIT and adds depreciation, amortization and depletion for EBITDA. |
| Operating and financial cycles | Inventory, receivables and payables days divide average balances by matching period volumes. The operating cycle adds inventory and receivables days. The financial cycle then deducts payables days. |
| Planning | Budget projects accrual revenue, cost and expense separately from receipts, payments and cash. It adds the initial outlay at period zero and discounts subsequent net cash flows for NPV. One-off planned amounts, actual amounts, actual-minus-plan variances and sensitivity to the revenue growth assumption remain visible. |

Indicators with unavailable or nonpositive denominators report the relevant reason. ROE flags a nonpositive equity balance at either endpoint. Zero revenue leaves margins undefined, while zero unit contribution leaves positive fixed cost unrecovered. A negative financial cycle, negative working capital or negative net income may be valid. Interpretation uses matching periods, accounting definitions and the entity's circumstances.

Calculations use exact rationals before presentation. Currency results adopt the chosen minor-unit rounding rule, and ratios and days display up to 12 decimal places. Plan period 1 uses base amounts, growth applies thereafter and overrides apply only to the selected period. Budget observations keep actuals separate from forecasts. NPV sign refers to the supplied cash assumptions and discount rate. The output also records minimum modeled cash, including period zero.

## Independent checks

The [Python CLI oracle](../../../tests/verify-investment-business.py) uses Decimal and Fraction from the standard library and runs the Windows CLI with structured JSON. It checks calculation results, Proof metadata and stable error codes.

| Check | Independent expectation |
| --- | --- |
| Owner's mandatory pricing example | Unit cost 100 at 25% markup gives price 125 and gross margin 20%. |
| Accrual and cash | Gross profit 100, contribution 100, EBIT 65, EBITDA 70 and net profit 55 on revenue 200 with the fixture's costs. A separate budget shows profits, cash and discounted flows. |
| CVM 156 reconciliation | Net income 12 plus income taxes 4 and net finance cost 3 gives EBIT 19. The additional charge of 2 gives EBITDA 21. |
| Accounting and financial break-even | Fixed charges are divided by the same unit contribution. Cash charges are adjusted before division. Whole-unit requirements round up. |
| Null and signed values | Zero revenue, zero turnover denominator and nonpositive equity are identified. Signed returns, quick ratio, working capital, positive and negative cash cycles and zero NPV are exercised. |
| Stress and bounds | Large decimal outputs keep period pages within the proof size limit. Incompatible assumptions and limit violations return explicit errors. |

```powershell
. .\scripts\dev-env.ps1
cargo build --locked -p dars-cli
python -X utf8 tests/verify-investment-business.py target/debug/dars.exe
```

## References

- CVM Resolution 156 article 3 gives the components of unadjusted LAJIR and LAJIDA. [CVM publication](https://conteudo.cvm.gov.br/legislacao/resolucoes/resol156.html) · [Resolution text](https://conteudo.cvm.gov.br/export/sites/cvm/legislacao/resolucoes/anexos/100/resol156.pdf)
- The U.S. Small Business Administration publishes the single-product break-even formula using fixed cost and unit contribution. [SBA break-even calculator](https://www.sba.gov/counseling/plan-your-business/break-even-point-calculator/)
- IAS 7 describes cash movements and the adjustments that connect cash flows and accrual results. The plan uses separate modeling inputs for these measures. [IFRS Foundation, IAS 7](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows.html/)
- OpenStax defines working capital, the quick ratio and the cash conversion cycle in its finance textbook. [Working capital](https://openstax.org/books/principles-finance-2e/pages/19-1-what-is-working-capital)
