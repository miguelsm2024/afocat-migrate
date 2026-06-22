---
name: migrate-project
description: Migra un proyecto Ocrend COMPLETO a PHP 8.2 de punta a punta, en el orden correcto de dependencias (composer, core, api, controllers, models, templates, verify). Orquesta los procedimientos del playbook sobre todo el proyecto, no un solo archivo. Funciona sobre cualquier proyecto Ocrend (no solo sys_Afocat) apuntando con ruta absoluta o AFOCAT_PROJECT_ROOT. Triggers: "migrar todo el proyecto", "migrate-project", "migrar panel_PA / sys.Transportes", "aplicar toda la migracion a <ruta>".
---

# migrate-project

Pipeline end-to-end para migrar un proyecto Ocrend entero a PHP 8.2. A diferencia de `migrate-file` (un archivo), este orquesta el orden completo. Probado en `panel_PA` (proyecto Ocrend hermano de sys_Afocat) — ver playbook §15.

## Apuntar a otro proyecto
Tres formas (el MCP y los procedimientos son agnosticos del proyecto):
1. **Ruta absoluta por llamada** — `deprecation_scan path="C:\xampp\htdocs\OtroProyecto"`. Sin reinstalar nada.
2. **`AFOCAT_PROJECT_ROOT`** apuntando al otro proyecto antes de lanzar Claude Code.
3. **Lanzar Claude Code desde el dir del otro proyecto** (cwd lo toma solo).

## Pre-requisitos / seguridad
- Confirmar respaldo: git init + commit, copia `.bak`, o que el usuario tenga respaldo externo. NO migrar in-place sin confirmar.
- Confirmar que el proyecto es Ocrend (`Ocrend/Kernel/` presente). Si NO es Ocrend, solo aplica la capa generica (deprecation_scan + null-safety); el playbook Ocrend (Silex/Twig/PHPExcel/mPDF) no transfiere.
- `php -v` debe ser >= 8.2 en local.

## Pipeline (orden estricto por dependencia)

```
0. SCAN + LIMPIEZA
   - deprecation_scan (excluye .cache + dups por default) -> scope real
   - NO borrar .cache/ ni "* (N).php" sin backup; solo se excluyen del scan
1. OCREND-COMPOSER  composer.json -> php>=8.2, twig ^3, symfony ^6.4, phpmailer ^6; quitar silex + symfony/debug
                    composer update --with-all-dependencies --ignore-platform-req=ext-gd
2. OCREND-CORE      Ocrend/Kernel/** (bloquea todo lo demas)
3. API-SILEX        copiar MicroApp.php + reescribir api/index.php
4. CONTROLLER       app/controllers/* (sizeof + BOM)
5. MODEL            app/models/* (null-safety wrappers + ?IRouter + guards)
6. PDF-TEMPLATE     mPDF/*.php, Examples/*.php
7. VERIFY           php_lint todo (0 errores) + smoke http
```

## Atajos seguros (proyecto Ocrend hermano)
- El **Kernel Ocrend es identico entre proyectos** salvo los cambios de migracion. `diff <proyecto>/Ocrend/Kernel/<f> sys_Afocat/Ocrend/Kernel/<f>` — si el unico delta son Twig ns / sizeof / getName, los edits son los mismos.
- `api/MicroApp.php` es agnostico (namespace `api`): se **copia tal cual** desde un proyecto ya migrado.
- `vendor/` NO se copia entre proyectos por costumbre — correr `composer update` limpio (genera lock correcto).

## OCREND-CORE — transforms batcheables (PowerShell, sobre Kernel, excluir "* (N).php")
- `\Twig_Environment`->`\Twig\Environment`, `\Twig_Loader_Filesystem`->`\Twig\Loader\FilesystemLoader`, `\Twig_Extension_Debug`->`\Twig\Extension\DebugExtension`, `\Twig_Extension`->`\Twig\Extension\AbstractExtension`, `\Twig_Function`->`\Twig\TwigFunction`
- `sizeof(`->`count(` ; `final private function`->`private function` ; `IRouter $router = null`->`?IRouter $router = null`
Manual: Start.php (Symfony Debug ns -> ErrorHandler ns, quitar `ExceptionHandler::register()`); Emails.php (`use PHPMailer\PHPMailer\PHPMailer;`, `new PHPMailer(true)`, `AddAttachment`->`addAttachment`); Functions.php (`RedirectResponse::create($u)->send()` -> `(new RedirectResponse($u))->send()`, `func_get_arg`->`mixed ...$args`); `#[\AllowDynamicProperties]` en clases base `Kernel/Models/Models.php` y `Kernel/Controllers/Controllers.php` (lo heredan los concretos).

## Diagnostico de 500 post-migracion
Un 500 NO siempre es migracion. Distinguir:
1. `framework.debug: true` en Ocrend.ini.yml (local).
2. Pegar request y leer `C:\xampp\apache\logs\error.log` — los `[php:notice] ... [critical] Uncaught Exception` salen ahi aunque el Router devuelva 500 plano.
3. Si dice `Unknown database '...'` -> es entorno (DB no importada), NO codigo. La migracion PHP 8.2 esta OK si el boot llega a la capa PDO.
4. Revertir debug a `false` (prod-safe) al terminar.

## Falsos positivos conocidos
- `dynamic-property` en models/controllers concretos: ya cubierto por `#[\AllowDynamicProperties]` heredado. No tocar.
- `json-decode-curl-offset` cuando el resultado no se accede por offset o esta guardado por `isset()`: seguro.
- `weak-hash` (md5/sha1) usado para tokens / nombres de archivo (no passwords): benigno, reportar sin cambiar (cambiarlo rompe referencias existentes).
- Templates `Generator/Templates/*.php` con `{{placeholder}}` Mustache: nunca parsean por diseno, excluir del lint.

## Reglas
- Un procedimiento a la vez, `php_lint` despues de cada paso pesado (core, models).
- Reportar al final: tabla por procedimiento + conteo `php -l` + resultado del smoke.
- Auto-actualizar el playbook (§15 historial + §16 hallazgos) antes de cerrar si hubo descubrimientos.
