# Playbook — Migración a PHP 8.2 (sys_Afocat)

Documento de referencia para aplicar correcciones de forma sistemática y con consumo mínimo de tokens. Cada procedimiento define **el tipo de archivo, los fixes, los comandos exactos y el prompt** para invocarlo.

---

## ⚠ Protocolo de auto-actualización (LEER PRIMERO)

Antes de cerrar cada tarea de migración:

1. **¿Hubo descubrimientos no documentados?** (nuevo regex de bug PHP 8.x, nuevo síntoma→causa→fix, edge case manual, script PowerShell mejor que el documentado, bug pre-existente recurrente, ruta prod ≠ local, versión de paquete actualizada).
2. **Si hubo:** edita la sección correspondiente + agrega línea en el §15 Historial. **Si no hubo:** dilo en una línea: "Sin nuevos hallazgos para playbook."

**Por qué:** sin esto los hallazgos quedan en el chat y se pierden, gastando tokens en futuras sesiones para redescubrir lo mismo.

---

## 1. Árbol de decisión — qué procedimiento aplicar

| Ruta del archivo | Tipo | Procedimiento |
|---|---|---|
| `Ocrend/Kernel/**/*.php` | Framework core | `[OCREND-CORE]` |
| `Ocrend/composer.json` | Dependencias framework | `[OCREND-COMPOSER]` |
| `api/index.php` o `api/http/*.php` | Rutas Silex | `[API-SILEX]` |
| `app/controllers/*Controller.php` | Controlador HTTP | `[CONTROLLER]` |
| `app/models/*.php` (no Papelera) | Modelo de datos | `[MODEL]` |
| `mPDF/*.php`, `TCPDF/examples/*.php` | Template de PDF **o endpoint JSON/SUNAT** que recibe `php://input` | `[PDF-TEMPLATE]` |
| `mPDF/composer.json` o `vendor/` | Librería mPDF | `[MPDF-UPDATE]` |
| `mPDF/PHPExcel-1.8/Classes/**/*.php` | Lib PHPExcel abandonada | `[PHPEXCEL-PATCH]` |
| `Ocrend.ini.yml` u otros `.yml/.ini` | Configuración | `[CONFIG]` (revisar manual) |
| Errores 500 silentes post-migración | Arquitectura de errores | `[ERROR-HANDLING]` |
| `**/*.js` (no `.min.js`, no `vendors/`) | JavaScript del proyecto | `[JS-MODERNIZE]` |
| `views/**/*.{html,htm,twig,phtml}` | Estructura HTML / Twig | `[HTML-STRUCTURE]` |
| `**/*.{css,scss}` (no `.min.css`) | Estilos | `[CSS-CLEANUP]` |
| Re-maquetado de pantalla (nivel redesign) | Layout / UX | `[FRONTEND-REDESIGN]` |

> **Frontend = nivel en runtime.** Los procedimientos `[JS-MODERNIZE]`/`[HTML-STRUCTURE]`/`[CSS-CLEANUP]`/`[FRONTEND-REDESIGN]` se aplican según el **nivel** que el usuario elige en `/frontend-upgrade` (modernize ⊂ restructure ⊂ redesign). El skill SIEMPRE pregunta el nivel; nunca se asume.

> **Nota** sobre `[PDF-TEMPLATE]`: aplica también a endpoints que **NO** generan PDF pero sí reciben JSON (SUNAT, anulación, resumen boletas). Los pasos de `$mpdf->Output('F')` y `function ceros` quedan como no-ops seguros si el archivo no los contiene.

---

## 2. `[OCREND-CORE]` — `Ocrend/Kernel/**/*.php`

### Causas de 500 que arregla
- `\Twig_Environment`, `\Twig_Function` → eliminados en Twig 3
- `Symfony\Component\Debug\*` → eliminado en Symfony 4.4
- `final private function` → warning fatal con ErrorHandler en PHP 8
- `sizeof()` deprecado, `IRouter $router = null` ilegal en PHP 8.1+
- `\PHPMailer` → renombrado en v6
- `func_num_args/func_get_arg` → reemplazar por variadic
- `RedirectResponse::create()` → eliminado en Symfony 5.1

### Acciones (en orden)
1. **Twig namespace migration**:
   - `\Twig_Environment` → `\Twig\Environment`
   - `\Twig_Loader_Filesystem` → `\Twig\Loader\FilesystemLoader`
   - `\Twig_Extension` → `\Twig\Extension\AbstractExtension`
   - `\Twig_Function` → `\Twig\TwigFunction`
   - `\Twig_Extension_Debug` → `\Twig\Extension\DebugExtension`
   - Eliminar `getName()` (removido de la interfaz)
2. **Symfony Debug → ErrorHandler**:
   - `use Symfony\Component\Debug\ExceptionHandler` → eliminar
   - `use Symfony\Component\Debug\ErrorHandler` → `use Symfony\Component\ErrorHandler\ErrorHandler`
   - `use Symfony\Component\Debug\Debug` → `use Symfony\Component\ErrorHandler\Debug`
   - `ExceptionHandler::register()` → eliminar (absorbido por ErrorHandler)
3. **PHPMailer v5 → v6**:
   - Agregar `use PHPMailer\PHPMailer\PHPMailer;`
   - `new \PHPMailer` → `new PHPMailer(true)`
   - `\PHPMailer` return type → `PHPMailer`
   - Métodos a camelCase: `AddAttachment` → `addAttachment`
4. `final private function X(...)` → `private function X(...)`
5. `sizeof(` → `count(`
6. `#[AllowDynamicProperties]` delante de clases que asignan props dinámicas (`Models`, `Controllers`)
7. Nullable hints: `IRouter $router = null` → `?IRouter $router = null`
8. `func_num_args/func_get_arg` → reescribir con `mixed ...$args` y foreach
9. `RedirectResponse::create($url)->send()` → `(new RedirectResponse($url))->send()`
10. **TwigAutoExtLoader**: si los `render('x/y')` no llevan `.twig`, crear `Ocrend/Kernel/Controllers/TwigAutoExtLoader.php` y usarlo en `Controllers.php` en lugar de `FilesystemLoader`

