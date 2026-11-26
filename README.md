# Universal Calculator (DARS)

*Compute anything. Anywhere.*

[Português brasileiro](README.pt-BR.md)

DARS is a local-first computation platform by Danilo Átila. The 0.6.0 review branch brings 25 workspaces to Windows and the browser. Rust computes the results, including exact rational table aggregates and reproducible seeded simulations. Each record carries the method, inputs and applicable limits. [Data Lab revision](evidence/objective-05/revision-01/REPORT.md) · [Objective 05](evidence/objective-05/REPORT.md)

Search for a workspace by name or description. In a science workspace, select an operation and load its example to inspect the result and Calculation Proof.

- **Productivity** — Math Notebook, Formula Studio and Automation Studio.
- **Science, engineering and data** — Statistics, Probability, Simulation, Optimization, Physics & Engineering, Graph Lab and Data Lab.
- **Finance and business** — Financial, Investment, Loans, Tax and Business, including the approved 0.4.1 Scenario Comparator.
- **Arithmetic and analysis** — Standard, Scientific, Algebra, Calculus and Linear Algebra.
- **Specialized tools** — Geometry, Discrete Mathematics, Programmer, Converter and Date & Time.

The active workspace loads its own mathematical resources. Calculation records can be inspected and downloaded locally. Standard is available offline after the web shell is prepared, and advanced workspaces become available offline once their resources are cached. [0.3.1 locale audit](evidence/objective-03/revision-01/REPORT.md) · [0.3.0 audit](evidence/objective-03/REPORT.md) · [Calculation records](evidence/objective-03/calculation-proof/contract.md)

Version 0.6.0 adds Math Notebook, Formula Studio and Automation Studio. Each runs locally with AI disabled. The optional desktop Intelligence panel can inspect a model server on a selected loopback address. See the [review report](evidence/objective-06/REPORT.md) and [community formula library](community/formulas/README.md).

## Foundation

The owner approved Objective 01 revision 01 (0.1.1). Its Standard calculator uses one Rust math engine in the Windows x64 app, browser and CLI. It supports arithmetic, percentages, fractions, powers and roots, editable expressions, temporary history and memory based on evaluated values. Dark navy is the default theme on fresh profiles.

- [Build from source](docs/en/build.md)
- [Use Standard](docs/en/standard.md)
- [Operations, privacy and diagnostics](docs/en/operations.md)
- [Architecture and numeric contract](docs/en/architecture.md)
- [Privacy and security design](docs/en/security.md)
- [Roadmap](ROADMAP.md) and [project state](PROJECT_STATE.md)
- [Objective 01 revision 01](evidence/objective-01/revision-01/REPORT.md) and [0.1.0 baseline](evidence/objective-01/REPORT.md)
- [Original mission](PROJECT_SPEC.md) and [English translation](docs/en/mission.md)

The approved Objective 02 version 0.2.2 restores module scheduler capacity after an isolated task stops responding and serves as the regression baseline. [Objective 02 revision 02](evidence/objective-02/revision-02/REPORT.md) · [Native capabilities and performance](evidence/objective-02/revision-01/REPORT.md)

DARS uses the [Apache License 2.0](LICENSE).
