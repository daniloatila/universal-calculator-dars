# Changes found during integration

[Português brasileiro](changes.pt-BR.md)

- A comparison against SciPy exposed an inaccurate binomial CDF near the center of one million fair trials. The corrected scientific kernels evaluate both tails with bounded convergence and preserve small fair-binomial jumps. The regression checks CDF, quantiles and the predecessor at a jump.
- A floating-point evaluation of a decimal risk level could move a historical loss threshold across a whole rank. The regression distinguishes 0.56 from a slightly larger decimal on an ordered sample of 100. Financial simulations also exercise small changes against large initial wealth.
- The optimization audit found a small residual created by arithmetic cancellation. The solver now reports when the arithmetic resolution cannot support a root claim. The underlying expression evaluator is shared with Graph Lab.
- Vite extracted the shared frame scheduler used by Geometry and Graph Lab. A cold-cache Chrome test found it loading with Standard. The offline asset list now defers that chunk and caches advanced modules on use.
- Import schema and output schema have separate roles in a tabular pipeline. Data Lab retains both to let users edit source types even after a transform has renamed or projected columns.
- Scientific WASM modules reuse Rust dependencies internally. The public worker checks its own registered module IDs before dispatch, including when a reused dependency also provides an independent calculator.
- Scientific controls now use labels tied to the operation. This covers the simulation interval method, probability results and distribution rates, sample vs. population, and the initial point or state in optimization and simulation. The browser regression exercises all seven interface languages.
- The 600-period Price comparison with final rounding took 9.29 and 9.38 seconds in the 0.5.0 worker. The 0.4.1 review observed up to 11.04 seconds. All 360- and 600-period scenarios preserved reference totals and differences. The exact-arithmetic path remains expensive. Finance keeps its 15-second deadline, and long scientific simulations use bounded batches. Two trials per version cannot establish a speed improvement. [Comparator timings](integrated-audit/finance-price.json)
