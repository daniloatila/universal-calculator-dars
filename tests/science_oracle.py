"""Shared CLI and Calculation Proof checks for three independent science oracles."""

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import subprocess
from time import perf_counter


def arguments(description, scipy=False):
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("executable", type=Path)
    parser.add_argument("--report", type=Path)
    if scipy:
        parser.add_argument("--scipy", action="store_true", help="also require and compare SciPy")
    return parser.parse_args()


class Oracle:
    def __init__(self, module, executable):
        self.module = module
        self.executable = executable.resolve(strict=True)
        self.counts = Counter()
        self.max_ms = 0.0

    def run(self, operation, data, *, options=None, error=None, category=None):
        text = data if isinstance(data, str) else json.dumps(data, separators=(",", ":"))
        request = {"schema": 1, "module": self.module, "operation": operation, "input": text,
                   "options": options or {}}
        started = perf_counter()
        process = subprocess.run([self.executable, "tool", json.dumps(request)], capture_output=True,
                                 encoding="utf-8", timeout=20)
        self.max_ms = max(self.max_ms, (perf_counter() - started) * 1000)
        response = json.loads(process.stdout)
        self.counts[category or operation] += 1
        if error:
            assert (process.returncode, response.get("ok"), response.get("code")) == (1, False, error), (request, response)
            return None, None
        assert process.returncode == 0 and response["ok"], (request, response, process.stderr)
        proof = response["proof"]
        assert (proof["schema"], proof["module"], proof["operation"]) == (1, self.module, operation), proof
        assert proof["expression"] == text and proof["normalized"] == text.strip(), proof
        assert proof["algorithm_version"] == f"{self.module}/1" and proof["references"], proof
        assert proof["constraints"] and proof["error_bound"] is None, proof
        return json.loads(proof["result"]), proof

    def finish(self, report, references, *, suite=None):
        summary = {"schema": 1, "suite": suite or f"{self.module}-independent-cli", "cases": sum(self.counts.values()),
                   "by_category": dict(sorted(self.counts.items())), "references": references,
                   "maximum_case_wall_time_ms": round(self.max_ms, 3),
                   "executable_sha256": hashlib.sha256(self.executable.read_bytes()).hexdigest()}
        text = json.dumps(summary, indent=2) + "\n"
        if report:
            report.write_text(text, encoding="utf-8")
        print(json.dumps(summary, separators=(",", ":")))
        return summary
