# Physics & Engineering

[Português brasileiro](contract.pt-BR.md)

`physics-engineering/1` models elementary mechanics, electricity, thermodynamics, fluids and engineering. Requests use named canonical decimal or rational strings and an optional `units` object mapping fields to unit codes. The result is `{ "values": { "quantity": { "value": "rational or decimal", "unit": "SI code" } } }`. Calculation Proof retains the original input with its units and records normalized scalar quantities in their SI units. The engine rejects repeated keys, unknown fields, incompatible dimensions, disallowed model domains and resistor lists longer than 32 entries.

| Area | Supported model IDs |
| --- | --- |
| Mechanics | `uniform_motion`, `accelerated_motion`, `force`, `work`, `energy`, `power`, `momentum`, `impulse`, `circular_motion`, `gravitation` |
| Electricity | `ohm`, `electrical_power`, `electrical_energy`, `resistors_series`, `resistors_parallel`, `capacitance`, `inductance`, `rlc_series` |
| Thermodynamics | `temperature`, `heat`, `heat_conduction`, `ideal_gas`, `pressure`, `thermodynamic_work`, `efficiency` |
| Fluids | `density`, `hydrostatic_pressure`, `buoyancy`, `flow_rate`, `continuity`, `bernoulli` |
| Engineering | `stress_strain`, `elasticity`, `torque`, `wave` |

The existing Converter handles dimensional families and exact affine temperature conversion. Temperature differences require `delta_K`, `delta_degC`, `delta_degF` or `delta_degR`. Electrical, frequency and other compound SI codes are restricted to each quantity's documented dimension and explicitly supported aliases. Approximate Converter factors such as `mmHg` do not enter exact physical models. Most operations return exact rationals within their stated mathematical assumptions. Physical measurements and simplified models carry separate real-world uncertainty.

Conventional standard gravity `g0 = 9.80665 m/s^2` is exact as a convention. The ideal-gas model computes with `R = 8.31446261815324 J/(mol*K)`, the exact product of the SI defining constants `N_A` and `k`. Point-mass gravitation uses CODATA 2022 `G = 6.67430e-11 m^3/(kg*s^2)` with standard uncertainty `1.5e-15 m^3/(kg*s^2)` and returns the propagated contribution of `G` as a separate quantity. Series RLC uses binary64 and notes the near-resonance conditioning. Neither approximate operation asserts an absolute error bound. Structural and critical-system validation are outside the scope of these classroom models. [BIPM SI Brochure, ninth edition](https://www.bipm.org/en/si-brochure-9) · [NIST standard gravity](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9) · [CODATA 2022](https://physics.nist.gov/cuu/pdf/JPCRD2022CODATA.pdf)

Run `python -B tests/verify-physics-engineering.py target/release/dars.exe` from the repository root. The independent oracle covers every model with analytic calculations or Python `Fraction`, including 12 V at 6 Ω yielding 2 A and 24 W, equivalent units, measured-constant uncertainty and rejected dimensional and absolute-temperature requests.
