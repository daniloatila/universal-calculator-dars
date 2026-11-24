$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/dev-env.ps1"
node "$PSScriptRoot/build-wasm.mjs"
if ($LASTEXITCODE -ne 0) {
    throw 'DARS WebAssembly build failed.'
}
