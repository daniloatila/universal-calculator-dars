# Objective 04 · Finance and business

[Português brasileiro](REPORT.pt-BR.md) · [Project state](../../PROJECT_STATE.md)

DARS 0.4.0 is **READY_FOR_REVIEW** on the dedicated branch. The exact source passed the Linux, macOS, Windows and security jobs. The audited 0.3.1 remains the Standard and resource comparison reference. [Acceptance ledger](acceptance.json) · [GitHub Actions](ci.json)

| Stage | Scope | Evidence |
| --- | --- | --- |
| Financial | Interest, equivalent rates, present and future value, annuities, discounting, cash flows, NPV, IRR, MIRR, and payback | [Method and limits](financial/methods.md) |
| Investment | Local balances, contributions and withdrawals, inflation, fees, taxes, variable rates and Brazilian product models | [Method and limits](investment/README.md) |
| Loans | Price, SAC, uniform and single-payment schedules, grace periods, prepayments and economic effective cost | [Method and limits](loans/methods.md) |
| Tax | Versioned and date-bounded simulations for Brazil, including social security, income, salary, investments, IOF, São Paulo ICMS and 2026 IBS/CBS | [Rule matrix](tax/rules.md) |
| Business | Pricing, margins, break-even, ratios, operating cycles, budgets and cash-flow projections | [Method and limits](business/README.md) |
| Scenario Comparator | Local snapshots, duplicate and edit, comparisons of applied metrics and replayable exports | [Decisions and format](changes.md) |

The acceptance ledger records which checks ran, their scope, and any remaining verification. Review the engine and resource results alongside the documentation below.

The independent Windows CLI results covered 128 Financial and Loans cases, 87 Investment and Business cases and 362 Tax cases. The periodic IRR fixture returns 10% and 20% exactly. The pricing fixture returns 125 at a 25% markup on cost 100 and a 20% margin on revenue. The tax oracle includes published Receita Federal examples, dated benefits and limits, and the missing-day rule for the six-calendar-month LCI/LCA perimeter. [Independent results](tests.json) · [Tax references](tax/rules.md)

The production Chrome suite passed 160 tests, including the previous 146 cases. The 42 directed transitions were checked in the original ten workspaces and in the five finance workspaces. Each finance workspace ran under all five profiles with peak one worker and zero active workers after the checked batch. Five financial workspaces were reproduced offline after caching their assets. [Browser ledger](browser.json) · [Language matrix](locale-transition-matrix.json) · [Screen captures](captures.json)

Financial Rust line coverage was 95.68% across unit tests and the instrumented CLI oracles. The 360-period Price workload with final rounding had a p95 of 1.91 seconds in the initialized WASM benchmark. The loan workspace performs that work in its cancellable worker and keeps the rendered table paginated. [Coverage](coverage.json) · [Benchmarks](benchmarks.json) · [Dependencies](dependencies.json)

The hosted Windows x64 review binary passed 17 historical checks, five offline finance examples, module suspension and recovery, and worker teardown on the installed WebView2 runtime. All 15 WASM assets retrieved from the running executable matched the hosted manifest. The executable was 17,565,184 bytes and had no Authenticode signature. [Artifact provenance](windows-artifact.json) · [Historical Windows checks](windows-regression.json) · [Native financial checks](desktop.json)

Time to the first checked Standard result was 574 → 1,730 ms in the first paired comparison with 0.3.1, and 621 → 577 ms in the second. Each launch used a fresh WebView2 profile. The OS file caches stayed in their existing state, and the measured interval includes one native sampler call. The variation limits conclusions about a systematic startup change. The incremental physical RAM target stays open. [First comparison](desktop.json) · [Second comparison](desktop-repeat.json) · [Memory follow-up](../objective-02/revision-02/memory-debt.md)

- [Reproduction](reproduction.md)
- [Security and privacy](security.md)
- [Change and dependency decisions](changes.md)
- [Regressions and compatibility](regression.md)
