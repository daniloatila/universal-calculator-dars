# Regression and comparison with 0.5.0

[Português brasileiro](regression.pt-BR.md)

The original [mapping](../regression.json) identifies the 602 historical positions. The revision uses maintained, executable equivalents and separates platform-specific observations. Counts from overlapping layers have different meanings. [Current suite counts](regression.json)

| Historical check | Positions | Current evidence |
| --- | ---: | --- |
| Rust Standard and structured tests | 16 | Three-platform Rust CI |
| CLI Fraction/Decimal oracle | 157 | Linux independent reference suite |
| Structured WASM arithmetic oracle | 291 | Linux independent reference suite |
| Standard CLI/WASM comparisons | 20 | Linux native/WASM parity |
| Node tests | 57 | Maintained Node suite |
| Chrome on physical Windows | 27 | Seven original spec files included in the current full Chrome run |
| Production browser offline | 10 | Production assets and lazy locale loading |
| Native Windows UI | 17 | Verified source-build executable on physical WebView2 |
| Windows credentials and capabilities | 7 | Two named credential tests and five capability tests |

The 2,355 advanced mathematics cases, 305 native/WASM mathematics comparisons and 577 independent finance cases are listed by suite. The Scenario Comparator exercises 84 independent cases and compares 84 cases across targets, with 79 proof replays. Scientific suites use independent numerical references and separately exercise boundary contracts, graph behavior, module work and seeded replay. Each of 36 batches matched the one-shot simulation proof. [Hosted receipts](ci.json) · [Windows artifact](windows-artifact.json) · [Native UI](windows-regression.json)

The complete Chrome run includes the 224 tests represented in 0.5.0 and the corrective integration cases. The 924-case language matrix includes six directed transitions from each of seven languages in each of 22 workspaces. The separate finance and science examples were exercised offline in the verified native application. [Chrome](browser.json) · [Language matrix](locale-transition-matrix.json) · [Finance offline](windows-finance-offline.json) · [Science offline](windows-candidate.json)
