# Reproducing the three findings

[Português brasileiro](reproduction.pt-BR.md)

Use the audited source commit in the receipt for each version. Build the release CLI with `cargo build --locked --release -p dars-cli`. Generate the matching local WASM modules with the repository's pinned wasm-bindgen and `node scripts/build-wasm.mjs`. The 0.5.0 source is `50225fb5dccb677b10653058f81d89c168a5743c`. Source files and the unaffected historical receipts are linked in the [original report](../REPORT.md).

The two files under `synthetic/` are shareable, deliberately invented inputs. From the repository root, run the following Python on either build. It passes the exact original bytes, including whitespace, as standard input. Windows users can supply `target/release/dars.exe` as the executable.

```python
from pathlib import Path
import hashlib, json, subprocess

root = Path("evidence/objective-05/revision-01")
cli = Path("target/release/dars").resolve()
for case in json.loads((root / "before.json").read_bytes())["cases"]:
    source = (root / case["file"]).read_bytes()
    assert hashlib.sha256(source).hexdigest() == case["file_sha256"]
    config = json.dumps(case["config"], separators=(",", ":"))
    record = subprocess.check_output([str(cli), "dataset", config], input=source)
    proof = json.loads(record)["proof"]
    print(case["id"], proof["algorithm_version"], json.loads(proof["result"])["profile"])
    if proof["algorithm_version"] == "data-lab/2":
        replay = subprocess.check_output([str(cli), "dataset-replay", proof["normalized"]], input=source)
        assert json.loads(replay)["proof"] == proof
```

The JSON fixture contains a native number and localized text. Compare both cell objects, numeric count, sum and mean. The XLSX fixture contains the same styled serial once as a cell value and once as the cached result of a formula. Compare the date casts and then the decimal casts. The original WASM `LocalDataset.page(0,25)` and the corrected CLI `dataset SETTINGS --page 0 25` expose the page. [Original observations](before.json) · [Corrected observations](after.json)

For the resource finding, use a release build and run `python -B tests/verify-data-revision.py target/release/dars --readers` with the validation dependencies in the workflow. The same small input runs under a generous budget and an artificially low budget. The oracle checks rejection and successful recovery, including a dataset within the file-size limit. Rust stage-specific tests cover a rejection during output from an existing table. The process-isolated benchmark is a separate measurement. Its four input volumes, width variations, measurements and configured budgets are recorded in [benchmarks.json](benchmarks.json).
