# DARS Intelligence

[Português brasileiro](README.pt-BR.md) · [Provider contracts](providers.md) · [Proposal schema](proposal.schema.json) · [Voice and vision](../voice-vision/README.md)

Open **Operations → DARS Intelligence**. The factory mode is Disabled. A proposal or exported proof can be opened, inspected and replayed with Rust in the browser or desktop. Choosing a provider, viewing its settings or editing a request leaves the network idle. The desktop creates its native HTTP client only after approval of an individual transmission.

## Local setup and diagnosis

1. Choose **Local AI**, then Ollama, LM Studio or a compatible server that you trust to run on this machine.
2. Choose `127.0.0.1` or `::1` and the port of the service. Select **Review model discovery**, inspect the GET destination and authorize the lookup. It has an empty body. A local credential is optional and is included in discovery only when selected explicitly.
3. Choose an advertised model or enter its ID. Review the purpose, exact outgoing body, destination, byte count and output limit. Authorize this specific request. A changed endpoint or edited request requires a new preview.
4. Validate the suggested input and explicitly run it. Inspect or export the Rust result. A model explanation, if requested separately, is labeled unverified and carries its own attribution.

The selected loopback connection uses the local socket directly. DARS does not search interfaces or ports, edit the VPN or proxy, change routing, launch services, or fetch models. The app reports connection refused, timeout, OS access denied, credential refusal, incompatible response, service with an empty inventory and model missing as distinct outcomes. A closed-port receipt establishes the result for that address and port at observation time. It cannot identify a VPN as the cause. An OpenAI-compatible server controls its own processing and any downstream traffic. The user must trust that specific implementation. Ollama and LM Studio also require installed local model metadata before DARS transmits a prompt. [Host observation](local-services.json)

## Execution and privacy

The model can suggest a compound-interest calculation or a mathematical expression, ask for missing information, decline, explain, or draft a Notebook, Formula or Automation document. Draft documents have to go through the receiving studio’s validation. An unregistered capability, extraneous field or forged result fails the proposal schema. Imported text, metadata and model output cannot grant credentials, choose files, modify local policy or select network targets. The broker accepts messages only from the packaged main window. Browser builds retain their same-origin network policy. [Runtime parser](../../../apps/web/src/intelligence-contract.ts) · [Native policy](../../../apps/desktop/src/intelligence.rs)

A transmission ticket covers the exact payload and destination, expires after 120 seconds and is single-use. The broker permits one in-flight operation and six starts per 60 seconds. Limits include 8 KiB of user text, a conservative caller-selected context budget of 128–4,096 tokens, 32–1,024 output tokens, a 1–30 second overall timeout, a 64 KiB provider envelope and an 8 KiB extracted model reply. The context estimate includes protocol framing and prompt instructions. It is an admission bound, not a price quote. TLS validation, redirect denial and explicit retry suppression apply to remote calls. OS and configured proxy policies continue to apply outside loopback. Provider costs and retention policies depend on the provider and account.

A session key is scoped by provider, numeric host and port. The optional Windows credential store applies only to external provider keys. The native communication component supplies the credential in an HTTP header. The UI offers replacement and removal. Exports omit credentials and prompts. Closing the panel cancels active work, clears transient credentials and releases its computation session. DARS does not install a credential store or write keys to ordinary settings on other platforms. [Credential bridge](../../../apps/desktop/src/credentials.rs)

## Verification

| Surface | Observed result |
| --- | --- |
| Native Rust | Eleven tests covered six wire formats, model metadata screening, offline policy, one-use grants, scoped keys, size/rate limits, cancellation, redirects and HTTP failures. Real TCP sockets on both loopbacks confirmed that discovery was an empty GET and included a key only after explicit opt-in. |
| Windows desktop | WebView2 invoked the compiled Rust broker. Temporary protocol fixtures returned an investment proposal, a clarification and an unregistered operation. Rust verified the amount, the UI requested missing information and it rejected the unregistered tool. Closing the fixture produced the specific refusal message. [Desktop receipt](native-loopback.json) |
| Chrome | A saved investment replay recalculated an attached forged result. Six browser cases passed, including 42 directed language switches with the same Rust output, local image recognition and invalid-file rejection. [Browser evidence](browser.json) · [Transitions](languages.json) |
| Node | Five contract tests covered directed language pairs, precision-preserving input, direct and document-sourced unsupported capabilities, schema errors and replay. [Tests](../../../apps/web/tests/intelligence.test.mts) |
| Real inference | Neither default local provider accepted the inventory connection. External provider protocols used synthetic fixtures. Real inference, account entitlements, billing and external latency remain unverified. No provider credential or paid call was used. |

The financial example uses BRL 10,000, 12 monthly periods and a decimal monthly rate of 0.01. Rust produced BRL 11,268.25 from the exact rational `1126825030131969720661201/100000000000000000000`. Replay requires only the structured interpretation and the local engine. [Browser capture](verified-investment.png) · [Desktop reproduction](../../../scripts/verify-intelligence-windows.mjs)

Run `cargo test --locked -p dars-desktop --lib intelligence` and `node --experimental-strip-types --test apps/web/tests/intelligence.test.mts` from the root. From `apps/web`, build the production bundle, then run `npx --no-install playwright test tests/intelligence.spec.ts`. The Windows verification hook receives the packaged WebView2 page from the standard desktop harness and closes every temporary listener in its cleanup path.

A proposal check validates its structure. Rust checks the expression when the user executes it. The importer reads original JSON tokens, refusing duplicate keys, unsafe integers and fractional syntax in integer fields in both proposals and exported replay envelopes. A syntactically invalid expression produces no mathematical result.
