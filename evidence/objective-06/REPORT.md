# Objective 06 · Productivity, automation and Intelligence

[Português brasileiro](REPORT.pt-BR.md) · [Acceptance ledger](acceptance.json)

**0.6.0 · READY_FOR_REVIEW** once all four checks for the published evidence commit have passed. The owner approved Objective 05 at 95/100. Its reviewed 0.5.1 tree was integrated into main and the new work was published on the Objective 06 review branch. Objectives 01–05 are approved at 95/100 each. Objectives 07 and 08 have not started. [Approval](../objective-05/approval.json) · [Audited source](https://github.com/daniloatila/universal-calculator-dars/commit/9ca50cffaa31ab71867809c473968f3fcd46368d) · [Source CI](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45902255489)

## What to try

| Workspace | Reproducible observation |
| --- | --- |
| [Math Notebook](math-notebook/REPORT.md) | At BRL 10,000, 1% per month and 12 months the result is BRL 11,268.25 with BRL 1,268.25 gain. Editing the rate recalculates its dependent projection, graph and proof. The principal and term retain their prior results. |
| [Formula Studio](formula-studio/README.md) | Four offline community definitions pass their declared tests. An exported run preserves the expression, exact version, units, inputs, dependencies and individual Rust proof. |
| [Automation Studio](automation-studio/REPORT.md) | Four flows replay using the existing engines. The finance comparison uses compatible values. Business produces a weighted margin of 14/45. The statistical example fills a missing value explicitly. The simulation reproduces its fixed-seed quantiles and discloses approximation. |
| [DARS Intelligence](intelligence/README.md) | The disabled default allows all 25 workspaces to operate. A model can propose a calculation. A separate user action authorizes Rust execution. The financial example produces the same fraction used by the notebook. |

## The local connection

The native development build, using its packaged WebView2 window, issued inventory GET requests on November 26 at 21:32 UTC. Ollama on port 11434 and LM Studio on 1234 refused connections on both 127.0.0.1 and ::1. No prompt or key was sent. DARS now makes direct local connections for numeric loopback and retains system proxy policy for remote providers. The release candidate connected to controlled HTTP servers on both loopback families, using separate temporary ports. The observations do not identify a VPN cause. No VPN, Windows protection or model service setting was changed. Trained-model inference and paid external calls were not verified. [Default endpoint checks](intelligence/local-services.json) · [Release desktop transport](integrated-audit/windows-intelligence-native.json)

OCR recognized a synthetic printed 2+3, required confirmation and Rust returned 5. The installed Chrome exposed two local Portuguese reading voices and no ready on-device dictation in the seven locales. No microphone was opened and no audio was played. [Voice availability](voice-vision/availability.json)

## Audit results

- Installed Chrome passed 261 cases, including all 232 inherited test identities. Hosted Chromium passed 261. Node passed 89. The 25-workspace matrix contains 1,050 unique directed comparisons, and Intelligence has a separate set of 42. [Browser](integrated-audit/browser.json) · [Matrix](locale-transition-matrix.json) · [Test ledger](tests.json)
- The 602 historical checks, 2,355 independent math cases, 305 math CLI/WASM comparisons, 577 independent finance cases, 84+84 financial comparisons, 79 financial replays, 36 simulation replays and 23 Data Lab groups with 31 cross-target comparisons passed. Scientific LLVM coverage was 96.00% (6822/7106 lines). Optimization's defensive gaps remain tracked. [Regression](regression.md) · [Coverage](coverage.json)
- The verified Windows x64 binary passed 17 historical desktop checks, five offline finance cases, seven science workspaces, the three new workspaces and controlled local provider calls. The packaged 22 WASM hashes match the build receipt. Executable SHA-256 is `fd81e7a025553ebf5ddfcf057beb6d5e0ae8204cfe90011c86e18c174094221f`. [Windows package](integrated-audit/windows-artifact.json) · [Physical comparison](integrated-audit/physical-windows-comparison.json)
- Independent review found ambiguous financial JSON tokens and a flow status that overstated the engine evidence. The corrected implementation rejects duplicate fields or fractional period tokens, labels approximate inputs and results, and reserves the Rust proof label for steps that actually call an engine. [Corrective checks](integrated-audit/corrective-checks.json)

A hosted run uncovered an offline first-visit race in Data Lab and a crash while opening Intelligence. DARS now caches the assets used by the open module throughout initial loading, and checks speech services only after an explicit request. The delayed-control test reopened Data Lab offline in three independent Chrome sessions. [First-visit verification](integration/data-lab-first-visit.json)

The paired visible Standard idle measurement recorded 119,537,664 and 119,656,448 private resident bytes in the application trees. Ambient-to-idle physical differences were 183,762,944 and 200,093,696 bytes. A single pair includes unrelated system activity. The target of less than 100 MB of incremental physical memory remains open. [Benchmarks](benchmarks.json) · [Memory history](../objective-02/revision-02/memory-debt.md)

[Changes](changes.md) · [Integration contract](integration/REPORT.md) · [Privacy](privacy.md) · [Security](security.md) · [Threat model](threat-model.md) · [Windows chronology](integrated-audit/windows-protection.md) · [Compatibility](compatibility.md) · [Reproduction](reproduction.md)

The exact source and delivery are identified by the branch history and their separate workflow runs. Receipt hashes are listed in the evidence manifest. The owner’s independent decision is pending. [Evidence hashes](manifest.json) · [Review branch](https://github.com/daniloatila/universal-calculator-dars/tree/codex/objective-06-productivity-automation-ai)
