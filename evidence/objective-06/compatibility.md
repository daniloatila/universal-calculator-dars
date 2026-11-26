# Compatibility

The 25 workspace IDs include the 22 prior modules plus Math Notebook, Formula Studio and Automation Studio. They use the same 22 WASM assets. The CLI and its Rust numerical contracts remain available. The dark navy default, seven interface languages, five adaptive profiles and original source-notation rules continue to apply.

Notebook v1 accepts the documented v0 subset through explicit migration. Formula v1 pins semantic versions and embeds definitions in exported run receipts. Automation v1 accepts validated flow JSON and historical proof envelopes. A failed historical comparison requests review. Opening any of these documents requires no model or account. Data Lab v2 retains original spreadsheet cache and date semantics and requires the prior documented migration for v1 recipes. [Notebook](math-notebook/REPORT.md) · [Formula format](../../community/formulas/README.md) · [Flow format](automation-studio/REPORT.md)

Desktop Windows has native transport and an optional persistent credential store. A browser can validate and execute proposals locally. The public review does not deploy a hosted proxy. macOS build verification and on-device execution claims are recorded independently. A fresh web profile needs its static assets. Previously visited resources can be used from its cache, while the Windows executable embeds its assets. [Platform results](integrated-audit/ci.json)

The service worker also recovers visited lazy assets that started before it first took control of a page. A forced cold-start delay verifies the already-loaded and in-flight assets enter the offline cache while unrelated workspaces stay deferred.
