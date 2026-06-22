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

3. **Correr MCP backend**: `deprecation_scan` sobre carpetas clave (severity:"fatal" primero, luego warning) + `php_lint` para detectar lo que ya rompe.

4. **Correr MCP frontend** (analisis global): `frontend_scan` sobre el proyecto. Reporta por `by_language` (js/css/html/twig), `by_level` (modernize/restructure/redesign) y `by_category` (legacy/a11y/xss/perf). NO elige nivel aqui — solo inventaria todos.
   - **Ruido en themes admin**: proyectos con bundle de tema (`app-assets/`, charts/tables demo) inflan el scan. Las libs conocidas y `vendors/`/minificados ya se excluyen. Para reducir mas: scopear `path` al codigo frontend propio, o filtrar `severity:"warning"` (omite info como `css-important`/`console.log`).

5. **Priorizar**: fatales > warnings. Backend: core/api primero (bloquean todo), luego models/controllers, luego templates. Frontend: se prioriza al elegir nivel en `/frontend-upgrade` (no en el scan).

6. **Escribir `migration-state.json`** en `AFOCAT_PROJECT_ROOT`:
```json
{
  "scanned_at": "<fecha>",
  "php_target": "8.2",
  "files": [
    {"path": "...", "procedure": "MODEL", "status": "pending|done|skip",
     "fatal": 0, "warning": 0, "notes": ""}
  ],
  "priority_order": ["..."],
  "frontend": {
    "scanned": 0,
    "by_language": {"js": 0, "css": 0, "html": 0, "twig": 0},
    "by_level": {"modernize": 0, "restructure": 0, "redesign": 0},
    "by_category": {"legacy": 0, "a11y": 0, "xss": 0, "perf": 0},
    "files": [{"path": "...", "lang": "js", "findings": 0, "status": "pending"}]
  },
  "done": [], "pending": [], "blocked": []
}
```

7. **Reportar**: dos tablas — (a) backend por procedimiento (archivos, fatales), (b) frontend por lenguaje y nivel. NO migrar ni corregir nada todavia — solo inventariar. Sugerir el primer `/migrate-file` (backend) y `/frontend-upgrade` (frontend, que preguntara el nivel).

## Reglas
- No tocar codigo en este skill. Solo lectura + estado.
- Si `migration-state.json` ya existe, actualizar (merge), no sobreescribir el progreso `done`.
