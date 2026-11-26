"""Compare sequential Data Lab processes. Sample private Windows counters when available."""
import argparse
import ctypes
import json
import subprocess
import sys
import time
from pathlib import Path


class Counters(ctypes.Structure):
    _fields_ = [("size", ctypes.c_uint32), ("faults", ctypes.c_uint32)] + [
        (name, ctypes.c_size_t) for name in ("peak_ws", "ws", "peak_paged", "paged", "peak_nonpaged",
                                             "nonpaged", "pagefile", "peak_pagefile", "private_commit",
                                             "private_working_set")] + [("shared_commit", ctypes.c_uint64)]


def sample_windows(process):
    if sys.platform != "win32":
        return None
    counter = Counters()
    counter.size = ctypes.sizeof(counter)
    if not ctypes.windll.kernel32.K32GetProcessMemoryInfo(
        ctypes.c_void_p(int(process._handle)), ctypes.byref(counter), counter.size
    ):
        return None
    return counter.private_working_set, counter.private_commit


def run(glue, wasm, rows, shape, mode, budget="default"):
    args = ["node", "--max-old-space-size=192", Path(__file__).with_suffix(".mjs"),
            glue, wasm, str(rows), shape, mode, str(budget)]
    with subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as process:
        started = time.monotonic()
        resident, commit = [], []
        while process.poll() is None:
            metrics = sample_windows(process)
            if metrics:
                resident.append(metrics[0])
                commit.append(metrics[1])
            if time.monotonic() - started > 60:
                process.kill()
                raise RuntimeError("Individual benchmark exceeded 60 seconds")
            time.sleep(0.015)
        output, errors = process.communicate()
    assert process.returncode == 0, errors.decode(errors="replace")
    result = json.loads(output)
    result["windows_private_samples"] = len(resident)
    result["windows_sampled_peak_private_working_set"] = max(resident, default=None)
    result["windows_sampled_peak_private_commit"] = max(commit, default=None)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("glue", type=Path)
    parser.add_argument("wasm", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--revision",action="store_true")
    parser.add_argument("--repeats", type=int, choices=range(1, 6), default=3)
    args = parser.parse_args()
    results = []
    for iteration in range(1, args.repeats + 1):
        for rows, shape in [(1000,"simple"),(10000,"simple"),(100000,"simple"),(200000,"simple"),
                            (1000,"wide"),(10000,"wide"),(1000,"long")]:
            for mode in ["import","transform"]:
                measured = run(args.glue,args.wasm,rows,shape,mode)
                results.append({**measured, "iteration": iteration})
                if measured["status"] == "resource_budget":
                    assert args.revision
                    retry = run(args.glue,args.wasm,rows,shape,mode,256*1024*1024)
                    results.append({**retry, "iteration": iteration})
    output = {"suite":"data-lab-process-volumes","conditions":"Sequential, independent Node processes. Import open includes parse and initial typing. Transform open includes the same input and the grouping pass. Profile is timed separately. Working-set and commit peaks are samples at approximately 15 ms. Peak RSS is the process lifetime high-water mark. WASM reports committed linear bytes; diagnostics are model estimates.","runs":results}
    args.output.write_text(json.dumps(output,indent=2)+"\n",encoding="utf8")
    print(f"{len(results)} runs, {sum(x['status']=='verified' for x in results)} verified, "
          f"{sum(x['status']=='resource_budget' for x in results)} budget rejections")


if __name__ == "__main__":
    main()
