# Permanent mission · Universal Calculator (DARS)

[Original Portuguese mandate](../../PROJECT_SPEC.md)

This is the English translation of the owner's mission. The original is preserved verbatim in `PROJECT_SPEC.md`. Milestones below specify intended scope. Refer to the [project state](../../PROJECT_STATE.md) for evidence of implementation or approval.

## Project identity

- Official name: Universal Calculator (DARS)
- Visual identity: DARS
- Slogan: Compute anything. Anywhere.
- Author: Danilo Átila
- GitHub: [daniloatila](https://github.com/daniloatila)
- Intended repository: `daniloatila/universal-calculator-dars`
- Suggested application identifier: `io.github.daniloatila.dars`
- License: Apache 2.0
- Distribution: free, public, and open source
- Primary language for code and documentation: English
- Secondary documentation language: Brazilian Portuguese

## Main mission

Develop a universal mathematical, financial, scientific, and technical computing platform that is capable, fast, secure, lightweight, intelligent, extensible, and visually sophisticated.

Build an ecosystem of computational tools beyond a scientific calculator, useful to students, finance professionals, engineers, scientists, data analysts, developers, and the general public. Make a genuine contribution to the international open-source community and publicly demonstrate excellence in software engineering. Judge quality by evidence and utility.

## Permanent operating requirements

These requirements apply to all eight objectives.

### Operational autonomy

Investigate, plan, implement, test, correct, refactor, and optimize the project autonomously. Use available resources, appropriate agents, official documentation, libraries, integrations, and parallel work where they provide real benefits. Discover information you can safely obtain instead of interrupting the work.

When you find a problem, investigate its cause, design and implement a solution, run tests, analyze results, correct failures, repeat as needed, and validate the overall result. Persist through solvable technical challenges. Investigate alternatives when an approach fails and replace libraries that cannot meet their requirements.

Respect security, permissions, licensing, data integrity, and real platform limits. Purchases, paid services, disclosure of private information, and modification of external projects require authorization. When an obstacle genuinely depends on unavailable credentials, devices, permissions or services, complete the independent work and document precisely what remains. Report the actual outcome.

### Continuity and governance

Create and maintain `AGENTS.md`, `PROJECT_SPEC.md`, `ROADMAP.md`, `PROJECT_STATE.md`, `CHANGELOG.md`, `docs/en/`, `docs/pt-BR/`, `docs/adr/`, `evidence/`, `benchmarks/`, and `tests/`. Record decisions, requirements, architecture, progress, evidence, and recovery procedures. Preserve continuity across Codex sessions.

Give each objective an identifier, a state, acceptance criteria, and its own report. Valid states are `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `FAILED_VALIDATION`, `READY_FOR_REVIEW`, and `APPROVED`. Only explicit owner approval permits `APPROVED`. At the end of an objective, stop before beginning the next and deliver the validation report. After authorization, resume from the recorded state and reuse approved components.

### Environment integrity

Locate the existing Calculadora project directory and preserve earlier work. Investigate an existing local repository before creating one. Preserve unrelated changes and avoid interfering with other projects, personal files, global settings, and private repositories. Avoid indiscriminate destructive commands. Use official dependencies, verified versions, lockfiles, reproducible environments, and least privilege.

### Technology architecture

Adopt Rust for the math engine and performance-sensitive processing, TypeScript for presentation logic and integrations, React for the UI, Tauri for native cross-platform integration, WebAssembly for the browser engine, and Vite for builds and code splitting. Use Python for development, independent tests, and benchmarks unless an ADR justifies an architectural exception. Use GitHub Actions for continuous integration and Playwright for web UI tests. Introduce SQLite or IndexedDB only where the corresponding persistence is needed. Use Canvas and WebGL for advanced visualization with compatible fallbacks.

Prefer a modular monorepo with a core independent of interfaces and external services. Each language must serve a project requirement.

### Preferred libraries

Evaluate these first where a module needs the corresponding capabilities.

| Library or tool | Purpose |
| --- | --- |
| num-bigint | Arbitrary-precision integers |
| num-rational | Exact rational numbers |
| num-complex | Complex numbers |
| num-traits | Numeric abstractions |
| bigdecimal | Configurable decimal precision |
| astro-float | Configurable floating-point precision |
| nalgebra | Linear algebra |
| statrs | Statistics and probability |
| uom | Units and dimensional analysis |
| nerdamer | Symbolic computation in an isolated, on-demand component |
| serde | Serialization |
| wasm-bindgen | WebAssembly integration |
| SymPy, NumPy, SciPy, mpmath, and Python Decimal | Independent mathematical validation |
| proptest | Property-based testing |
| Criterion | Rust benchmarks |
| cargo-fuzz | Fuzzing where supported |

Evaluate other dependencies when needed. Before approval, check versions, license and transitive dependencies, security, maintenance, compatibility, precision, performance, size, stability, and platform or WebAssembly integration. Experimental versions require justification and validation. Keep replaceable libraries behind stable interfaces. If a verified alternative is superior, record the decision and comparisons in an ADR. Prefer lighter permissively licensed alternatives where they meet the same requirements.

### Mathematical accuracy

Mathematics is authoritative. Generative AI alone must never determine a result. Use exact integer and rational arithmetic where appropriate, suitable decimal arithmetic for finance, configurable scientific precision, and symbolic representation when possible. Define rounding, document numeric tolerances, estimate error where applicable, validate domains, and bound processing time and memory.

Clearly identify unsupported operations. Distinguish exact, approximate, undefined, divergent, incompatible, and inconclusive results. Preserve requested precision under performance optimization. Avoid implicit floating-point conversion where the result could change.

### Privacy and security

DARS follows Privacy by Design and Security by Design.

- Provide no telemetry, tracking, advertising, required accounts, or required hosted math backend.
- Collect no user calculations or files. Embed no API keys and log no credentials.
- Keep history temporary by default. Persist local data only as authorized.
- Protect credentials using available secure operating-system facilities. Keep API credentials out of localStorage and IndexedDB.
- Limit external communication to authorized features and the transparent update mechanism. Define destinations, purposes, permissions, retention, and how the user can inspect them.
- Default external AI and synchronization to off.
- Treat expressions, files, and AI responses as data. Prevent arbitrary code execution and unrestricted access to users' computers.
- Continuously check security, dependencies, secrets, permissions, malicious inputs, and the supply chain.

### Internationalization

Deliver complete English (`en`), Brazilian Portuguese (`pt-BR`), Simplified Chinese (`zh-CN`), Hindi (`hi`), Spanish (`es`), Arabic (`ar`), and French (`fr`) versions. Detect the operating system language and use English as fallback. Offer a manual persistent language preference. Adapt number formats, decimal and grouping separators, dates, currencies, plural forms, error messages, accessibility, and right-to-left layout for Arabic. Load only needed language resources. Maintain equivalent English and Brazilian Portuguese versions of official documentation, with English as the primary version.

### Visual identity

Create an original, premium, modern, minimalist, professional, responsive, accessible, fluid, lightweight, customizable, cross-platform identity. Offer light, dark, and OLED themes and reduced-motion support. Prioritize legibility, productivity, and efficient interaction. Make the interface usable across phones, tablets, notebooks, desktops, and browsers, with keyboard, mouse, touch, and platform assistive technologies. Use professional products as quality references and create distinct visual assets. Use graphics resources where they improve the experience.

### Quality

As applicable to each objective, run unit, integration, functional, end-to-end, regression, mathematical property, fuzz, security, accessibility, internationalization, performance, stress, compatibility, and failure-recovery checks.

Preserve the integrity of evidence and tests. Report failures with verifiable justifications and do not hide defects by weakening tests. Distinguish what was implemented, compiled, tested in a simulator, and tested on real devices. Compilation alone is insufficient for an end-to-end claim.

## Objective 01/08 · Build the foundation and first working product

Planned milestone v0.1.0.

Build a robust technical, visual, and mathematical foundation and a usable first version with an independent identity and correct basic calculations from a reusable math engine.

Required outcomes:

- Audit the development environment.
- Validate intended names and identifiers in relevant channels.
- Document modular architecture and organize the monorepo.
- Create an original design system, lightweight scalable logo and icons, and a responsive initial interface.
- Build an independent Rust math engine and a working Rust, TypeScript, and WebAssembly integration.
- Run a functional desktop application on Windows and a functional web application. Obtain initial build evidence for other available platforms.
- Establish an initial CLI, internationalization, security, module management, and continuous integration.
- Provide bilingual documentation and an independent testing environment.

### Standard

Implement a complete standard calculator. Include arithmetic, percentages, fractions, powers, roots, parentheses, precedence, negatives, memory, temporary history, undo and redo, result copying, keyboard input, editable expressions, exact and approximate displays, and correct error handling. Use a safe parser with an explicit grammar, structured expressions, and processing limits. Provide a stable interface for future modules.

### Completion

Run on Windows and in a browser. Work offline for basic calculations. Return an exact 0.3 from 0.1 + 0.2, an exact rational 1/3, and an appropriate division-by-zero error. Verify consistent results across tested environments. Pass the applicable automated tests. Measure baseline memory, CPU, startup, size, and latency. Provide complete foundation documentation and reproducible installation and use instructions.

Prepare the dedicated public repository. Only publish reviewed code and documentation, free of secrets and claims about unimplemented features. Keep the stable end-user release for a later stage. Deliver the working application and evidence report.

## Objective 02/08 · Build operational intelligence

Planned milestone v0.2.0.

Make DARS manage its resources intelligently, adapt to its environment, and maintain privacy, modularity, and operational efficiency.

### DARS Module Manager

Use explicit unloaded, loading, active, suspending, suspended, terminated, and recoverable failure states. Activate one primary module by default. When switching modules, preserve necessary state, cancel or complete tasks according to policy, suspend unnecessary activity, terminate idle workers, and release graphics resources, caches, and memory when technically possible. Use lazy loading, code splitting, dynamic loading, feature flags, and isolation. Keep heavy dependencies active only as needed.

### DARS Adaptive

Build deterministic self-optimization. Detect OS, architecture, CPU capacity, available memory, memory pressure, graphics capability, power, battery, thermal state, UI latency, observed performance, window state, and app resource use where available and authorized.

Provide Ultra Light, Efficiency, Balanced, Performance, and Maximum profiles. Adapt parallelism, rendering frequency and complexity, cache limits, worker count, monitoring frequency, graphics processing, and background tasks. Use hysteresis, adaptive limits, and minimum time between changes to prevent oscillations. Monitoring overhead must be smaller than its measurable benefit. Use deterministic logic without generative AI and preserve precision, formulas, and results.

### DARS Privacy Center

Show permissions, active resources, allowed external connections, storage policy, and data deletion controls. Provide an explicit offline mode. Create secure persistence and credential protection for future modules.

### Internationalization and diagnostics

Complete the seven languages. Verify visual, numeric, and cultural adaptation, including Arabic RTL. Provide an optional local diagnostics panel for resources, active module, performance profile, version, and capabilities. Avoid high-frequency sampling while the panel is inactive.

### Completion

Demonstrate loading only required modules, effective suspension of idle resources, cancellation, state recovery, adaptation to simulated and real constraints, measurable optimization gains, mathematical regression coverage, no telemetry, offline behavior, and all seven languages working. Measure memory release directly instead of inferring it from hidden UI.

## Objective 03/08 · Build universal mathematics

Planned milestone v0.3.0.

Build a high-precision mathematical ecosystem covering educational, scientific, and advanced algebraic needs. Implement and validate each module individually.

| Module | Scope |
| --- | --- |
| Scientific | Trigonometry, logarithms, exponentials, constants, complex numbers, hyperbolic functions, scientific notation, degrees, radians, and configurable precision |
| Algebra | Simplification, expansion, factorization, polynomials, equations, inequalities, and systems within the supported domain |
| Calculus | Derivatives, definite and indefinite integrals, limits, series, numeric methods, and approximations |
| Linear Algebra | Matrices, vectors, determinants, inverses, transposition, systems of linear equations, eigenvalues, eigenvectors, and decompositions |
| Geometry | Areas, volumes, perimeters, planar geometry, spatial geometry, and analytic geometry |
| Discrete Mathematics | Combinatorics, sets, logic, permutations, combinations, primes, and elementary number theory |
| Programmer | Base conversion, logic and bitwise operations, shifts, two's complement, and configurable bit width |
| Converter | Length, mass, volume, temperature, pressure, energy, power, velocity, digital storage, and other appropriate unit categories |
| Date & Time | Intervals, age, dates, time zones, deadlines, business days, and configurable calendars |

The Converter also supports currency conversion with source, date, validity, and authorized refresh. Allow manually entered rates. Identify stale quotes as stale.

### DARS Calculation Proof

Create a structured calculation record with original expression, formula, variables, units, domain, method, result, precision, rounding, assumptions, restrictions, error estimate, engine version, and references where applicable. Allow export and reproducibility without AI. Distinguish a recorded execution from a mathematical proof.

### Completion

Give every module its own tests. Compare with independent references including SymPy and mpmath. Use property-based testing. Test invalid inputs, extremes, singularities, and divergence. Verify platform compatibility and correct suspension. Expose real results and capabilities. Explicitly identify unsupported operations.

## Objective 04/08 · Build finance and business tools

Planned milestone v0.4.0.

Create a professional, transparent, verifiable financial platform for students, investors, analysts, managers, and finance professionals.

### Financial

Implement simple and compound interest, rate equivalence, present and future value, annuities, payment streams, NPV, IRR, modified IRR, and payback.

### Investment

Implement contributions over time, wealth projections, nominal and real returns, inflation, fixed income, investment comparisons, reinvestment, and scenario analysis. Make rates, costs, taxes, frequencies, and assumptions configurable.

### Loans

Implement financing, loans, constant principal and fixed payment amortization, extra payments, early payoff, and total cost comparisons.

### Tax

Build an extensible tax engine by country, jurisdiction, and effective period. Start with Brazil. Use official sources, references, effective dates, and versioned rules. Keep incompatible legal frameworks separate. Identify simulations as such. Report unavailability for a jurisdiction or period without validated rules.

### Business

Implement pricing, markup, margin, breakeven, ROI, ROE, ROA, fixed and variable costs, cash flow projections, financial metrics, and sensitivity analysis.

### Scenario Comparator

Compare scenarios side by side, change variables interactively, and show the impact of each assumption. Generate tables and charts from computed results.

### Completion

Use suitable decimal arithmetic, explicit rounding conventions, documented formulas, independently validated results, and tests with established financial examples. Handle zero and negative rates where applicable and cash flows with multiple IRRs or no solution. Preserve financial privacy and export auditable calculations. Run full regression checks for earlier objectives.

## Objective 05/08 · Build the science, engineering, and data ecosystem

Planned milestone v0.5.0.

Expand DARS into scientific computing, statistical analysis, engineering, visualization, and data processing while preserving performance, precision, and modularity.

### Statistics and Probability

Statistics covers descriptive measures, dispersion, correlation, covariance, regression, hypothesis tests, confidence intervals, and sample analysis. Probability covers discrete and continuous distributions, conditional probabilities, quantiles, and density functions.

### Simulation

Provide Monte Carlo, probabilistic simulation, projections, risk and sensitivity analysis, reproducible seeds, identified random number algorithms, cancellation, and controlled execution.

### Optimization

Implement minimization, maximization, root finding, constrained optimization, and suitable numerical methods. Report convergence, tolerance, and exit conditions.

### Physics & Engineering

Provide formulas, physical constants, dimensional conversions, mechanics, kinematics, energy, electricity, thermodynamics, and selected technical tools.

### Graph Lab

Provide interactive 2D and 3D charts, multiple functions, zoom, navigation, roots, intersections, dynamic parameters, export, and adaptive visualization. Suspend rendering while inactive. Provide graphics fallbacks when GPU or WebGL is unavailable. Handle discontinuities and invalid domains correctly.

### Data Lab

Import and analyze CSV, JSON, and XLSX locally. Provide tabular display, filtering, sorting, missing value treatment, summaries, transformations, grouping, visualization, export, and bulk calculations. Guard against malicious files, excessive memory use, archive abuse, and formula injection in exports. Default to local file processing.

### Completion

Validate with NumPy, SciPy, SymPy, and other independent references. Measure precision, stability, performance, and memory. Test representative data, responsiveness during long tasks, cancellation, reproducible simulation, and full regression of earlier modules.

## Objective 06/08 · Build productivity, automation, and AI

Planned milestone v0.6.0.

Create tools to build, connect, reuse, explain, and automate complex calculations. Keep the math engine authoritative and preserve user privacy.

### Math Notebook

Create interactive documents containing text, formulas, variables, calculations, tables, and charts. Build a dependency graph between cells, update dependent calculations automatically, and detect cycles. Use an open, documented, versioned, portable file format.

### Formula Studio

Create, test, save, document, and reuse custom formulas. Build a community library with references, tests, and versioning. Contributions are declarative and validated. Arbitrary third-party execution requires secure isolation.

### Automation Studio

Support workflows, bulk operations, variables, calculation sequences, conditions, import, and export. Use a restricted declarative language or representation with memory, time, and processing bounds. Keep terminal and filesystem access narrow and authorized.

### DARS Intelligence

Provide a modular gateway with off, local AI, and external API modes. Default to off. Integrate local Ollama, LM Studio, and compatible endpoints. Provide optional adapters for OpenAI, Anthropic, Gemini, and other compatible APIs using credentials provided by each user. Keep models out of the installer, use no automatic downloads, and avoid supplying services via the author's accounts or credentials.

AI may interpret natural language, identify variables, propose math tools, explain formulas or verified results, help construct calculations, and identify missing information. The math engine remains authoritative. AI may not invent results, access credentials, access files without authorization, execute arbitrary commands, transmit data without authorization, or automatically move local processing into the cloud.

Use structured responses validated by schemas and protect against prompt injection. Show users what data external providers would receive. Provider retention claims require evidence.

### Voice and visual recognition

Where technically viable, implement math expression recognition from images, OCR, voice commands, and spoken results. Prefer lightweight, local processing. Load these features on demand to preserve startup and resource use in the basic application.

### Completion

Keep math working with AI disabled. Test simulated providers and authorized real integrations. Validate results produced by the math engine. Verify absence of unauthorized transfers, credential protection, resistance to malicious inputs, reproducible automation, file compatibility, cancellation, isolation, and complete regression of earlier objectives.

## Objective 07/08 · Build universal distribution and mandatory updates

Planned milestone v0.9.0.

Prepare safe, professional installation, use, and updates across platforms.

### Targets

- Windows x64 and ARM64
- Linux x64 and ARM64 where supported
- macOS Intel and Apple Silicon
- Android, iOS, and iPadOS
- Modern browsers and PWA
- ChromeOS via compatible channels
- Tablets and hybrid devices

Set minimum OS versions from tests and dependencies. Prove compatibility claims. Distinguish compiled, tested, distributed, and officially supported targets.

### DARS Update Manager

Use GitHub Releases as the primary official distribution source, subject to app store mechanisms. Detect the installed version, platform, and architecture. Verify published stable versions. Keep stable and experimental channels distinct.

Authenticate update metadata, sign artifacts, and verify them cryptographically before installation. Verify integrity, prevent malicious rollback and incompatible updates, preserve data, and recover from failures. Control downloads, use backoff and timeouts, and handle GitHub outages. Never send calculations or personal information.

After confirming a newer stable version is authentic, compatible, and available for the platform, preserve work and require the update before new operations. Keep secure recovery and export available. Commits, branches, betas, and incomplete releases do not count as mandatory updates. Publish the enforcement policy only after validating and making available all corresponding artifacts.

Allow offline use unless a mandatory update was previously confirmed. Preserve an authenticated block and provide safe recovery. A temporary service outage, lookup error, or invalid metadata alone cannot block operation.

Respect Android, iOS, and package manager distribution rules. For web and PWA, version and update caches coherently. Document that official updates cannot be technically forced onto forks, modified builds, and permanently offline users.

### Distribution security

Protect private keys. Use update signatures, checksums, SBOMs, verified artifact provenance, and reproducible builds when viable. Minimize workflow privileges. Verify CI dependencies and actions. Protect release steps. Provide key revocation and recovery procedures. Private keys must stay private. Distinguish updater signing, OS code signing, and notarization. Keep platform security protections in effect during installation.

### DARS CLI and DARS SDK

Complete terminal and integration libraries. Expose stable, documented interfaces for supported core operations. Support Rust and JavaScript or TypeScript integrations including WebAssembly. Evaluate Python bindings where beneficial. Document support differences among the SDK, CLI, and graphical app.

### Public demonstration

Host the web app through GitHub Pages or equivalent static infrastructure. Compute locally without requiring a math server.

### Completion

Verify builds on available targets and installers on platforms actually tested. Test update from an older version, tampered artifacts, invalid metadata, data preservation, interrupted installation recovery, offline behavior, and distribution channels. Deliver a working web demo, installation docs, an evidence-based compatibility matrix, and a distribution security audit. Record unavailable external credentials or devices for signing, notarization, and store releases accurately.

## Objective 08/08 · Attain excellence and launch globally

Planned milestone v1.0.0.

Audit, improve, validate, and publish a professional, international, sustainable, useful, stable open-source product. Investigate defects, inconsistencies, risks, bottlenecks, and opportunities across the application.

### Mathematical audit

Review formulas, operations, algorithms, assumptions, tolerances, results, and rounding rules against independent references. Investigate silent errors, extremes, inconsistent results, and platform differences.

### Security audit

Review code, dependencies, supply chain, files, persistence, communications, AI, imports, automation, credentials, and updates. Run fuzz and adversarial tests. Mitigate applicable critical or high vulnerabilities before acceptance.

### Performance audit

Investigate CPU, RAM, GPU, storage, startup, rendering, and latency. Compare with previous objectives and optimize using measurements. Exercise different device classes beyond the development machine.

Initial engineering targets:

- Desktop startup at most 1 second on reference hardware
- Basic operations under 10 ms
- Common interactions under 100 ms
- Idle CPU close to zero
- Incremental RAM under 100 MB in basic desktop mode where viable
- Desktop installer under 30 MB, excluding external runtimes
- Initial compressed web transfer under 2 MB
- Math core coverage above 95%
- One primary module active by default
- Zero bundled AI models, telemetry, and known blocking regressions

Measure and document all metrics. Separate total and incremental use, including subprocesses and WebViews. Describe and justify deviations. Preserve measurement integrity.

### Experience audit

Review design, responsiveness, accessibility, legibility, navigation, shortcuts, themes, translations, mobile use, Arabic UI, errors, failure recovery, installation, updates, and removal. Use WCAG 2.2 AA as the applicable accessibility reference.

### Open-source ecosystem

Prepare the English and Brazilian Portuguese READMEs, technical documentation, bilingual user guide, API and formula references, architecture diagrams, contributing guide, code of conduct, security and privacy policies, public roadmap, changelog, Apache 2.0 license, third-party notices, issue and pull request templates, test reports, reproducible benchmarks, compatibility matrix, installation and usage instructions, functional examples, real demonstrations, and maintenance procedures.

Present the project professionally to an international audience. Keep stars, followers, downloads, contributions, testimonials, and results authentic.

### Final publication

Prepare stable 1.0.0 with official artifacts, signatures, documentation, a demo, and release notes. Publish the stable release and enable its updater distribution only after explicit final approval. Prepare promotion on the owner's GitHub profile by updating both READMEs and pinning DARS first where authorized mechanisms are available. Preserve the visibility of the owner's other repositories. Prepare a professional LinkedIn presentation for manual publication by the owner.

### Completion

Deliver all 25 modules in the validated scope, working cross-cutting infrastructure, audited security, verified mathematics, measured performance, seven reviewed languages, complete bilingual documentation, a working public demo, safe distribution on declared platforms, no known blocking defects, reproducible evidence, and explicit final approval.

## Required delivery protocol

Before requesting approval, critically audit the current work and prior approved components. Correct regressions before presenting a result.

Give each objective its own folder from `evidence/objective-01/` through `evidence/objective-08/`. Include `REPORT.md`, `acceptance.json`, `tests.json`, `benchmarks.json`, `security.md`, `compatibility.md`, `changes.md`, and `reproduction.md`. Add sanitized logs, screenshots, relevant technical reports, and hashes of commits and artifacts. Generate reports from actual results whenever possible. Keep private data, secrets, personal paths, and confidential logs out of publications.

## Required report for each objective

Write the report in Brazilian Portuguese.

1. Identification with objective, version, commit, branch, and state.
2. Executive summary of what was delivered.
3. Implementation with components, changes, and available features.
4. Individual acceptance criteria with passed, failed, partial, not applicable, or blocked status, justification, and evidence.
5. Tests with executed, passed, failed, ignored, coverage, commands, and evidence links.
6. Performance with CPU, RAM, startup, size, latency, measurement environment, and comparisons.
7. Security with checks, risks, mitigations, and limitations.
8. Compatibility with actual build and runtime evidence and clear simulated-versus-real distinctions.
9. Problems with causes, solutions, and remaining issues.
10. Architecture decisions with reasoning and impact.
11. Regression results for prior objectives.
12. Evidence with direct links to commits, files, reports, artifacts, and screenshots.
13. Reproduction with independent execution and verification commands.
14. Critical self-assessment of improvements, remaining risks, and unproven claims.
15. Final state with `READY_FOR_REVIEW` only after mandatory criteria are satisfied. Use `BLOCKED` or `FAILED_VALIDATION` as applicable. Approval belongs to the owner.

## Final operating direction

Build a professional product. Work across software engineering, architecture, computational mathematics, data science, finance, security, DevOps, design, accessibility, quality, performance, AI, and open source. Act autonomously and rigorously. Challenge decisions and consider the impact of changes across the whole application. Preserve architecture, security, precision, and maintainability. Deliver working features and evidence-backed tests and claims. Continue through solvable problems until meeting the established criteria.

## Immediate execution order

1. Locate and audit the existing environment.
2. Record the full mission in permanent project files.
3. Establish tracking for all eight objectives.
4. Start Objective 01 only.
5. Work autonomously until meeting its acceptance criteria or establishing an unavoidable external blocker.
6. Perform the objective audit.
7. Deliver the working application, evidence, and report.
8. Wait for explicit owner approval before starting Objective 02.
