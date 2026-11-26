# Data Lab

[Português brasileiro](REPORT.pt-BR.md)

The desktop and browser send a user-selected local file to a dedicated worker. Rust reads the records, applies the pipeline in order, computes the profile and emits a Calculation Proof. Under the native CLI the same reader accepts bytes on standard input using `dars dataset SETTINGS_JSON`. Neither interface needs a Python installation.

## Import and types

CSV and TSV support quoted fields, embedded delimiters, CRLF, UTF-8 with optional BOM, Latin-1 and explicit UTF-16 endianness. JSON accepts an array of flat records and keeps the original spelling of numeric tokens. The first record defines the columns in alphabetical order. Missing keys in later records appear as absent. Additional keys, duplicate keys and nested data are rejected. Header detection treats the first record as column names only if every field starts with a letter and the names are distinct. The user can select an explicit header mode.

Columns start as text. The numeric convention and the selected types are independent of interface language. Integers and decimals use the same bounded rational parser as Converter. Decimal tokens may have 128 digits and an exponent up to 256 in magnitude. Computed fractions remain exact. The original spelling of imported values survives typing, including leading zeros. Empty, absent, null, invalid and zero have distinct representations. Dates and times use explicit ISO civil types. A text token such as NaN becomes invalid when cast to a numeric type.

The XLSX reader resolves the chosen workbook sheet and reads only its cells, shared strings and styles. It preserves SpreadsheetML numeric lexemes, handles rich strings, indexes sparse cells and records the 1900 or 1904 epoch for recognized date-formatted serials. The serial remains visible, including Excel serial 60. A formula and its optional stored cache have separate fields. An absent cache stays unknown. Cell errors retain their original code. Workbook features such as charts, custom number-format display and formula recalculation are outside this reader. [Microsoft SpreadsheetML formula model](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-formulas)

## Transformations and analysis

The versioned JSON pipeline binds explicit column names. Its closed operation set includes filter, stable sort, select, rename, cast, drop/fill missing, literal-row deduplication, group, calculate, text and join. A calculated column takes two explicit operands (column or constant) and one of four arithmetic operators. A lookup join uses unique literal keys, a left or inner join and one output column. Group reductions include valid count, exact sum, mean, minimum and maximum. Group and deduplication keys preserve literal spelling and cell origin. Sorting numeric columns compares exact values. Each stage records row counts before and after transformation. For grouped rows, reduction in row count includes consolidation.

Enter the full declarative operation set in the browser's pipeline editor or load a saved pipeline file. The step builder provides shortcuts for filtering by equality, sorting, removing duplicates, dropping missing rows, trimming text and multiplying a column by two.

The profile reports origin counts, numeric count, exact sums and extrema. Optional numeric analysis computes type-7 quartiles, Tukey 1.5 IQR outlier counts and eight equal-width histogram bins with the maximum in the final bin. A constant sample occupies bin one. With two numeric columns, complete pairs give the signed square root of exact Pearson r². Zero variance or fewer than two complete pairs yields an undefined coefficient. Correlation alone provides no causal inference.

## Resource limits and replay

A table permits 16 MiB of source bytes, 200,000 data rows, 64 columns, 1.2 million cells and 4 KiB per input field. Dataset creation limits configuration JSON to 16 KiB. Creating a portable proof requires the descriptor containing the configuration and source hash to fit in 4 KiB. Up to 32 declarative transformations share a budget of 12 million cell visits at stage entry. A preview pages 25 rows in the interface. The worker reads the file off the main thread and reports initialization, read, import and output phases. Cancellation terminates the worker. Pagination and export recreate the bounded dataset from the temporary file handle. Leaving the module releases the file and preview. A synthetic demonstration may be reopened automatically.

The input descriptor, schema, types, row counts, ordered pipeline, exact profile and SHA-256 identify the computation. Replaying a file proof requires selecting the same bytes with the same settings. The proof summarizes the input records. A pipeline can be saved separately for use on another compatible source. Imported proofs are records supplied by the user. Literal CSV exports the text of each cell in the transformed table, including stored formula values when available. Protected CSV adds a prefix to text that a spreadsheet could interpret as a formula. The paged view separately identifies source formulas and their cache status.

## Reproduction

Run the Rust test groups under `cargo test --locked -p dars-universal --no-default-features --features data-lab data_lab::`. Build the CLI and tool WASM, then run `node tests/check-data-targets.mjs target/release/dars`. This compares 20 complete native/WASM records against independently stated expectations, including two workbook sheets and exact values above the binary64 integer boundary. Run `node benchmarks/science-data.mjs` for the isolated synthetic volume checks. [Comparison program](../../../tests/check-data-targets.mjs) · [Volume measurements](benchmarks.json)

The browser capture uses the built-in synthetic example with IDs A and B and values 1.25 and 2.50. [Browser capture](web.png)
