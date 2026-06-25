---
name: erp-fasmot-validation
description: Hallazgos al validar afocat-migrate contra erp__Fasmot (proyecto Ocrend real)
metadata: 
  node_type: memory
  type: project
  originSessionId: cda579ce-adc1-42b8-b8ef-8af47a3bb6df
---

Validación del plugin `afocat-migrate` v1.1 contra `c:\xampp\htdocs\erp__Fasmot` (Ocrend real, 2026-06-22).

**Estado migración erp__Fasmot:**
- Backend app propio **ya corre en PHP 8.2**. CORE limpio, MODELS 93→4 fatal (null-safety [MODEL] + 3 casos manuales concat), CONTROLLERS cerrado, `php -l` OK. IRouter `?nullable` en 23 archivos.
- mPDF ya `^8.2`, PHPExcel ya parsea. **PHPWord** (`mPDF/PHPExcel-1.8/Examples/phpword/.../PHPWord-master/`) = 23 lint-fail pero **no referenciado en `app/`** → código muerto, `skip`.
- Frontend modernize: `login.js`/`docs/app.js` hechos; ESLint --fix arregló 269 `var` seguros.

**Hallazgos que dispararon cambios en el plugin (ya commiteados):**
- `deprecation_scan`/`frontend_scan` matcheaban en **comentarios** y firmas **ya `?nullable`** → inflaba fatal ~10×. Fix: `isCommentLine()` + lookbehind en regex `non-nullable-default-null`. Ver [[playbook]] §16.

**No-obvios a recordar:**
- Null-safety (`strtotime/substr/str_pad` con null) = **deprecation PHP 8.1, NO fatal en 8.2** (rompe en PHP 9). Endurecer por [MODEL] pero no bloquea runtime.
- `dynamic-property` warnings = **FP heredado** de `#[AllowDynamicProperties]` en clases base Kernel.
- **`var`→`let/const` NO es modernize-safe a escala**: estos JS usan `sourceType:script` con **vars globales compartidas entre archivos**; ESLint sólo convierte las function-local (269/2113). El resto (1844 globales) requiere restructure (módulos), no modernize.
- `==`→`===` queda manual por módulo (ESLint no lo auto-fixea; cambio semántico).
- Themes admin (`app-assets/`) inflan frontend_scan; scopear `path` o `severity:warning`.

**Acción base codificada (reutilizable) — playbook §14c:**
Dos procedimientos nuevos, validados acá, para cualquier proyecto Ocrend futuro:
- `[DOMAIN-REFERENCES]`: dominio prod hardcodeado → `SITE_URL` (PHP, define en Start.php desde `site.url`), `href="."`+`<base>` (Twig, borrar `.cache`), ruta relativa (JS). NO tocar display (pie PDF) ni URLs externas. En erp__Fasmot: 78 refs PHP + 3 JS + 2 Twig.
- `[JS-SAFE-MODERNIZE]`: sólo lo provablemente seguro — `var`→let/const function-local (ESLint, deja globales), `==`→`===` en `typeof`/`.val/.text/.html/.attr()`/`.length`. En erp__Fasmot: 269 var + 516 == seguros. Restante (5084 ==, 2382 var globales) = runtime/restructure, NO automatizable.
Reglas de detección añadidas: `hardcoded-absolute-url` (deprecation-rules) y `js-hardcoded-url` (frontend-rules), ambas info → playbook DOMAIN-REFERENCES.

**Runtime fix (entorno, no código) — playbook §16:**
- Reporte XLSX da **403 Forbidden** → el archivo no se creó porque PHPExcel fataleó con `Class "ZipArchive" not found`. Fix: `extension=zip` en php.ini + reiniciar Apache. Checar en cada entorno nuevo. Diagnóstico real en `apache/logs/error.log`, no en el 403.
- Nombre con **espacio antes de extensión** (`'...AL '.$f.' .xlsx'`) → Windows recorta el espacio final → URL `%20.xlsx` no matchea. Fix aplicado en Expediente.php (11 casos).
- **Imágenes mPDF no aparecen** → falta `extension=gd` (PNG con alpha lo necesita; sin GD se omite en silencio, NO es la ruta). Fix: `extension=gd` en php.ini + restart Apache. **Combo a habilitar en cada entorno Ocrend: `zip` (xlsx) + `gd` (imágenes pdf).**