### Verificación
```powershell
Get-ChildItem -Path "Ocrend\Kernel" -Recurse -Filter "*.php" | ForEach-Object { php -l $_.FullName }
```

### Prompt sugerido
```
Aplica OCREND-CORE a Ocrend/Kernel/<ruta>
```

---

## 3. `[OCREND-COMPOSER]` — `Ocrend/composer.json`

### Estado objetivo
```json
{
    "require": {
        "php": ">=8.2",
        "twig/twig": "^3.0",
        "symfony/yaml": "^6.4",
        "symfony/http-foundation": "^6.4",
        "symfony/error-handler": "^6.4",
        "symfony/var-dumper": "^6.4",
        "phpmailer/phpmailer": "^6.0"
    }
}
```
**Eliminar**: `silex/silex`, `symfony/debug`, cualquier `^3.x` o `^2.x`.

### Comandos
```bash
cd Ocrend/
composer update --with-all-dependencies
```
Si en local falta `ext-zip` o `ext-gd`, agregar `--ignore-platform-req=ext-XXX`.

### Prompt sugerido
```
Aplica OCREND-COMPOSER
```

---

## 4. `[API-SILEX]` — `api/index.php` y `api/http/*.php`

### Causa de 500
`Silex\Application` no existe en Symfony 6.4 (paquete abandonado en 2019). Usa `unset($app['exception_handler'])`, `$app->post/get/put/delete()`, `$app->json()`, `$app->run()`.

### Solución
**Crear `api/MicroApp.php`** — drop-in replacement con la misma API de Silex usando `Symfony\HttpFoundation` directamente. Implementa `ArrayAccess`. Soporta solo rutas estáticas (sin `/users/{id}`); para rutas con parámetros, migrar a `Symfony\Component\Routing` real.

**`api/index.php`**:
```php
require __DIR__ . '/MicroApp.php';
$app = new api\MicroApp();
unset($app['exception_handler']);
require 'http/get.php'; require 'http/post.php'; require 'http/put.php'; require 'http/delete.php';
$app->run();
```

Los archivos `http/*.php` no se tocan — la API es idéntica a Silex.

> El `MicroApp::run()` actual incluye try/catch + helper `firstAppFrame` para devolver JSON estructurado en errores. Ver §11 `[ERROR-HANDLING]`.

### Verificación
```powershell
php -l api/MicroApp.php
php -l api/index.php
# Smoke: POST a ruta inexistente debe retornar 404 JSON
Invoke-WebRequest -Uri "http://localhost:8080/sys_Afocat/api/_test" -Method POST
```

### Refactor opcional de `api/http/post.php` (formato 2-líneas)
```php
$app->post('/Ruta', function() use($app) { 
$u = new Model\X; return $app->json($u->method()); });
```

Script:
```powershell
$pattern = "\`$app->(post|get|put|delete)\(\s*'([^']+)',\s*function\s*\(\s*\)\s*use\s*\(\s*\`$app\s*\)\s*\{\s*\`$u\s*=\s*new\s+(Model\\[a-zA-Z_][a-zA-Z0-9_]*)\s*;\s*return\s+\`$app->json\(\s*\`$u->([a-zA-Z_][a-zA-Z0-9_]*)\(\)\s*\)\s*;\s*\}\s*\)\s*;"
$replacement = "\`$app->\`$1('\`$2', function() use(\`$app) { \`r\`n\`$u = new \`$3; return \`$app->json(\`$u->\`$4()); });"
```

### Detectar rutas duplicadas
**MicroApp** (mismo que Silex) usa `$this->routes[$method][$path] = $handler` — un duplicado **sobreescribe silenciosamente**. Después de cualquier reformat:
```powershell
$rx = [regex]"(?m)^\s*\`$app->(post|get|put|delete)\(\s*'([^']+)'"
$rx.Matches($c) | ForEach-Object { "$($_.Groups[1].Value):$($_.Groups[2].Value)" } | Group-Object -CaseSensitive | Where-Object { $_.Count -gt 1 }
```
- Duplicados con **mismo handler** → inocuos.
- Duplicados con **handlers distintos** → la 2ª gana, la 1ª es código muerto silente. Reportar al usuario.
- **PHP routing es case-sensitive** (`/Form_Cheque` ≠ `/Form_CHEQUE`). Usar `Group-Object -CaseSensitive`.

### Prompt sugerido
```
Aplica API-SILEX a api/
# Para refactor de formato:
Refactoriza api/http/post.php al formato 2-líneas
```

---

## 5. `[CONTROLLER]` — `app/controllers/*Controller.php`

### Causas de 500 que arregla
- `sizeof()` deprecation
- BOM UTF-8 antes de `<?php` → "Namespace declaration must be the first statement"

### Script
```powershell
$root = "app\controllers"
Get-ChildItem -Path $root -Filter "*.php" | ForEach-Object {
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    if ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        [System.IO.File]::WriteAllBytes($_.FullName, $bytes[3..($bytes.Length - 1)])
    }
    $c = [System.IO.File]::ReadAllText($_.FullName)
    $c2 = $c -replace 'sizeof\(', 'count('
    if ($c -ne $c2) { [System.IO.File]::WriteAllText($_.FullName, $c2) }
}
```

### Prompt sugerido
```
Aplica CONTROLLER a app/controllers/<archivo>
```

---

## 6. `[MODEL]` — `app/models/*.php`

### Causas de 500
- `sizeof()` deprecation
- Funciones strict-type que reciben `null` → `TypeError` fatal en PHP 8.1+:
  - `strtotime`, `substr`, `str_pad`, `str_replace` (3er arg), `strtoupper`, `strtolower`, `mb_strlen`, `trim`, `round`
- `$response = json_decode(...)` y luego `$response['k']` sin validar
- `$select_result[0]['col']` cuando `select()` puede retornar `false`
- Variables undefined (copy-paste con params equivocados)

