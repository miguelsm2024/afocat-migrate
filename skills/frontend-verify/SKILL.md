---
name: frontend-verify
description: Verifica la estructura de frontend (HTML/CSS/JS) en views/ y mPDF templates tras la migracion. Revisa templates Twig (.twig sin extension, sintaxis Twig 3), HTML mal formado, JS que parsea respuestas JSON del API (JSON.parse roto por warnings PHP), y rutas de assets. Triggers: "verificar frontend", "frontend-verify", "revisar HTML/CSS/JS", "vistas rotas", "revisar Twig".
---

# frontend-verify

Asegura que el frontend siga consistente cuando el backend pasa a PHP 8.2.

## Pasos

1. **Twig 3**: en `views/app/` y donde haya `render()`:
   - `render('x/y')` sin `.twig` requiere `TwigAutoExtLoader` (ver ocrend-php8.md). Verificar que exista.
   - Sintaxis Twig 2 -> 3: `{% spaceless %}` removido, filtros renombrados, `for ... if` -> `for ... |filter`.

2. **JS que consume el API**: buscar `JSON.parse(...)` / `$.ajax` / `fetch` que reciben de `api/http/*` o `mPDF/*`. Si el endpoint emitia warnings PHP antes del JSON, `JSON.parse` rompia. Confirmar que los endpoints migrados respondan JSON limpio (ver PDF-TEMPLATE display_errors off).

3. **HTML**: tags sin cerrar, atributos duplicados, encoding (BOM UTF-8 antes de `<?php` rompe el render — relacionado con CONTROLLER fix).

4. **Assets**: rutas CSS/JS relativas vs absolutas; que apunten bien en local (`http://localhost:8080/sys_Afocat/`) y prod (`/erp/`).

5. **Codigos de respuesta API** que el JS interpreta: `1`=OK, `2`=error logico, `3`=excepcion, `6`=advertencia, `7`=config, `99`=no auth. Verificar que el front maneje todos.

## Reporte
Lista `archivo:linea | problema | fix`. Separar HTML / CSS / JS / Twig.

## Reglas
- **Este skill solo VERIFICA** (read-only): consistencia estructural y compatibilidad con el backend migrado. Para APLICAR correcciones o elevar el frontend, usar `/frontend-upgrade` (pregunta el nivel: modernize/restructure/redesign).
- Foco en lo que la migracion PHP 8 pudo romper (respuestas JSON, Twig, encoding) y en regresiones tras un upgrade.
- Usar como paso de verificacion DESPUES de `/frontend-upgrade`.
