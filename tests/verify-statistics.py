"""Independent Statistics CLI checks with Fraction, NumPy, and SciPy."""

import argparse
import hashlib
import json
import math
import random
import subprocess
from fractions import Fraction
from pathlib import Path

import numpy as np
import scipy
from scipy import stats


def close(actual, expected, rtol=2e-8, atol=2e-12):
    assert actual is not None and math.isclose(actual, expected, rel_tol=rtol, abs_tol=atol), (actual, expected)


def run(cli):
    cases = []

    def evaluate(name, operation, value, options=None, *, raw=False, error=None):
        source = value if raw else json.dumps(value, separators=(",", ":"))
        request = {"schema": 1, "module": "statistics", "operation": operation, "input": source, "options": options or {}}
        proc = subprocess.run([cli, "tool", json.dumps(request)], capture_output=True, check=False, timeout=8)
        response = json.loads(proc.stdout)
        cases.append(name)
        if error:
            assert proc.returncode == 1 and response == {"ok":False, "code":error}, (name, response)
            return None
        assert proc.returncode == 0 and response["ok"], (name, response, proc.stderr)
        proof = response["proof"]
        assert proof["module"] == "statistics" and proof["operation"] == operation and proof["normalized"] == source
        assert proof["method"] and proof["formula"] and proof["constraints"] and proof["error_bound"] is None
        return json.loads(proof["result"])

    for is_population, variance in ((True, 2), (False, 2.5)):
        result = evaluate(f"fundamental_population={is_population}", "descriptive", {"values":[1,2,3,4,5]}, {"population":is_population})
        assert result["mean"] == 3 and result["median"] == 3 and result["variance"] == variance

    rng = random.Random(20261126)
    for i in range(32):
        values = [rng.randint(1, 100)/10 for _ in range(6 + i)]
        weights = [rng.randint(1, 10) for _ in values]
        objective = {"values":values,"weights":weights,"percentiles":[.11,.5,.91]}
        step = i % 3 == 0
        population = i % 2 == 0
        excess = i % 5 != 0
        result = evaluate(f"numeric_descriptive_{i}","descriptive",objective,
                          {"quantile":"type1" if step else "type7", "population":population, "kurtosis":"excess" if excess else "pearson"})
        for key, expected in {
            "mean":np.mean(values), "weighted_mean":np.average(values, weights=weights), "harmonic_mean":stats.hmean(values),
            "geometric_mean":stats.gmean(values), "standard_deviation":np.std(values, ddof=0 if population else 1),
            "median":np.median(values), "mad":stats.median_abs_deviation(values), "minimum":min(values), "maximum":max(values),
            "range":np.ptp(values), "skewness":stats.skew(values,bias=population),
            "kurtosis":stats.kurtosis(values,bias=population,fisher=excess), "coefficient_of_variation":stats.variation(values,ddof=0 if population else 1),
        }.items():
            close(result[key], expected)
        for point in result["percentiles"]:
            close(point["value"], np.quantile(values, point["probability"], method="inverted_cdf" if step else "linear"))
        assert Fraction(result["exact"]["mean"]) == sum(map(lambda x: Fraction(str(x)), values)) / len(values)

    result = evaluate("outlier_and_tied_modes","descriptive",{"values":[1,1,2,2,2,3,3,3,100]})
    assert result["modes"] == [2,3] and [v["index"] for v in result["outliers"]] == [8]
    assert evaluate("sample_constant","descriptive",{"values":[42]*20})["skewness"] is None
    assert evaluate("sample_single_observation","descriptive",{"values":[42]})["variance"] is None
    assert evaluate("negative_geometric_undefined","descriptive",{"values":[-1,0,2]})["geometric_mean"] is None
    result = evaluate("missing_versus_zero","descriptive",{"values":[1,None,0,3],"weights":[5,8,10,None]}, {"missing":"omit"})
    assert result["count"] == 3 and result["missing"] == 1 and Fraction(result["exact"]["weighted_mean"]) == Fraction(1,3)
    source = '{"values":[10000000000000000.1,10000000000000000.2,"10000000000000000.3",10000000000000000.4]}'
    result = evaluate("native_json_decimal_lexemes","descriptive",source,raw=True)
    assert Fraction(result["exact"]["mean"]) == Fraction("10000000000000000.25")
    assert Fraction(result["exact"]["variance"]) == Fraction(1,60)

    for index, offset in enumerate((10**15,10**40,10**68,10**90)):
        data = [rng.randint(-500,500) for _ in range(12)]
        plain = evaluate(f"baseline_{index}","descriptive",{"values":data})
        trans = evaluate(f"exact_translation_{index}","descriptive",{"values":[str(offset+d) for d in data]}, error="limit" if index>=2 else None)
        if trans is not None:
            assert Fraction(trans["exact"]["mean"]) - Fraction(plain["exact"]["mean"]) == offset
            assert trans["exact"]["variance"] == plain["exact"]["variance"]

    for i in range(16):
        x = np.array([rng.randint(0,10) for _ in range(22)])
        y = np.array([xi + rng.randint(-3,7) for xi in x])
        result = evaluate(f"pairwise_{i}", "relationship", {"x":x.tolist(),"y":y.tolist()})
        close(result["covariance"], np.cov(x,y)[0,1])
        close(result["pearson"], stats.pearsonr(x,y).statistic)
        close(result["spearman"], stats.spearmanr(x,y).statistic)
    result = evaluate("paired_missing","relationship",{"x":[1,None,3,4],"y":[2,100,6,None]}, {"missing":"omit"})
    assert (result["count"],result["missing"],result["pearson"]) == (2,2,1)
    result = evaluate("constant_relationship","relationship",{"x":[1,1,1],"y":[2,3,4]})
    assert result["pearson"] is None and result["spearman"] is None

    for k in [1,2,4,8]:
        for run_index in range(4):
            x = np.array([[rng.randint(-30,30) for _ in range(k)] for _ in range(14+k)], dtype=float)
            y = 9 + x@np.arange(1,k+1) + np.array([rng.randint(-10,10)/20 for _ in x])
            design = np.column_stack((np.ones(len(x)), x))
            expected = np.linalg.lstsq(design,y,rcond=None)[0]
            result = evaluate(f"svd_{k}_{run_index}","regression",{"predictors":x.tolist(),"response":y.tolist()})
            assert result["status"] == "fitted" and result["rank"] == k+1
            np.testing.assert_allclose([result["intercept"],*result["coefficients"]],expected,atol=1e-10,rtol=1e-10)
            np.testing.assert_allclose([r["value"] for r in result["residuals"]], y-design@expected, atol=1e-10,rtol=1e-10)
            tss = np.sum((y-y.mean())**2)
            close(result["diagnostics"]["r2"],1-np.sum((y-design@expected)**2)/tss)

    rank = evaluate("exact_collinear","regression",{"predictors":[[q,q*2] for q in range(10)],"response":list(range(10))})
    assert rank["status"] == "rank_deficient" and rank["coefficients"] is None and rank["rank"] == 2
    n = [0,1,2,3,4,5]
    conditioned = evaluate("ill_conditioned_full_rank","regression",{"predictors":[[str(q),str(q+(q%2)*1e-9)] for q in n],"response":[3,6,4,12,11,10]})
    assert conditioned["status"] == "ill_conditioned" and conditioned["rank"] == 3
    constant = evaluate("constant_fit","regression",{"predictors":[[q] for q in n],"response":[10]*len(n)})
    assert constant["diagnostics"]["r2"] is None and constant["coefficients"] == [0] and constant["intercept"] == 10
    shifted = evaluate("center_before_binary64_regression","regression",{"predictors":[[str(10**25+i)] for i in n], "response":[str(10**25+2*i) for i in n]})
    close(shifted["coefficients"][0], 2)
    skipped = evaluate("regression_complete_rows","regression",{"predictors":[[0],[None],[2],[3]],"response":[0,2,4,None]}, {"missing":"omit"})
    assert [r["index"] for r in skipped["residuals"]] == [0,2]

    x = [3,6,1,9,4,4,8,11]
    y = [1,8,0,4,5,7,6,7]
    for alt in ["two_sided","less","greater"]:
        alternative = alt.replace("_","-")
        option = {"alternative":alt,"alpha":"0.1"}
        one_sample = evaluate(f"one_sample_t_{alt}","mean_test",{"values":x,"null_mean":3},option)
        t = stats.ttest_1samp(x,3,alternative=alternative)
        for key, v in [("statistic",t.statistic),("p_value",t.pvalue)]:
            close(one_sample[key],v)
        for key, v in zip(["lower","upper"],t.confidence_interval(.9)):
            close(one_sample["confidence_interval"][key], v) if math.isfinite(v) else None
        z = evaluate(f"one_sample_z_{alt}","mean_test",{"values":x,"null_mean":3,"known_sd":3.2},option)
        z_observed = (np.mean(x)-3)/(3.2/math.sqrt(len(x)))
        p = {"two_sided":2*stats.norm.sf(abs(z_observed)),"less":stats.norm.cdf(z_observed),"greater":stats.norm.sf(z_observed)}[alt]
        close(z["statistic"],z_observed)
        close(z["p_value"],p)
        for dependent in [True,False]:
            result = evaluate(f"difference_test_{alt}_paired={dependent}","difference_test",{"x":x,"y":y,"paired":dependent},option)
            ref = stats.ttest_rel(x,y,alternative=alternative) if dependent else stats.ttest_ind(x,y,alternative=alternative,equal_var=False)
            close(result["statistic"],ref.statistic)
            close(result["p_value"],ref.pvalue)
            close(result["degrees_of_freedom"],ref.df)
        test = stats.mannwhitneyu(x,y,method="asymptotic",alternative=alternative)
        result = evaluate(f"mann_whitney_{alt}","rank_test",{"x":x,"y":y},option)
        close(result["statistic"],test.statistic)
        close(result["p_value"],test.pvalue)
        signs = np.sign(np.array(x)-y)
        result = evaluate(f"sign_test_{alt}","sign_test",{"x":x,"y":y},option)
        close(result["p_value"], stats.binomtest(int(sum(signs>0)),int(sum(signs!=0)),.5,alternative=alternative).pvalue)
        for k,n,p in ((12,20,.5),(0,10,.1),(9,100,.02),(2,12,.4),(330,500,.7),(923,1000,.965),(1,1,1),(0,10,0),(1,10,0)):
            result = evaluate(f"binomial_inference_{alt}_{k}_{n}_{p}","proportion_test",{"successes":k,"trials":n,"p0":p},option)
            test = stats.binomtest(k,n,p,alternative=alternative)
            close(result["p_value"],test.pvalue,atol=1e-300)
            expected = test.proportion_ci(.9,method="wilson")
            close(result["confidence_interval"]["lower"],expected.low)
            close(result["confidence_interval"]["upper"],expected.high)
    exact_null = evaluate("t_test_exact_location_difference","mean_test",{"values":[str(100000000000000+i) for i in range(8)],"null_mean":"100000000000003.5"})
    assert exact_null["statistic"] == 0 and exact_null["p_value"] == 1

    for i in range(12):
        a = [rng.randint(10,100) for _ in range(5)]
        good = evaluate(f"chi_square_{i}","chi_square",{"observed":a,"expected":[str(Fraction(sum(a),5).numerator/ Fraction(sum(a),5).denominator)]*5})
        expected = stats.chisquare(a)
        close(good["statistic"],expected.statistic)
        close(good["p_value"],expected.pvalue)
        matrix = [[rng.randint(10,100) for _ in range(4)] for _ in range(3)]
        independent = evaluate(f"chi_square_independence_{i}","chi_square_independence",{"table":matrix})
        ref = stats.chi2_contingency(matrix,correction=False)
        close(independent["statistic"],ref.statistic)
        close(independent["p_value"],ref.pvalue)
        groups = [[rng.randint(1+g,20)+g for _ in range(9+g)] for g in range(4)]
        result = evaluate(f"anova_{i}","anova",{"groups":groups})
        ref = stats.f_oneway(*groups)
        close(result["statistic"],ref.statistic)
        close(result["p_value"],ref.pvalue)

    malformed = [
        ("null_rejected","descriptive",{"values":[None,0]},"invalid_input"),
        ("all_missing_rejected","descriptive",{"values":[None,None]},"domain",{"missing":"omit"}),
        ("empty_rejected","descriptive",{"values":[]},"domain"),
        ("empty_text_not_missing","descriptive",{"values":["",0]},"invalid_input"),
        ("negative_weights","descriptive",{"values":[1,2],"weights":[1,-1]},"domain"),
        ("weight_sum_zero","descriptive",{"values":[1,2],"weights":[0,0]},"domain"),
        ("nonfinite_token","descriptive",{"values":["NaN",0]},"invalid_input"),
        ("predictor_row_length","regression",{"predictors":[[1,2],[3]],"response":[4,5]},"domain"),
        ("invalid_percentile","descriptive",{"values":[1,2],"percentiles":[1.01]},"domain"),
        ("case_row_limit","descriptive",{"values":[1]*513},"limit"),
        ("constant_sample_t","mean_test",{"values":[1]*5},"domain"),
        ("inconsistent_pairs","difference_test",{"x":[1,2,3],"y":[4,5],"paired":True},"domain"),
        ("invalid_alpha","mean_test",{"values":x},"domain",{"alpha":"0"}),
        ("inadequate_expected_chi","chi_square",{"observed":[1,2],"expected":[1,2]},"domain"),
        ("constant_group_anova","anova",{"groups":[[1,1],[2,2]]},"domain"),
        ("noninformative_sign","sign_test",{"x":[1,2,3],"y":[1,2,3]},"domain"),
        ("rank_inadequate_n","rank_test",{"x":[1,2],"y":[3,4]},"domain"),
        ("nonobject_statistics_input","descriptive",[1,2],"invalid_input"),
        ("input_field_count","descriptive",{str(i):0 for i in range(10)},"invalid_input"),
        ("invalid_mantissa_exponent","descriptive",{"values":["2e1.5",1]},"invalid_input"),
        ("scientific_literal_limit","descriptive",{"values":["1e101",1]},"limit"),
        ("too_many_percentiles","descriptive",{"values":[1,2],"percentiles":[0]*33},"limit"),
        ("weights_alignment","descriptive",{"values":[1,2],"weights":[1]},"domain"),
        ("unknown_quantile_convention","descriptive",{"values":[1,2]},"invalid_input",{"quantile":"nearest"}),
        ("unknown_kurtosis_convention","descriptive",{"values":[1,2]},"invalid_input",{"kurtosis":"other"}),
        ("unknown_missing_policy","relationship",{"x":[1,2],"y":[3,4]},"invalid_input",{"missing":"coerce"}),
        ("single_relationship_pair","relationship",{"x":[1],"y":[2]},"domain"),
        ("no_predictor_rows","regression",{"predictors":[],"response":[]},"domain"),
        ("invalid_predictor_arity","regression",{"predictors":[[2]*9,[4]*9],"response":[3,6]},"limit"),
        ("too_many_regression_rows","regression",{"predictors":[[2]]*257,"response":[3]*257},"limit"),
        ("predictor_response_mismatch","regression",{"predictors":[[1],[2]],"response":[1]},"domain"),
        ("too_few_for_mean","mean_test",{"values":[1]},"domain"),
        ("invalid_known_sd","mean_test",{"values":[1,2],"known_sd":0},"domain"),
        ("unknown_tail","mean_test",{"values":[1,2]},"invalid_input",{"alternative":"nearest"}),
        ("rank_all_tied","rank_test",{"x":[2]*5,"y":[2]*5},"domain"),
        ("proportion_count_inconsistent","proportion_test",{"trials":10,"successes":11,"p0":.5},"domain"),
        ("proportion_count_noninteger","proportion_test",{"trials":10,"successes":2.5,"p0":.5},"domain"),
        ("proportion_count_limit","proportion_test",{"trials":1000001,"successes":2,"p0":.5},"limit"),
        ("chi_square_totals","chi_square",{"observed":[10,20],"expected":[10,10]},"domain"),
        ("chi_square_irregular_table","chi_square_independence",{"table":[[10,20],[10,20,30]]},"domain"),
        ("chi_square_contingency_limits","chi_square_independence",{"table":[[10,20]]*17},"limit"),
        ("anova_groups_limit","anova",{"groups":[[0,1]]*17},"limit"),
        ("unsupported_inference","matrix_eval",{"values":[1,2]},"unsupported"),
    ]
    for name,operation,value,error,*options in malformed:
        evaluate(name,operation,value,options[0] if options else {},error=error)
    evaluate("duplicate_fields","descriptive",'{"values":[1,2],"values":[3,4]}',raw=True,error="invalid_input")
    return {"module":"statistics","oracle":{"numpy":np.__version__,"scipy":scipy.__version__,"fractions":"Python standard library"},
            "requests":len(cases),"passed":len(cases),"cli_sha256":hashlib.sha256(Path(cli).read_bytes()).hexdigest(),"checks":cases}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cli",type=Path)
    parser.add_argument("--out",type=Path)
    args = parser.parse_args()
    receipt = run(str(args.cli.resolve()))
    if args.out:
        args.out.write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf-8")
    print(f"Statistics: {receipt['passed']} independent requests")