### Script
```powershell
$path = "app\models\<archivo>.php"
$varX = '\$[a-zA-Z_][a-zA-Z0-9_]*(?:\[[^\]]*\])*(?:->[a-zA-Z_][a-zA-Z0-9_]*)*'
$c = [System.IO.File]::ReadAllText($path)

$c = $c -replace 'sizeof\(', 'count('

$c = $c -replace "(?<!\(string\)\()strtotime\(($varX)\)",     "strtotime((string)(`$1 ?? ''))"
$c = $c -replace "(?<!\(string\)\()substr\(($varX),",         "substr((string)(`$1 ?? ''),"
$c = $c -replace "(?<!\(string\)\()str_pad\(($varX),",        "str_pad((string)(`$1 ?? ''),"
$c = $c -replace "(?<!\(string\)\()strtoupper\(($varX)\)",    "strtoupper((string)(`$1 ?? ''))"
$c = $c -replace "(?<!\(string\)\()strtolower\(($varX)\)",    "strtolower((string)(`$1 ?? ''))"
$c = $c -replace "(?<!\(float\)\()round\(($varX),",           "round((float)(`$1 ?? 0),"
$c = $c -replace "(?<!\(string\)\()mb_strlen\(($varX)\)",     "mb_strlen((string)(`$1 ?? ''))"
$c = $c -replace "(?<![a-zA-Z_])trim\(($varX)\)",             "trim((string)(`$1 ?? ''))"
$c = $c -replace "intval\(($varX)\)",                          "intval(`$1 ?? 0)"

$c = $c -replace 'str_replace\(((?:"[^"]*"|''[^'']*''|\$[a-zA-Z_][a-zA-Z0-9_]*(?:\[[^\]]*\])*)),\s*((?:"[^"]*"|''[^'']*''|\$[a-zA-Z_][a-zA-Z0-9_]*(?:\[[^\]]*\])*)),\s*(\$[a-zA-Z_][a-zA-Z0-9_]*(?:\[[^\]]*\])*)\)', 'str_replace($1, $2, (string)($3 ?? ''''))'

$rxC = [regex]'(?s)function\s+ceros\s*\(\s*\$valor\s*,\s*\$longitud\s*\)\s*\{[^}]+\}'
$safeCeros = "function ceros(`$valor, `$longitud){ return str_pad((string)(`$valor ?? ''), (int)`$longitud, '0', STR_PAD_LEFT); }"
$c = $rxC.Replace($c, $safeCeros)

[System.IO.File]::WriteAllText($path, $c)
& php -l $path
```

### Manuales (caso por caso)
- **`json_decode($curl_resp, true)`** sin validar: agregar `if (!is_array($response)) { $response = ['k1'=>'', 'k2'=>'']; }` o usar `is_array($response) && isset($response['k']) ? ... : ''`
- **`$rows = $this->db->select(...)`** sin chequear: agregar `if (false === $rows) { return [...]; }` antes del offset access
- **Variables undefined** dentro de funciones: grep `function X(` y verificar que el cuerpo solo use los params declarados

### Prompt sugerido
```
Aplica MODEL a app/models/<archivo>.php
# Bug específico:
Revisa el método X en <archivo> que tira 500
```

---

## 7. `[PDF-TEMPLATE]` — `mPDF/*.php`, `TCPDF/examples/*.php` (incluye endpoints JSON)

### Causas de 500
- `display_errors=1` polluciona el JSON con HTML de warnings
- `$data = json_decode($body, true)` sin validar → `$data[0]['k']` fatal si JSON inválido
- `function ceros()` con `str_pad($valor, ...)` recibe null
- `strtotime/substr/str_replace` con null → TypeError
- `$mpdf->Output('path.pdf')` SIN `'F'` envía PDF binary inline al caller curl en vez de guardar y responder JSON

### Script (idempotente)
```powershell
$path = "mPDF\<archivo>.php"
$c = [System.IO.File]::ReadAllText($path)
$varX = '\$[a-zA-Z_][a-zA-Z0-9_]*(?:\[[^\]]*\])*'

# 1) Header — silenciar errors, evitar JSON corrompido
$c = $c -replace "ini_set\('display_errors',\s*1\)",         "ini_set('display_errors', '0')"
$c = $c -replace "ini_set\('display_startup_errors',\s*1\)", "ini_set('display_startup_errors', '0')"
$c = $c -replace "(?m)^\s*error_reporting\(E_ALL\);\s*\r?\n", ""
$c = $c -replace "error_reporting\(E_ALL\s*\^\s*E_NOTICE\)", "error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED)"

# 2) sizeof -> count
$c = $c -replace 'sizeof\(', 'count('

# 3) Inyectar helper _fdate + validación de $data — SOLO si no existen ya (idempotencia)
$helpers = @"


# === Helpers PHP 8.x null-safety ===
if (!function_exists('_fdate')) {
    function _fdate(`$s, `$format = 'd/m/Y') {
        if (`$s === null || `$s === '' || `$s === false) return '';
        `$ts = strtotime((string)`$s);
        return `$ts ? date(`$format, `$ts) : '';
    }
}
if (!is_array(`$data)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => 0, 'error' => 'Payload invalido o vacio']);
    exit;
}
# === Fin helpers ===

"@
if ($c -notmatch '# === Helpers PHP 8\.x null-safety') {
    $c = [regex]::Replace($c, '(\$data\s*=\s*json_decode\(\$bodyRequest\s*,\s*true\)\s*;)', '$1' + $helpers, 1)
}

# 4) Reemplazar ceros() local con safe version
$safeCeros = "function ceros(`$valor, `$longitud){`r`n        return str_pad((string)(`$valor ?? ''), (int)`$longitud, '0', STR_PAD_LEFT);`r`n    }"
$c = [regex]::Replace($c, '(?s)function\s+ceros\s*\(\s*\$valor\s*,\s*\$longitud\s*\)\s*\{[^}]+\}', $safeCeros)

# 5) Reemplazar date(..., strtotime($var)) con _fdate($var, ...)
$c = $c -replace 'date\("([^"]+)"\s*,\s*strtotime\((\$[a-zA-Z_][a-zA-Z0-9_]*(?:\[[^\]]+\])*)\)\)', '_fdate($2, "$1")'

# 6) Wrappers null-safety
$c = $c -replace "(?<!\(string\)\()strtotime\(($varX)\)",  "strtotime((string)(`$1 ?? ''))"
$c = $c -replace "(?<!\(string\)\()substr\(($varX),",      "substr((string)(`$1 ?? ''),"
$c = $c -replace "(?<!\(string\)\()str_pad\(($varX),",     "str_pad((string)(`$1 ?? ''),"
$c = $c -replace "(?<!\(string\)\()strtoupper\(($varX)\)", "strtoupper((string)(`$1 ?? ''))"
$c = $c -replace "(?<!\(string\)\()strtolower\(($varX)\)", "strtolower((string)(`$1 ?? ''))"
$c = $c -replace "(?<!\(float\)\()round\(($varX),",         "round((float)(`$1 ?? 0),"
$c = $c -replace "(?<!\(string\)\()mb_strlen\(($varX)\)",  "mb_strlen((string)(`$1 ?? ''))"
$c = $c -replace 'str_replace\(((?:"[^"]*"|''[^'']*''|\$[a-zA-Z_][a-zA-Z0-9_]*(?:\[[^\]]*\])*)),\s*((?:"[^"]*"|''[^'']*''|\$[a-zA-Z_][a-zA-Z0-9_]*(?:\[[^\]]*\])*)),\s*(\$[a-zA-Z_][a-zA-Z0-9_]*(?:\[[^\]]*\])*)\)', 'str_replace($1, $2, (string)($3 ?? ''''))'

