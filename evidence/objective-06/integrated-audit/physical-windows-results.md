# Physical Windows results

[Português brasileiro](physical-windows-results.pt-BR.md)

The verified x64 executable from run `45902255489` opened and calculated on the physical Windows machine. Both versions used WebView2 158.0.4370.33. [Package identity](windows-artifact.json) · [Method](windows-method.md)

| Metric | 0.5.1 | 0.6.0 |
| --- | ---: | ---: |
| Startup to verified Standard result (ms) | 546.6 | 533.2 |
| Median of 12 recalculations (ms) | 47.25 | 34.44 |
| Private resident memory at idle (MiB) | 114.0 | 114.1 |
| Private commit at idle (MiB) | 256.1 | 259.9 |
| Total working set at idle (MiB) | 390.2 | 391.5 |
| Machine-wide physical use, idle minus ambient (MiB) | 175.2 | 190.8 |
| Processes left after exit | 0 | 0 |

The reviewed application passed the 17 historical Windows checks, five offline finance fixtures and seven science/data workspaces. It reproduced the historical finance comparison. The packaged application registered 25 modules and matched all 22 computational WASM hashes by reading their packaged contents. The three productivity workspaces and disabled Intelligence mode completed their local cases. The native broker also completed the explicitly approved numeric loopback fixture cases. [Historical test](windows-regression.json) · [Candidate](windows-candidate.json) · [Native broker](windows-intelligence-native.json)

The table reports median process-tree samples. Working sets include shared pages. Private commit can include nonresident pages. Machine-wide differences also reflect unrelated activity, and the run includes instrumentation. These measurements leave the target below 100 MB of incremental physical RAM open. No separate AI model server was started. [Phase data in bytes](physical-windows-comparison.json)