**Cadena de debug reportes (PDF/XLSX/Word) — orden a chequear (todo en [[playbook]] §16):**
1. Extensión del entorno: `zip` (xlsx/docx) y `gd` (imágenes pdf). Restart Apache tras tocar php.ini.
2. Server genera? Verificar archivo en disco + `ZipArchive->open()` + `curl -I` (200) ANTES de culpar al código/lib.
3. Lib `Examples/phpword` (PHPWord viejo) = **código muerto, nadie la usa**; el word real sale de `mPDF/word/template_*.php` (lib `mPDF/word/vendor`). NO perder tiempo ahí.
4. Templates word: `display_errors=0` + `echo file_get_contents('FILES/x.docx')` (no la raíz).
5. Nombre sin espacio antes de extensión.
6. Descarga front: usar **fetch+blob** (no `link.href` relativo con espacios) — guarda los bytes reales. Múltiples descargas: `download` attr.
7. **JS cacheado sin `?v=`**: el fix no surte efecto hasta hard refresh; agregar `?v=YYYYMMDDx` al `<script>` + borrar `.cache`. ← causa más engañosa.

**Deploy Docker+Nginx validado (build real, [[playbook]] §14d gotchas):**
- erp__Fasmot en GitHub PRIVADO (`miguelsm2024/erp__Fasmot`, SSH). ~45M (vendor grandes + outputs + secretos excluidos).
- `base_assets()` (Functions.php) rompía bajo nginx: `$server[0].$server[1].$server[2]` sobre SERVER_NAME vacío → `Uninitialized string offset` → 500 con debug:true (tumba login). Fix: `substr((string)$server,0,3)` + nginx `fastcgi_param SERVER_NAME $host`. Bug PHP8 latente que SOLO aparece fuera de Apache/mod_php.
- `composer install` aborta (exit 4) con `mPDF/word` (PhpWord pineado dev-master vs constraint v0.18.*). Fix: commitear ese vendor puntual (2.8M), sacarlo del install; Ocrend(70M)/mPDF(96M) sí por composer.
- Stack: nginx(web) + php:8.2-fpm(app) + mariadb(db). Build probado: login HTTP 200. Docker Desktop debe estar corriendo para build.

**Rediseño vistas (capa override, [[playbook]] §14b [VIEW-REDESIGN]):** minimalista + dark mode SIN reescribir el theme Modern Admin (compartido por 50+ vistas). `views/app/css/redesign.css` (vars CSS light/dark, !important para ganar al theme) + `redesign.js` (window.RD: toggle, loader, toast, validarForm, lockBtn). Anti-flash inline en `<head>` antes de CSS. Inyectado en los 5 layouts (overall/_snt/_basic/_graf/_two) + login; iframes heredan tema vía localStorage. Toggle ☀/☾ en navbar. SEGURIDAD: removido polyfill.io (comprometido 2024) de todas las vistas. Regla detectable `polyfill-io-comprometido` (fatal). Piloto = dashboard, aprobada, replicada.

**Skill base creado (v1.2): `/runtime-audit`** — encapsula TODO este plan post-migración (entorno gd/zip, errores consola, vistas 500, imprimibles bareword, reportes self-curl timeout, descargas `<a download>` directo, dominio). Diagnóstico por evidencia (error.log+curl+integridad) antes de tocar código + auto-actualiza playbook. Ejecutar en cualquier proyecto Ocrend que ya corre pero falla en runtime. Todos los fixes en [[playbook]] §16 + §14c/§14d. Descargas: NO usar fetch+blob para mismo origen (caché HTTP rompe la 2ª); usar `<a href=encodeURI download>` directo + secuencia con delay 1200ms.
