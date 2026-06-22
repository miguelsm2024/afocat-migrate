---
name: migrate-file
description: Migra UN archivo PHP a PHP 8.2 aplicando el procedimiento correcto del playbook (OCREND-CORE, CONTROLLER, MODEL, PDF-TEMPLATE, PHPEXCEL-PATCH, API-SILEX, CONFIG). Detecta el tipo por la ruta, aplica fixes batchables + manuales, corre php -l, y actualiza migration-state.json. Triggers: "migrar <archivo>", "migrate-file", "aplica MODEL/PDF-TEMPLATE/etc a <ruta>".
---

# migrate-file

Migra un archivo siguiendo el procedimiento del playbook segun su ruta.

## Flujo (3-4 tool calls objetivo)

1. **Resolver procedimiento** por ruta (arbol §1 de `knowledge/playbook.md`). Si el usuario nombro el procedimiento explicito, usarlo.

2. **Leer el archivo** (una vez). Si >100KB, leer por secciones relevantes.

3. **Aplicar fixes** del procedimiento:
   - Batchables: usar los scripts PowerShell del playbook o Edits directos (display_errors, sizeof->count, null-wrappers strtotime/substr/str_pad/etc, ceros() safe, $mpdf->Output('F')).
   - Manuales (§12): guard `count($cat)>1` en explode/AsociadoCertificadoID, `is_array($response)` post json_decode, `false !== $rows` antes de offset, `money_format`->`number_format`, guards de `DateTime::createFromFormat`, offset sobre numerico (`is_string` guard).

4. **Verificar**: `php -l` (el hook PostToolUse lo corre auto; si falla bloquea). O MCP `php_lint` sobre el archivo.

5. **Actualizar `migration-state.json`**: marcar `status:"done"`, registrar notas de hallazgos.

6. **Protocolo auto-actualizacion del playbook** (§ del playbook): si hubo hallazgo nuevo (regex, sintoma->causa->fix, edge case), agregarlo a `knowledge/playbook.md` ANTES de cerrar. Si no: decir "Sin nuevos hallazgos".

## Reglas
- Editar, no reescribir el archivo completo.
- No tocar inyecciones SQL preexistentes salvo pedido explicito (no son PHP 8.x) — reportarlas a security-audit.
- Para archivos de FileZilla temp: ruta `C:\Users\migue\AppData\Local\Temp\fz3temp-*\`.
- Si el archivo es grande/complejo, delegar la localizacion de riesgos al subagente `php-investigator` primero.