[System.IO.File]::WriteAllText($path, $c)
& php -l $path
```

### Manual: `$mpdf->Output()` debe usar `'F'` + responder JSON
Si el archivo genera PDF, buscar:
```php
$mpdf->Output('REPORTES/.../algo.pdf');
```
Reemplazar con:
```php
$pdf_id   = isset($X['identificador']) ? (string)$X['identificador'] : '';
$pdf_path = 'REPORTES/.../'.$pdf_id.'.pdf';
$mpdf->Output($pdf_path, 'F');
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['success' => 1, 'respuesta' => 'PDF generado', 'pdf' => $pdf_path]);
exit;
```

Y en el caller (modelo) que hace el curl, validar `$response`:
```php
$response = json_decode($respuesta, true);
$mensaje  = (is_array($response) && isset($response['respuesta'])) ? $response['respuesta'] : '';
```

### Endpoints sin PDF (SUNAT, etc)
Para archivos como `mPDF/resumen_boletas.php`, `mPDF/anular_documento.php` que reciben JSON pero generan XML/llaman SUNAT, **el script aplica igual** — los pasos 4 (ceros) y la mitad de 6 (wrappers) serán no-ops. El valor está en los pasos 1, 3 y 5.

### Prompt sugerido
```
Aplica PDF-TEMPLATE a mPDF/<archivo>.php
# Si invocado desde modelo:
Verifica que el caller en app/models/<archivo>.php valide el $response del curl
```

---

## 8. `[MPDF-UPDATE]` — actualizar la librería mPDF

### Causa de 500
mPDF v8.0.x usa `$str{0}` para offset access — eliminada en PHP 8.0. Tira fatal en cualquier render. ~100 líneas afectadas, NO se puede parchear manual.

### Solución
1. Local — `mPDF/composer.json`:
   ```json
   { "require": { "php": ">=8.2", "mpdf/mpdf": "^8.2" } }
   ```
2. Local — `composer update mpdf/mpdf --with-all-dependencies --ignore-platform-req=ext-gd`
3. Producción — en orden de preferencia:
   - **A**: SSH + `cd mPDF/ && rm -rf vendor/ composer.lock && composer install`
   - **B**: subir vía FTP `mPDF/composer.json`, `composer.lock` y todo `mPDF/vendor/` (~30-50 MB)
   - **C**: subir solo `mPDF/vendor/mpdf/mpdf/` y los `mPDF/vendor/composer/{installed.json,installed.php,autoload_*.php}`

### Verificación
```bash
grep -rn '\$[a-zA-Z_][a-zA-Z0-9_]*{[0-9]' mPDF/vendor/mpdf/mpdf/src/ | wc -l   # debe ser 0
php -r "require 'mPDF/vendor/autoload.php'; echo \Mpdf\Mpdf::VERSION;"          # >= 8.2
```

### Prompt sugerido
```
Aplica MPDF-UPDATE
```

---

## 9. `[PHPEXCEL-PATCH]` — librería PHPExcel-1.8 abandonada

### Causa de 500
PHPExcel 1.8 (último release 2014) declara `php: ^5.2|^7.0`. Usa `$str{0}` (curly brace string offset) que PHP 8.0 eliminó. ~215 ocurrencias en `Classes/`.

### Decisión
- **A) Migrar a PhpSpreadsheet** (correcto): `composer require phpoffice/phpspreadsheet` + reescribir `Examples/`. Invasivo.
- **B) Parchear curly-braces** (rápido): suficiente si los modelos invocan PHPExcel solo vía HTTP curl a `Examples/*.php` (no `require` directo). **Camino aplicado en este proyecto.**
- **C) Fork no oficial**: riesgoso.

### Patrones
| Viejo | Nuevo | Notas |
|---|---|---|
| `$str{0}` | `$str[0]` | mayoría |
| `$str{$i}` | `$str[$i]` | bastantes |
| `$str{$i+1}`, `$str{++$i}` | `$str[$i+1]`, `$str[++$i]` | ~10 |
| `"$x{$arr['k']}"` (interpolación dentro de string) | **NO TOCAR** | minoritario — restaurar si se rompió |

### Riesgo del regex
**Crítico:** `{$var['k']}` ES VÁLIDO dentro de strings double-quoted (interpolación). Pass 1 puede romperlo a `[$var['k']]`. Pass 3 lo restaura.

### Script (3 pases)
```powershell
$root = "mPDF\PHPExcel-1.8\Classes"

# Pass 1 — variable simple {0} o {$x}
$rx1 = [regex]'(\$[a-zA-Z_]\w*(?:\[[^\]]+\]|->[a-zA-Z_]\w*)*)\{(\d+|\$[a-zA-Z_]\w*(?:\[[^\]]+\]|->[a-zA-Z_]\w*)*)\}'
Get-ChildItem -Path $root -Recurse -Filter "*.php" | ForEach-Object {
    $c = [System.IO.File]::ReadAllText($_.FullName)
    $new = $rx1.Replace($c, '$1[$2]')
    if ($new -ne $c) { [System.IO.File]::WriteAllText($_.FullName, $new) }
}

# Pass 2 — expresiones aritméticas {$x+1}, {++$x}
$rx2 = [regex]'(\$[a-zA-Z_]\w*(?:\[[^\]]+\]|->[a-zA-Z_]\w*)*)\{(\+\+\$\w+|\-\-\$\w+|\$\w+\s*[+\-]\s*\d+|\$\w+\s*[+\-]\s*\$\w+)\}'
Get-ChildItem -Path $root -Recurse -Filter "*.php" | ForEach-Object {
    $lines = [System.IO.File]::ReadAllLines($_.FullName)
    $changed = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $newLine = $rx2.Replace($lines[$i], '$1[$2]')
        if ($newLine -ne $lines[$i]) { $lines[$i] = $newLine; $changed = $true }
    }
    if ($changed) { [System.IO.File]::WriteAllLines($_.FullName, $lines) }
}

# Pass 3 — RESTAURAR interpolaciones rotas: "...[$var[...]]..." → "...{$var[...]}..."
$rxBroken = [regex]'\[(\$[a-zA-Z_]\w*\[(?:''[^'']+''|"[^"]+")(?:\]\[(?:''[^'']+''|"[^"]+"))*\])\]'
Get-ChildItem -Path $root -Recurse -Filter "*.php" | ForEach-Object {
    $lines = [System.IO.File]::ReadAllLines($_.FullName)
    $changed = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '"' -and $rxBroken.IsMatch($lines[$i])) {
            $newLine = $rxBroken.Replace($lines[$i], '{$1}')
            if ($newLine -ne $lines[$i]) { $lines[$i] = $newLine; $changed = $true }
        }
    }
    if ($changed) { [System.IO.File]::WriteAllLines($_.FullName, $lines) }
}

# Verificación
Get-ChildItem -Path $root -Recurse -Filter "*.php" | ForEach-Object {
    $r = & php -l $_.FullName 2>&1 | Out-String
    if ($r -notmatch "No syntax errors") { Write-Host "FAIL: $($_.Name)" }
}
```

### Verificación final
```bash
grep -rEn '\$[a-zA-Z_]\w*\{[0-9]' mPDF/PHPExcel-1.8/Classes/    # debe ser 0
grep -rEn '\$[a-zA-Z_]\w*\{\$' mPDF/PHPExcel-1.8/Classes/        # debe ser 0
```

### Warnings/Deprecated residuales del lib (post curly-brace) — fix en raíz
Tras parchear curly-braces, el lib aún inunda `error_log` en PHP 8.x con 2 patrones recurrentes (NO fatales pero cientos de líneas por request, disparados al escribir celdas numéricas):

| Archivo:línea | Síntoma | Causa | Fix |
|---|---|---|---|
| `Classes/PHPExcel/Cell/DefaultValueBinder.php:82` | `Warning: Trying to access array offset on value of type int/float` | `$pValue[0] === '='` cuando `$pValue` es int/float | `} elseif (is_string($pValue) && strlen($pValue) > 1 && $pValue[0] === '=') {` (guard `is_string` + `strlen` antes del offset) |
| `Classes/PHPExcel/Writer/Excel2007/StringTable.php:61` | `Deprecated: Implicit conversion from float ... to int loses precision` | `isset($aFlippedStringTable[$cellValue])` usa float como key ANTES del check de datatype | Mover el check `getDataType()==TYPE_STRING/STRING2/NULL` **antes** del `!isset($aFlippedStringTable[$cellValue])` → numéricos cortocircuitan y nunca usan float como key |

Ambos son globales (un fix sirve para todos los Examples). Requieren re-subir los 2 archivos de `Classes/` vía FTP. Otros Deprecated del lib (`Calculation.php:2077` propiedad dinámica `$_debugLog`, `WorksheetIterator` return types) NO son fatales en 8.2 y los silencia el `error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED)` que PDF-TEMPLATE pone en el header del Example.

### Después del patch
Para cada script en `mPDF/PHPExcel-1.8/Examples/` invocado por modelos vía curl, aplicar `[PDF-TEMPLATE]`. Archivos típicos:
- `Format_PADRON.php` (BD_Cat::IN___)
- `Format_SNT_*.php` (Expediente)
- `Format_CPE_*.php` (Expediente)
- `Liquidacion_Solicitud.php`, `Liquidacion_PROV.php` (Expediente)
- `Crear-SBS.php` (Recaudacion)

### Prompt sugerido
```
Aplica PHPEXCEL-PATCH a mPDF/PHPExcel-1.8
```

---

## 10. `[CONFIG]` — `.yml`, `.ini`, `.env`

No suelen requerir cambios para PHP 8.2. Verificar manualmente:
- `framework.debug: true` en local; `false` en prod
- Conexión BD: `host`, `port`, `user`, `pass` válidos
- Paths absolutos: `/home/usuario/...` solo válidos en server

### Prompt sugerido
```
Revisa <archivo>.yml para PHP 8.2 / producción
```

---

## 11. `[ERROR-HANDLING]` — errores 500 silentes post-migración

### Síntoma
Cualquier excepción/error en Models o Controllers responde **500 vacío** sin file/line. Antes de migrar mostraba la traza.

### Causa
`Start.php` registra `Symfony\Component\ErrorHandler\ErrorHandler::register()` siempre, pero `Debug::enable()` solo se llama si `framework.debug: true`. Sin debug, ErrorHandler captura excepciones y responde 500 silente. Además `MicroApp::run()` y `Router::executeController()` no tenían try/catch, así que la excepción nunca se transformaba en JSON estructurado para el front.

### Fix (estado actual del código)

**1. `Ocrend/Kernel/Config/Ocrend.ini.yml`** — `framework.debug: true` en local, `false` en prod.

**2. `api/MicroApp.php::run()`** — try/catch `\Throwable`. Siempre `error_log(...)`. Cuando `debug=true` responde JSON con `{success:0, error, type, file, line, app, trace}`; cuando `debug=false` responde `{success:0, error:'Error interno del servidor'}`.

**3. `Ocrend/Kernel/Router/Router.php::executeController()`** — mismo patrón. En debug rethrow (para que la página HTML de `Debug::enable()` aparezca con stacktrace). En prod 500 plano.

**4. Helper `firstAppFrame($e)`** — tanto en MicroApp como en Router, recorre el stacktrace y devuelve el **primer frame dentro de `app/models/` o `app/controllers/`**. Surface como campo `app: {file, line, function, layer}` en el JSON. **Crítico** porque el throw site (`$e->getFile()/getLine()`) muchas veces está en vendor (PDO, Symfony, mPDF) y no en código del proyecto. `app.file/line` apunta directamente a tu modelo/controller responsable.

### JSON de respuesta (debug=true)
```json
{
  "success": 0,
  "error": "Cannot access offset of type string on string",
  "type": "TypeError",
  "file": "...\\app\\models\\Ventas.php",
  "line": 213,
  "app": {
    "file": "...\\app\\models\\Ventas.php",
    "line": 213,
    "function": "app\\models\\Ventas->Cat_vender",
    "layer": "model"
  },
  "trace": [...]
}
```

`app=null` solo si la excepción nunca tocó código de `app/`. En ese caso revisar `trace` completo.

### Caveat
XAMPP local tiene `display_errors=On` en `php.ini`. Warnings/Notices de PHP se imprimen ANTES del JSON y rompen `JSON.parse` en el front. Fix: agregar `ini_set('display_errors', '0');` al top de `api/index.php`. Errores siguen yendo a `error_log`. Las páginas HTML de `Debug::enable()` no dependen de ese flag.

### Prompt sugerido
```
Aplica ERROR-HANDLING
# o si ya está aplicado y solo quieres ajustar comportamiento:
Revisa el catch de MicroApp/Router
```

---

## 12. Patrones manuales (no batchables)

| Síntoma | Causa probable | Cómo encontrar |
|---|---|---|
| Variable usada sin declarar | Copy-paste con params distintos | grep `function X(` y verificar params vs uso |
| `$select_result[0]['col']` sin validar | Falta `false !== $rows` | Buscar `$x = $this->db->select(`, ver siguiente offset access |
| `$response['k']` post-`json_decode($curl)` | Curl devolvió binario o HTML, no JSON | Buscar `json_decode` + offset access en mismo bloque |
| `$cpe[0]['estado']` sin chequear `$cpe` | Branch que no validó el select | Análisis manual del flujo |
| Inyección SQL `"id='$var'"` | Pre-existente, NO es PHP 8.x | No tocar salvo pedido explícito |
| `money_format('%i', $var)` fatal | Removida en PHP 8.0. Aparece en PHPExcel/Siniestros | grep `money_format` → reemplazar con `number_format((float)$var, 2, '.', ',')` |
| `$cat = explode("-", $X['AsociadoCertificadoID']); if ($cat[1]...)` sin guard | `AsociadoCertificadoID` puede ser `""` → `explode` retorna `[""]` → `$cat[1]` undefined → `ErrorException` en PHP 8 | grep `explode.*AsociadoCertificadoID` — verificar que cada bloque `$cat[1]` esté dentro de `if (count($cat) > 1)`. Fix: envolver serie-determination + DB select con ese guard. Si `$var = false` es posible en rama sin guard, inicializar antes: `$var = false;` |

---

## 13. Tabla de prompts rápidos

| Quiero arreglar... | Prompt exacto |
|---|---|
| Archivo del Kernel Ocrend | `Aplica OCREND-CORE a Ocrend/Kernel/<ruta>` |
| Dependencias del framework | `Aplica OCREND-COMPOSER` |
| `api/` con Silex | `Aplica API-SILEX a api/` |
| Un controller | `Aplica CONTROLLER a app/controllers/<archivo>` |
| Un modelo | `Aplica MODEL a app/models/<archivo>` |
| Template de PDF o endpoint JSON | `Aplica PDF-TEMPLATE a mPDF/<archivo>` |
| Librería mPDF | `Aplica MPDF-UPDATE` |
| Librería PHPExcel | `Aplica PHPEXCEL-PATCH a mPDF/PHPExcel-1.8` |
| YAML/INI de config | `Revisa <archivo>.yml para PHP 8.2 / producción` |
| Errores 500 silentes | `Aplica ERROR-HANDLING` |
| Bug específico de un método | `Revisa el método <X> en <archivo> que tira 500` |
| Archivo de FileZilla temp | `Aplica <PROCEDIMIENTO> a C:\Users\migue\AppData\Local\Temp\fz3temp-3\<archivo>` |

### Flujo objetivo (3-4 tool calls por archivo)
1. Leer archivo (1 tool call)
2. Aplicar script PowerShell (1 tool call)
3. `php -l` (1 tool call)
4. Reportar conteos (respuesta breve)

---

## 14. Rutas y verificación

### Rutas típicas
| Origen | Path local | Path producción |
|---|---|---|
| FileZilla temp | `C:\Users\migue\AppData\Local\Temp\fz3temp-3\<archivo>` | varía |
| Proyecto local | `C:\xampp\htdocs\sys_Afocat\<carpeta>\<archivo>` | `/home2/afoca4w2/public_html/erp/<carpeta>/<archivo>` |

### Verificación end-to-end
```powershell
# Sintaxis de TODOS los PHP modificados
Get-ChildItem -Path "<carpeta>" -Recurse -Filter "*.php" | ForEach-Object {
    $r = & php -l $_.FullName 2>&1 | Out-String
    if ($r -notmatch "No syntax errors") { Write-Host "FAIL: $($_.FullName)`n$r" }
}

# Smoke test web
Invoke-WebRequest -Uri "http://localhost:8080/sys_Afocat/" -UseBasicParsing
Invoke-WebRequest -Uri "http://localhost:8080/sys_Afocat/logout/" -MaximumRedirection 0 -UseBasicParsing  # 302

# Producción — error_log
# Descargar /home2/afoca4w2/public_html/erp/error_log via FTP, leer últimas 30 líneas
```

---

## 14b. Procedimientos Frontend (JS / HTML / CSS)

> Se aplican vía `/frontend-upgrade`, que **pregunta el nivel** (modernize/restructure/redesign). Reglas machine-readable en `frontend-rules.json`; scan vía MCP `frontend_scan`. Corrector: agente `frontend-migrator` (máx 2 archivos). Cada regla lleva `level` y `category`.

### `[JS-MODERNIZE]` — `**/*.js`
**Nivel modernize.** Qué arregla:
- `var` → `let`/`const` (revisar scope antes; no auto-ciego).
- `==`/`!=` → `===`/`!==` (salvo comparación intencional con null).
- `document.write()` → `createElement`/`innerHTML` sobre contenedor.
- `$.ajax/$.get/$.post` → `fetch()` + async/await (mantener manejo de códigos API 1/2/3/6/7/99).
- jQuery `.live/.bind/.delegate` → `.on()`/`.off()` o `addEventListener`.
- `escape/unescape` → `encodeURIComponent`/`decodeURIComponent`.
- `eval()` → evitar (XSS); `new Array()/Object()` → `[]`/`{}`; quitar `console.log` de prod.

**Verificación:** si hay `eslint` en el proyecto, correrlo; si no, revisión visual. No agregar deps.

### `[HTML-STRUCTURE]` — `views/**/*.{html,htm,twig,phtml}`
**Niveles modernize→restructure.** Qué arregla:
- Tags deprecados `center/font/marquee/big/strike/tt` → semántico + CSS.
- `<img>` sin `alt`, `<html>` sin `lang` (a11y).
- Twig: `{% spaceless %}` → `{% apply spaceless %}…{% endapply %}` (Twig 3). `|raw` → revisar XSS.
- **restructure:** extraer `onclick=`/handlers inline a archivo JS (`addEventListener`); extraer `style=` inline a clase CSS.

**No romper:** rutas de assets que el PHP referencia, sintaxis Twig 3, encoding (BOM antes de `<?php` rompe render — ver `[CONTROLLER]`).

### `[CSS-CLEANUP]` — `**/*.{css,scss}`
**Niveles modernize→restructure.** Qué arregla:
- Prefijos de proveedor obsoletos (`-webkit-border-radius`, etc.) → propiedad estándar.
- **restructure:** `!important` → aumentar especificidad/reordenar; `font-size: Npx` → `rem`.
- Dedupe de reglas repetidas.

**Ruido:** themes admin (`app-assets/`) generan miles de `!important`/inline. Scopear `path` al CSS propio o filtrar `severity:"warning"`.

### `[FRONTEND-REDESIGN]` — re-maquetado (solo nivel redesign)
**Nivel redesign. Alto riesgo, subjetivo.** Qué cubre:
- Layout `float`/tablas-de-layout → flexbox/grid; responsive/breakpoints.
- **EXIGE spec de diseño por pantalla**: layout objetivo, breakpoints, referencia visual. El agente `frontend-migrator` **rechaza redesign sin spec**.
- Siempre mostrar antes/después. Nunca re-maquetar a ciegas. No cambiar copy ni lógica.

---

## 15. Historial de migraciones aplicadas

| Área | Estado | Notas |
|---|---|---|
| `Ocrend/composer.json` | ✓ | Twig 3, Symfony 6.4, PHPMailer 6 |
| `Ocrend/Kernel/` | ✓ | Twig namespaces, ErrorHandler, AllowDynamicProperties (ver `cambios-realizados-ocrend.md`) |
| `api/` (Silex) | ✓ | Reemplazado por `MicroApp.php` |
| `api/http/post.php` | ✓ | Reformat 2-líneas (219 routes), 7 duplicados detectados (2 con handlers distintos = bugs) |
| `app/controllers/*` | ✓ | `sizeof→count` + BOM removido |
| `app/models/*` (locales) | ✓ | `sizeof→count` |
| `app/models/Liquidacion_New.php` (FTP) | ✓ | sizeof + null-wrappers + bug `Get_Correlativo_*` + curl response |
| `app/models/Ventas.php` (FTP) | ✓ | null-wrappers + 2 validaciones `json_decode` (Emision_BOLETO, get_PDF) |
| `mPDF/*` templates | ✓ | 10+ archivos con universal fixes + null-wrappers |
| `mPDF/gene_cat_boleta*.php` (FTP) | ✓ | Solo faltaba `$mpdf->Output('F')` + JSON response |
| `mPDF/resumen_boletas.php` (FTP) | ✓ | Endpoint SUNAT (XML, no PDF). display_errors + helpers + `is_array($data)` |
| `mPDF/vendor` | ✓ | mpdf v8.3.1 |
| `mPDF/PHPExcel-1.8/Classes/` | ✓ | 226 reemplazos curly-brace + 4 restauraciones interpolación, 215 archivos parsean en PHP 8.2 |
| `[ERROR-HANDLING]` (MicroApp + Router) | ✓ | try/catch + `firstAppFrame` + campo `app` en JSON |
| `mPDF/PHPExcel-1.8/Examples/Format_SNT_COFIDE.php` (FTP) | ✓ | PDF-TEMPLATE + `money_format→number_format` (manual) |
| `mPDF/PHPExcel-1.8/Examples/Format_CPE_SUNAT.php` (FTP) | ✓ | PDF-TEMPLATE + guard `DateTime::createFromFormat` false + `substr` null-safe |
| `Classes/PHPExcel/Cell/DefaultValueBinder.php` (FTP) | ✓ | `$pValue[0]` guard `is_string` — mata Warning offset int/float (§9) |
| `Classes/PHPExcel/Writer/Excel2007/StringTable.php` (FTP) | ✓ | reorden datatype-check antes de isset — mata Deprecated float→int key (§9) |
| `app/models/Expediente.php` (FTP) | ✓ | MODEL + IRouter nullable + 10× `explode/AsociadoCertificadoID` sin guard `count($cat)>1` |
| **`panel_PA/` (proyecto Ocrend hermano en xampp/htdocs)** | ✓ | Migración COMPLETA local: COMPOSER + OCREND-CORE (Kernel 13 archivos) + API-SILEX (MicroApp copiado) + MODEL + PDF-TEMPLATE. 47 archivos `php -l` OK. Boot verificado hasta capa DB (500 = `Unknown database`, no migración). Prueba que el toolkit es reutilizable en otro proyecto Ocrend |

---

## 16. Hallazgos cross-cutting

- **Idempotencia helpers PDF-TEMPLATE:** sin guard `if ($c -notmatch '# === Helpers PHP 8.x null-safety')` se duplica el bloque al re-correr. Aplicado en §7.
- **PDF-TEMPLATE alcance:** aplica a CUALQUIER endpoint POST que reciba `php://input` (templates mPDF, endpoints SUNAT, anulación, resumen). Los pasos no relevantes (ceros, mpdf->Output) son no-ops seguros.
- **Throw site ≠ frame de aplicación:** `$e->getFile()/getLine()` muchas veces apunta a vendor. El helper `firstAppFrame` (§11) recorre el trace para devolver el primer frame en `app/models/` o `app/controllers/`. Crítico para diagnóstico rápido.
- **PHP routing case-sensitive:** `Group-Object` en PowerShell por defecto es case-insensitive — usar `-CaseSensitive` al detectar duplicados de rutas.
- **`{$var['k']}` dentro de strings double-quoted** es interpolación válida; el regex `[PHPEXCEL-PATCH]` Pass 1 lo rompe — Pass 3 lo restaura.
- **`framework.debug` controla mucho más que mensajes:** sin él, `Debug::enable()` no corre, ErrorHandler responde 500 silente. En local poner `true`, en prod `false`.
- **error_log inundado ≠ fatal:** un `error_log` con miles de líneas de un Example puede ser 100% Warning/Deprecated del lib `Classes/`, cero del Example. Antes de tocar el Example, agrupar el log por `archivo:línea` — si todo apunta a `Classes/`, el fix real es en el lib (§9), no en el Example. El Example solo necesita `error_reporting(... & ~E_DEPRECATED)` para no derramar el ruido al response.
- **Offset/key sobre numérico en lib PHPExcel:** PHP 8 convierte en Warning (`$x[0]` sobre int/float) o Deprecated (float como key de array) lo que en PHP 7 era silencioso. Patrón de fix: anteponer guard de tipo (`is_string`) o reordenar la condición para que el caso numérico cortocircuite antes del acceso. Ver `DefaultValueBinder.php:82` y `StringTable.php:61` (§9).
- **Toolkit reutilizable en cualquier proyecto Ocrend:** MCP `deprecation_scan`/`php_lint` aceptan ruta absoluta (o `AFOCAT_PROJECT_ROOT`); el Kernel Ocrend es idéntico entre proyectos salvo los cambios de migración (verificado con `diff` panel_PA vs sys_Afocat: único delta = Twig ns + sizeof→count + getName). `MicroApp.php` es agnóstico (namespace `api`) → se copia tal cual. Orden: COMPOSER → OCREND-CORE → API-SILEX → CONTROLLER → MODEL → PDF-TEMPLATE → VERIFY.
- **Ruido de scan: excluir `.cache/` y backups `* (N).php`.** En panel_PA el scan crudo dio 456 findings; excluyendo `app/templates/.cache/` (Twig compilado, regenera) y archivos duplicados tipo `Start (1).php` bajó a 180 reales. Los compilados Twig 2 en `.cache/` NO los carga Twig 3 (distinto hash de cache key) → inertes, no fatales.
- **dynamic-property falso positivo por herencia:** `#[\AllowDynamicProperties]` en las clases base `Kernel/Models/Models.php` y `Kernel/Controllers/Controllers.php` se hereda por todos los models/controllers concretos. El scanner (regex) sigue marcando cada `$this->x` dinámico en las subclases pero ya están cubiertos — no tocar.
- **500 de DB ≠ 500 de migración:** un 500 tras migrar puede ser la página de Symfony ErrorHandler por `Unknown database` (entorno), no código. Distinguir: `framework.debug: true` + leer `C:\xampp\apache\logs\error.log` (los `[php:notice] ... [critical] Uncaught Exception` salen ahí aunque el Router devuelva 500 plano). Si el boot llega hasta la capa DB, la migración PHP 8.2 está OK.
- **Whitespace antes de `<?php` en templates mPDF:** `gene_Comprimido.php` tenía una línea en blanco antes de `<?php` → output antes de headers ("headers already sent"). Al aplicar PDF-TEMPLATE, recortar todo lo previo a `<?php`.
- **Falsos positivos del scan en comentarios y firmas ya-nullable (v1.1):** `deprecation_scan`/`frontend_scan` matcheaban dentro de docblocks (`* ... Twig_Extension`) y código comentado (`// substr(...)`), y `non-nullable-default-null` marcaba firmas que YA eran `?Tipo $x = null`. Inflaba el conteo "fatal" ~10×. Fix en el engine: `isCommentLine()` skipea líneas que arrancan con `//`/`*`/`/*`/`{#`; y el regex de `non-nullable-default-null` lleva lookbehind `(?<!\?)(?<!\?\\)` para ignorar `?IRouter`/`?\Throwable`. En erp__Fasmot esto bajó CORE 10→3 y reveló que los reales eran solo constructores `IRouter $router = null` sin `?` (fix: `?IRouter`, idéntico al de OCREND-CORE).
- **erp__Fasmot ya corría en PHP 8.2:** `php -l` limpio salvo `mPDF/PHPExcel-1.8/Examples/phpword/.../PHPWord-master/` (lib vendorizada anidada, 23 archivos, probable no usada → `skip`). Los null-safety (`strtotime/substr/str_pad` con posible null) son **deprecation PHP 8.1, NO fatal en 8.2** (rompen en PHP 9); se endurecen igual por [MODEL] pero no bloquean runtime.
