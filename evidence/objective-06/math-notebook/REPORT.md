# Math Notebook

[Português brasileiro](REPORT.pt-BR.md) · [Portable JSON schema](notebook-v1.schema.json) · [Financial sample](financial-plan.darsnb)

Open Math Notebook from the productivity tools. The financial example starts with three editable variables, BRL 10,000, an effective monthly rate of 0.01 and 12 months. Select **Recalculate** to populate the future capital, gain, chart and Calculation Proof. Select the monthly rate in the outline, choose **Edit**, enter 0.02 in the original English notation and apply. The rate, capital projection, gain, chart and proof update. The opening capital and month-count cells retain their original records.

The original plan produces BRL **11,268.25** in future capital and **1,268.25** in gain under half-even currency rounding. The exact capital is `1126825030131969720661201/100000000000000000000`. The chart has 13 points, covering month zero through month twelve. Rust computes each point through the registered financial engine. The adjacent table and the exported notebook preserve its exact rational value. Only chart coordinates use a floating-point display projection.

### Editing and calculation

Cells have stable IDs independent of their order. The outline, editor and document support adding, duplicating, deleting and reordering cells. The outline accepts the arrow, Home and End keys. Alt with an arrow moves the selected cell. Ctrl/Cmd+Enter applies a cell edit or runs the notebook. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z navigate committed document edits outside text inputs. Undo and redo each retain up to 24 document snapshots within one MiB.

Use headings and text cells for written material. Formatted text supports bold, emphasis, inline code and paragraphs. The renderer escapes HTML. Variable, expression, scientific and financial cells use the capability session to call Rust. Formula cells name a declarative formula and its exact version. Table cells accept rectangular JSON arrays of strings. Chart, result and proof cells refer to another cell using `@id`. Financial projections expose `amount_exact` and `interest_exact`. For instance, `@growth.interest_exact` selects the exact gain. Currency display fields have separate rounding semantics.

Expressions and scientific cells substitute dimensionless, exact numeric dependencies. Financial inputs require matching currency, `rate/month` and `month` units. The formula library performs dimensional checks for custom formulas. Decimal finance arguments can receive exact finite fractions if they fit the engine’s decimal grammar. Incompatible dimensions, unavailable outputs and approximate numeric dependencies produce cell errors. An approximate scientific result remains viewable with its proof and uncertainty. Cells retain their input notation across interface language changes.

### Document format, consent and resource bounds

The `.darsnb` file is a UTF-8 JSON object with format `dars-notebook`, version 1, a title and ordered cells. Opening a file validates field names, value types, stable IDs, depth, duplicate JSON keys, history and embedded formula definitions. Its stored outputs are marked historical. The user must authorize a new calculation before any imported document can run. A documented draft variant with version 0 and `notation: "ascii-point"` migrates to version 1 with English input notation. Unrecognized versions are refused.

The optional document metadata accepts a description of up to 1,024 characters and up to 16 tags of 40 characters each. Result cells retain the dependency’s proof so another proof cell can reference that result.

Each computed record includes the cell, direct dependencies, change set, typed inputs, source, original notation, output and underlying proofs. Formula receipts bind the definition and its version. Explicit export bundles definitions from verified local runs in dependency order. Importing them leaves the application’s formula library untouched. On authorized execution, a notebook with attachments checks their declarative tests in its own library. Documents use temporary session state and explicit file export.

The planner limits documents to 128 cells, 512 direct dependencies, dependency depth 32 and 4,096 source characters per cell. A table has up to 128 rows and 12 columns. The total engine-call allowance is 256 per recalculation. One operation runs at a time with the Adaptive resource allowance, a 45-second deadline and cancellable worker ownership. File size is capped at two MiB. The computation estimates retained document and result bytes, checks provisional proofs while building a cell and enforces the smaller of two MiB or one eighth of the active dataset allowance. A rejected operation leaves the last committed independent cells available. Invalid or cyclic ancestors cannot supply a value to descendants. Historic or stale data never populates the live dependency map.

Run `node --experimental-strip-types --test apps/web/tests/notebook.test.mts` for structural and resource tests. In the production web build, `npx playwright test math-notebook.spec.ts` exercises the finance example, editing, cancellation, formula replay, file consent and all 42 ordered language pairs. [Test receipts](tests.json)

References use a cell’s stable identifier, for example @capital. A variable symbol provides a separate label, which must be unique within the document.

The included financial sample holds seven historical cell records and thirteen financial Calculation Proofs. Installed Chrome reopened the document and obtained identical outputs for all seven cells after explicit recalculation. PowerShell validated the exported document against the published schema and its local formula-schema reference. [Portable sample and hashes](tests.json)
