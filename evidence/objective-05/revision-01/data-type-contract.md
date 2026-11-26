# Data Lab type contract

[Português brasileiro](data-type-contract.pt-BR.md)

## Source values and explicit casts

The preview keeps `value`, the original cell content or a derived cell's literal. It shows `source_type`, `source_origin`, `requested_type`, `notation`, `validity`, and `canonical` separately. The decoded contents of a JSON string are preserved. The original JSON number token is retained, including its exponent. A workbook cell also carries its storage type and raw `<v>` value when present. `canonical` is `null` for an unavailable or invalid value and a string for a valid one. The numeric string is an exact reduced fraction or an integer. `origin` remains the compatibility classification for the current interpretation. `source_origin` survives successive casts.

| Input | Numeric interpretation after an explicit cast |
| --- | --- |
| Native JSON number `1.25` | Dot-decimal source grammar. The exact value is `5/4` under either decimal setting. |
| XLSX native numeric cell or numeric formula cache `1.25` | Dot-decimal source grammar unless the cell is temporal. The raw number is retained. |
| CSV, TSV, JSON string, XLSX text, or text supplied to a transformation | The selected text grammar applies. Under comma notation, `2,50` is `5/2` and `2.50` is invalid. |
| Exact numeric output of Calculate or Group | A canonical integer or rational produced by Rust. A later cast consumes that value independently of the text notation. |

Columns can remain Text. In such a column `00017` stays `00017`, and exact decimals remain visible as supplied. An Integer cast requires an integral value. Dates, native booleans, and workbook errors are excluded from numeric aggregates. Empty text, JSON `null`, absent cells, invalid conversions, uncached formulas, and errors retain distinct validity. Numeric zero is valid. Changing the interface language leaves the source grammar and canonical values unchanged. The decimal setting is an import choice for text conversion and is recorded in the recipe.

## Workbook dates and caches

The preview records `workbook.cell_type`, `style_index`, `number_format_id`, and the custom `number_format_code` where present. `formula` stores the supplied formula text. `workbook.cache.status` distinguishes `stored`, `empty`, `missing`, and `error`. An explicit empty cache has a raw empty string, while a missing cache has no cache value. Cached text follows the text notation and a numeric cache follows XLSX notation. The loader uses stored values, which can be stale. Excel formula evaluation is outside this contract.

Workbook date metadata is independent of the presence of a formula. A direct styled serial and a cached styled serial with the same value and epoch produce the same canonical date. The preview and proof report the workbook epoch. The cell records `serial` or `iso`, the date conversion status, and the canonical ISO value when available. The 1900 calculation uses `1899-12-31` as serial zero and skips the fictitious day at serial `60`. Its raw value remains available with status `fictitious_1900_leap_day` and no Gregorian value. The 1904 calculation starts at `1904-01-01` and accepts serial `60` as an ordinary day. [Excel date systems](https://support.microsoft.com/en-us/excel/date-systems-in-excel) · [Microsoft's 1900 leap-year note](https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/wrongly-assumes-1900-is-leap-year)

The fractional part of a nonnegative serial is an exact fraction of a 24-hour day. Values between nanoseconds are rendered at the previous nanosecond and expose `discarded_subnanosecond_precision: true`; the source still records the full decimal. ISO dates retain civil dates and times where no offset was supplied. Offset-bearing ISO date-times normalize to UTC. ISO times with precision beyond nine fractional digits have invalid date status. A Time cast displays the time of day where available. A date with no time component remains a date. A Text cast keeps the raw serial while preserving the source date type, so a later Decimal cast still excludes it.

## Pipeline operations

| Operation | Effective rule |
| --- | --- |
| Filter and Sort | Compare canonical values in the chosen column type. Filter skips unavailable cells. Sort orders unavailable cells by origin and literal, and retains row order for equal keys. Numeric order uses exact rationals. Date order uses civil date-time values, using UTC for offset-bearing values. Date-only, civil date-time, and UTC values are distinct keys. |
| Deduplicate and Group | Use the typed key. `1.25` and `1,250` are equal in a Decimal column with the appropriate source notations. The first matching literal remains the group representative. Missing origins remain distinct. Group counts usable cells, and its numerical aggregates require numeric columns. |
| Join | Parse each lookup key in the column type using the selected text notation. Equivalent duplicates are rejected. Missing or invalid source keys never match. A left join creates an absent output for unmatched rows. The output preserves lookup text, including leading zeros. |
| Fill Missing | Replace absent, null, and empty cells. Parse the supplied replacement using the selected text notation and record `derivation.from_missing`. Invalid, error and uncached cells keep their own states. |
| Calculate, statistics and analysis | Read usable numeric values through their own source grammar and compute exact fractions within the numeric bounds. Text, Date and Time columns require an appropriate explicit numeric cast before use as numeric inputs. Dates cannot be reinterpreted as quantities through an intermediate Text cast. |
| Text | Apply an explicit string transformation and record its derivation. Where a source date has a valid ISO interpretation, the text operation uses that ISO representation and preserves the date source type. |
| Export CSV | Write the contents in `value`, preserving ordinary literals and leading zeros. The protected export applies spreadsheet-safe quoting/prefixing to formula-like text. CSV carries no workbook styles or typed metadata. |

## Proof and compatibility

Fresh imports produce `data-lab/2`. The `normalized` object encoded in the proof contains SHA-256 of the original bytes, `semantics_version: 2`, canonical `configuration` including import options and selected text notation, destination types, pipeline steps, analysis, and `resource_policy` with its model and effective byte limit. The proof records counts of source types, notations and workbook cache states before transformations, plus output column profiles, cast validity, and applied operation trace. Proof records contain aggregate evidence and recipe settings. Raw source bytes remain with the user.

Reopening a v2 recipe requires the same source bytes and supported semantics and resource-policy model. The descriptor limit is 4,096 UTF-8 bytes. A different digest returns `invalid_input`, and a legacy or unrecognized version returns `unsupported`. Historical v1 proofs remain readable in the interface. Explicit migration selects the original bytes, checks their digest, and runs the recorded configuration under v2 to create a new result, leaving the historical proof intact. Numeric statistics, date validity, and typed pipeline keys can change in that new result. [Compatibility checks](compatibility.md)

Run `cargo test --locked -p dars-universal --no-default-features --features data-lab` for the Rust contract checks. The independent fixtures and runtime comparisons are linked from the revision evidence.
