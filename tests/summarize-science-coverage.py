"""Summarize production source coverage for the seven Objective 05 Rust engines."""
import json
import sys
from pathlib import Path

modules = {"statistics", "probability", "simulation", "optimization", "physics_engineering", "graph_lab", "data_lab"}
rows = []
for report in json.loads(Path(sys.argv[1]).read_bytes())["data"][0]["files"]:
    key = report["filename"].replace("\\", "/").split("/crates/dars-universal/src/", 1)
    if len(key) != 2:
        continue
    path = key[1]
    module = path.split("/")[0].removesuffix(".rs")
    if path == "discrete_tail.rs":
        module = "shared-distribution"
    elif path == "calculus/numerical_expression.rs":
        module = "shared-expression"
    elif module not in modules or (path.endswith("/tests.rs") or path.endswith("_tests.rs")):
        continue
    lines = report["summary"]["lines"]
    rows.append({"module": module, "path": path, "covered": lines["covered"], "total": lines["count"]})
assert modules.issubset({row["module"] for row in rows})
covered, total = (sum(row[k] for row in rows) for k in ("covered", "total"))
print(json.dumps({"suite": "science-rust-line-coverage", "covered": covered, "total": total,
                  "percent": round(100 * covered / total, 2), "target_percent": 95,
                  "files": sorted(rows, key=lambda r: r["path"])}, indent=2))
if covered * 100 <= total * 95:
    raise SystemExit("Scientific production-source line coverage must exceed 95%.")
