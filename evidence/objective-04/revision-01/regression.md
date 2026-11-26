# Regression mapping

[Português brasileiro](regression.pt-BR.md)

The historical matrix remains in the [0.4.0 test ledger](../tests.json). The revision reruns the established CI workload and tracks the 602 inherited checks, 2,355 mathematical oracle cases, 305 mathematical CLI/WASM checks, 577 independent finance cases, 630 notation comparisons and existing browser and native tests. Each category keeps its original scope. Full proof parity, notation transitions and unit tests can cover the same calculation and are listed separately.

The new independent oracle computes annual equivalents with rational arithmetic and checks stable dispositions without using the candidate's displayed rates as an oracle. The WASM check sends those requests to separately built workers and compares the entire proof envelope with native output. The browser adds workflow coverage for historical import, language changes, suspended state and the concurrent-worker bound. The compatibility catalog has a dedicated Rust test that replays concrete recipes and checks the declared metric identity, required keys and unit.
