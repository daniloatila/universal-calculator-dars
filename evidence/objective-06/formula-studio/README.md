# Formula Studio review

[Português brasileiro](README.pt-BR.md) · [Authoring and contribution guide](../../../community/formulas/README.md)

Formula Studio ships four local declarations. Each run records the formula ID, exact version, complete declaration, supplied values and units, executed test cases and the Rust Calculation Proof. Referenced formulas retain separate pinned child records. The portable example uses a Brazilian decimal comma, a fraction and version 1.0.0 of the arithmetic mean. Rust returned exactly 3/2. [Exported run](formula-run.json)

| Check | Observed result |
| --- | --- |
| Four shipped definitions | Rust CLI and WASM agreed on rectangle area 12 m², simple interest 1,200 BRL, mean 1/2 and speed 5/2 m/s. |
| Version and dependency identity | Fresh-library replay reproduced the full record. A second version coexisted with the original. Changing an occupied pin failed. The dependency proof retained its source definition. |
| Validation and interruption | Unit and domain errors, missing references, cycles, an incorrect expected result, excessive input, cancellation and an interrupted save were exercised. The failed custom definition stayed outside the library. |
| Localized input | The seven languages produced 42 directed switches in Chrome. Each source maintained an identical full exported record across its six target languages. All 42 cases retained one mathematical proof hash. |
| Import and editing | Browser actions staged a local file, observed its failed test, corrected the case, verified the formula, executed it, created a new version and duplicated it. |

The six Node suites compared the full successful or unsuccessful responses from the compiled native and WASM Standard targets. Eight browser tests ran against the built 0.6.0 site in installed Chrome. The screenshot captures the French interface after switching from a Brazilian Portuguese input. [Checks](checks.json) · [42 locale cases](locale-matrix.json) · [Screenshot](formula-studio.png)

PowerShell's independent schema validator accepted all four community files. It rejected three modified declarations with an unknown field, a missing version and an empty test list. [Schema validation](schema-validation.json)

## Reproduction

Build the release CLI and generate the project WASM as in CI. With the locked web dependencies installed, run the following from the repository root.

```sh
node --experimental-strip-types --test apps/web/tests/formula-studio.test.mts
npm --prefix apps/web run test:e2e -- formula-studio.spec.ts
```

The dimension checker handles compound named units. A scale or currency conversion requires an explicit prior conversion. A rounded child result cannot become the exact input of a parent. An approximate expected result must supply a tolerance large enough for the measured difference and the engine's reported uncertainty. The library holds at most 64 versions and 512 KiB of declarations in memory. A declaration is limited to 64 KiB and a recorded run to 256 KiB. [Document validation](../../../apps/web/src/formula-definition.ts) · [Library and tests](../../../apps/web/tests/formula-studio.test.mts)
