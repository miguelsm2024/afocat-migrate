---
name: ocrend-check
description: Verifica la compatibilidad del CORE de Ocrend Framework 2 con PHP 8.2: Twig 2->3, Symfony Debug->ErrorHandler, Silex->MicroApp, propiedades dinamicas (#[AllowDynamicProperties]), nullable hints, PHPMailer v6, composer.json y la arquitectura de errores (firstAppFrame, framework.debug). Triggers: "revisar Ocrend", "ocrend-check", "core compatible PHP 8", "verificar framework".
---

# ocrend-check

Audita el core del framework (lo que bloquea TODO si falla). Basado en `knowledge/ocrend-php8.md` + playbook OCREND-CORE / OCREND-COMPOSER / API-SILEX / ERROR-HANDLING.

## Checklist (orden de impacto)

1. **composer.json** (`Ocrend/`): `php >=8.2`, `twig/twig ^3`, `symfony/* ^6.4`, `phpmailer ^6`. Eliminar `silex/silex`, `symfony/debug`, versiones `^2/^3`.

2. **Twig 3** (`Ocrend/Kernel/`): cero `Twig_*` (usar deprecation rule `twig-legacy-class`). `TwigAutoExtLoader` si los render no llevan `.twig`.

3. **Symfony ErrorHandler**: cero `Symfony\Component\Debug\*`. `ExceptionHandler::register()` eliminado.

4. **Silex -> MicroApp**: `api/index.php` usa `MicroApp.php`. Detectar rutas duplicadas (PHP routing es case-sensitive; usar `Group-Object -CaseSensitive`).

5. **Propiedades dinamicas**: `#[AllowDynamicProperties]` en `Models` y `Controllers` base.

6. **Nullable hints**: `?Tipo $x = null` (regla `non-nullable-default-null`).

7. **PHPMailer v6**: `new PHPMailer(true)`, metodos camelCase, `use PHPMailer\PHPMailer\PHPMailer;`.

8. **Arquitectura de errores** (ERROR-HANDLING): `MicroApp::run()` y `Router::executeController()` con try/catch `\Throwable` + helper `firstAppFrame`. `framework.debug: true` local / `false` prod. `ini_set('display_errors','0')` en `api/index.php`.

## Verificacion
```powershell
Get-ChildItem "Ocrend\Kernel" -Recurse -Filter "*.php" | ForEach-Object { php -l $_.FullName }
```
O MCP `php_lint path:"Ocrend/Kernel"` + `deprecation_scan path:"Ocrend"`.

## Reporte
PASS/FAIL por item. El core debe estar 100% antes de migrar models/controllers (si el core rompe, nada arranca).
