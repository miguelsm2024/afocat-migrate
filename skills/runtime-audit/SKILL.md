---
name: runtime-audit
description: Plan base post-migración para proyectos Ocrend ya en PHP 8.2 que CORREN pero fallan en runtime - imprimibles (PDF/XLSX/Word) que no generan o no descargan, errores en consola del browser, vistas que dan 500, reportes que "no terminan". Diagnostica por evidencia (error.log + curl + integridad de archivo) antes de tocar código, aplica los fixes del playbook §16, y auto-actualiza el playbook con hallazgos nuevos. Triggers: "runtime-audit", "no genera el pdf/excel/word", "no descarga el archivo", "errores en consola", "imprimibles fallan", "reportes no terminan", "revisar generación de archivos".
---

# runtime-audit

Plan base para la fase **post-migración**: la app Ocrend ya corre en PHP 8.2 (core/models/controllers migrados, `php -l` limpio) pero fallan funciones reales — generación de imprimibles, descargas, vistas, reportes. Codifica la secuencia de diagnóstico+fix validada en erp__Fasmot. Trabaja sobre cualquier proyecto apuntando con ruta absoluta o `AFOCAT_PROJECT_ROOT`.

## Principio rector: DIAGNOSTICAR ANTES DE TOCAR
Casi siempre "no genera X" NO es lo que parece. Verificar la cadena con evidencia, en orden, ANTES de editar código:
1. **error.log** (`C:\xampp\apache\logs\error.log`) — la causa real está aquí, NO en el HTTP 500/403 que ve el browser.
2. **¿el archivo se creó?** `ls` en disco + `ZipArchive->open()` (xlsx/docx) o primeros bytes (`head -c4 | od -tc`: `50 4b`/`PK` = ok).
3. **¿se sirve?** `curl -s -o /dev/null -w "%{http_code} %{content_type}"` a la URL.
4. Recién entonces decidir: entorno / server PHP / frontend.

## Checklist de diagnóstico+fix (orden recomendado)

### 1. Entorno (NO viaja con el código — revisar en CADA entorno: local, VPS, Docker)
- **`extension=gd`** habilitada → imágenes en mPDF (PNG con alpha). Sin ella la imagen se omite muda. Test: `php -m | grep gd`.
- **`extension=zip`** habilitada → XLSX (PHPExcel) y DOCX (PhpWord) son zip. Sin ella: `Class "ZipArchive" not found` → archivo no se crea → 403 al pedirlo.
- Tras tocar `php.ini`: **reiniciar Apache**.
- `max_execution_time` suficiente para reportes grandes (o `set_time_limit` en el código, ver punto 4).

### 2. Errores en consola del browser
- **`Uncaught SyntaxError: Unexpected token '<'`** en un `.js` = el archivo NO existe → el router Ocrend devuelve HTML. `curl -w "%{content_type}"`: si `text/html`, falta el archivo (ruta vieja / movido a `_____Papelera/`). Restaurar (proyectos hermanos sys_Afocat/panel_PA suelen tener copia) o corregir el `src`.
- **`Invalid or unexpected token`** en `.js` que SÍ existe = archivo corrupto. `head -c4 archivo.js | od -An -tc`: si no es texto JS (`(fun`, `!fun`), reemplazar con copia limpia.
- **`<script src>` sin `?v=`** → el browser cachea JS viejo; el fix "no surte efecto" hasta hard refresh. Agregar cache-bust `?v=YYYYMMDDx` + borrar `app/templates/.cache/`.

### 3. Vista da 500 al cargar (en su iframe)
- **Warning PHP = 500 con `framework.debug:true`** (ErrorHandler Ocrend lo eleva a ErrorException). `error.log` → `[Router] ErrorException in <archivo>:<línea>`. Causa típica: `Undefined variable $x` por copy-paste (usar la var correcta). En prod con `debug:false` son solo warnings.
- **500 de DB ≠ 500 de migración**: `Unknown column`/`Unknown database` = esquema BD desincronizado vs código (BD local vieja). NO editar la query a ciegas — sincronizar esquema (dump de prod / ALTER). Ver `db_schema` MCP.

### 4. Imprimible no genera (PDF/XLSX/Word)
- **Bareword (constante indefinida) como valor de array = FATAL en PHP 8**: `['setAutoTopMargin' => stretch]` (sin comillas). PHP7: warning+string; PHP8: `Error: Undefined constant`. Diagnóstico: un imprimible falla mientras otros del mismo módulo generan → el que falla tiene el bareword. `grep -rE "=>\s*[a-z][a-z_]+\b" mPDF` (sin comillas, sin `$`). Fix: encomillar (`=> 'stretch'`). (Regla MCP `bareword-constant-array-value`.)
- **Templates Word (PhpWord)**: requieren `zip`; `display_errors` en `'0'` (no contaminar respuesta); `echo file_get_contents('FILES/x.docx')` (no la raíz).
- **Self-curl sin `CURLOPT_TIMEOUT` + `max_execution_time`** → reporte "no termina": el Example tarda >120s, en Windows `curl_exec` cuenta para el límite → el orquestador muere esperando, pero el Example (request aparte) escribe el archivo. Fix: `@set_time_limit(300)` en orquestador Y Examples + `CURLOPT_TIMEOUT, 290` en el self-curl.

### 5. Genera pero NO descarga (frontend)
- **Mismo origen → `<a href=encodeURI(ruta) download=nombre>` directo**, NO `fetch+blob`. fetch+blob introduce caché HTTP (la 2ª descarga "solo funciona tras limpiar caché"), memoria, y rutas raras en iframes.
- **Descargas múltiples**: ejecutar EN SECUENCIA con delay ~1200ms (los browsers bloquean descargas juntas). encodeURI para nombres con espacios.

### 6. Referencias internas hardcodeadas (ver `[DOMAIN-REFERENCES]`)
- `"https://<dominio-prod>/..."` para archivos del mismo proyecto → rompe en local/Docker. PHP: `SITE_URL` (define en Start.php desde `site.url`). JS/Twig: ruta relativa / `<base href>`.

## Reglas
- **Verificar con evidencia antes de editar.** El error.log manda, no el código HTTP del browser.
- No editar queries SQL a ciegas si es desajuste de esquema (es entorno/datos).
- Tras editar JS/Twig: cache-bust `?v=` + borrar `.cache` + avisar hard refresh `Ctrl+Shift+R`.
- Tras editar PHP: `php -l`.
- **AUTO-ACTUALIZAR el playbook** (protocolo §inicial): si aparece un patrón nuevo no documentado, integrarlo a `knowledge/playbook.md` §16 (+ regla en `deprecation-rules.json`/`frontend-rules.json` si es detectable por regex) y commitear. Si no hubo: "Sin nuevos hallazgos para playbook."
- Fuente de verdad de todos estos fixes: `${CLAUDE_PLUGIN_ROOT}/knowledge/playbook.md` §16 (hallazgos cross-cutting) + §14c/§14d.
