# Changelog

[Português brasileiro](docs/pt-BR/changelog.md)

## 0.4.1 · Objective 04 financial comparison revision

- Records available numerical stopping tolerances and withholds differences that fall inside the solver resolution.
- Recalculate both scenario recipes in Rust and classify metric compatibility by financial meaning, units and applicable context.
- Normalize known discrete compound rates to an exact effective annual basis. Report percentage points, relative variation and precision independently.
- Preserve historical scenario import and export replayable comparison proofs. Limit nominal loan-cost selection to compatible proposals.

## 0.4.0 · Objective 04 review candidate

- Added five financial and business workspaces with rational monetary arithmetic, currency scales and explicit rounding.
- Added local investment projections, amortization schedules, dated Brazilian tax rules and business analysis.
- Extended Calculation Proof to preserve financial assumptions and added local scenario comparison and replay.
- Validated the candidate against the shared runtime and the 0.3.1 reference. [Objective 04 evidence](evidence/objective-04/REPORT.md)

## 0.3.1 · Objective 03 locale review

- Editable fields retain their original notation when the interface language changes. An inline hint explains the notation and how to clear it. Matrix cells and other independently edited inputs retain separate origins.
- Each grammar handles its own numeric, argument, row, set and calendar delimiters. Calculation Proof can carry the original expression locale alongside canonical replay data.
- Added a seven-language matrix that compares normalized requests and mathematical records for all ten workspaces. [Revision report](evidence/objective-03/revision-01/REPORT.md)

## 0.3.0 · Objective 03 review

- Added the Scientific, Algebra, Calculus, Linear Algebra, Geometry, Discrete Mathematics, Programmer, Converter and Date & Time workspaces with bounded Rust evaluators and independent mathematical checks.
- Added searchable navigation for ten workspaces, separate advanced WASM assets, five adaptive profiles and seven interface languages.
- Added versioned local calculation records with explicit classification, methods, settings and replay information. Records opened from disk are shown as unverified text.
- Extended Windows and browser evidence to cover module switching, suspension, offline preparation, worker teardown and comparable memory measurements. [Objective 03 stages](evidence/objective-03/PLAN.md)

## 0.2.2 · Objective 02 revision 02

- Terminate the dedicated worker of an expired or cancelled module job before admitting its successor.
- Ignore responses from retired workers and keep module suspension, queue limits and adaptive admission effective during recovery.
- Track WebView2 private commit and the basic-mode memory target through the remaining objectives.

## 0.2.1 · Objective 02 revision 01

- Added a scoped Windows capabilities provider and local resource diagnostics.
- Decoupled module registration and protected startup, session clearing, and secondary task deadlines.
- Added reduced-detail drawing in Ultra Light and matched native performance comparisons.

## 0.2.0 · Objective 02

- Added single-active module lifecycle and recovery of in-memory Standard session values.
- Added five resource profiles, native window suspension and idle worker restart on demand.
- Added the privacy center, explicit cache-only web mode and localized diagnostics.
- Added readable labels for retained mathematical values without changing their calculation representation.

## 0.1.1 · Objective 01 revision 01

- Stored exact rational values and enclosed approximations independently of the original expression. Memory and result reuse preserve their value in percentage expressions.
- Added worker deadlines, cancellation, stale-response isolation and bounded recovery.
- Set a navy-blue Dark theme as the default on fresh profiles and retained explicit theme choices.
- Added browser, Rust and independent oracle regressions and a Windows benchmark with private working-set, commit and longer idle samples.

## 0.1.0 · Objective 01 review

- Recorded the original mission, eight planned milestones, and the evidence and approval process.
- Built and validated the Standard calculator with a shared Rust engine across Windows x64, web and CLI. Published the audited source and evidence for owner review.
