# Objective 03 · Dependency and reference inventory

[Português brasileiro](dependencies.pt-BR.md) · [Integrated report](REPORT.md) · [Security](security.md)

## Runtime and build lock delta

The base is the audited 0.2.2 source `d3c5a95d9c059fceb19e6f4f50e7c4dd38be2fad`. Objective 03 adds 16 registry package/version entries to the Rust lock and removes zero. The web dependency declarations remain the same. The web package and lock root version move to `0.3.0`. Registry entries can represent optional or target-specific packages. Use `cargo tree --locked` with the relevant feature and target selection to inspect a particular artifact. [Workspace lock](../../Cargo.lock) · [Engine features](../../crates/dars-universal/Cargo.toml) · [Web lock](../../apps/web/package-lock.json)

| Scope | New Rust registry entries |
| --- | --- |
| Scientific | `astro-float-num` 0.3.6, `either` 1.19.0, `itertools` 0.10.5, `lazy_static` 1.5.1. The engine uses `astro-float-num` for bounded arbitrary-precision approximations and existing Num types for exact arithmetic. [Selection and primary references](scientific/limits.md) · [Registry checks](scientific/verification.md) |
| Linear Algebra | `nalgebra` 0.35.0, `approx` 0.5.1, `glam` 0.30.10/0.31.1/0.32.1/0.33.12, `matrixmultiply` 0.3.11, `num-complex` 0.4.6, `rawpointer` 0.2.1, `safe_arch` 1.2.0, `simba` 0.10.2, `wide` 1.7.1. `nalgebra` supports the selected numerical methods and the stage records the optional-feature and artifact impact. [Selection and primary references](linear-algebra/limits.md) · [Registry checks](linear-algebra/dependency-check.json) |
| Date & Time | The evaluator selects the Jiff 1.0.3, Jiff Core 1.0.2 and `jiff-tzdb` 1.0.0 packages already present in the lock. Named zones use embedded IANA 2026f `rearguard` data. [Dependency reasoning](date-time/limits.md) · [IANA snapshot](https://www.iana.org/time-zones/releases/2026f) |
| Other advanced modules | Operate with the existing Num, Serde and workspace packages. Algebra uses a bounded Rust parser and symbolic rules. Converter uses the reviewed runtime registry and manual rates. [Algebra alternatives](algebra/limits.md) · [Converter alternatives](converter/limits.md) |

The pinned Rust and WASM binding toolchains are `1.100.0` and `wasm-bindgen-cli` `0.2.130`. The SHA-256 values of `Cargo.lock` and `apps/web/package-lock.json` are `53a7043de7be6bf0ebc51d53e65249587315d95b438b35b24efca99eb84c9820` and `32c531c5efcbb8469b12e2edbf218991245236d96e3aab4c21db633e7923ac80`. Runtime packages remain separate from the independent references below. [Rust toolchain](../../rust-toolchain.toml) · [WASM build script](../../scripts/build-wasm.mjs) · [Integrated test ledger](tests.json)

## Test-only references

| Reference | Use |
| --- | --- |
| Python `Fraction`, `Decimal`, exact integers and finite set operations | Standard rational and interval comparisons, fixed-width words, independent unit ratios and discrete operations. [Standard oracle](../../tests/oracle.py) · [Programmer oracle](../../tests/verify-programmer.py) · [Discrete Mathematics oracle](../../tests/verify-discrete-mathematics.py) |
| SymPy `1.14.0` and mpmath `1.3.0` | Scientific real/complex precision, symbolic algebra, Calculus references, exact matrices and geometry. Python packages are hash-pinned. [Reference lock](../../tests/math-oracle-requirements.txt) |
| NumPy `2.5.1` and SciPy `1.18.1` | Numerical eigenspaces, QR diagnostics and the corresponding residual checks. The binary test wheels carry per-platform SHA-256 hashes. [Wheel locks](../../tests/linear-algebra-oracle-requirements.txt) · [Linear Algebra oracle](../../tests/verify-linear-algebra.py) |
| Python `datetime`, `calendar`, `zoneinfo` and `tzdata` `2026.6` | Gregorian dates, ISO week years, independent business calendar and nanosecond arithmetic, and TZif input loaded directly from the pinned wheel. IANA's published `rearguard` rules define the tested Dublin daylight-saving labels. [Date & Time oracle](../../tests/verify-date-time.py) · [IANA source](https://data.iana.org/time-zones/tzdb-2026f/europe) |
| BIPM SI and NIST conversion factors | Dimensional quantities, exact and nominal unit factors, decimal and binary information prefixes. The Converter uses independent rational, decimal and symbolic checks over the bounded catalogue. [Converter source references](converter/limits.md) · [Converter oracle](../../tests/verify-converter.py) |

Stage limits record operation-specific mathematical references and which results are exact, symbolic or approximate. [All module references](REPORT.md#module-validation) · [Calculation record contract](calculation-proof/contract.md)
