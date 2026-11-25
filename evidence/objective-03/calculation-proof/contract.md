# DARS Calculation Proof · Record contract

[Português brasileiro](contract.pt-BR.md) · [Structural schema](schema.v1.json)

Schema 1 preserves the execution context of a successful computation. It records the requested operation, the submitted expression, its mathematical representation, settings, domain, method, result and declared exactness. The implemented advanced tools emit records through the same Rust contract. The schema also recognizes the identifiers reserved for planned modules. [Engine contract](../../../crates/dars-universal/src/lib.rs)

An **execution record** describes the calculation that ran. An **explanation** clarifies its mathematical method. **Solution verification** applies independent criteria to a result. A **formal proof** requires justified premises and deductions. The displayed record offers provenance and material for reproduction. Its precision field describes the recorded numerical precision. An error bound is a separate field and is present only when supplied by the engine.

## Read and reproduce a record

| Fields | Meaning |
| --- | --- |
| `schema`, `module`, `operation` | Format version and stable operation identity. |
| `expression`, `normalized` | Original input and the engine's mathematical representation. |
| `variables`, `units`, `options` | Named bindings, units and scalar settings. Empty maps represent an empty group. |
| `domain`, `method`, `formula` | Domain and recorded method with its formula when available. |
| `result`, `exactness`, `precision` | Result as text, classification as exact, symbolic or approximate, and recorded precision when applicable. |
| `tolerance`, `rounding`, `error_bound` | The stated numerical settings and bound. A `null` means that the engine did not provide that field's value. |
| `assumptions`, `constraints`, `references` | Conditions, restrictions and literature identifiers. |
| `engine_version`, `algorithm_version` | Engine identity and per-operation implementation version. |

For the bounded Scientific example, open Scientific and evaluate `sin(90°)`. Open **Calculation record**, select **Download JSON**, then use **Open local JSON** to inspect that file. The result is `1` with exact classification. To cross-check the calculation, evaluate the same mathematical input using the recorded module and settings in the locked CLI.

```powershell
$request = '{"schema":1,"module":"scientific","operation":"evaluate","input":"sin(90°)","options":{"angle":"rad","notation":"auto","precision":32,"complex":false}}'
cargo run --locked -q -p dars-cli -- tool $request
```

For localized input, use the original expression and settings to identify the intended notation. The normalized representation gives the mathematical expression used by the record and may contain formatting specific to the engine. Reproduction should compare the mathematical result and its exactness at the recorded engine version. [Browser entry point](../../../apps/web/src/tool-scientific-runtime.tsx) · [CLI entry point](../../../crates/dars-cli/src/main.rs)

Canonical Scientific expressions can also be used for an explicit comparison. This procedure reproduced the recorded result and exactness for sine and cosine at known angles, `ln(1)`, `log2(1024)`, `20!` and complex `sqrt(-1)` with the Scientific WASM build. Use it for records whose normalized expression is accepted by the current Scientific parser and whose engine version matches the test build. A manually selected import still opens as data for inspection.

```powershell
$record = Get-Content -Raw -Encoding utf8 -LiteralPath dars-calculation-record.json | ConvertFrom-Json
$request = [ordered]@{
    schema = $record.schema
    module = $record.module
    operation = $record.operation
    input = $record.normalized
    options = $record.options
} | ConvertTo-Json -Depth 5 -Compress
cargo run --locked -q -p dars-cli -- tool $request
```

For Algebra, solve `x/x=1` with the real domain selected. The record identifies `x` as a real variable, retains `x != 0` and preserves the expression structure in its normalized input. Simplifying before recording that input would lose the exclusion during replay. The Algebra CLI suite verified identical records on replay for seven cases, including active restrictions and bound variables. [Algebra oracle](../../../tests/verify-algebra.py)

In Calculus, integrate `exp(-x^2)` numerically between `0` and `1` with absolute tolerance `1e-10`. The record identifies adaptive Simpson quadrature, lists the requested tolerance and reports an estimated absolute error among its constraints. The certified error bound remains `null`. The oracle verifies numerical accuracy independently and compares complete records on replay. [Calculus oracle](../../../tests/verify-calculus.py)

In Linear Algebra, run QR on a three-by-two matrix with rows `1 0`, `1 1` and `1 2`. The record identifies the Householder method, states the applied tolerance and reports the observed Frobenius reconstruction residual and orthogonality error. These diagnostics characterize the returned factors. The oracle checks reconstruction and the subspace independently with NumPy and SciPy. [Linear Algebra oracle](../../../tests/verify-linear-algebra.py)

## Local format and validation

The interchange file is a standalone UTF-8 JSON object. Browsers read at most 128 KiB, require valid UTF-8, reject repeated names even through escapes, and accept only the expected own fields. JSON Schema length limits describe characters. The application additionally enforces UTF-8 byte limits for each field, rejects malformed Unicode scalar sequences, and applies a two-level container limit. Request text has a 4,096-byte bound. Normalized text has an 8,192-byte bound and result text has a 32,768-byte bound. Map entries are limited to 16. Lists are limited to 32 entries. [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/json-schema-validation) · [Application validator](../../../apps/web/src/calculation-proof.ts)

An imported file is shown as **Imported record** and its values are labeled unverified. Expressions and references are rendered as literal text, including strings that resemble markup or links. Import displays the record without invoking a computation, writing preferences or contacting a server. Download creates a local JSON file. The imported record lives in the workspace component and closing it reveals the current calculation record again. [Local viewer](../../../apps/web/src/calculation-proof-panel.tsx)

## Verification commands

```powershell
node --experimental-strip-types --test apps/web/tests/calculation-proof.test.mts
npm run build --prefix apps/web
npm run test:e2e --prefix apps/web -- calculation-proof.spec.ts
```

Build the Scientific WASM assets first. The Node suite checks the schema, round trips, duplicate names, bounds, Unicode text and the completeness of the seven locale labels. The browser suite checks the real Scientific export, reopening the downloaded file, oversized and malformed UTF-8 files, literal rendering and local handling. [Node suite](../../../apps/web/tests/calculation-proof.test.mts) · [Browser suite](../../../apps/web/tests/calculation-proof.spec.ts)

The focused checks passed in Node (8 tests) and the installed Chrome browser (2 tests on the Scientific production route). Python `jsonschema` 4.25.1 checked the Draft 2020-12 meta-schema and agreed with the app codec on 10 representative structural instances. UTF-8 limits, repeated field-name rejection, and literal browser rendering are exercised by the app tests. [Independent validator](https://pypi.org/project/jsonschema/4.25.1/)
