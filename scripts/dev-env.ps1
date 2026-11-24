# Dot-source this script to use the optional, project-local Windows toolchain.
$darsTooling = Join-Path (Split-Path $PSScriptRoot -Parent) '.tooling'
$darsCargoBin = Join-Path $darsTooling 'cargo/bin'
if (Test-Path -LiteralPath (Join-Path $darsCargoBin 'rustup.exe') -PathType Leaf) {
    $env:CARGO_HOME = Join-Path $darsTooling 'cargo'
    $env:RUSTUP_HOME = Join-Path $darsTooling 'rustup'
    if (($env:Path -split ';') -notcontains $darsCargoBin) {
        $env:Path = "$darsCargoBin;$env:Path"
    }
}
$darsWasmBindgen = Join-Path $darsTooling 'wasm-bindgen-0.2.130-x86_64-pc-windows-msvc/wasm-bindgen.exe'
if (Test-Path -LiteralPath $darsWasmBindgen -PathType Leaf) {
    $env:DARS_WASM_BINDGEN = $darsWasmBindgen
}
