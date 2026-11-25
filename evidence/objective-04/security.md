# Objective 04 security and privacy

[Português brasileiro](security.pt-BR.md)

Financial values are passed to a dedicated local worker that loads only the selected tool asset. WASM receives bounded serialized requests, and the evaluator parses typed fields and uses only documented operations. Monetary values cross the JavaScript boundary as strings. The interface adds no account, network provider, credentials, permissions, telemetry or financial storage. The web service worker handles the project's same-origin static files using its existing cache policy. The Windows application embeds the equivalent assets.

Calculation Proof and scenario exports write a file only after the user requests it. Requests include the financial data entered by the user and should be handled as personal financial records. The scenario importer bounds file size and request count, checks the schema and allowed fields, and submits each request to the Rust evaluator before adding it to the session. It also checks that the original source notation reproduces the validated canonical request. All file content is presented as text or parsed data. Closing or clearing the session clears in-memory calculations according to the existing module lifecycle.

The verification scope includes module isolation, resource limits, retired responses, worker teardown, offline execution and public evidence hygiene. The Windows review binary must correspond to the source commit and workflow receipt. Authenticode signing remains within Objective 07.
