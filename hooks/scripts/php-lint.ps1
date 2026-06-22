# PostToolUse hook — auto `php -l` sobre cualquier .php editado/creado.
# Recibe JSON del harness por stdin: { tool_input: { file_path: "..." } }
# Si hay error de sintaxis, devuelve exit 2 + mensaje en stderr -> el modelo lo ve y corrige.

$ErrorActionPreference = 'SilentlyContinue'

$raw = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }

try { $payload = $raw | ConvertFrom-Json } catch { exit 0 }

# file_path puede venir en tool_input.file_path (Edit/Write) — MultiEdit igual
$fp = $payload.tool_input.file_path
if ([string]::IsNullOrWhiteSpace($fp)) { exit 0 }
if ($fp -notmatch '\.php$') { exit 0 }
if (-not (Test-Path $fp)) { exit 0 }

$php = $env:AFOCAT_PHP_BIN
if ([string]::IsNullOrWhiteSpace($php)) { $php = 'php' }

$out = & $php -l $fp 2>&1 | Out-String

if ($out -match 'No syntax errors detected') {
    # OK — silencioso (exit 0, sin ruido)
    exit 0
} else {
    # Error de sintaxis -> bloquea y reporta al modelo
    [Console]::Error.WriteLine("php -l FALLO en $fp`n$out")
    exit 2
}
