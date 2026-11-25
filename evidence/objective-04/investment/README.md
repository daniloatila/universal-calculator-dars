# Investment evidence · Objective 04

[Português brasileiro](README.pt-BR.md) · [Independent CLI results](cli-oracle.json)

## Calculation model

The Rust engine projects nominal and real balances from an opening amount, periodic cash flows and one-off period overrides. The input assigns one currency and states effective rates as decimal fractions, so `0.01` means 1% per chosen period. It supports opening or closing deposits and withdrawals, retention or distribution of positive net gains, fees, taxes, inflation and calendar dates.

For each period the engine computes gross earnings on the balance after opening flows. The fee uses the post-return balance and adds the fixed fee. The scenario tax applies to positive gross earnings. Closing flows follow the period's earnings, fees and distributions. The gross projection repeats the same external flows and distribution policy with zero fees and tax. Real profit deflates deposits, withdrawals and distributions at their respective boundaries. Simple nominal and real returns divide matching profits by contributed capital, using individually deflated contributions for the real rate. Financial amounts use rational arithmetic and the selected presentation rounding.

| Product | Supported calculation and assumptions |
| --- | --- |
| Generic | Effective period rate with period, calendar day, business day, month, quarter or year as an explicit unit. |
| CDB, RDB, LCI, LCA | Manual effective return, effective daily DI times participation, or same-period IPCA and spread. RDB is nontransferable, LCI is backed by real-estate credit and LCA by agribusiness credit. Contractual precision, lock-in and issuer terms depend on the contract. |
| Tesouro Prefixado | Portfolio projection at the supplied effective period rate. The result has a maturity-projection valuation label. |
| Tesouro Selic and Tesouro IPCA+ | Projection combines same-period index and spread as `(1 + index) × (1 + spread) − 1`. The supplied IPCA index also serves as the default purchasing-power deflator. Early-sale valuation requires actual market prices. |
| Poupança | Manual anniversary returns, including published historical rates, or a derived monthly Selic–TR return for eligible deposits opened from 4 May 2012. A first incomplete period earns zero. Days 29–31 move the base to day 1 of the following month. |

Derived savings uses the 0.5% monthly additional rate above 8.5% annual Selic. At and below 8.5%, it converts 70% of the annual target to a monthly compounded factor. The latter branch is marked approximate when it uses a bounded 18-decimal lower factor. TR and the additional factor compound. The model represents one monthly credit cohort for an individual or nonprofit account with cash flows at period boundaries. Additional deposit cohorts, intraperiod balances and bank posting adjustments carry their own terms.

Indexed and savings scenarios carry a manually supplied provenance field and ISO reference date. These values are kept with the result and Proof. The engine runs offline. Statutory tax and guarantee eligibility, fund custody, coupon schedules, product valuation from actual quotations, and redemption restrictions are outside this projection. The Scenario Comparator can vary declared assumptions across separately computed results.

## Independent checks

The [Python CLI oracle](../../../tests/verify-investment-business.py) uses standard-library Decimal and Fraction arithmetic, closed-form annuities, public methodology examples, and exact currency comparisons. It invokes the native Windows CLI and inspects the JSON Calculation Proof and stable error codes.

| Check | Independent expectation |
| --- | --- |
| Federal central bank savings example, 1–31 Mar 2001 | BRL 500.00 at the end. Zero completed credit periods. |
| Federal central bank savings example, 17 May–30 Aug 2002 | BRL 10,221.87 from the three credited rates 0.6683%, 0.7516% and 0.7826%. |
| Selic branch and leap-year anniversary | Zero, below, at and above 8.5%. A 31 Jan 2024 opening has its first complete period on 1 Mar 2024. |
| DI participation and calendar | 105% of a synthetic 0.04% effective daily DI with weekend and an explicitly supplied holiday excluded. |
| Closed form, variable cash flows and presentation | Opening and closing deposits, negative and zero rates, deflation, tax, fees, reinvestment, rounding, pagination and rejected inputs. |

```powershell
. .\scripts\dev-env.ps1
cargo build --locked -p dars-cli
python -X utf8 tests/verify-investment-business.py target/debug/dars.exe
```

## Primary sources

- Banco Central do Brasil publishes the complete-period savings methodology and the two numerical examples. Its FAQ describes deposits on days 29–31. [Methodology and examples](https://www3.bcb.gov.br/CALCIDADAO/publico/metodologiaCorrigirPelaPoupanca.do?method=metodologiaCorrigirPelaPoupanca) · [Anniversary FAQ](https://www.bcb.gov.br/meubc/faqs/p/posso-abrir-caderneta-de-poupanca-nos-dias-29-30-e-31-qual-a-diferenca)
- The Selic conditions and account credit conventions come from Lei 12.703, BCB and Caixa's account terms. [Lei 12.703/2012](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12703.htm) · [BCB savings remuneration](https://www.bcb.gov.br/estatisticas/remuneradepositospoupanca) · [Caixa terms](https://www.caixa.gov.br/Downloads/poupanca-integrada/regulamento-poupanca.pdf)
- B3 documents the DI index, CDB settlement and characteristics of private fixed-income securities. The engineering test uses a synthetic daily rate and a user-supplied holiday. [DI methodology](https://www.b3.com.br/pt_br/market-data-e-indices/indices/indices-de-segmentos-e-setoriais/di/metodologia-de-calculo-do-indice-di/) · [CDB handbook](https://www.b3.com.br/data/files/E9/24/20/40/0D331610D1820216790D8AA8/Manual-do-Produto-Certificado-de-Deposito-Bancario-CDB.pdf) · [RDB](https://www.b3.com.br/pt_br/produtos-e-servicos/registro/renda-fixa-e-valores-mobiliarios/recibo-de-deposito-bancario.htm) · [LCI](https://www.b3.com.br/pt_br/produtos-e-servicos/central-depositaria/renda-fixa-e-valores-mobiliarios/letra-de-credito-imobiliario.htm) · [LCA](https://www.b3.com.br/pt_br/produtos-e-servicos/registro/renda-fixa-e-valores-mobiliarios/letras-de-credito-do-agronegocio.htm)
- Treasury explains maturity and early redemption. IBGE defines inflation and the index used by the real-value examples. BCB supplies the opening-deposit annuity formula. [Treasury rules](https://www.tesourodireto.com.br/sobre-o-tesouro/regras-e-regulamento) · [IBGE inflation](https://www.ibge.gov.br/explica/inflacao.php) · [BCB regular deposits methodology](https://www3.bcb.gov.br/CALCIDADAO/publico/exibirMetodologiaAplicacaoDepositosRegulares.do?method=exibirMetodologiaAplicacaoDepositosRegulares)
