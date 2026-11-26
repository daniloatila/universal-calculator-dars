"""Independent exact-value and workbook oracle for Data Lab revision 0.5.1."""
import argparse
import base64
import csv
import hashlib
import io
import json
import subprocess
import sys
from datetime import datetime
from decimal import Decimal
from fractions import Fraction
from pathlib import Path

from fixtures.data_revision_workbook import HEADERS, workbook

ROOT = Path(__file__).resolve().parents[1]


def encode(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


class Targets:
    def __init__(self, cli):
        self.cli = cli
        self.bridge = subprocess.Popen(["node", ROOT / "tests/data-revision-wasm.mjs"],
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf8")
        self.comparisons = 0

    def check(self, source, settings, op="proof", *, replay=False, error=None):
        settings = encode(settings)
        source = source.encode() if isinstance(source, str) else source
        payload = {"bytes": base64.b64encode(source).decode(), "settings": settings, "op": op, "replay": replay}
        self.bridge.stdin.write(encode(payload) + "\n")
        self.bridge.stdin.flush()
        response = json.loads(self.bridge.stdout.readline())
        if op in ("page", "proof"):
            args = [self.cli, "dataset-replay" if replay else "dataset", settings]
            if op == "page":
                args.extend(["--page", "0", "25"])
            cli = subprocess.run(args, input=source, capture_output=True, timeout=20)
            assert cli.returncode in (0, 1), (cli.returncode, cli.stderr)
            native = json.loads(cli.stdout)
            actual = {"value": native} if cli.returncode == 0 else {"error": native["code"]}
            assert response == actual, (op, response, actual)
            self.comparisons += 1
        if error is not None:
            assert response == {"error": error}, response
            return None
        assert "value" in response, (op, response)
        return response["value"]

    def close(self):
        self.bridge.stdin.close()
        assert self.bridge.wait(timeout=10) == 0


def cell(page, column, row):
    return page["rows"][row][[c["name"] for c in page["columns"]].index(column)]


def profile(proof, column):
    result = json.loads(proof["proof"]["result"])
    return next(c for c in result["profile"] if c["column"]["name"] == column)["statistics"]


def totals(stats, observations):
    values = [Fraction(v) for v in observations]
    assert stats["n"] == len(values) and Fraction(stats["sum"]) == sum(values), stats
    assert Fraction(stats["mean"]) == sum(values) / len(values), stats


def audit(targets, reference_readers):
    checked = []
    check = targets.check
    config = {"format": "json", "decimal": "comma", "types": {"valor": "decimal"}}
    mixed = '[{"valor":1.25},{"valor":"2,50"}]'
    reference = [Fraction(Decimal("1.25")), Fraction(Decimal("2.50"))]
    proof = check(mixed, config)
    totals(profile(proof, "valor"), reference)
    page = check(mixed, config, "page")
    for i, (kind, token) in enumerate([("number", "1.25"), ("text", "2,50")]):
        item = cell(page, "valor", i)
        assert (item["source_type"], item["value"], item["validity"]) == (kind, token, "valid"), item
        assert Fraction(item["canonical"]) == reference[i], item
    checked.append("mixed_json_source_grammar_and_exact_profile")
    assert proof["proof"]["algorithm_version"] == "data-lab/2"
    desc = json.loads(proof["proof"]["normalized"])
    assert desc["sha256"] == hashlib.sha256(mixed.encode()).hexdigest()
    assert desc["semantics_version"] == 2 and desc["configuration"]["semantics_version"] == 2
    assert check(mixed, desc, replay=True) == proof
    assert check(mixed, desc, "page", replay=True) == page
    check(mixed.replace("1.25", "1.26"), desc, replay=True, error="invalid_input")
    old = {"sha256": desc["sha256"], "configuration": config}
    check(mixed, old, replay=True, error="unsupported")
    checked.extend(["v2_proof_and_page_replay", "changed_source_digest", "v1_requires_explicit_migration"])

    large = ["90071992547409931234567891.123456789", "1.2345e-31", "-107E+12"]
    src = "[" + ",".join('{"valor":'+v+'}' for v in large) + "]"
    totals(profile(check(src, config), "valor"), [Fraction(Decimal(v)) for v in large])
    checked.append("exact_decimal_exponent_and_integer_beyond_binary64")
    table = '[{"id":"0001","valor":0},{"id":"0002","valor":""},{"id":"0003","valor":null},{"id":"0004"},{"id":"0005","valor":"NaN"}]'
    page = check(table, config, "page")
    assert [cell(page, "id", i)["value"] for i in range(5)] == [f"{i:04d}" for i in range(1, 6)]
    assert [cell(page, "valor", i)["validity"] for i in range(5)] == ["valid", "empty", "null", "absent", "invalid"]
    totals(profile(check(table, config), "valor"), [0])
    checked.extend(["leading_zero_text_ids", "zero_empty_null_absent_invalid"])
    untyped = check(mixed, {"format":"json","decimal":"comma"}, "page")
    assert untyped["columns"][0]["kind"] == "text" and cell(untyped,"valor",0)["value"] == "1.25"
    opts = {**config, "steps":[{"op":"cast","column":"valor","kind":t} for t in ("integer","text","decimal")]}
    totals(profile(check(mixed, opts), "valor"), reference)
    checked.append("initial_text_and_successive_casts")

    sort = {"op":"sort","column":"valor","descending":True}
    filt = {"op":"filter","column":"valor","compare":"gt","value":"1,00"}
    add = {"op":"calculate","left":{"column":"valor"},"operator":"add","right":{"constant":"0,25"},"name":"out"}
    src = '[{"k":"a","valor":1.25},{"k":"a","valor":"2,50"},{"k":"a","valor":0}]'
    chain = {**config,"steps":[filt,sort,add]}
    page = check(src,chain,"page")
    assert [Fraction(cell(page,"out",i)["canonical"]) for i in range(2)] == [Fraction(11,4),Fraction(3,2)]
    group = {**chain,"steps":[*chain["steps"],{"op":"group","by":"k","column":"out","aggregate":"sum","name":"total"}]}
    totals(profile(check(src,group),"total"),[Fraction(17,4)])
    checked.append("localized_filter_exact_sort_calculate_group")
    csv_source = 'id,n\na,\nb,2\na,\n'
    lookup = [["a","repeated"],["b","other"]]
    steps = [{"op":"fill_missing","column":"n","value":"1,25"},{"op":"cast","column":"n","kind":"decimal"},
             {"op":"deduplicate","columns":["id"]},{"op":"join","column":"id","name":"label","lookup":lookup,"mode":"left"}]
    opts = {"decimal":"comma","steps":steps}
    totals(profile(check(csv_source,opts),"n"),[Fraction(5,4),2])
    page = check(csv_source,opts,"page")
    assert [cell(page,"label",i)["value"] for i in range(2)] == ["repeated","other"]
    checked.append("fill_type_conversion_literal_keys_dedup_and_join")

    refs = {}
    for epoch in (1900,1904):
        data = workbook(epoch)
        workbook_opts = {"format":"xlsx","decimal":"comma","types":dict.fromkeys(
            ["amount","direct_date","formula_date","cached_number","cached_text"],"decimal")}
        p = check(data,workbook_opts)
        totals(profile(p,"amount"),[Fraction(5,4),Fraction(5,2),Fraction(1,25)])
        totals(profile(p,"cached_number"),[Fraction(7,2)]*3)
        totals(profile(p,"cached_text"),[Fraction(15,4)]*3)
        for title in ("direct_date","formula_date"):
            stats = profile(p,title)
            assert stats is None or stats["n"] == 0, (title,stats)
        page = check(data,workbook_opts,"page")
        for i in range(3):
            direct = cell(page,"direct_date",i)["workbook"]
            cached = cell(page,"formula_date",i)
            meta = cached["workbook"]
            assert direct["date"] == meta["date"] and str(direct["date"]["epoch"]) == str(epoch), (direct,meta)
            assert meta["number_format_id"] == 164 and meta["cache"]["status"] == "stored"
            assert cached["formula"] == f"C{i+2}" and cell(page,"id",i)["value"] == "0001"
        assert cell(page,"no_cache",0)["workbook"]["cache"]["status"] == "missing"
        assert cell(page,"empty_cache",0)["workbook"]["cache"]["status"] == "empty"
        assert cell(page,"cached_error",0)["workbook"]["cache"]["status"] == "error"
        assert cell(page,"iso_date",0)["workbook"]["date"]["representation"] == "iso"
        first = cell(page,"direct_date",0)["workbook"]["date"]
        if epoch == 1900:
            assert first["status"] == "fictitious_1900_leap_day", first
        if reference_readers:
            refs[str(epoch)] = readers(data,epoch,page)
        checked.extend([f"xlsx_numbers_text_cache_{epoch}",f"direct_and_cached_dates_fractional_serial_{epoch}",
                        f"missing_empty_error_caches_and_iso_{epoch}"])
    protected = check('label\n=example\nplain',{},"protected")
    literal = check('label\n=example\nplain',{},"literal")
    assert list(csv.reader(io.StringIO(protected))) == [["label"],["'=example"],["plain"]]
    assert list(csv.reader(io.StringIO(literal))) == [["label"],["=example"],["plain"]]
    checked.append("protected_and_literal_csv")
    checked.extend(resource_cases(check))
    return checked, refs


def resource_cases(check):
    # Ordinary small tables; use the configured budget as the test variable.
    # Measure the unconstrained open first, then cross the admission boundary on the same bytes.
    text = "sample label " * 15
    missing = "id,v\n" + "\n".join(f"{i % 2}," for i in range(80))
    original = "id,v\n" + "\n".join(f"{i % 2},{text}ß" for i in range(80))
    cases = [
        ("shared_string_workbook", workbook(1904), {"format":"xlsx"}),
        ("fill_missing", missing, {"steps":[{"op":"fill_missing","column":"v","value":text}]}),
        ("join_repeated_labels", missing, {"steps":[{"op":"join","column":"id","name":"label",
                                                     "lookup":[["0",text],["1",text]],"mode":"left"}]}),
        ("expanding_text", original, {"steps":[{"op":"text","column":"v","name":"upper","transform":"uppercase"}]}),
        ("multiple_retained_columns", original, {"steps":[{"op":"text","column":"v","name":f"v{i}","transform":"trim"}
                                                          for i in range(3)]}),
    ]
    passed = []
    for label, source, options in cases:
        room = 4*1024*1024
        rich = {**options, "resource_budget_bytes":room}
        diag = check(source,rich,"resources")
        peak = diag["estimated_high_water_bytes"]
        assert 65536 < peak <= room and max(diag["stage_estimated_high_water_bytes"].values()) == peak, diag
        tight = {**options,"resource_budget_bytes":max(65536,peak-4096)}
        check(source,tight,error="resource_budget")
        check(source,rich)
        passed.append(label+"_resource_admission_and_recovery")
    # Capped reads stop at one sentinel byte, even when the individual source fits the 16 MiB file limit.
    ordinary = "column\n"+"hello world\n"*1150
    check(ordinary,{"resource_budget_bytes":65536},error="resource_budget")
    small = check("v\n1",{"types":{"v":"integer"},"resource_budget_bytes":1024*1024})
    totals(profile(small,"v"),[1])
    passed.append("ingress_limit_and_successor")
    return passed


def readers(data,epoch,page):
    import openpyxl
    import pandas as pd

    formula = openpyxl.load_workbook(io.BytesIO(data),data_only=False)
    stored = openpyxl.load_workbook(io.BytesIO(data),data_only=True)
    try:
        df = pd.read_excel(io.BytesIO(data),engine="openpyxl",dtype=object)
        assert df.shape == (3,11) and tuple(df.columns) == HEADERS
        assert list(df["id"]) == ["0001"]*3 and formula.active["D3"].value == "=C3"
        assert stored.active["C3"].value == stored.active["D3"].value
        iso = cell(page,"direct_date",1)["workbook"]["date"]["iso"]
        assert datetime.fromisoformat(iso) == stored.active["C3"].value, iso
        expected_first = datetime(1900,2,28,12) if epoch == 1900 else datetime(1904,3,1,12)
        assert stored.active["C2"].value == expected_first
        return {"openpyxl":openpyxl.__version__,"pandas":pd.__version__,"shape":list(df.shape),
                "direct_first_as_datetime":stored.active["C2"].value.isoformat(),
                "cached_formula":formula.active["D3"].value,"ordinary_datetime":iso}
    finally:
        stored.close()
        formula.close()


if __name__ == "__main__":
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("cli",type=Path)
    args.add_argument("--readers",action="store_true")
    args.add_argument("--out",type=Path)
    options = args.parse_args()
    targets = Targets(options.cli.resolve(strict=True))
    try:
        checks, readers_info = audit(targets,options.readers)
    finally:
        targets.close()
    out = {"suite":"data-lab-revision-contract","cases":checks,"passed":len(checks),"failed":0,
           "native_wasm_request_comparisons":targets.comparisons,"reference_readers":readers_info,
           "cli_sha256":hashlib.sha256(options.cli.read_bytes()).hexdigest(),
           "wasm_sha256":hashlib.sha256((ROOT/"apps/web/src/tool-wasm/data-lab/dars_tool_wasm_bg.wasm").read_bytes()).hexdigest()}
    if options.out:
        options.out.write_text(json.dumps(out,indent=2)+"\n",encoding="utf8")
    print(json.dumps(out))
