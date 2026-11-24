# DARS project instructions

- Treat [PROJECT_SPEC.md](PROJECT_SPEC.md) as the original mission authorized by the owner. Use [ROADMAP.md](ROADMAP.md) for milestone boundaries and [PROJECT_STATE.md](PROJECT_STATE.md) for current status and evidence.
- Work on the current objective only. Complete its audit, record the results, and stop at its approval gate. Only explicit owner approval can change an objective to `APPROVED` and authorize starting the next one.
- Keep the existing `github-portfolio/` directory and local Codex state out of version control and public artifacts. Keep fixes and tooling within the project. A user-specific path in a local log does not belong in published evidence.
- Use English for identifiers, code, commits, and the primary documentation. Maintain corresponding Brazilian Portuguese documentation. Preserve the Portuguese mission verbatim.
- Keep Rust authoritative for mathematical results. Evaluators must parse and limit user input, preserve exact values where possible, identify approximations, and produce stable errors. Never evaluate expressions as host code, call an AI service to compute a result, or silently reduce precision.
- Keep calculator state temporary by default. Persist explicit preferences only. Record communication destinations, data use and permissions before enabling integrations. Keep runtime capabilities and workflow permissions minimal.
- Verify dependencies and lockfiles. Separate source, generated files, and sanitized evidence. Use actual device, browser, and platform results when claiming execution and distinguish generation of artifacts from running them.
- Give every acceptance item a reproducible result in `evidence/objective-NN/`. Record failures, unavailable platforms, and coverage limits. Use `READY_FOR_REVIEW` only when required criteria have evidence. A source publication or commit does not approve an objective.
- Publish only the audited DARS tree and review-bound artifacts requested by the current objective. Follow the mission's separate authorization boundary for the stable release, profile promotion, and external communications.

Português brasileiro · [Instruções do projeto](docs/pt-BR/project-instructions.md)
