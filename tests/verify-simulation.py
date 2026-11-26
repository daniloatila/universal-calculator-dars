"""Reference PCG stream, analytic stochastic moments, financial loss and replay checks."""

import argparse
import hashlib
import json
import math
import platform
import statistics
import subprocess
import time
from pathlib import Path

import numpy as np
import scipy
from scipy import stats


class ReferencePCG:
    """PCG minimal reference translated using Python arbitrary-width integers."""

    def __init__(self, seed, stream=54):
        self.state = 0
        self.incr = 2 * stream + 1
        self.word()
        self.state = (self.state + seed) % (2**64)
        self.word()

    def word(self):
        old = self.state
        self.state = (6364136223846793005 * old + self.incr) % (2**64)
        shifted = (((old >> 18) ^ old) >> 27) % (2**32)
        rotation = old >> 59
        return ((shifted >> rotation) + ((shifted % (1 << rotation)) << (32 - rotation))) % (2**32)

    def uniform(self):
        return (self.word() * 2**20 + self.word() // 2**12 + .5) / 2**52

    def normal(self):
        u, theta = self.uniform(), self.uniform()
        return math.sqrt(-2 * math.log(u)) * math.cos(math.tau * theta)


def close(actual, expected, rtol=3e-10, atol=1e-11):
    assert actual is not None and math.isclose(actual, expected, rel_tol=rtol, abs_tol=atol), (actual, expected)


def run(cli, benchmark=False):
    cases = []
    benchmarks = []

    def evaluate(name, value, *, error=None, options=None, operation="monte_carlo", raw=False, timed=False):
        source = value if raw else json.dumps(value,separators=(",",":"))
        request = {"schema":1,"module":"simulation","operation":operation,"input":source,"options":options or {}}
        t0 = time.perf_counter()
        proc = subprocess.run([cli,"tool",json.dumps(request)],capture_output=True,check=False,timeout=10)
        elapsed = 1000 * (time.perf_counter()-t0)
        response = json.loads(proc.stdout)
        if not timed:
            cases.append(name)
        if error:
            assert proc.returncode == 1 and response == {"ok":False,"code":error}, (name,response)
            return None
        assert proc.returncode == 0 and response["ok"], (name,response,proc.stderr)
        proof = response["proof"]
        assert proof["module"] == "simulation" and proof["operation"] == operation and proof["normalized"] == source
        assert proof["method"] and proof["precision"] and proof["error_bound"] is None
        result = json.loads(proof["result"])
        assert result["termination"] == "requested_count"
        histogram = result["histogram"]
        assert sum(histogram["counts"]) == result["samples"] and len(histogram["edges"]) == len(histogram["counts"])+1
        if result["seed"] is not None:
            assert proof["variables"]["seed"] == result["seed"] and result["rng"] == "pcg32-xsh-rr/1"
            assert proof["variables"]["parallelism"] == "serial_order_fixed"
        return (result,elapsed) if timed else result

    def verify_series(result, vector, threshold=None, rtol=3e-10):
        x = np.array(vector)
        close(result["mean"],np.mean(x),rtol=rtol)
        close(result["variance"],np.var(x,ddof=1),rtol=rtol)
        close(result["standard_deviation"],np.std(x,ddof=1),rtol=rtol)
        for label,p in [("p05",.05),("p25",.25),("p50",.5),("p75",.75),("p95",.95)]:
            close(result["quantiles"][label], np.quantile(x,p,method="linear"), rtol=rtol)
        hist = result["histogram"]
        close(min(x),hist["edges"][0],rtol=rtol)
        close(max(x),hist["edges"][-1],rtol=rtol)
        # Independent libm implementations can round an endpoint by one ULP.
        # Only align endpoints after comparing their values.
        inside = np.clip(x,hist["edges"][0],hist["edges"][-1])
        np.testing.assert_array_equal(np.histogram(inside,bins=hist["edges"])[0],hist["counts"])
        if threshold is not None:
            assert result["event"]["count"] == int(np.count_nonzero(x>=threshold))
            close(result["event"]["probability"],np.mean(x>=threshold))

    rng_check = ReferencePCG(42)
    assert [rng_check.word() for _ in range(6)] == [0xa15c02b7,0x7b47f409,0xba1d3330,0x83d2f293,0xbfa4784b,0xcbed606e]
    seed = 18446744073709551615
    n = 1200
    normal = {"model":"distribution","distribution":"normal","parameters":{"mean":3,"sd":2},"samples":n,"seed":str(seed),"threshold":4,"bins":12}
    observed = evaluate("normal_reference_pcg32",normal)
    reference = ReferencePCG(seed)
    verify_series(observed,[3+2*reference.normal() for _ in range(n)],4)
    close(observed["standard_error"],observed["standard_deviation"]/math.sqrt(n))
    close(observed["confidence_interval"]["lower"],observed["mean"]-stats.norm.ppf(.975)*observed["standard_error"])
    assert evaluate("same_seed_replay",normal) == observed
    assert evaluate("different_seed",{**normal,"seed":str(seed-1)}) != observed

    n = 451
    threshold = 9
    random_walk = {"model":"random_walk","start":4,"drift":.08,"sd":.4,"steps":32,"samples":n,"seed":"55","threshold":threshold,"bins":17,"shock":.03}
    reference = ReferencePCG(55)
    expected = [4+math.fsum(.08+.4*reference.normal() for _ in range(32)) for _ in range(n)]
    result = evaluate("random_walk_reference",random_walk)
    verify_series(result,expected,threshold)
    close(result["sensitivity"]["mean_change"],.96)

    n = 650
    finance = {"model":"finance","initial":1250,"contribution":25,"drift":.02,"volatility":.12,"steps":12,"shock":.01,
               "currency":"USD","seed":"1003","samples":n,"risk_level":.952,"threshold":1800,"bins":12}
    reference = ReferencePCG(1003)
    values, changed = [], []
    for _ in range(n):
        wealth = shocked = 1250
        for _ in range(12):
            shock = reference.normal()
            wealth = wealth*math.exp(.02 + .12*shock) + 25
            shocked = shocked*math.exp(.03 + .12*shock) + 25
        values.append(wealth)
        changed.append(shocked-wealth)
    result = evaluate("finance_common_paths",finance)
    verify_series(result,values,1800)
    losses = sorted(1250+12*25-x for x in values)
    tail_weight = len(losses)*(1-finance["risk_level"])
    fractional = tail_weight-math.floor(tail_weight)
    es = (sum(losses[-math.floor(tail_weight):]) + fractional*losses[-math.ceil(tail_weight)])/tail_weight
    close(result["loss_risk"]["value_at_risk"],np.quantile(losses,.952,method="inverted_cdf"))
    close(result["loss_risk"]["expected_shortfall"],es)
    close(result["sensitivity"]["mean_change"],statistics.fmean(changed))

    trivial = evaluate("deterministic_finance_zero_volatility",{**finance,"initial":1000,"contribution":100,"drift":0,"volatility":0,"steps":10,"samples":15,"shock":"1e-22","threshold":2000})
    assert trivial["mean"] == 2000 and trivial["variance"] == 0 and trivial["event"]["probability"] == 1
    assert trivial["loss_risk"]["value_at_risk"] == trivial["loss_risk"]["expected_shortfall"] == 0
    close(trivial["sensitivity"]["mean_change"],1.45e-18,atol=0)
    assert len(trivial["histogram"]["counts"]) == 1 and trivial["confidence_interval"] is None

    historical = evaluate("historical_expected_shortfall_fractional_ties", {"model":"historical_risk","losses":[5,1,5,2,10],"risk_level":.7,"threshold":5})
    assert historical["loss_risk"]["basis"] == "observed_losses" and historical["loss_risk"]["value_at_risk"] == 5
    close(historical["loss_risk"]["expected_shortfall"],25/3)
    assert historical["event"]["probability"] == .6 and historical["event"]["confidence_interval"] is None
    assert historical["seed"] is None and historical["standard_error"] is None
    for lexeme,expected_rank in (("0.559999999999999999999999",56),("0.56",56),("0.560000000000000000000001",57),("5.6e-1",56)):
        levels = '{"model":"historical_risk","losses":' + json.dumps(list(range(1,101))) + ',"risk_level":' + lexeme + '}'
        result = evaluate(f"exact_empirical_rank_{lexeme}",levels,raw=True)
        assert result["loss_risk"]["value_at_risk"] == expected_rank and result["loss_risk"]["level_exact"] == lexeme
        close(result["loss_risk"]["expected_shortfall"],78.5)
    small_return = evaluate("loss_below_wealth_ulp",{**finance,"initial":"1e100","contribution":0,"steps":1,"samples":10,
                            "drift":"1e-22","volatility":0,"shock":0})
    assert small_return["mean"] == 1e100
    for field in ["value_at_risk","expected_shortfall"]:
        close(small_return["loss_risk"][field],-1e78,atol=0)
    small_loss = evaluate("adverse_loss_below_wealth_ulp",{**finance,"initial":"1e100","contribution":0,"steps":1,"samples":10,
                            "drift":"-1e-22","volatility":0,"shock":0})
    close(small_loss["loss_risk"]["value_at_risk"],1e78,atol=0)
    exact_type7 = evaluate("type7_exact_integer_coordinate",{"model":"historical_risk","losses":[0]*20+["1e70"],"risk_level":"0.95"})
    assert exact_type7["quantiles"]["p95"] == 0

    laws = [
        ("bernoulli",{"p":.4},stats.bernoulli(.4)), ("binomial",{"n":10,"p":.4},stats.binom(10,.4)),
        ("negative_binomial",{"r":3.7,"p":.45},stats.nbinom(3.7,.45)), ("geometric",{"p":.3},stats.geom(.3)),
        ("poisson",{"lambda":7.5},stats.poisson(7.5)), ("hypergeometric",{"population":80,"successes":25,"draws":6},stats.hypergeom(80,25,6)),
        ("discrete_uniform",{"minimum":-7,"maximum":8},stats.randint(-7,9)), ("uniform",{"minimum":-1,"maximum":5},stats.uniform(-1,6)),
        ("normal",{"mean":0,"sd":1},stats.norm()), ("lognormal",{"log_mean":.4,"log_sd":.3},stats.lognorm(.3,scale=math.exp(.4))),
        ("exponential",{"rate":1.6},stats.expon(scale=1/1.6)), ("gamma",{"shape":.8,"rate":1.6},stats.gamma(.8,scale=1/1.6)),
        ("beta",{"alpha":.9,"beta":2.5},stats.beta(.9,2.5)), ("weibull",{"shape":1.6,"scale":2},stats.weibull_min(1.6,scale=2)),
        ("student_t",{"df":10},stats.t(10)), ("chi_squared",{"df":4.2},stats.chi2(4.2)), ("fisher_f",{"df1":9,"df2":16},stats.f(9,16)),
    ]
    for i, (distribution, parameters, law) in enumerate(laws):
        n = 12000
        result = evaluate(f"simulation_moments_{distribution}",{"model":"distribution","distribution":distribution,
                          "parameters":parameters,"seed":str(500+i),"samples":n,"threshold":float(law.ppf(.5))})
        assert result["samples"] == n
        check_mean = math.sqrt(law.var()/n)
        assert abs(result["mean"]-law.mean()) < 5.5*check_mean, (distribution,result["mean"],law.mean(),check_mean)
        assert abs(result["variance"]/law.var()-1) < .18, (distribution,result["variance"],law.var())
        point = law.ppf(.5)
        p = law.sf(point-1 if distribution in {law[0] for law in laws[:7]} else point)
        assert abs(result["event"]["probability"]-p) < 5.5*math.sqrt(p*(1-p)/n)+1/n
    heavy = evaluate("infinite_variance_suppresses_mc_error",{**normal,"distribution":"student_t","parameters":{"df":1},"samples":100})
    assert heavy["variance"] is not None and heavy["standard_error"] is None and heavy["confidence_interval"] is None

    evaluate("missing_seed",{key:value for key,value in normal.items() if key!="seed"},error="invalid_input")
    evaluate("invalid_seed",{**normal,"seed":"-1"},error="invalid_input")
    evaluate("outside_u64_seed",{**normal,"seed":"18446744073709551616"},error="invalid_input")
    evaluate("invalid_confidence",{**normal,"confidence_level":1},error="domain")
    evaluate("too_many_samples",{**normal,"samples":100001},error="limit")
    evaluate("work_limit",{**random_walk,"steps":1000,"samples":100000},error="limit")
    evaluate("negative_finance_volatility",{**finance,"volatility":-.1},error="domain")
    evaluate("unsupported_model",{**normal,"model":"user_code"},error="unsupported")
    evaluate("invalid_model_fields",{**normal,"losses":[1]},error="invalid_input")
    evaluate("invalid_historical_seed",{"model":"historical_risk","losses":[1,2],"seed":"4"},error="invalid_input")
    evaluate("duplicate_parameters",'{"model":"distribution","distribution":"normal","parameters":{"mean":0,"sd":1,"sd":2},"seed":"4","samples":10}',raw=True,error="invalid_input")
    evaluate("unsupported_operation",normal,operation="math_eval",error="unsupported")
    evaluate("unknown_options",normal,options={"mode":"unknown"},error="invalid_input")
    evaluate("negative_walk_sd",{**random_walk,"sd":-.1},error="domain")
    evaluate("negative_initial",{**finance,"initial":-1},error="domain")
    evaluate("invalid_currency",{**finance,"currency":"bitcoin"},error="invalid_input")
    evaluate("finance_model_limit",{**finance,"drift":2.1},error="limit")
    evaluate("outcome_limit",{**finance,"initial":"1e100","drift":2,"volatility":0,"steps":100},error="limit")
    evaluate("invalid_bins",{**normal,"bins":0},error="domain")
    evaluate("missing_historical_data",{"model":"historical_risk","losses":[1]},error="domain")
    evaluate("historical_samples_limit",{"model":"historical_risk","losses":[1]*513},error="limit")
    evaluate("risk_below_supported_domain",{"model":"historical_risk","losses":[1,2,3],"risk_level":"0.49999999999999999999"},error="domain")
    evaluate("risk_above_supported_domain",{"model":"historical_risk","losses":[1,2,3],"risk_level":"0.99990000000000000001"},error="domain")
    evaluate("risk_invalid_token",{"model":"historical_risk","losses":[1,2,3],"risk_level":"52%"},error="invalid_input")
    evaluate("rejection_outcome_outside_finite_range",{**normal,"distribution":"weibull","parameters":{"shape":.0001,"scale":1e100}},error="limit")

    if benchmark:
        for name,payload in [("normal_100k",{**normal,"samples":100000}),
                             ("walk_2m_steps",{**random_walk,"samples":20000,"steps":100}),
                             ("finance_2m_steps",{**finance,"samples":20000,"steps":100})]:
            samples = []
            for _ in range(3):
                observed,duration = evaluate(name,payload,timed=True)
                assert observed["samples"] == payload["samples"]
                samples.append(round(duration,3))
            benchmarks.append({"case":name,"samples_ms":samples,"sample_count":payload["samples"],"path_steps":payload.get("steps",1),
                               "median_ms":round(statistics.median(samples),3)})
    cli_hash = hashlib.sha256(Path(cli).read_bytes()).hexdigest()
    return {"module":"simulation","oracle":{"numpy":np.__version__,"scipy":scipy.__version__,"pcg_reference":"https://www.pcg-random.org/download.html"},
            "requests":len(cases),"passed":len(cases),"cli_sha256":cli_hash,"checks":cases}, {
            "module":"simulation","host":platform.system(),"method":"native release CLI process wall, fresh process per sample; includes startup and JSON serialization",
            "cli_sha256":cli_hash,"benchmarks":benchmarks}


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cli",type=Path)
    parser.add_argument("--out",type=Path)
    parser.add_argument("--benchmark-out",type=Path)
    args=parser.parse_args()
    receipt,benchmarks=run(str(args.cli.resolve()),benchmark=bool(args.benchmark_out))
    if args.out:
        args.out.write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf-8")
    if args.benchmark_out:
        args.benchmark_out.write_text(json.dumps(benchmarks,indent=2)+"\n",encoding="utf-8")
    print(f"Simulation: {receipt['passed']} independent requests")
