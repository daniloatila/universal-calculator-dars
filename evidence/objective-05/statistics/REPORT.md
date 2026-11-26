# Statistics

DARS 0.5.0 accepts local schema-1 requests for `statistics`. Send the canonical JSON object as the `input` string. `proof.result` contains a JSON object encoded as a string. The request preserves the original source notation separately.

| Operation | Input | Method |
| --- | --- | --- |
| `descriptive` | `values`, optional `weights` and `percentiles` | Exact rational location and dispersion where indicated, geometric mean, quartiles, MAD, modes and potential outliers |
| `relationship` | Aligned `x` and `y` | Exact centered covariance, Pearson correlation and Spearman correlation using average ranks |
| `regression` | `predictors` as rows, `response` | Simple or multiple least squares with an intercept, exact centering and column scaling before bounded SVD |
| `mean_test` | `values`, optional `null_mean` and `known_sd` | One-sample t or one-sample z with a known population standard deviation |
| `difference_test` | `x`, `y`, optional `paired` and `null_difference` | Paired t on within-pair differences or Welch t for independent groups |
| `proportion_test` | `successes`, `trials`, `p0` | Exact binomial null distribution with numerical tails, Wilson score interval and Cohen's h |
| `chi_square` | `observed` and `expected` | Pearson goodness of fit with fixed expected counts and Cohen's w |
| `chi_square_independence` | `table` | Pearson independence test with Cramér's V and no continuity correction |
| `anova` | `groups` | Omnibus fixed-effects one-way ANOVA with eta-squared and omega-squared |
| `rank_test` | `x` and `y` | Asymptotic Mann–Whitney U with tie adjustment, continuity correction and rank-biserial effect |
| `sign_test` | Aligned `x` and `y`, optional `null_difference` | Paired sign test with exact binomial null distribution |

## Conventions and bounds

- Statistics reads canonical decimal strings and JSON numeric lexemes as exact rationals. Each token has at most 48 mantissa digits, written exponent magnitude at most 100 and value magnitude at most `1e100`. The universal envelope limits the canonical input to 4,096 UTF-8 bytes. Statistics allows up to 512 observations per vector and 32 additional percentiles. Regression permits up to 256 rows and eight predictors within the byte limit.
- Descriptive and relationship calculations default to sample denominators. Set `population: true` for population calculations. Quartiles and percentiles support Hyndman–Fan `type7` (linear, default) and `type1` (empirical inverse). Median and MAD use midpoint interpolation. MAD is the unscaled median absolute deviation from the median. Tukey fences flag observations outside Q1 − 1.5 IQR and Q3 + 1.5 IQR. [Hyndman and Fan](https://robjhyndman.com/publications/quantiles/)
- Population skewness and kurtosis use the centered population moments. Sample skewness uses adjusted Fisher–Pearson with at least three observations. Sample kurtosis uses the bias-corrected fourth moment with at least four observations. Select `excess` or `pearson` with the `kurtosis` option. A constant distribution has undefined skewness and kurtosis. Harmonic mean requires strictly positive observations, geometric mean accepts nonnegative observations, and coefficient of variation requires a positive mean.
- `missing` defaults to `reject`. `omit` treats JSON `null` as missing and drops complete pairs or regression rows where needed. Descriptive weights affect only the weighted mean and require a nonnegative set with positive sum. A constant variable has undefined correlation. Fields in `exact` supplement binary64 presentation where applicable.
- Regression reports the numerical rank including the intercept and a reciprocal condition estimate for the centered and scaled design. Rank uses `max(n,k) × 32 × eps × largest singular value`. A rank-deficient fit reports diagnostics without coefficients. A reciprocal condition below or equal to `1e−8` flags a sensitive fit. Use the reported exact centers for centered prediction, particularly when the zero-origin intercept is far outside the observed range. Residuals retain input row indices.
- Inference uses `alpha` from `1e−12` through `0.5`, default `0.05`. Directional tests accept `two_sided`, `less` or `greater`. Paired differences are `x−y`. Tests report assumptions, p-values, degrees of freedom and effects where applicable. Both chi-square tests require each expected count to be at least five. Mann–Whitney requires a minimum of five observations per group and uses average ranks. The sign test removes differences exactly equal to the null. Binomial tests support up to one million trials.
- Confidence intervals estimate population quantities under the stated assumptions. P-values are tail probabilities under the null. Statistical significance has no causal interpretation by itself. Intervals, numerical tolerances and working precision are recorded separately from certified error. [NIST statistical handbook](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35.htm)

## Reproduce

After building the release CLI, run `python -B tests/verify-statistics.py target/release/dars --out evidence/objective-05/statistics/tests.json` with the locked test-only scientific environment. Python `Fraction` checks preserved decimal precision. NumPy and SciPy check moments, rank behavior, regression, tests and intervals. The shared `tests/verify-simulation-targets.mjs` compares isolated WASM against the CLI. See [test receipt](tests.json) and [acceptance](acceptance.json).

Runtime dependencies are the existing `num-bigint`, `num-rational`, `num-traits` and `nalgebra`, and `statrs` with optional default random sampling and its independent nalgebra disabled. The library choice reuses the project's existing SVD and arbitrary-size decimal support while keeping inference special functions local. [Nalgebra SVD](https://docs.rs/nalgebra/0.35.0/nalgebra/linalg/struct.SVD.html) · [Statrs source](https://github.com/statrs-dev/statrs/tree/v0.18.0)

The browser capture uses the synthetic sample 1, 2, 3, 4, 5. It shows mean 3, median 3 and sample variance 2.5. [Browser capture](web.png)
