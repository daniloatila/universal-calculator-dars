# Roadmap

[Português brasileiro](docs/pt-BR/roadmap.md) · [Project state](PROJECT_STATE.md) · [Original mission](PROJECT_SPEC.md)

Milestones describe planned scope. The original mission contains their detailed requirements. Each objective gets its own evidence pack and requires explicit owner approval before work begins on the next.

| Objective | Planned version | Scope | Acceptance focus |
| --- | --- | --- | --- |
| 01 · Foundation | 0.1.0 | Rust core, Standard module, Windows desktop, browser, initial CLI, original design, internationalization, security and CI | Run on Windows and in a browser. Verify offline operation, exact arithmetic, errors, cross-runtime parity and reproducibility. Record startup, size, CPU, memory and latency. |
| 02 · Operational intelligence | 0.2.0 | Module lifecycle, resource adaptation, privacy center, diagnostics and complete localization | Measure suspension, cancellation, recovery and gains under real and simulated constraints. Verify seven languages, RTL, privacy and prior behavior. |
| 03 · Universal mathematics | 0.3.0 | Scientific, Algebra, Calculus, Linear Algebra, Geometry, Discrete Mathematics, Programmer, Converter, Date & Time and Calculation Proof | Validate each module against independent references, properties, extreme inputs and platform/lifecycle checks. |
| 04 · Finance and business | 0.4.0 | Financial, investment, loans, tax, business and scenario comparison | Verify decimal and rounding policy, documented formulas, independently checked financial examples, auditable export and privacy. |
| 05 · Science, engineering and data | 0.5.0 | Statistics, probability, simulation, optimization, physics and engineering, graphs and data | Compare with scientific references. Measure responsiveness and resources. Exercise cancellation, seeding, large inputs and regressions. |
| 06 · Productivity, automation and AI | 0.6.0 | Notebook, formulas, declarative automation, optional AI, voice and visual recognition | Verify local-first operation, schema and permission enforcement, reproducible automation, cancellation, file compatibility and verified math. |
| 07 · Distribution and updates | 0.9.0 | Platform packages, signed mandatory updates, CLI and SDK, public web demo | Verify installers, signed updates, interruption recovery, tamper rejection and declared platform compatibility. |
| 08 · Global audit and launch | 1.0.0 | Audit across 25 modules, optimize, complete open-source documentation and prepare final distribution | Verify measured objectives and published platform claims, resolve launch blockers and obtain explicit approval before stable release. |

See [PROJECT_STATE.md](PROJECT_STATE.md) for the current gate. Review reports and approval records belong with each objective's evidence.

Objectives 01 and 02 were approved at 0.1.1 and 0.2.2. Objective 03 proceeds through nine internal stages, followed by the global audit. [Objective 01 approval](evidence/objective-01/approval.json) · [Objective 02 approval](evidence/objective-02/approval.json) · [Objective 03 stage gates](evidence/objective-03/PLAN.md)

## Windows memory follow-up

Every authorized objective from 03 through 08 includes a comparable Windows memory check. The target of less than 100 MB of incremental RAM in visible basic desktop mode remains open. The pre-1.0 audit will investigate the increase in private commit observed across repeated cycles and document its disposition before stable release. [Memory debt and investigation protocol](evidence/objective-02/revision-02/memory-debt.md)
