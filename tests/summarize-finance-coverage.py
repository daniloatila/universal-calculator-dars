"""Report aggregate instrumented line coverage for the complete finance subtree."""

import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("llvm_export", type=Path)
    args = parser.parse_args()
    marker = "/crates/dars-universal/src/finance/"
    rows = []
    raw = json.loads(args.llvm_export.read_bytes())
    for report in raw["data"][0]["files"]:
        filename = report["filename"].replace("\\", "/")
        if marker not in filename:
            continue
        path = filename.split(marker, 1)[1]
        lines = report["summary"]["lines"]
        rows.append({"path": "crates/dars-universal/src/finance/" + path,
                     "total": lines["count"], "covered": lines["covered"]})
    rows.sort(key=lambda row: row["path"])
    total = sum(row["total"] for row in rows)
    covered = sum(row["covered"] for row in rows)
    if not rows or total == 0:
        raise SystemExit("No finance source line counts in the LLVM report")
    passed = 100 * covered > 95 * total
    print(json.dumps({"suite": "finance-line-coverage", "covered": covered, "total": total,
                      "percent": round(100 * covered / total, 2), "above_95": passed, "files": rows},
                     separators=(",", ":")))
    if not passed:
        raise SystemExit("Financial line coverage must exceed 95 percent")


if __name__ == "__main__":
    main()
