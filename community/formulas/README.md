# DARS formula library

[Português brasileiro](README.pt-BR.md) · [File schema](formula-v1.schema.json)

These four declarative definitions ship with Formula Studio and work offline. Each file carries its author, license, domain, named parameters, output unit and executable test cases. Selecting a file opens an editable draft. **Verify and save** runs its cases with the local Rust engine and admits a passing definition into the session library. **Run formula** performs the same verification before using an unverified draft. Export the definition to keep it after clearing the session or closing the application.

| Definition | Contract | Default result |
| --- | --- | --- |
| [Rectangle area](rectangle-area.json) | Width and height in metres | 12 m² |
| [Simple interest](simple-interest.json) | Principal in BRL, rate per period as a fraction, whole periods | 1,200 BRL interest |
| [Arithmetic mean](arithmetic-mean.json) | Two exact rational values | 1/2 |
| [Average speed](constant-speed.json) | Distance in metres and elapsed seconds | 5/2 m/s |

## Authoring and review

1. Duplicate an example or create a formula. Give it a stable lowercase ID and a three-part numeric version. The full JSON editor includes parameters, inclusive bounds, tests, references, author and license. The expression field accepts named variables, decimal literals, parentheses, unary signs, `+`, `-`, `*`, `/`, `^`, `sqrt` and `cbrt`.
2. Specify units on all parameters and the result. Use `1` for a dimensionless quantity. Named units support products, quotients and integer powers, such as `m/s^2`. Addition and subtraction require matching dimensions. Scaled units and currency conversion require an explicit conversion before using the formula. A dimensioned base with a power requires a literal integer exponent. Root dimensions must divide evenly.
3. Supply at least one valid expected result. Cover zero or domain boundaries, unit mismatches and invalid inputs as applicable. Values are decimal or rational strings, including integers. Integer parameters must have an integral mathematical value. Use an explicit nonnegative absolute tolerance for approximate output. The comparison includes the Rust engine's certified display uncertainty. Expected error cases use stable codes.
4. For a dependency, pin its ID and version, declare a local name, and map its parameter names to available inputs or earlier dependency outputs. Register the dependency first. Missing pins, cycles, dimension mismatches and using rounded intermediate values are rejected. A saved ID and version identify one immutable definition within a library.
5. Share a standalone JSON document and its provenance through an explicitly authorized contribution. Include the source of the equation, conventions, rationale for tolerances, license of the contribution and independently checkable cases. Contributors supply ordinary data; reviewers inspect the definition and execute the cases before including it. Change the version for any change to a published definition.

Opening a local file never installs it globally or executes it. Formula Studio uses no network service. JSON references are descriptive text. The edition includes bounded input and complexity checks in addition to the public schema. A run record includes the complete pinned definitions and nested Rust Calculation Proofs. Sessions and generated results remain temporary until an explicit file export.
