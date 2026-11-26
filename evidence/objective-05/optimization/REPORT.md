# Optimization

[Português brasileiro](REPORT.pt-BR.md)

The audited suite includes the root of x²−2, the quadratic minimum at x=3, Rosenbrock, discontinuities, bounded local optima and exact linear feasibility. Bounded LP and numerical local solvers have separate interpretations.

The independent CLI suite exercised 39 cases. Native/WASM parity passed 17 requests and rejected 3 calls to other workspaces. The initialized WASM benchmark measures 120 calls after warmup. Local instrumented line coverage for this module was 93.69%. [Algorithms and limits](contract.md) · [Independent cases](tests.json) · [Parity and timing](parity.json) · [Coverage](coverage.json) · [Browser capture](web.png)
