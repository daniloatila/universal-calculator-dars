# 0002 · Scientific computation across native and WASM

[Português brasileiro](0002-scientific-computation.pt-BR.md)

Each scientific workspace loads its own WebAssembly artifact. The native CLI and web workers share the Rust calculations and the versioned proof envelope. Each worker admits only its registered public tool IDs. Internally, Optimization and Graph Lab reuse the bounded Calculus expression tree. Physics uses the Converter dimensional model. Parameter limits, algorithm iterations and distribution conventions belong to the mathematical request. Device profiles control graphics sampling and scheduling.

Simulation retains deterministic PRNG and accumulator state in a short-lived Rust task. Step size changes the frequency of progress notifications. The worker owns a single task and frees it on completion. Terminating the worker cancels native WASM execution. A new job receives a new worker. Data Lab has a separate byte-oriented API for large sources, bounded independently from the 4 KiB tool expression input. The native CLI reads those bytes on stdin. File proofs bind SHA-256, configuration and summary. Replay requires the external source file.

Statistics uses exact rationals where feasible and centered linear algebra for fitted models. Probability and inference share bounded probability kernels. Simulation records the PRNG version and aggregation. Optimization distinguishes feasible or provably optimal linear solutions from local numerical estimates. SI dimensions are checked before formula evaluation. A graph exports sampled geometry, viewport and resolution independently of mathematical proofs.

Canvas 2D supports the 2D and projected 3D workspaces. Surfaces use a bounded grid and an adjustable camera. Drawing on demand avoids keeping a GPU context or permanent animation loop. The active module owns all temporary resources. [Engine contracts](../../evidence/objective-05/REPORT.md)
