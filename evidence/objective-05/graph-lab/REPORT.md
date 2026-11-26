# Graph Lab

[Português brasileiro](REPORT.pt-BR.md)

The real Canvas UI renders sampled 2D curves and projected 3D geometry. Export, camera operation, discontinuity gaps, keyboard inspection and the context-recovery event path were exercised. The context-loss test dispatches browser events. A physical GPU interruption was outside that test.

The independent CLI suite exercised 25 cases. Native/WASM parity passed 16 requests and rejected 3 calls to other workspaces. The initialized WASM benchmark measures 120 calls after warmup. Local instrumented line coverage for this module was 98.95%. [Algorithms and limits](contract.md) · [Independent cases](tests.json) · [Parity and timing](parity.json) · [Coverage](coverage.json) · [Browser capture](web.png)

The browser captures show `sin(x)` and `cos(x)` as 2D paths and `sin(x)*cos(y)` as a 3D surface. [2D](web-2d.png) · [3D](web.png)
