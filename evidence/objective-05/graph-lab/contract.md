# Graph Lab

[Português brasileiro](contract.pt-BR.md)

`graph-lab/1` compiles bounded real formulas with the existing Calculus parser. The request uses canonical formula strings. Decimal and scientific literals, `pi`, `e`, arithmetic, integer powers between −32 and 32, `sin`, `cos`, `tan`, `exp`, `ln`, `abs`, and `sqrt` are supported. Angles use radians. Interactive parameters `a`, `b`, `c` default to 1, 0, 0.

| Operation | Formula input | Output |
| --- | --- | --- |
| `explicit` | `expressions` with one to four formulas in `x` | Independent two-coordinate paths. Optional `find_roots` and `find_intersections` request numeric candidates. |
| `parametric` | `x` and `y` formulas in `t` | A two-coordinate path. |
| `polar` | `r` in `t` | A Cartesian path derived from `r(t)` and angle `t`. |
| `implicit` | `expression` in `x,y` | The zero-level contour, sampled with marching squares and a center sample in ambiguous cells. |
| `surface` | `expression` in `x,y` | `grid.x`, `grid.y`, `grid.z[y][x]` with undefined or masked vertices set to `null`. |
| `space_curve` | `x`, `y`, and `z` formulas in `t` | A three-coordinate path. |

Paths use `series[].points`, where `null` breaks the polyline. Implicit contour segments use a `null` separator per segment. The engine tests interval domains before connecting samples, including across unsampled poles where the interval exposes the singularity. Unresolved trigonometric oscillations, unsupported magnitudes and unresolved domain cells cause gaps and warnings. Implicit contour generation can report a partial result at its segment limit. Grid sampling can miss narrow features, isolated points or contours without a sign change. The broadcast result has a 32 KiB ceiling. Axis and output magnitude limits are `10^12`. Curves permit 16–256 samples each and up to 512 total explicit samples. Grids use 8–32 samples per axis and default to 24.

Numerical root and intersection candidates use a fixed 128-panel scan, up to 50 bisections per candidate, up to 12 candidates per curve or pair, and an approximate absolute residual tolerance of `10^-8`. The numerical search remains the same when only visual sampling changes. Roots with no sign change and features between probes can be missed. The point-range check suppresses results when floating cancellation prevents resolving a small computed residual. Calculation Proof records the input, method, precision and search assumptions. The error-bound field is empty.

Run `python -B tests/verify-graph-lab.py target/release/dars.exe` from the repository root to check analytic paths, surfaces, contour samples, separation across poles, guard behavior and numerical invariance across visual sample counts. Browser controls, context recovery, exports, low-resource rendering and lifecycle are recorded in the integrated audit.

[NIST DLMF interpolation](https://dlmf.nist.gov/3.3) · [NIST DLMF nonlinear equations](https://dlmf.nist.gov/3.8)
