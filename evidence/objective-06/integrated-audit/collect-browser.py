"""Bind an installed-Chrome run, production asset snapshot and notation comparisons to HEAD.

Run from the repository root. The local working directory contains potentially private raw
Playwright reports. Only selected test measurements and synthetic screenshots are exported.
"""
import argparse
import base64
import collections
import hashlib
import json
import re
import struct
import subprocess
from pathlib import Path


def read(path):
    return json.loads(path.read_bytes().decode("utf-8-sig"))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def hash_file(path):
    return digest(path.read_bytes())


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def manifest(root):
    assets = [{"path": path.relative_to(root).as_posix(), "sha256": hash_file(path)}
              for path in root.rglob("*") if path.is_file()]
    assets.sort(key=lambda row: row["path"])
    return {"source_commit": git("rev-parse", "HEAD"), "assets": assets,
            "asset_set_sha256": digest(json.dumps(assets, separators=(",", ":")).encode()),
            "files_count": len(assets), "wasm_count": sum(row["path"].endswith(".wasm") for row in assets)}


def specs(suites):
    for suite in suites:
        yield from suite.get("specs", [])
        yield from specs(suite.get("suites", []))


def passed(report):
    rows = {}
    for spec in specs(report["suites"]):
        assert len(spec["tests"]) == 1 and spec["ok"], spec["title"]
        test = spec["tests"][0]
        assert test["status"] == "expected" and len(test["results"]) == 1, spec["title"]
        result = test["results"][0]
        assert result["status"] == "passed", spec["title"]
        key = (spec["file"], spec["title"])
        assert key not in rows, key
        rows[key] = result
    assert len(rows) == report["stats"]["expected"]
    assert all(report["stats"][key] == 0 for key in ["unexpected", "skipped", "flaky"])
    return rows


def payloads(rows, name):
    for result in rows.values():
        for attachment in result["attachments"]:
            if attachment["name"] == name:
                yield base64.b64decode(attachment["body"], validate=True)


def decoded(rows, name):
    return [json.loads(body) for body in payloads(rows, name)]


def pair_index(records):
    result = {(v["source"], v["target"]): v for v in records}
    assert len(result) == len(records)
    return result


