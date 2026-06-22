---
name: migrate-scan
description: Escaneo inicial de un proyecto PHP legacy para migrar a PHP 8.2. Inventaria archivos por tipo (Ocrend core, controllers, models, mPDF/PHPExcel templates, api/Silex), corre deprecation_scan + php_lint via MCP, y genera/actualiza migration-state.json con el inventario priorizado. Usar al INICIAR la migracion o para re-evaluar el estado. Triggers: "escanear proyecto", "migrate-scan", "que falta migrar", "inventario PHP 8".
---

# migrate-scan

Punto de entrada de la migracion. Produce un inventario priorizado y un `migration-state.json` en la raiz del proyecto destino.

## Pasos

1. **Leer knowledge base**: `${CLAUDE_PLUGIN_ROOT}/knowledge/playbook.md` (arbol de decision §1) y `ocrend-php8.md`. NO re-leer si ya estan en contexto.

2. **Clasificar archivos** por el arbol de decision del playbook:
   - `Ocrend/Kernel/**` -> OCREND-CORE
   - `api/index.php`, `api/http/*` -> API-SILEX
   - `app/controllers/*` -> CONTROLLER
   - `app/models/*` -> MODEL
   - `mPDF/*.php`, `Examples/*.php` -> PDF-TEMPLATE
   - `mPDF/PHPExcel-1.8/Classes/**` -> PHPEXCEL-PATCH
   - `*.yml/.ini` -> CONFIG

3. **Correr MCP** `deprecation_scan` sobre carpetas clave (severity:"fatal" primero, luego warning). Y `php_lint` para detectar lo que ya rompe.

4. **Priorizar**: fatales > warnings. Core/api primero (bloquean todo), luego models/controllers, luego templates.

5. **Escribir `migration-state.json`** en `AFOCAT_PROJECT_ROOT`:
```json
{
  "scanned_at": "<fecha>",
  "php_target": "8.2",
  "files": [
    {"path": "...", "procedure": "MODEL", "status": "pending|done|skip",
     "fatal": 0, "warning": 0, "notes": ""}
  ],
  "priority_order": ["..."],
  "done": [], "pending": [], "blocked": []
}
```

6. **Reportar**: tabla resumen por procedimiento (cuantos archivos, cuantos fatales). NO migrar nada todavia — solo inventariar. Sugerir el primer `/migrate-file`.

## Reglas
- No tocar codigo en este skill. Solo lectura + estado.
- Si `migration-state.json` ya existe, actualizar (merge), no sobreescribir el progreso `done`.
