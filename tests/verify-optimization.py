"""Independent analytic cases and optional SciPy cross-checks for Optimization."""

from math import isclose, sqrt

from science_oracle import Oracle, arguments


def close(a, b, tolerance=2e-7):
    assert isclose(a, b, rel_tol=tolerance, abs_tol=tolerance), (a, b)


def row(coefficients, relation, rhs):
    return {"coefficients": [str(value) for value in coefficients], "relation": relation, "rhs": str(rhs)}


def linear(objective, rows=(), sense="maximize"):
    return {"objective": [str(value) for value in objective], "constraints": list(rows), "sense": sense}


def main():
    args = arguments(__doc__, scipy=True)
    oracle = Oracle("optimization", args.executable)
    run = oracle.run
    bracket = {"lower": "0", "upper": "2"}
    root_options = {"bisection": bracket, "hybrid": {**bracket, "initial": "1"},
                    "newton": {"initial": "1"}, "secant": {"initial": "1", "second": "2"}}
    for operation, options in root_options.items():
        out, proof = run(operation, "x^2-2", options=options)
        assert out["status"] == "converged" and out["residual_kind"] == "absolute_function_value", out
        close(out["point"][0], sqrt(2))
        assert out["residual"] <= float(proof["tolerance"]), out
        assert proof["exactness"] == "approximate"
    for expr, options, reason in [
        ("1/(x-0.2)", bracket, "domain_continuity_unresolved"),
        ("tan(x)", {"lower": "1", "upper": "2"}, "domain_continuity_unresolved"),
        ("x^2+1", bracket, "no_sign_change"),
        ("1e-12", bracket, "no_sign_change"),
        ("1/(x^2)", bracket, "undefined_endpoint"),
        ("sqrt(x)-1", {"lower": "-1", "upper": "2"}, "undefined_endpoint"),
    ]:
        out, _ = run("bisection", expr, options=options, category="domain_and_false_roots")
        assert (out["status"], out["reason"]) == ("inconclusive", reason), out
    out, _ = run("bisection", "(x-1)/(x*x+1)", options=bracket, category="interval_dependency")
    assert out["status"] == "converged" and out["point"] == [1.0], out
    out, _ = run("newton", "x^3-1", options={"initial": "0"}, category="ill_conditioned")
    assert out["reason"] == "zero_or_undefined_slope", out
    out, _ = run("newton", "exp(-1000)+x^2", options={"initial": "0"}, category="binary64_underflow")
    assert out["reason"] == "undefined_initial_point", out
    out, _ = run("newton", "1e16+x-1e16", options={"initial": "1"}, category="binary64_roundoff")
    assert (out["status"], out["reason"]) == ("inconclusive", "residual_below_arithmetic_resolution"), out
    out, _ = run("secant", "x^2-2", options={"initial": "1", "second": "1"}, category="coincident_estimates")
    assert out["reason"] == "coincident_initial_points", out
    out, _ = run("bisection", "x^2-2", options={**bracket, "max_iterations": 1}, category="iteration_bound")
    assert out["status"] == "iteration_limit" and out["iterations"] == 1, out

    options = {"lower": "-5", "upper": "7", "tolerance": "1e-9"}
    for operation, expr in [("minimize_univariate", "(x-3)^2+2"), ("maximize_univariate", "2-(x-3)^2")]:
        out, _ = run(operation, expr, options=options)
        assert out["status"] == "local_optimum_candidate" and out["residual_kind"] == "interval_width", out
        close(out["point"][0], 3)
        close(out["value"], 2)
    out, _ = run("minimize_univariate", "(x^2-1)^2", options={"lower": "-2", "upper": "2"}, category="nonconvex_multiple_minima")
    assert out["status"] == "local_optimum_candidate", out
    close(abs(out["point"][0]), 1)
    close(out["value"], 0)
    out, _ = run("minimize_univariate", "x^2", options={"lower": "2", "upper": "5"}, category="active_bound")
    assert out["point"] == [2] and out["value"] == 4, out

    box = {"initial": "0", "initial_y": "0", "upper": "1", "y_lower": "-0.5"}
    out, _ = run("gradient_descent", "(x-3)^2+(y+1)^2", options=box)
    assert out["status"] == "stationary_point" and out["point"] == [1, -0.5], out
    out, _ = run("bfgs", "x^2+y^2", options={"initial": "2", "upper": "1"}, category="constraint_violation")
    assert out["status"] == "constraint_violation", out
    out, _ = run("bfgs", "x^2-y^2", category="saddle_classification")
    assert out["status"] == "stationary_point", out
    rosenbrock = "(1-x)^2+100*(y-x^2)^2"
    dars_rosenbrock = {}
    for operation, status in [("nelder_mead", "local_optimum_candidate"), ("bfgs", "stationary_point")]:
        out, _ = run(operation, rosenbrock, options={"initial": "-1.2", "initial_y": "1", "tolerance": "1e-8", "max_iterations": 400}, category="rosenbrock")
        assert out["status"] == status, out
        close(out["point"][0], 1)
        close(out["point"][1], 1)
        close(out["value"], 0)
        dars_rosenbrock[operation] = out
    out, _ = run("bfgs", "(x-1)^2+(y-2)^2+(z-3)^2", options={"dimensions": 3}, category="three_dimensions")
    assert out["point"] == [1,2,3] and out["status"] == "stationary_point", out

    cases = [
        (linear([1,2], [row([1,1],"<=",4), row([0,1],"<=",2)]), "global_optimum", "6", False),
        (linear([1,1], [row([1,1],"<=",4)]), "global_optimum", "4", True),
        (linear([1,0], [row([1,0],"<=",4)]), "global_optimum", "4", True),
        (linear([1,0], [row([1,0],"<=",4), row([1,0],">=",5)]), "infeasible", None, None),
        (linear([0,1], [row([1,0],"<=",4)]), "unbounded", None, None),
        (linear([1,1,1], [row([3,3,3],"=",1)], "minimize"), "global_optimum", "1/3", True),
        (linear([1], [row(["1e-20"],"<=",1)]), "global_optimum", "100000000000000000000", False),
    ]
    for program, status, exact, alternatives in cases:
        out, proof = run("linear_program", program, category="exact_lp")
        assert out["status"] == status and proof["exactness"] == "exact", out
        assert out.get("value_exact") == exact and out.get("alternative_optimum") == alternatives, out
    run("linear_program", linear([1,2], [row([1],"<=",1)]), error="invalid_input", category="invalid_inputs")
    run("linear_program", linear([1,2,3,4]), error="limit", category="invalid_inputs")
    run("newton", "import(x)", options={"initial": "1"}, error="unsupported", category="invalid_inputs")
    run("bfgs", "x^2+y^2", options={"max_iterations": 4097}, error="limit", category="invalid_inputs")
    references = ["Independent analytic solutions and exact rational LP certificates"]
    if args.scipy:
        import scipy
        from scipy.optimize import brentq, linprog, minimize, rosen

        scipy_root = brentq(lambda x: x*x-2,0,2)
        out, _ = run("hybrid", "x^2-2", options=bracket, category="scipy")
        close(out["point"][0], scipy_root)
        for operation, method in [("nelder_mead", "Nelder-Mead"),("bfgs", "BFGS")]:
            independent = minimize(rosen, [-1.2,1], method=method)
            assert independent.success, independent
            for a,b in zip(dars_rosenbrock[operation]["point"], independent.x):
                close(a,b,2e-4)
        optimum = linprog([-1,-2], A_ub=[[1,1],[0,1]], b_ub=[4,2], method="highs")
        assert optimum.success, optimum
        out, _ = run("linear_program", cases[0][0], category="scipy")
        close(out["value"], -optimum.fun)
        references.append(f"SciPy {scipy.__version__}: brentq, minimize, linprog")
    oracle.finish(args.report, references)


if __name__ == "__main__":
    main()