def canonical_math(row):
    fields = ["module", "operation", "normalized", "result"]
    canonical = [{key: value[key] for key in fields} for value in row["modules"]]
    return digest(json.dumps(canonical, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode())


def previous_reference(raw, prior_evidence):
    assert hash_file(raw) == prior_evidence["playwright"]["report_sha256"]
    rows = passed(read(raw))
    canonical = [{"source": row["source"], "target": row["target"], "canonical_sha256": canonical_math(row)}
                 for row in decoded(rows, "locale-transition-pair")]
    return {"schema": 1, "source_commit": prior_evidence["source_commit"],
            "raw_report_sha256": hash_file(raw), "test_file_and_title": sorted([list(key) for key in rows]),
            "canonical_math": sorted(canonical, key=lambda r: (r["source"], r["target"]))}


def notation(rows, reference, baseline, build):
    base_pairs = pair_index(baseline["matrix"])
    locales = sorted(baseline["locales"])
    pairs = {(a, b) for a in locales for b in locales if a != b}
    assert pairs == set(base_pairs) and len(pairs) == 42
    math = pair_index(decoded(rows, "locale-transition-pair"))
    legacy_math = pair_index(reference["canonical_math"])
    science = pair_index(decoded(rows, "science-locale-transition"))
    finance = [row for group in decoded(rows, "finance-language-matrix") for row in group]
    product = collections.defaultdict(dict)

    def add_product(row, module):
        pair = (row["source"], row["target"])
        assert pair in pairs and module not in product[pair]
        assert re.fullmatch(r"[0-9a-f]{64}", row["proof_sha256"])
        product[pair][module] = {"module": module, **{k: v for k, v in row.items() if k not in ("source", "target")}}

    for group in decoded(rows, "formula-matrix"):
        for row in group:
            add_product(row, "formula-studio")
    for name in ["automation-locales.json", "math-notebook-locales.json"]:
        for group in decoded(rows, name):
            assert len(group["comparisons"]) == group["total"]
            for row in group["comparisons"]:
                add_product(row, group["module"])
    assert set(math) == set(legacy_math) == set(science) == set(product) == pairs
    assert len(finance) == 210
    matrix = []
    browser = next(iter(math.values()))["browser"]
    assert browser["channel"] == "chrome"
    for source, target in sorted(pairs):
        pair = (source, target)
        m, s = math[pair], science[pair]
        assert m["browser"] == browser and s["browser"] == browser["version"]
        assert canonical_math(m) == legacy_math[pair]["canonical_sha256"], pair
        row = {"source": source, "target": target,
               "mathematics": [{"module": v["module"], "operation": v["operation"], "request_sha256": v["requestSha256"],
                                "proof_sha256": v["proofSha256"], "earlier_normalized_input_and_result_match": True}
                               for v in m["modules"]],
               "finance": [{"module": v["module"], "complete_proof_equal": True} for v in finance if (v["from"], v["to"]) == pair],
               "science": [{"module": v["module"], "proof_sha256": v["proofSha256"], "complete_proof_equal": True} for v in s["checks"]],
               "productivity": [product[pair][k] for k in sorted(product[pair])]}
        for group in ["mathematics", "finance", "science"]:
            assert sorted(v["module"] for v in row[group]) == sorted(v["module"] for v in base_pairs[pair][group])
        names = [v["module"] for group in ["mathematics", "finance", "science", "productivity"] for v in row[group]]
        assert len(names) == len(set(names)) == 25
        matrix.append(row)
    counts = {group: sum(len(row[group]) for row in matrix) for group in ["mathematics", "finance", "science", "productivity"]}
    assert counts == {"mathematics": 420, "finance": 210, "science": 294, "productivity": 126}
    return browser, {"schema": 1, "source_commit": build["source_commit"], "build_asset_set_sha256": build["asset_set_sha256"],
                     "locales": locales, "categories": counts, "directed_language_pairs": len(pairs), "modules": 25,
                     "unique_proof_comparisons": sum(counts.values()), "earlier_mathematics_inputs_and_results_match": 420,
                     "method": "Each module checks the original notation and deterministic calculation across all 42 ordered language pairs. Financial proofs are compared in full by the browser test. The digest of a multistep automation covers its flow, trace and outputs.",
                     "matrix": matrix}


def collect(args, build):
    previous_evidence = Path("evidence/objective-05/revision-01")
    old_meta = read(previous_evidence / "browser.json")
    reference = read(args.public / "chrome-0.5.1-reference.json")
    assert reference["source_commit"] == old_meta["source_commit"] and reference["raw_report_sha256"] == old_meta["playwright"]["report_sha256"]
    if args.previous_report.exists():
        assert previous_reference(args.previous_report, old_meta) == reference
    assert read(args.raw / "assets.json") == build
    report = read(args.raw / "playwright.json")
    rows = passed(report)
    old = {tuple(key) for key in reference["test_file_and_title"]}
    assert len(old) == 232 and old <= rows.keys(), sorted(old - rows.keys())
    browser, matrix = notation(rows, reference, read(previous_evidence / "locale-transition-matrix.json"), build)
    screenshots = []
    captures = args.public / "chrome-captures"
    captures.mkdir(exist_ok=True)
    for name, target in {"math-notebook-financial.png": "math-notebook.png", "formula-studio": "formula-studio.png",
                         "automation-preview.png": "automation-studio.png", "verified-investment": "intelligence-investment.png",
                         "reviewed-printed-expression": "reviewed-printed-expression.png"}.items():
        png, = payloads(rows, name)
        assert png.startswith(b"\x89PNG\r\n\x1a\n") and png[12:16] == b"IHDR"
        (captures / target).write_bytes(png)
        width, height = struct.unpack(">II", png[16:24])
        screenshots.append({"path": "chrome-captures/" + target, "sha256": digest(png), "width": width, "height": height})
    stats = report["stats"]
    counts = dict(sorted(collections.Counter(file for file, title in rows).items()))
    node = (args.raw / "node.log").read_text(encoding="utf-8-sig")
    n = re.search(r"(?m)^(?:ℹ |# )?pass (\d+)\s*$", node)
    assert n and int(n[1]) >= old_meta["node"]["passed"]
    assert re.search(r"(?m)^(?:ℹ |# )?fail 0\s*$", node)
    offline = [json.loads(line) for line in (args.raw / "offline.log").read_text(encoding="utf-8-sig").splitlines() if line.startswith("{")]
    assert [(v["suite"], v["passed"], v["failed"]) for v in offline] == [("production-web-offline-and-lazy-locales", 10, 0), ("production-finance-offline", 5, 0)]
    science, = decoded(rows, "science-offline")
    assert len(science["modules"]) == len(science["proofHashes"]) == 7 and science["external"] == []
    matrix_path = args.public.parent / "locale-transition-matrix.json"
    write(matrix_path, matrix)
    write(args.public / "browser.json", {
        "schema": 1, **{k: v for k, v in build.items() if k != "assets"}, "asset_digest_method": old_meta["asset_digest_method"],
        "browser": browser, "source_scope": "Production build from the identified 0.6.0 source on physical Windows with installed Google Chrome.",
        "playwright": {"started_utc": stats["startTime"], "duration_ms": stats["duration"], "passed": len(rows), "failed": 0, "skipped": 0, "flaky": 0,
                       "report_sha256": hash_file(args.raw / "playwright.json"), "suites": counts,
                       "inherited_0_5_1": {"mapped_and_passed": len(old), "earlier_report_sha256": reference["raw_report_sha256"],
                                           "public_reference": "chrome-0.5.1-reference.json"},
                       "new_cases": len(rows) - len(old)},
        "notation": {**matrix["categories"], "total": matrix["unique_proof_comparisons"], "receipt": "../" + matrix_path.name, "sha256": hash_file(matrix_path)},
        "standalone_offline": {"results": offline, "log_sha256": hash_file(args.raw / "offline.log")},
        "offline_science": science, "node": {"passed": int(n[1]), "log_sha256": hash_file(args.raw / "node.log")},
        "screenshots": screenshots, "synthetic_screenshot_inputs": True})
    print(browser, len(rows), "Chrome cases,", len(old), "inherited,", matrix["unique_proof_comparisons"], "notation checks,", n[1], "Node cases")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["snapshot", "collect"])
    parser.add_argument("source", help="Full audited Git SHA")
    parser.add_argument("--raw", type=Path, default=Path("artifacts/objective-06/integrated-run"))
    parser.add_argument("--public", type=Path, default=Path("evidence/objective-06/integrated-audit"))
    parser.add_argument("--previous-report", type=Path, default=Path("artifacts/objective-05/revision-01/chrome-exact.playwright.json"))
    arguments = parser.parse_args()
    assert re.fullmatch(r"[0-9a-f]{40}", arguments.source) and git("rev-parse", "HEAD") == arguments.source
    assert not git("status", "--porcelain", "--untracked-files=all", "--", "apps", "crates", "Cargo.toml", "Cargo.lock", "scripts", "tests", ".github/workflows/ci.yml", "community")
    assets = manifest(Path("apps/web/dist"))
    assert assets["wasm_count"] == 22
    if arguments.phase == "snapshot":
        arguments.raw.mkdir(parents=True, exist_ok=True)
        write(arguments.raw / "assets.json", assets)
        print("Source", assets["source_commit"], "asset digest", assets["asset_set_sha256"])
    else:
        collect(arguments, assets)
