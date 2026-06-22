# Ocrend Framework 2 — Compatibilidad PHP 8.2

Framework base de sys_Afocat (PHP 7 / MVC + Silex). Esta guia concentra lo especifico del core para correr en PHP 8.2. Complementa `playbook.md` (procedimientos por tipo de archivo).

## Mapa del core

```
Ocrend/Kernel/
├── Config/Ocrend.ini.yml      # DB, sesiones, site, framework.debug
├── Controllers/Controllers.php # base de controllers (Twig loader)
├── Router/Router.php          # ejecuta controllers, manejo de errores
├── Helper/                    # Functions, Files, Strings, etc.
└── (Start.php)                # bootstrap: ErrorHandler::register, Debug::enable
```

## Puntos criticos PHP 8.2 (en orden de impacto)

### 1. Twig 2 -> 3 (FATAL)
Clases `Twig_*` eliminadas. Migrar namespaces (ver playbook OCREND-CORE). Si los `render('x/y')` NO llevan extension `.twig`, crear `TwigAutoExtLoader` y usarlo en lugar de `FilesystemLoader`.

### 2. Symfony Debug -> ErrorHandler (FATAL)
`Symfony\Component\Debug\*` eliminado en 4.4. Usar `Symfony\Component\ErrorHandler\*`. `ExceptionHandler::register()` se elimina (absorbido).

### 3. Silex (FATAL)
Abandonado. `api/` se reescribe con `MicroApp.php` (drop-in, implementa ArrayAccess, misma API `post/get/put/delete/json/run`). Los `api/http/*.php` NO se tocan.

### 4. Propiedades dinamicas (DEPRECATED 8.2, FATAL 9.0)
`Models` y `Controllers` asignan props dinamicas. Anteponer `#[AllowDynamicProperties]` a esas clases base.

### 5. Nullable hints (DEPRECATED 8.4)
`IRouter $router = null` -> `?IRouter $router = null`. Aplica a cualquier type-hint de clase con default null.

### 6. PHPMailer v5 -> v6
`new \PHPMailer` -> `new PHPMailer(true)` + `use PHPMailer\PHPMailer\PHPMailer;`. Metodos a camelCase (`AddAttachment`->`addAttachment`).

## Manejo de errores (clave para diagnostico)

`framework.debug` controla mucho mas que mensajes:
- `true` (local): `Debug::enable()` corre, pagina HTML con stacktrace.
- `false` (prod): ErrorHandler captura y responde **500 silente** si no hay try/catch.

Fix aplicado (estado actual):
- `MicroApp::run()` y `Router::executeController()` con try/catch `\Throwable`.
- Helper `firstAppFrame($e)`: recorre el stacktrace y devuelve el primer frame en `app/models/` o `app/controllers/`. **Critico**: el throw site suele estar en vendor (PDO, Symfony, mPDF), no en tu codigo. El campo `app:{file,line,function,layer}` del JSON apunta al responsable real.
- En debug=true: JSON `{success:0, error, type, file, line, app, trace}`. En prod: `{success:0, error:'Error interno del servidor'}`.

Caveat: XAMPP local trae `display_errors=On`. Warnings se imprimen ANTES del JSON y rompen `JSON.parse`. Fix: `ini_set('display_errors','0')` al top de `api/index.php`.

## Configuracion (Ocrend.ini.yml)

```yaml
database: { host, user, pass, name, port, motor: mysql }   # db_afocat, localhost:8080
sessions: { unique: 0CR3ND2011, life_time: 28800 }          # 8h
site:     { url, timezone: America/Lima }
framework: { debug: true|false }                            # true local / false prod
```

## Sesiones (auditar en migracion)

- `life_time: 28800` (8h). Verificar `session.gc_maxlifetime` coherente en PHP 8.
- Clave `unique: 0CR3ND2011` — id de sesion del framework.
- Login: max 3 intentos, bloqueo 30 min (modelo `Users.php`).
- Control de accesos por `tabla modulos` (checkbox por usuario: `Ven_CAT`, `Print_Acc`, etc.).
- PHP 8: revisar `session_set_cookie_params` (firma cambio a array en 7.3+), flags `HttpOnly`/`Secure`/`SameSite`.

## Convenciones que afectan la migracion

- Namespaces: `app\models` / `app\controllers`.
- Tablas certificados DINAMICAS: `__SERIE_AÑO` (`__FL_2023`, `__YF_2019`). El scan de DB debe enumerarlas.
- Respuestas API: `1`=OK, `2`=error logico, `3`=excepcion, `6`=advertencia, `7`=config, `99`=no auth.
- PDFs/Excel: generados via curl a `Examples/*.php` y `mPDF/*.php` (no require directo) -> por eso PDF-TEMPLATE aplica a esos endpoints.

## Rutas prod vs local

| | Local | Prod (DigitalOcean) |
|---|---|---|
| Raiz | `c:\xampp\htdocs\sys_Afocat\` | `/home2/afoca4w2/public_html/erp/` |
| FTP temp (FileZilla) | `C:\Users\migue\AppData\Local\Temp\fz3temp-*\` | — |
