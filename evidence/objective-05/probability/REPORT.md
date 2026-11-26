# Probability

Send the law identifier and its parameter object to `probability` / `distribution` as an `input` JSON string. The response contains moments where finite. `x` requests mass or density, CDF `P(X ≤ x)` and survival `P(X > x)`. Set `lower` and `upper` together for `P(lower ≤ X ≤ upper)`, `probability` for the generalized inverse CDF, `sample_count` with `seed` for samples or `plot_points` for graph coordinates. Each of these queries is optional.

| Law | Parameters | Convention |
| --- | --- | --- |
| `bernoulli` | `p` | Support 0 and 1 |
| `binomial` | `n`, `p` | Number of successes in `n` trials |
| `negative_binomial` | `r`, `p` | Failures before `r` successes when `r` is an integer. The law also accepts positive real shape parameters. |
| `geometric` | `p` | Trials through first success, starting at 1 |
| `poisson` | `lambda` | Nonnegative event rate |
| `hypergeometric` | `population`, `successes`, `draws` | Sampling without replacement |
| `discrete_uniform` | `minimum`, `maximum` | Inclusive integer endpoints |
| `uniform` | `minimum`, `maximum` | Continuous support with distinct endpoints |
| `normal` | `mean`, `sd` | Positive standard deviation |
| `lognormal` | `log_mean`, `log_sd` | Normal parameters in natural-log space |
| `exponential` | `rate` | Mean `1/rate` |
| `gamma` | `shape`, `rate` | Rate is the reciprocal of scale |
| `beta` | `alpha`, `beta` | Positive shapes on [0, 1] |
| `weibull` | `shape`, `scale` | Positive shape and scale |
| `student_t` | `df` | Center zero, scale one |
| `chi_squared` | `df` | Positive degrees of freedom |
| `fisher_f` | `df1`, `df2` | Numerator and denominator degrees of freedom |

`events` takes `p_a`, `p_b` and `p_ab`. It returns intersection, union, complements, both conditionals, Bayes' reformulation and an independence check using a four-epsilon relative comparison. Pairs outside the Fréchet bounds are rejected. Zero-probability conditioning returns `null` for that conditional.

## Algorithms and precision

- Continuous density may exceed one. It measures probability per unit of `x`. Discrete mass is probability at a point. Discrete CDF and survival use the greatest integer at most `x`. Plot points show density over the central 99% span or individual masses at sampled integers. A strided mass plot can omit support points.
- Direct survival functions and complementary beta arguments preserve upper tails. The bounded modified Lentz fraction uses at most 4,096 iterations, compares its convergent factor to eight binary64 epsilons and rejects nonconvergence. A normalized log-beta formulation checks cancellation before evaluating small probabilities. Continuous quantiles use bracket expansion and bisection, with a relative tail-residual check at the floating-point bracket boundary. Quantile iteration caps are 1,024 bracket expansions and 1,100 refinements. These are solver controls. The proof has no certified error bound. [NIST DLMF incomplete beta](https://dlmf.nist.gov/8.17) · [NIST DLMF gamma asymptotics](https://dlmf.nist.gov/5.11)
- The dedicated fair-binomial branch sums integer coefficients for `n ≤ 52`, so exact dyadic CDF jumps and their immediate neighbors are distinguished in that range. Independent reference cases include the center of a million-trial binomial, skewed and symmetric beta laws, normal survival past 14 standard deviations, large upper F tails and the gamma CDF near zero. The tested regular comparisons use up to `3e-8` relative and `2e-14` absolute tolerance. The mpmath extreme-tail checks do not use an absolute floor. Very small tails and extreme sample values can round at the limits of binary64. Infinite support endpoints and unavailable moments or densities use `null` with reason metadata.
- The request allows up to 4,096 bytes, 128 sample values and 129 plot points. Binomial trials and Poisson rate are capped at one million, the hypergeometric population at 5,000 and discrete-uniform endpoints at magnitude `1e9`. Unbounded discrete search caps counts at `1e15`. Supported shapes and degrees of freedom are `1e−4..1e4`. The lognormal constrains `abs(log_mean) ≤ 100` and `log_sd ≤ 50`. Other nonzero scalar magnitudes lie between `1e−100` and `1e100`. Finite-range and degenerate distributions use explicit branches. Invalid parameters, duplicates, unsupported requests and excessive inputs produce stable errors.

Statrs 0.18.0 supplies distribution definitions and selected functions with default sampling and optional nalgebra disabled. DARS implements the shared bounded beta fraction and numerically sensitive tail branches explicitly. Libm 0.2.16 provides deterministic sampling transforms without system entropy. Samples use the PCG recipe shared with [Simulation](../simulation/REPORT.md). [Statrs source](https://github.com/statrs-dev/statrs/tree/v0.18.0) · [Libm source](https://docs.rs/crate/libm/0.2.16)

## Reproduce

Run `python -B tests/verify-probability.py target/release/dars --out evidence/objective-05/probability/tests.json` with the locked test-only SciPy and mpmath dependencies. The suite checks all 17 families, distributions against independent implementation and analytic cases, support, complementarity, monotonicity, quantile consistency and local seed replay. The shared `tests/verify-simulation-targets.mjs` verifies isolated CLI/WASM results. See [test receipt](tests.json) and [acceptance](acceptance.json).

The browser capture uses the standard normal distribution at `x = 0` and shows density and cumulative probability in separate fields. [Browser capture](web.png)
