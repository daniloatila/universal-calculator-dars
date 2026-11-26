# Threat model

The desktop window, typed Rust broker, worker manager and Rust kernels are separate trust boundaries. A model reply, a file supplied by a user and a previously saved proof remain untrusted inputs. A stored verified flag is historical information.

| Failure or threat | Control | Residual limit |
| --- | --- | --- |
| An input document asks for a terminal, file selection or transmission | Closed declarative language, bounded schemas and no corresponding mathematical capability | A user can independently export a document or choose an explicit provider request. |
| A model attaches a result, changes tool or supplies a destination | Closed proposal schema and user action before execution. The kernel produces the proof. | A structurally valid proposal can still misunderstand intent. The user sees the inputs. |
| A grant is reused after content or destination changes | Single-use, expiring native grant, generation checks, cancellation, no automatic retry | A local provider can continue work already received. |
| A selected provider redirects traffic or an address is unavailable | Numeric loopback, fixed external destinations, TLS, redirect rejection and a distinct error | A compatible local server or system proxy has its own behavior. No provider failover is configured. |
| A document overwhelms workers, graph or memory | Graph and call ceilings, deadline, one active auxiliary job, cumulative charges and worker termination | Budgets model allocations. System RAM and server-side model memory are measured separately. |
| Data or result is silently substituted | Exact strings, versioned proof checks, source hashes and explicit replay | A matching hash identifies the input bytes. It cannot verify the accuracy of an external spreadsheet cache. |
| Text is recognized incorrectly | Bounded local OCR, uncertainty rejection, editable confirmation | Dense typesetting, handwriting and multi-line mathematics are outside the implemented OCR grammar. |

[Runtime evidence](automation-studio/execution.json) · [Native gateway](intelligence/README.md) · [Voice and vision](voice-vision/README.md)
