# Objective 03 internal stages

[Português brasileiro](PLAN.pt-BR.md) · [Owner authorization](../objective-02/approval.json) · [Mission](../../PROJECT_SPEC.md)

The 0.2.2 delivery is the accepted baseline. Each internal stage records its mathematical specification, dependency investigation, domains and limits, engine and interface, module and adaptive integration, localization, independent mathematical validation, security, performance, documentation and regression. Record internal acceptance before starting the next stage. Calculation Proof applies from the first stage. Objective 03 remains in progress through the global audit.

| Stage | Module | State |
| --- | --- | --- |
| 1 | Scientific | INTERNALLY_ACCEPTED · [Verification](scientific/verification.md) · [CI](scientific/ci.json) |
| 2 | Algebra | INTERNALLY_ACCEPTED · [Verification](algebra/verification.md) · [CI](algebra/ci.json) |
| 3 | Calculus | INTERNALLY_ACCEPTED · [Verification](calculus/verification.md) · [CI](calculus/ci.json) |
| 4 | Linear Algebra | INTERNALLY_ACCEPTED · [Verification](linear-algebra/verification.md) · [CI](linear-algebra/ci.json) |
| 5 | Geometry | INTERNALLY_ACCEPTED · [Verification](geometry/verification.md) · [CI](geometry/ci.json) |
| 6 | Discrete Mathematics | INTERNALLY_ACCEPTED · [Verification](discrete-mathematics/verification.md) · [Superseded CI run](discrete-mathematics/ci.json) |
| 7 | Programmer | INTERNALLY_ACCEPTED · [Verification](programmer/verification.md) · [CI](programmer/ci.json) |
| 8 | Converter | INTERNALLY_ACCEPTED · [Verification](converter/verification.md) · [CI](converter/ci.json) |
| 9 | Date & Time | INTERNALLY_ACCEPTED · [Verification](date-time/verification.md) · [CI](date-time/ci.json) |
| Audit | Integrated Objective 03 | READY_FOR_REVIEW · [Audit report](REPORT.md) · [Acceptance](acceptance.json) · [CI](ci.json) |

The global audit repeats the baseline's 602 mapped checks, exercises all ten modules and seven locales, and verifies Windows, browser, CLI/WASM, CI, security, offline operation, performance, memory and publication. [Baseline regressions](../objective-02/revision-02/tests.json) · [Windows memory debt and protocol](../objective-02/revision-02/memory-debt.md)
