# Optimization

[Português brasileiro](contract.pt-BR.md)

The `optimization/1` Calculation Proof accepts a canonical expression in `x`, `y`, and optionally `z`. Binary64 evaluation compiles the bounded Calculus syntax tree locally. The real grammar supports decimal and scientific literals, arithmetic, integer powers from −32 to 32, `sin`, `cos`, `tan`, `exp`, `ln`, `abs`, `sqrt`, `pi`, and `e`. Formulas accept radians. Dependencies are the existing Calculus parser, rational arithmetic and serialization.

| Operations | Inputs and method | Status and diagnostics |
| --- | --- | --- |
| `bisection`, `hybrid` | `lower`, `upper`, optional `initial` for the hybrid. The hybrid only takes Newton steps inside the safe interior of the bracket. | A root candidate with absolute function residual, iteration count and exit reason. Sign changes through unresolved domains do not establish a root. |
| `newton`, `secant` | `initial` and, for secant, `second`. Newton uses forward automatic differentiation on the same tree. | An undefined or zero slope, an undefined iterate, an unresolved domain or an exhausted work limit produces an explicit inconclusive or iteration-limit status. |
| `minimize_univariate`, `maximize_univariate` | `lower` and `upper`. Golden-section search assumes a suitable basin and compares the original endpoints. | A local candidate and final interval width. Multiple minima or maxima can exist. |
| `gradient_descent`, `bfgs`, `nelder_mead` | `dimensions` of 2 or 3, `initial`/`initial_y`/`initial_z`, optional axis bounds. Projected Armijo, projected BFGS with Armijo, and bounded simplex search. | First-order stationarity or a local simplex candidate. The residual identifies the projected gradient infinity norm or simplex diameter. Invalid starting points return a constraint violation. |
| `linear_program` | Structured `objective`, `constraints`, and `sense`. Nonnegative variables, 1–3 dimensions, ≤12 constraints, `<=`, `>=`, `=`. Canonical rational strings, at most 112 bits for each input numerator and denominator. | Exact global optimum, infeasible or unbounded. The exact coordinates and objective are authoritative. The Boolean `alternative_optimum` flags the presence of tied optimal vertices or a feasible zero-gain direction. The work count is the number of active row sets examined. |

Magnitude of continuous coordinates is capped at `10^12`. Numeric tolerance defaults to `10^-9` and ranges from `10^-13` to `10^-2`. Iteration limits range from 1–4,096 and default to 256. A bracketing solver is limited to one root and can return inconclusive when its interval check cannot establish a usable branch. A small printed residual can arise from cancellation. The point-range guard suppresses convergence where the available arithmetic cannot resolve the requested residual. This guard is a numerical screen. The record keeps the error bound empty.

The nonnegative feasible polyhedron in linear programming is pointed. Exhaustive exact active-set enumeration tests vertices for feasibility and objective value. A separate enumeration intersects the nonnegative recession cone with `sum(d)=1`. A feasible direction with positive gain proves unboundedness for the maximization convention. A zero-gain direction at a finite optimum implies alternatives. This deliberately small input scope bounds the combinatorial work.

Run `python -B tests/verify-optimization.py target/release/dars.exe` from the repository root. Add `--scipy` in a Python environment with SciPy to compare independently with `brentq`, `minimize` and `linprog`. The analytic suite includes a discontinuity, binary64 cancellation, a nonconvex function, a saddle, a near-degenerate exact LP, inconsistent and unbounded LPs, bounds, multiple optima and Rosenbrock. Browser cancellation and worker recovery belong to the integrated audit.

[SciPy optimization reference](https://docs.scipy.org/doc/scipy/reference/optimize.html) · [NIST DLMF nonlinear equations](https://dlmf.nist.gov/3.8)
