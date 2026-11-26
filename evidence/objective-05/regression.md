# Regression mapping

[Português brasileiro](regression.pt-BR.md)

The Objective 05 audit reverified all 602 inherited checks. The count includes 578 local engine, web and browser checks, 17 checks on physical Windows WebView2 and seven checks in the exact-source hosted Windows job. Earlier numerical and financial reruns keep their original receipts. The financial and comparator oracles that identify their executable record the local history CLI SHA-256 `62855de300d81f877ac1723d7d26a44896dad1b0ac42defd5d904d4b3d6a8fd4`. [Machine-readable ledger](regression.json) · [Approved 0.4.1 mapping](../objective-04/revision-01/tests.json)

## The 602 inherited checks

| Historical category | Mapped | Observed in Objective 05 |
| --- | ---: | --- |
| Standard Rust suite | 16 | Ten Standard and six structured-value tests passed. Five additional proof tests also passed in `review-tests.log`. |
| Independent Standard CLI oracle | 157 | 157 passed on the local release CLI in `history/oracle.txt`. |
| Independent structured Standard WASM oracle | 291 | 291 passed on generated WASM in `history/structured.txt`. |
| Standard CLI/WASM results | 20 | 20 passed in `history/check-targets.txt`. |
| TypeScript and Node | 57 | The final-source suite passed 70 tests, including the 57 inherited equivalents, in `frontend-label-node.log`. |
| Chrome on physical Windows | 27 | The final-source Chrome suite passed all seven inherited test files. The per-file mapping is in the JSON ledger. |
| Explicit production web offline verification | 10 | 10 passed in the standalone offline suite. It exercises offline reload and lazy locale assets. |
| Native Windows WebView2 | 17 | All 17 passed on physical Windows using WebView2 `158.0.4370.33` and the verified hosted executable. [Runtime receipt](integrated-audit/windows-regression.json) · [Artifact provenance](integrated-audit/windows-artifact.json) |
| Windows credential provider | 2 | Both passed in the hosted Windows release step, including the synthetic Credential Manager round trip enabled by `--include-ignored`. [Hosted receipt](integrated-audit/ci.json) |
| Windows capability and sensor tests | 5 | All five named capability and sensor checks passed in the hosted Windows desktop step. [Hosted receipt](integrated-audit/ci.json) |

## Mathematical and financial regression suites

| Mathematical module | Independent CLI | CLI/WASM | Isolation |
| --- | ---: | ---: | ---: |
| Scientific | 102 real, 75 complex | 19 | 1 |
| Algebra | 184 | 28 | 1 |
| Calculus | 210 | 27 | 2 |
| Linear Algebra | 223 | 30 | 3 |
| Geometry | 159 | 32 | 4 |
| Discrete Mathematics | 289 | 38 | 5 |
| Programmer | 368 | 36 | 6 |
| Converter | 342 | 46 | 7 |
| Date & Time | 403 | 49 | 8 |
| **Total within each suite** | **2,355** | **305** | **37** |

The Standard Calculation Proof suite separately passed nine CLI/WASM cases, including five replays. Finance passed 577 independent CLI cases across Financial and Loans (128), Investment and Business (87), and Tax (362). The 87 comprise 49 Investment and 38 Business cases. The five baseline financial CLI/WASM suites passed 49 cases with 20 separate isolation checks. Financial passed 15, Investment 3, Loans 7, Tax 17 and Business 7.

The semantic comparison passed 84 independent CLI cases and 79 independent proof replays. Its isolated CLI/WASM suite also passed 84 cases with 79 proof replays. These are separate checks of the same comparison corpus. Chrome ran 14 finance-workspace tests and 12 comparator tests, including normalized rates, solver resolution and historical replay. The standalone production web offline script passed one case each for Financial, Investment, Loans, Tax and Business.

The verified 0.5.0 Windows executable passed five offline financial examples on physical WebView2, covering IRR, investment projection, SAC amortization, Brazilian income-tax withholding and price from margin. A separate run imported and reproduced the historical comparison, retained its result after switching modules and confirmed zero difference on the normalized rate basis. Both finance runs are counted separately from the 602 inherited checks, and the 0.4.1 Windows receipts retain their original provenance. [Current offline finance](integrated-audit/windows-finance-offline.json) · [Current comparator](integrated-audit/windows-finance-comparison.json) · [Exported comparison proof](integrated-audit/windows-finance-comparison-proof.json) · [Approved Windows finance](../objective-04/revision-01/desktop.json) · [Approved Windows comparator](../objective-04/revision-01/after-windows.json)

## Browser and hosted scope

Local Chrome 158.0.8127.38 passed 224 tests on commit `50225fb5dccb677b10653058f81d89c168a5743c`, using asset-set SHA-256 `9e19135cd5e85d01f60ae30c0a2b891de49ca696ec252c2cc61ec42889f1b491`. The run includes 146 inherited mathematical and shell tests, 14 financial workspace tests, 12 comparator tests and 52 science tests. The original Geometry lazy-loading and offline-reload failure remains in its earlier receipt. Two earlier complete runs passed 223 tests each on their own builds. [Final Chrome receipt](integrated-audit/browser.json)

The final matrix covers 42 directed language pairs and contains 420 inherited mathematical, 210 inherited financial and 294 scientific comparisons. All 924 canonical comparisons match those from the preceding complete source-matched run. The browser, notation, proof and oracle suites can cover the same workflow and keep separate counts. [Final locale matrix](locale-transition-matrix.json)

The exact-source hosted workflow `45860076452` passed all four jobs. Its Ubuntu browser job passed 224 tests in Playwright Chromium. The local browser results use Chrome on Windows, and the physical desktop results use WebView2. Firefox is outside the measured browser scope. [Hosted workflow receipt](integrated-audit/ci.json) · [Windows verification method](integrated-audit/windows-method.md) · [Reproduction](reproduction.md)
