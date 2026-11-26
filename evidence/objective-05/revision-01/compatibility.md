# Data Lab compatibility in 0.5.1

[Português brasileiro](compatibility.pt-BR.md)

Version 2 distinguishes a structured file's native scalar grammar from the notation of text. Existing version 1 proofs remain readable. The UI shows historical records with their recorded result and offers explicit migration. Migration recalculates under the documented version 2 rules. An original source-bound record still requires the original source digest. The old result is retained as a historical record. A new standalone import uses the current rules.

A version 2 replay binds the source bytes to SHA-256, the semantic version, import settings, transformations and the effective resource budget. The native CLI accepts `dataset-replay DESCRIPTOR_JSON`, where the descriptor is the normalized JSON **inside** the proof. It calculates the result again. The browser compares a recomputed bound result with the imported record. Unsupported versions and mismatched source bytes produce explicit errors. [Type contract](data-type-contract.md) · [Historical observations](before.json)
