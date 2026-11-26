"""Compare DARS distributions with SciPy and selected extreme tails with mpmath."""

import argparse
import hashlib
import json
import math
import subprocess
from pathlib import Path

import mpmath as mp
import scipy
from scipy import stats


def close(actual, expected, *, relative=3e-8, absolute=2e-14):
    if not math.isfinite(expected):
        assert actual is None, (actual, expected)
    else:
        assert actual is not None and math.isclose(actual, expected, rel_tol=relative, abs_tol=absolute), (actual, expected)


def run(cli):
    cases = []

    def evaluate(name, payload, *, operation="distribution", options=None, error=None, raw=False):
        request = {"schema": 1, "module": "probability", "operation": operation,
                   "input": payload if raw else json.dumps(payload, separators=(",", ":")), "options": options or {}}
        proc = subprocess.run([cli, "tool", json.dumps(request)], capture_output=True, check=False, timeout=8)
        response = json.loads(proc.stdout)
        cases.append(name)
        if error:
            assert proc.returncode == 1 and response == {"ok": False, "code": error}, (name, response)
            return {}
        assert proc.returncode == 0 and response["ok"], (name, response, proc.stderr)
        proof = response["proof"]
        assert proof["module"] == "probability" and proof["operation"] == operation
        assert proof["exactness"] == "approximate" and proof["error_bound"] is None
        assert proof["normalized"] == request["input"]
        return json.loads(proof["result"])

    laws = [
        ("bernoulli", {"p": .3}, stats.bernoulli(.3), True),
        ("binomial", {"n": 10, "p": .5}, stats.binom(10, .5), True),
        ("negative_binomial", {"r": 2.7, "p": .4}, stats.nbinom(2.7, .4), True),
        ("geometric", {"p": .2}, stats.geom(.2), True),
        ("poisson", {"lambda": 10.7}, stats.poisson(10.7), True),
        ("hypergeometric", {"population": 80, "successes": 27, "draws": 14}, stats.hypergeom(80, 27, 14), True),
        ("discrete_uniform", {"minimum": -8, "maximum": 0}, stats.randint(-8, 1), True),
        ("uniform", {"minimum": -2, "maximum": 3}, stats.uniform(-2, 5), False),
        ("normal", {"mean": 0, "sd": 1}, stats.norm(), False),
        ("lognormal", {"log_mean": .3, "log_sd": .8}, stats.lognorm(.8, scale=math.exp(.3)), False),
        ("exponential", {"rate": 1.2}, stats.expon(scale=1 / 1.2), False),
        ("gamma", {"shape": 2.3, "rate": .7}, stats.gamma(2.3, scale=1 / .7), False),
        ("beta", {"alpha": 2.2, "beta": 4.1}, stats.beta(2.2, 4.1), False),
        ("weibull", {"shape": 1.4, "scale": 2.5}, stats.weibull_min(1.4, scale=2.5), False),
        ("student_t", {"df": 5.2}, stats.t(5.2), False),
        ("chi_squared", {"df": 3.5}, stats.chi2(3.5), False),
        ("fisher_f", {"df1": 5.3, "df2": 8.4}, stats.f(5.3, 8.4), False),
    ]
    for name, parameters, law, discrete in laws:
        payload = {"distribution": name, "parameters": parameters}
        prev_x, prev_cdf = -math.inf, 0.0
        for p in (.000001, .005, .031, .123, .23, .5, .79, .91, .997, .999999):
            x = float(law.ppf(p))
            lower, upper = float(law.ppf(.015)), float(law.ppf(.975))
            result = evaluate(f"{name}:p={p}", {**payload, "x": x, "probability": p, "lower": lower, "upper": upper})
            kind = "mass" if discrete else "density"
            assert result["kind"] == ("discrete" if discrete else "continuous")
            point = result["point"]
            close(point[kind], (law.pmf if discrete else law.pdf)(x))
            close(point["cdf"], law.cdf(x))
            close(point["survival"], law.sf(x))
            close(point["cdf"] + point["survival"], 1)
            assert x >= prev_x and point["cdf"] + 1e-12 >= prev_cdf
            prev_x, prev_cdf = x, point["cdf"]
            got = result["quantile"]["value"]
            close(got, x)
            if discrete:
                assert got == int(got) and law.cdf(got - 1) < p + 1e-9 <= law.cdf(got) + 2e-9
            else:
                close(law.cdf(got), p, relative=1e-6)
            before = lower - 1 if discrete else lower
            close(result["interval"]["probability"], law.cdf(upper) - law.cdf(before))
            close(result["mean"], law.mean())
            close(result["variance"], law.var())

        first = evaluate(f"{name}:sample_and_plot", {**payload, "sample_count": 128, "seed": "42", "plot_points": 65})
        again = evaluate(f"{name}:seed_replay", {**payload, "sample_count": 128, "seed": 42})
        assert first["samples"] == again["samples"] and len(first["samples"]) == 128
        lo, hi = law.support()
        assert all(lo <= value <= hi and (not discrete or value == int(value)) for value in first["samples"])
        xs = [point["x"] for point in first["plot"]["points"]]
        assert xs == sorted(set(xs)) and (len(xs) <= 65 if discrete else len(xs) == 65)
        for point in first["plot"]["points"]:
            close(point["y"], (law.pmf if discrete else law.pdf)(point["x"]))

    normal = {"distribution": "normal", "parameters": {"mean": 0, "sd": 1}}
    assert evaluate("standard_normal_oracle", {**normal, "x": 0})["point"]["cdf"] == .5
    binomial = {"distribution": "binomial", "parameters": {"n": 10, "p": .5}}
    close(evaluate("binomial_oracle", {**binomial, "x": 5})["point"]["mass"], .24609375)
    for floor,p in [(0,1/1024),(5,.623046875)]:
        assert evaluate(f"exact_binomial_jump_{floor}", {**binomial,"x":floor,"probability":p})["quantile"]["value"] == floor
        assert evaluate(f"one_ulp_above_binomial_jump_{floor}", {**binomial,"x":floor,"probability":math.nextafter(p,1)})["quantile"]["value"] == floor+1
    for count, p, x in [(1000000,.5,500000),(1000000,.1,100000),(100000,.5,50000)]:
        r = evaluate(f"large_binomial_center_{count}_{p}", {"distribution":"binomial","parameters":{"n":count,"p":p},"x":x,"probability":.5})
        ref = stats.binom(count,p)
        close(r["point"]["cdf"],ref.cdf(x))
        close(r["point"]["survival"],ref.sf(x))
        assert r["quantile"]["value"] == ref.ppf(.5)
    assert evaluate("discrete_gap", {**binomial, "lower": 4.1, "upper": 4.9})["interval"]["probability"] == 0
    assert evaluate("discrete_noninteger", {**binomial, "x": 4.5})["point"]["mass"] == 0
    point = evaluate("degenerate_binomial", {"distribution": "binomial", "parameters": {"n": 10, "p": 1}, "x": 10, "probability": .9})
    assert point["point"]["mass"] == 1 and point["variance"] == 0 and point["quantile"]["value"] == 10
    endpoint = evaluate("infinite_quantile_explicit", {**normal, "probability": 1})
    assert endpoint["quantile"]["value"] is None and endpoint["undefined"]["quantile"] == "infinite_support_endpoint"
    singular = evaluate("singular_density_explicit", {"distribution": "gamma", "parameters": {"shape": .5, "rate": 2}, "x": 0})
    assert singular["point"]["density"] is None and singular["point"]["cdf"] == 0
    moments = evaluate("undefined_student_moments", {"distribution": "student_t", "parameters": {"df": .8}, "x": 0})
    assert moments["mean"] is None and moments["variance"] is None
    for a,b in [(10000,10000),(10000,15),(0.1,10000),(1,10000)]:
        ref = stats.beta(a,b)
        for p in [.001,.05,.5,.93,.999]:
            x = float(ref.ppf(p))
            r = evaluate(f"beta_large_or_skewed_{a}_{b}_{p}", {"distribution":"beta","parameters":{"alpha":a,"beta":b},"x":x,"probability":p})
            close(r["point"]["cdf"],ref.cdf(x))
            close(r["point"]["survival"],ref.sf(x))
            close(r["quantile"]["value"],x)

    with mp.workdps(100):
        r = evaluate("normal_interval_14_to_15", {**normal, "x": 14, "lower": 14, "upper": 15, "probability": "1e-70"})
        tail = lambda x: mp.erfc(x / mp.sqrt(2)) / 2
        close(r["point"]["survival"], float(tail(14)), absolute=0)
        close(r["interval"]["probability"], float(tail(14) - tail(15)), absolute=0)
        close(float(tail(-r["quantile"]["value"])), 1e-70, absolute=0)
        r = evaluate("fisher_large_upper_tail", {"distribution": "fisher_f", "parameters": {"df1": 3, "df2": 6}, "x": "1e70"})
        close(r["point"]["survival"], float(mp.betainc(3, mp.mpf("1.5"), 0, 1 / (1 + mp.mpf("5e69")), regularized=True)), absolute=0)
        r = evaluate("gamma_small_cdf", {"distribution": "gamma", "parameters": {"shape": .25, "rate": 2}, "x": "1e-60"})
        close(r["point"]["cdf"], float(mp.gammainc(mp.mpf("0.25"), 0, mp.mpf("2e-60"), regularized=True)), absolute=0)
        r = evaluate("weibull_scale_normalized", {"distribution": "weibull", "parameters": {"shape": 30, "scale": "1e60"}, "x": "1e60"})
        close(r["point"]["cdf"], -math.expm1(-1), absolute=0)
        close(r["point"]["density"], 30e-60 / math.e, absolute=0)

    events = evaluate("conditional_and_bayes", {"p_a": .6, "p_b": .5, "p_ab": .3}, operation="events")
    assert events["independent"]
    for key, expected in {"a_given_b": .6, "b_given_a": .5, "union": .8, "bayes_a_given_b": .6, "complement_a": .4}.items():
        close(events[key], expected)
    assert evaluate("undefined_conditioning", {"p_a": 0, "p_b": .5, "p_ab": 0}, operation="events")["b_given_a"] is None
    evaluate("impossible_intersection", {"p_a": .75, "p_b": .8, "p_ab": .2}, operation="events", error="domain")
    evaluate("negative_sigma", {**normal, "parameters": {"mean": 0, "sd": -1}}, error="domain")
    evaluate("unpaired_bounds", {**normal, "lower": 0}, error="invalid_input")
    evaluate("reversed_bounds", {**normal, "lower": 1, "upper": 0}, error="domain")
    evaluate("unpaired_seed", {**normal, "seed": "1"}, error="invalid_input")
    evaluate("overlarge_plot", {**normal, "plot_points": 130}, error="limit")
    evaluate("bad_quantile", {**normal, "probability": -1}, error="domain")
    evaluate("unsupported_law", {**normal, "distribution": "arbitrary_expression"}, error="unsupported")
    evaluate("unexpected_parameter", {**normal, "parameters": {"mean": 0, "sd": 1, "extra": 1}}, error="invalid_input")
    evaluate("duplicate_parameter", '{"distribution":"normal","parameters":{"mean":0,"sd":1,"sd":2}}', raw=True, error="invalid_input")
    evaluate("unsafe_discrete_query_size", {"distribution": "geometric", "parameters": {"p": "1e-70"}, "x": "1e90"}, error="limit")
    evaluate("underflowing_decimal_parameter", {**normal, "parameters": {"mean": "1e-999", "sd": 1}}, error="limit")
    evaluate("oversized_integer_request", {"distribution": "hypergeometric", "parameters": {"population": 5001, "successes": 1, "draws": 2}}, error="limit")
    degenerates = [
        ("bernoulli", {"p": 0}, 0), ("binomial", {"n": 0, "p": .5}, 0),
        ("negative_binomial", {"r": 24, "p": 1}, 0), ("geometric", {"p": 1}, 1),
        ("poisson", {"lambda": 0}, 0), ("hypergeometric", {"population": 1, "successes": 1, "draws": 1}, 1),
    ]
    for name, parameters, value in degenerates:
        r = evaluate(f"degenerate_moments_{name}", {"distribution": name, "parameters": parameters, "x": value, "sample_count": 2, "seed": "2", "probability": 0})
        assert r["point"]["mass"] == r["point"]["cdf"] == 1 and r["point"]["survival"] == r["variance"] == 0
        assert r["samples"] == [value,value] and r["quantile"]["value"] == value
    for name,parameters,error in [
        ("gamma",{"shape":.00001,"rate":2},"limit"), ("normal",{"mean":"1e90","sd":1},"limit"),
        ("lognormal",{"log_mean":0,"log_sd":51},"limit"), ("poisson",{"lambda":1000001},"limit"),
        ("uniform",{"minimum":1,"maximum":1},"domain"), ("discrete_uniform",{"minimum":-1.5,"maximum":0},"domain"),
        ("discrete_uniform",{"minimum":-1000000001,"maximum":0},"limit"),
        ("hypergeometric",{"population":2,"successes":3,"draws":1},"domain"),
    ]:
        evaluate(f"parameter_bound_{name}_{parameters}",{"distribution":name,"parameters":parameters},error=error)
    evaluate("zero_samples",{**normal,"sample_count":0,"seed":"42"},error="domain")
    evaluate("nonempty_options",normal,options={"unknown":True},error="invalid_input")
    evaluate("too_many_dist_params",'{"distribution":"normal","parameters":{"a":1,"b":2,"c":3,"d":4}}',raw=True,error="invalid_input")
    low = evaluate("outside_finite_support",{**binomial,"x":-1})["point"]
    assert low["mass"] == low["cdf"] == 0 and low["survival"] == 1
    wide = evaluate("bounded_plot_strides",{"distribution":"discrete_uniform","parameters":{"minimum":0,"maximum":1000},"plot_points":5})["plot"]
    assert wide["stride"] > 1 and len(wide["points"]) <= 5
    return {"module": "probability", "oracle": {"scipy": scipy.__version__, "mpmath": mp.__version__},
            "requests": len(cases), "distribution_families": len(laws), "passed": len(cases), "cli_sha256": hashlib.sha256(Path(cli).read_bytes()).hexdigest(),
            "checks": cases}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cli", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    receipt = run(str(args.cli.resolve()))
    if args.out:
        args.out.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(f"Probability: {receipt['passed']} independent requests, {receipt['distribution_families']} families")
