param([string]$NodePath = "")

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$failures = New-Object System.Collections.Generic.List[string]
$required = @(
  "index.html", "assets/styles.css", "assets/app.js", "assets/redaction-engine.mjs",
  "data/cases.json", "data/local-import-sample.txt", "tests/redaction-engine.test.mjs",
  "tests/browser-smoke.mjs", "tests/validate.ps1", "tools/static-server.mjs", "tools/static-server.ps1",
  "README.md", "docs/ARCHITECTURE.md", "docs/CASE_STUDY.md", "docs/RELEASE_NOTES.md", "docs/VALIDATION.md",
  "docs/screenshots/civiccase-redact-desktop.png", "docs/screenshots/civiccase-redact-mobile.png",
  "package.json", "LICENSE", ".gitignore", ".env.example", ".nojekyll"
)
foreach ($file in $required) { if (-not (Test-Path -LiteralPath (Join-Path $root $file))) { $failures.Add("Missing required file: $file") } }

try {
  $manifest = Get-Content -Raw -LiteralPath (Join-Path $root "data/cases.json") | ConvertFrom-Json
  if ($manifest.cases.Count -ne 4) { $failures.Add("Exactly four synthetic case-note fixtures are required.") }
  if ($manifest.notice -notmatch "fictional and synthetic") { $failures.Add("Synthetic-data disclosure missing from case manifest.") }
  if (($manifest.cases.text -join " ") -notmatch "example\.test") { $failures.Add("Reserved test-domain evidence missing.") }
} catch { $failures.Add("Case fixture manifest is invalid JSON.") }

$html = Get-Content -Raw -LiteralPath (Join-Path $root "index.html")
foreach ($hook in @('<meta name="viewport"', 'class="skip-link"', 'id="workspace"', 'aria-live=', 'type="module"')) { if ($html -notmatch [Regex]::Escape($hook)) { $failures.Add("index.html missing $hook") } }

$files = Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object { $_.FullName -notmatch "\.git\\" -and $_.FullName -ne $MyInvocation.MyCommand.Path -and $_.Extension -in @(".html", ".css", ".js", ".mjs", ".json", ".md", ".txt", ".example") }
$text = ($files | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"
foreach ($pattern in @("(?i)gmail\.com", "sk-[A-Za-z0-9]{20,}", "gh[opsu]_[A-Za-z0-9]{20,}", "BEGIN (RSA|OPENSSH) PRIVATE KEY")) { if ($text -match $pattern) { $failures.Add("Potential private information or secret found: $pattern") } }
foreach ($phrase in @("synthetic", "local-first", "reversible", "human", "No upload", "not a regulated records system")) { if ($text -notmatch [Regex]::Escape($phrase)) { $failures.Add("Disclosure phrase missing: $phrase") } }

if (-not $NodePath) { $node = Get-Command node -ErrorAction SilentlyContinue; if ($node) { $NodePath = $node.Source } }
if (-not $NodePath -or -not (Test-Path -LiteralPath $NodePath)) { $failures.Add("Node.js not found; pass -NodePath.") } else { & $NodePath (Join-Path $root "tests/redaction-engine.test.mjs"); if ($LASTEXITCODE -ne 0) { $failures.Add("Redaction engine tests failed.") } }

if ($failures.Count) { Write-Host "CIVICCASE VALIDATION FAILED"; foreach ($failure in $failures) { Write-Host "- $failure" }; exit 1 }
Write-Host "CIVICCASE VALIDATION PASSED"
Write-Host "Checked files, fixture boundaries, disclosures, privacy patterns, accessibility hooks, and redaction logic."
