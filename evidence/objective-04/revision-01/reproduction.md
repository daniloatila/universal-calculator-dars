# Reproducing the 0.4.1 comparison revision

[Português brasileiro](reproduction.pt-BR.md)

The historical fixture was captured from the hosted and hash-verified 0.4.0 Windows package running on installed WebView2. Open Financial and select Equivalent rate. Save one scenario with a source rate of 0.10, two source periods per year, and two destination periods per year. Save a second scenario with the same source and one destination period. Comparing Rate in 0.4.0 reports 0.11 and 110%. [Original input and proof](before-windows.json) · [Capture](before-windows.png)

Open the [historical scenario file](historical-scenarios.json) in the 0.4.1 Scenario Comparator. The engine recalculates both recipes, identifies the different periods, rebuilds the proof and shows 0.21 for both results on an effective annual basis. The fractional difference, percentage points and relative percent are zero.

```console
cargo build --locked --release -p dars-cli
python -B tests/verify-finance-comparison.py target/release/dars
node scripts/build-wasm.mjs
node tests/check-finance-comparison-targets.mjs target/release/dars
npm run build --prefix apps/web
npm run test:e2e --prefix apps/web
```

Use `target/release/dars.exe` for a local Windows CLI. For native application verification, confirm the Actions run, ZIP digest, package manifest and EXE SHA-256 first. Use separate fresh WebView2 profiles for the two versions.

```powershell
node scripts/reproduce-finance-comparison-v040.mjs $reference artifacts/objective-04/revision-01/baseline
node scripts/verify-finance-comparison-v041.mjs $candidate $verifiedSha artifacts/objective-04/revision-01/candidate
node scripts/verify-desktop.mjs --objective-04-revision-01 --exe $candidate
node scripts/verify-finance-desktop.mjs $approved031 $candidate $verifiedSha artifacts/objective-04/revision-01/desktop.json 0.4.1
```
