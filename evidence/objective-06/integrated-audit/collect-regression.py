"""Extract only suite counts from the three test steps in the audited Ubuntu job."""
import json, re, sys
from pathlib import Path

path = Path("evidence/objective-06/integrated-audit")
ci = json.loads((path/"ci.json").read_bytes())
def evidence(name):
    return json.loads((path/name).read_bytes())
desktop, browser, matrix = (evidence(name) for name in ['windows-regression.json','browser.json','../locale-transition-matrix.json'])
assert desktop["audited_source_commit"] == browser["source_commit"] == matrix["source_commit"] == ci["headSha"]
assert (desktop["passed"], desktop["failed"]) == (17,0)
assert browser["playwright"]["inherited_0_5_1"]["mapped_and_passed"] == 232
assert browser["playwright"]["passed"] == ci["ubuntu_chromium_passed"]
assert matrix["unique_proof_comparisons"] == 1050 and sum(matrix["categories"][g] for g in ("mathematics","finance","science")) == 924
assert len(browser["offline_science"]["modules"]) == 7 and browser["standalone_offline"]["results"][1]["passed"] == 5
lines = Path(f"artifacts/objective-06/integrated-run/{ci['databaseId']}-ubuntu.log").read_text(encoding="utf8").splitlines()
def stream(step):
    return "\n".join(re.sub(r"^.*?\d\d:\d\d:\d\d\.\d+Z ", "", line) for line in lines if "\t"+step+"\t" in line)
def records(text):
    values = []
    decoder = json.JSONDecoder()
    for match in re.finditer(r"(?m)^\{", text):
        try:
            record = decoder.raw_decode(text[match.start():])[0]
        except ValueError:
            continue
        values.append(record)
    return values
oracle = stream("Verify advanced mathematics with independent references")
parity = stream("Compare native and WebAssembly against independent calculations")
advanced = records(oracle)
comparisons = records(parity)
by_name = {v['suite']:v for v in advanced+comparisons if 'suite' in v}
math_oracles = {v['suite']:v['passed'] for v in advanced if 'passed' in v and re.search("sympy|mpmath|python-integers|datetime-calendar-zoneinfo", v.get('suite',''))}
math_parities = {k:by_name[k+'-cli-wasm']['passed'] for k in ['scientific','algebra','calculus','linear_algebra','geometry','discrete-mathematics','programmer','converter','date-time']}
finance = {label:next(v[k] for v in advanced if cond(v)) for label,k,cond in [
    ("financial_and_loans","total",lambda v:v.get('status')=='pass' and 'total'in v),
    ("investment_and_business","total",lambda v:v.get('ok') and 'total'in v),
    ("tax","count",lambda v:v.get('ok') and 'count'in v)]}
science = {k:int(re.search(r"(?m)^"+k+r": (\d+) independent requests", oracle)[1]) for k in ["Statistics","Probability","Simulation"]}
science.update({name:by_name[name]["cases"] for name in ['physics-engineering-independent-cli','optimization-independent-cli','graph-lab-independent-cli','optimization-boundaries','graph-lab-boundaries']})
science.update({k:by_name[k]["passed"] for k in ['tabular-import-contracts','local-tabular-scientific-oracle','data-lab-revision-contract']})
assert sum(math_oracles.values())==2355 and sum(math_parities.values())==305 and sum(finance.values())==577
assert by_name['financial-semantic-comparison']['passed']==by_name['semantic-comparison-cli-wasm']['cases']==84
assert by_name['financial-semantic-comparison']['independent_proof_replays']==by_name['semantic-comparison-cli-wasm']['proof_replays']==79
chunks=by_name['statistics-probability-simulation-target-parity']['modules']['simulation']['chunks']
assert len(chunks)==36
base = {k:by_name[k]['passed'] for k in ['python-fraction-decimal-oracle','fraction-decimal-structured-wasm','native-wasm-result-parity']}
offline = records(stream('Browser verification (Linux)'))
offline = {v["suite"]:v["passed"] for v in offline if v.get("suite","").startswith("production-")}
node = re.search(r"(?m)^(?:ℹ |# )?pass (\d+)\s*$",stream('Build WebAssembly and frontend'))
assert node and int(node[1])>=57 and offline.get("production-web-offline-and-lazy-locales")==10
assert all(v.get('failed',0)==0 for v in advanced+comparisons)
core_log = stream('Check Rust formatting and core')
core_checks = {}
for binary, size in [('standard',10), ('structured_values',6)]:
    matches = re.search(r"Running tests/" + binary + r"\.rs.*?test result: ok\. (\d+) passed; (\d+) failed", core_log, re.S)
    assert matches and tuple(map(int, matches.groups())) == (size, 0)
    core_checks[binary] = size
corrective = by_name['data-lab-revision-contract']
assert (corrective['passed'], corrective['native_wasm_request_comparisons']) == (23,31)
assert sum(core_checks.values())==16 and base == {'python-fraction-decimal-oracle':157,'fraction-decimal-structured-wasm':291,'native-wasm-result-parity':20}
ledger = {"version":"0.6.0","source_commit":ci["headSha"],"workflow":ci["url"],
    "advanced_math_independent":math_oracles,"math_cli_wasm":math_parities,"finance_independent":finance,
    "financial_comparisons":{"independent":84,"cli_wasm":84,"bound_replays":79},
    "simulation_chunk_replays":len(chunks),"science":science,"historical_base_cli_wasm":base,
    "data_lab_revision":{"independent_groups":corrective["passed"],"native_wasm_request_comparisons":corrective["native_wasm_request_comparisons"],"group_names":corrective["cases"]},
    "rust_core_integration_binaries":core_checks,"physical_chrome":browser["playwright"],
    "physical_windows":{"historical":desktop["passed"],"executable_sha256":desktop["executable_sha256"],"webview2":desktop["webview2"]},
    "directed_notation":{"inherited":924,"current":1050},"offline_science_modules":browser["offline_science"]["modules"],
    "rust_core_historical_map":"16 inherited tests in two maintained core integration test binaries; see original regression ledger and the audited Check Rust formatting and core workflow step.",
    "node_passed":int(node[1]),"hosted_chromium":ci["ubuntu_chromium_passed"],"offline_web":offline,
    "credential_checks":len(ci["windows_credential_checks"]),"capability_checks":len(ci["windows_capability_checks"]),
    "historical_mapping":[["rust_standard_and_structured",16],["cli_oracle",157],["wasm_structured",291],["cli_wasm",20],
        ["node",57],["physical_chrome",27],["production_offline",10],["physical_webview2",17],["hosted_credential",2],["hosted_capabilities",5]],
    "physical_chrome_receipt":"browser.json","physical_windows_receipt":"windows-regression.json","locale_matrix_receipt":"../locale-transition-matrix.json",
    "counting":"The 602 historical positions are maintained equivalents inside larger current suites. Counts for different layers overlap and should not be summed into a grand total."}
assert sum(v for _,v in ledger['historical_mapping'])==602
(path/"regression.json").write_text(json.dumps(ledger,indent=2)+"\n",encoding="utf8")
print("Advanced math",sum(math_oracles.values()),"parities",sum(math_parities.values()),"finance",sum(finance.values()),"simulation",len(chunks))
