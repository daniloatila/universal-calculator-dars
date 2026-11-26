# File handling and privacy

[Português brasileiro](security.pt-BR.md)

Data Lab runs on the local device. Files enter the bounded Rust reader through standard input or a temporary browser worker. Rendering uses text nodes, SpreadsheetML formulas remain inert, and local export has separate protected and literal CSV modes. The reader checks archive member names, entry sizes, allowed relationships, decompression bounds, XML nesting and table dimensions. The resource ledger also accounts for the resulting live table, intermediate calculations and output. [Budget model](resource-budget.md) · [0.5.0 boundaries](../security.md)

The revision tests use ordinary synthetic tables and small artificial budgets. A shielded CSV and a literal CSV are compared cell by cell. Closing the application and terminating a worker have separate receipts. Windows packages are checked against the successful hosted job, declared commit and archive and executable digests. The physical tests use fresh WebView2 profiles. Protection settings were read before the tests. Microsoft Defender antivirus, real-time protection and behavior monitoring reported enabled. Smart App Control reported Off. The review made no protection changes or exclusions. The observed protection fields matched after the native runs. [Windows status](windows-protection.json)

| Surface reviewed | Enforced boundary and evidence |
| --- | --- |
| Archive and XML | Per-member and total decompression caps, directory admission, allowed part paths and bounded XML events, depth and attributes. The reader rejects unsupported XML processing directives and external workbook relationships. [Reader](../../../crates/dars-universal/src/data_lab/workbook.rs) |
| Spreadsheet content | Macros and external-link parts are refused. Formulas and cached values remain local inert data. Cell coordinates, fields and materialized cells have independent bounds. A shared string incurs a charge on each materialization. [Import cases](../../../tests/verify-data-import.py) · [Budget tests](../../../crates/dars-universal/src/data_lab/budget_tests.rs) |
| Transforms | Fill, join, text conversions, retained columns, rational workspaces and grouping indices share the allowance. Small tests vary the allowance while holding the source constant. [Oracle](oracle.json) |
| Page, proof and export | Each output has its own serialization cap as well as the common allowance. A successful page does not imply the complete export will fit. Rust reserves room for the browser response while constructing the next output. The committed prior preview has its own bounded lifetime. [Resource contract](resource-budget.md) |
| CSV and network | Protected CSV shields formula-like text, and literal CSV keeps its explicit opt-in. Browser interception and offline Windows examples exercise local operation. [Chrome](browser.json) · [Windows](windows-candidate.json) |
