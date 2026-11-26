param(
    [Parameter(Mandatory)][ValidateRange(1, [long]::MaxValue)][long] $ArtifactId,
    [Parameter(Mandatory)][ValidateRange(1, [long]::MaxValue)][long] $RunId,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string] $Commit,
    [ValidateSet('0.5.0','0.5.1')][string] $Version = '0.5.0'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repository = 'daniloatila/universal-calculator-dars'
$branch = 'codex/objective-05-science-engineering-data'
$project = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$api = "repos/$repository/actions"
$artifactPath = "$api/artifacts/$ArtifactId"

function Read-GitHubJson([string] $Endpoint) {
    $body = & gh api $Endpoint
    if ($LASTEXITCODE -ne 0) { throw "GitHub metadata request failed with exit $LASTEXITCODE" }
    return ($body | ConvertFrom-Json -AsHashtable)
}

function Get-ExeMachine([string] $Path) {
    $reader = [IO.BinaryReader]::new([IO.File]::OpenRead($Path))
    try {
        if ($reader.ReadUInt16() -ne 0x5a4d) { throw 'Invalid DOS executable header' }
        $reader.BaseStream.Position = 0x3c
        $reader.BaseStream.Position = $reader.ReadUInt32()
        if ($reader.ReadUInt32() -ne 0x4550) { throw 'Invalid PE signature' }
        return $reader.ReadUInt16()
    } finally { $reader.Dispose() }
}

$run = Read-GitHubJson "$api/runs/$runId"
$jobs = Read-GitHubJson "$api/runs/$runId/jobs?per_page=100"
$windows = @($jobs.jobs | Where-Object { $_.name -ceq 'verify (windows-latest)' })
$artifact = Read-GitHubJson $artifactPath
if ($run.id -ne $runId -or $run.head_sha -cne $commit -or
    $run.head_branch -cne $branch -or $run.head_repository.full_name -cne $repository -or
    $run.path -cne '.github/workflows/ci.yml' -or
    $windows.Count -ne 1 -or $windows[0].status -cne 'completed' -or $windows[0].conclusion -cne 'success' -or
    $artifact.id -ne $ArtifactId -or $artifact.name -cne 'dars-windows-review' -or $artifact.expired -or
    $artifact.workflow_run.id -ne $runId -or $artifact.workflow_run.head_sha -cne $commit -or
    $artifact.digest -cnotmatch '^sha256:[a-f0-9]{64}$') {
    throw 'GitHub artifact identity, digest or successful Windows job identity failed.'
}

$declared = & git -C $project show ('{0}:apps/desktop/tauri.conf.json' -f $commit)
if ($LASTEXITCODE -ne 0 -or ($declared | ConvertFrom-Json).version -cne $version) {
    throw 'Audited source does not declare the expected desktop version.'
}
$workspaceRun = Join-Path $project "artifacts/objective-05/windows-review-$ArtifactId"
New-Item -ItemType Directory -Force -Path $workspaceRun | Out-Null
$archive = Join-Path $workspaceRun 'dars-windows-review.zip'
& gh api "$artifactPath/zip" > $archive
if ($LASTEXITCODE -ne 0) { throw "GitHub raw ZIP download failed with exit $LASTEXITCODE" }
$archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$archiveBytes = (Get-Item -LiteralPath $archive).Length
if ($archiveHash -cne $artifact.digest.Substring(7) -or $archiveBytes -ne $artifact.size_in_bytes) {
    throw 'Raw archive digest or reported size failed.'
}

$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
    $archiveNames = $zip.Entries.FullName | Sort-Object -CaseSensitive
    if (($archiveNames -join '|') -cne 'dars-desktop.exe|provenance.json') {
        throw 'Archive entry names differ from the expected review package.'
    }
    $exeEntryLength = $zip.GetEntry('dars-desktop.exe').Length
    $manifestEntryLength = $zip.GetEntry('provenance.json').Length
    if ($exeEntryLength -le 0 -or $exeEntryLength -gt 64MB -or
        $manifestEntryLength -le 0 -or $manifestEntryLength -gt 32KB) {
        throw 'Archive entry layout or extraction bounds differ from the expected review package.'
    }
} finally { $zip.Dispose() }

$package = Join-Path $workspaceRun 'package'
Expand-Archive -LiteralPath $archive -DestinationPath $package -Force
$binary = Get-Item -LiteralPath (Join-Path $package 'dars-desktop.exe')
$provenance = Get-Content -Raw -LiteralPath (Join-Path $package 'provenance.json') | ConvertFrom-Json -AsHashtable
$binaryHash = (Get-FileHash -LiteralPath $binary.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($provenance.schema -ne 1 -or $provenance.commit -cne $commit -or $provenance.run_id -ne [string] $runId -or
    [int] $provenance.run_attempt -ne $run.run_attempt -or $provenance.target -cne 'windows-x64' -or
    $provenance.sha256 -cne $binaryHash -or $provenance.bytes -ne $binary.Length -or
    $binary.VersionInfo.FileVersion -cne $version -or $binary.VersionInfo.ProductVersion -cne $version -or
    (Get-ExeMachine $binary.FullName) -ne 0x8664) {
    throw 'Executable hash, byte count, PE version, machine architecture or build provenance failed.'
}
$assets = $provenance.packaged_wasm
if ($assets.Count -ne 22 -or (@($assets.name | Sort-Object -Unique)).Count -ne 22 -or
    (@($assets | Where-Object { $_.name -cmatch '^dars_wasm_bg-[A-Za-z0-9_-]+\.wasm$' })).Count -ne 1 -or
    (@($assets | Where-Object { $_.name -cmatch '^dars_tool_wasm_bg-[A-Za-z0-9_-]+\.wasm$' })).Count -ne 21 -or
    (@($assets | Where-Object { $_.sha256 -cnotmatch '^[a-f0-9]{64}$' })).Count -ne 0) {
    throw 'The hosted receipt must contain well-formed hashes for 22 packaged WebAssembly files.'
}

$receipt = [ordered]@{
    schema = 1
    repository = $repository
    branch = $branch
    commit = $commit
    run_id = $runId
    run_attempt = $run.run_attempt
    windows_job_id = $windows[0].id
    windows_job_conclusion = $windows[0].conclusion
    artifact_id = $ArtifactId
    archive_sha256 = $archiveHash
    archive_bytes = $archiveBytes
    retention_expires_utc = $artifact.expires_at
    target = $provenance.target
    exe_sha256 = $binaryHash
    exe_bytes = $binary.Length
    exe_version = $version
    pe_machine = 'AMD64 (0x8664)'
    signature_status = (Get-AuthenticodeSignature -LiteralPath $binary.FullName).Status.ToString()
    packaged_wasm_receipt_count = $assets.Count
    packaged_wasm_receipt = $assets
    checked_at_utc = [datetime]::UtcNow.ToString('o')
}
$resultPath = Join-Path $workspaceRun 'verified-provenance.json'
$bytes = [Text.Encoding]::UTF8.GetBytes(($receipt | ConvertTo-Json -Depth 6) + [Environment]::NewLine)
$file = [IO.File]::Open($resultPath, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::Read)
try { $file.Write($bytes); $file.Flush($true) } finally { $file.Dispose() }
$receipt | ConvertTo-Json -Depth 6
