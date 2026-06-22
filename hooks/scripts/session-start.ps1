# SessionStart hook — inyecta contexto de migracion al iniciar/reanudar sesion.
# Emite additionalContext con: estado del proyecto, ubicacion del playbook, y recordatorios clave.

$ErrorActionPreference = 'SilentlyContinue'

# Por defecto: la carpeta actual (donde se abrio Claude Code). Override con AFOCAT_PROJECT_ROOT.
$proj = $env:AFOCAT_PROJECT_ROOT
if ([string]::IsNullOrWhiteSpace($proj)) { $proj = (Get-Location).Path }

$plugin = $env:CLAUDE_PLUGIN_ROOT
$lines = @()
$lines += "=== afocat-migrate :: contexto de migracion PHP 8.2 ==="
$lines += "Proyecto destino: $proj"
$lines += "Playbook (fuente de verdad): $plugin/knowledge/playbook.md"
$lines += "Reglas de deprecacion: $plugin/knowledge/deprecation-rules.json"
$lines += "Notas Ocrend PHP 8: $plugin/knowledge/ocrend-php8.md"

# Estado de migracion del proyecto destino (si existe)
$state = Join-Path $proj 'migration-state.json'
if (Test-Path $state) {
    $lines += "--- migration-state.json ---"
    $lines += (Get-Content $state -Raw)
} else {
    $lines += "migration-state.json NO existe en el proyecto destino. Crear con /migrate-scan al iniciar."
}

# TASKS.md tail
$tasks = Join-Path $proj 'TASKS.md'
if (Test-Path $tasks) {
    $lines += "--- TASKS.md (En Progreso) ---"
    $inblock = $false
    foreach ($l in (Get-Content $tasks)) {
        if ($l -match '^##\s*.*En Progreso') { $inblock = $true; continue }
        if ($inblock -and $l -match '^##\s') { break }
        if ($inblock -and $l.Trim().Length -gt 0) { $lines += $l }
    }
}

$lines += "Flujo: /migrate-scan -> /ocrend-check (core PRIMERO, bloquea todo) -> /migrate-project (proyecto entero) o /migrate-file <archivo> (granular) -> /migrate-verify -> ftp_deploy."
$lines += "Transversales: /security-audit /session-audit /frontend-verify. Subagentes por archivo: php-investigator -> php-migrator -> php-reviewer."
$lines += "=== fin contexto ==="

$ctx = ($lines -join "`n")

# Formato JSON de SessionStart hook: additionalContext
$result = @{
    hookSpecificOutput = @{
        hookEventName    = 'SessionStart'
        additionalContext = $ctx
    }
} | ConvertTo-Json -Depth 5 -Compress

Write-Output $result
exit 0
