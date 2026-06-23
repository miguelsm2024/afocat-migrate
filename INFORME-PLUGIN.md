# Informe del plugin `afocat-migrate` — Migración a PHP 8.2 (Ocrend / sys_Afocat)

> Documento de traspaso. Reúne TODO lo necesario para entender para qué existe este
> plugin, cómo está construido y cómo continuar con el objetivo inicial sin redescubrir
> contexto. Pensado para anexarse a la nueva ubicación de `Migrate_Php_8/`.
>
> Fecha: 2026-06-22 · Autor: miguelsm2024 (elwar001@gmail.com) · Versión plugin: 1.1.0

---

## 1. Objetivo del plugin (para qué está destinado)

Llevar proyectos **Ocrend Framework 2** (PHP 7 / MVC + Silex) a **su siguiente nivel**,
**backend y frontend**, de forma **ordenada, repetible y con consumo mínimo de tokens**:

- **Backend:** migración a **PHP 8.2** (deprecaciones, null-safety, Twig/Symfony, Silex→MicroApp).
- **Frontend (v1.1):** análisis global + corrección de **JS/CSS/HTML/Twig** por **niveles**
  (`modernize` ⊂ `restructure` ⊂ `redesign`). El plugin **siempre pregunta hasta dónde llegar**
  con el frontend (vía `/frontend-upgrade`); nunca asume el nivel.

Flujo histórico (v1.0, sigue vigente):

- **Origen:** `sys_Afocat` (ERP del cliente AFOCAT, sobre Ocrend 2).
- **Alcance probado:** reutilizable en **cualquier proyecto Ocrend** de `xampp/htdocs`.
  Ya validado en `panel_PA` (proyecto Ocrend hermano). Siguiente objetivo: `sys.Transportes`.
- **Filosofía:** el motor (skills/agentes/hooks/MCP) es **agnóstico del proyecto**; solo el
  `knowledge/` está saborizado a Ocrend. Si el proyecto NO es Ocrend, aplica únicamente la
  capa genérica (deprecation scan + null-safety).

El plugin **no es un autofix ciego**: codifica un **playbook** (procedimientos por tipo de
archivo) que un humano descubrió migrando a mano, y lo automatiza parcialmente. La fuente de
verdad es `knowledge/playbook.md`, que se **auto-actualiza** con cada hallazgo nuevo.

---

## 2. Estructura del plugin

```
Migrate_Php_8/
├── .claude-plugin/
│   ├── plugin.json          # manifiesto: nombre, MCP server, hooks
│   └── marketplace.json     # marketplace local para /plugin install
├── .env.example             # plantilla de variables de entorno (copiar a .env)
├── .gitignore               # excluye .env (secretos) y node_modules
├── README.md                # guía de uso e instalación
├── agents/                  # 5 subagentes especializados
│   ├── ocrend-compat.md
│   ├── php-investigator.md
│   ├── php-migrator.md
│   ├── php-reviewer.md
│   └── security-tester.md
├── skills/                  # 8 skills (slash commands)
│   ├── migrate-scan/SKILL.md
│   ├── migrate-project/SKILL.md
│   ├── migrate-file/SKILL.md
│   ├── migrate-verify/SKILL.md
│   ├── ocrend-check/SKILL.md
│   ├── security-audit/SKILL.md
│   ├── session-audit/SKILL.md
│   └── frontend-verify/SKILL.md
├── hooks/
│   ├── hooks.json           # SessionStart + PostToolUse
│   └── scripts/
│       ├── session-start.ps1  # inyecta contexto de migración al iniciar
│       └── php-lint.ps1       # php -l automático al editar/crear .php
├── knowledge/               # base de conocimiento (fuente de verdad)
│   ├── playbook.md          # procedimientos por tipo de archivo (auto-actualizable)
│   ├── ocrend-php8.md       # específico del core Ocrend
│   └── deprecation-rules.json # reglas machine-readable que consume el MCP
└── mcp/afocat-migrate-mcp/  # MCP server Node (4 tools)
    ├── index.js
    ├── package.json
    └── node_modules/        # deps (gitignored)
```

---

## 3. Componentes en detalle

### 3.1 MCP server (`mcp/afocat-migrate-mcp/index.js`)

Servidor stdio en Node. Expone **4 tools**. Config 100% por variables de entorno
(secretos NUNCA en código ni `plugin.json`). `PROJECT_ROOT` por defecto = `process.cwd()`
(la carpeta desde donde se lanza Claude Code); override con `AFOCAT_PROJECT_ROOT`.

| Tool | Qué hace | Notas clave |
|---|---|---|
| `php_lint` | `php -l` recursivo sobre archivo/carpeta | Excluye `vendor/node_modules/.git/.cache/dist/build` y backups `* (N).php`. Devuelve solo los que fallan. |
| `deprecation_scan` | Aplica `deprecation-rules.json` | Devuelve `file:line`, regla, severidad, fix, playbook. Filtro `severity`. `include_security:true` añade reglas SQLi/XSS/etc. `limit` default 500. |
| `frontend_scan` (v1.1) | Aplica `frontend-rules.json` a JS/CSS/HTML/Twig | Reglas scopeadas por lenguaje (`applies_to`) y por nivel (`level`). Devuelve `file:line`, `lang`, `severity`, `level`, `category`, `fix`. Filtros `level`/`lang`/`severity`. Excluye `vendors/`, `bower_components`, minificados `*.min.*` y libs conocidas (jquery/bootstrap/datatables/etc.). |
| `db_schema` | Introspección MySQL `db_afocat` | Credenciales leídas de `Ocrend.ini.yml` (NO duplicadas en `.env`). Detecta tablas dinámicas `__SERIE_AÑO` (`__FL_2023`). Con `table`: columnas. |
| `ftp_deploy` | Sube archivo migrado a prod vía FTP/FTPS | Credenciales de `.env`. Exige host/user/pass. `dry_run:true` previsualiza la ruta remota sin subir. |

**Exclusiones de scan (importante):** sin excluir `.cache/` el scan se infla ~2.5×
(templates Twig compilados que Twig 3 ni carga). En `panel_PA` el scan crudo dio 456
findings; excluyendo `.cache/` + dups bajó a **180 reales**. Override con `include_all:true`.

### 3.2 Hooks (`hooks/`)

| Hook | Disparador | Acción |
|---|---|---|
| **SessionStart** (`session-start.ps1`) | `startup\|resume` | Inyecta `additionalContext`: ruta del proyecto, ubicación del playbook/reglas/notas, contenido de `migration-state.json` (o aviso si no existe), bloque "En Progreso" de `TASKS.md`, y el flujo recomendado. |
| **PostToolUse** (`php-lint.ps1`) | `Edit\|Write\|MultiEdit` | Corre `php -l` sobre el `.php` editado. Si hay error de sintaxis → `exit 2` + stderr → el modelo lo ve y corrige. Si OK → silencioso. |

> El hook PostToolUse hace que el `php -l` del "flujo objetivo (3-4 tool calls)" sea
> automático: no hay que invocarlo a mano tras cada Edit.

### 3.3 Skills (slash commands)

| Skill | Para qué | Cuándo usar |
|---|---|---|
| `migrate-scan` | Inventario inicial + genera `migration-state.json` priorizado | Al INICIAR o re-evaluar |
| `migrate-project` | Migra un proyecto Ocrend COMPLETO end-to-end (pipeline ordenado) | Recomendado para proyecto nuevo |
| `migrate-file` | Migra UN archivo por el procedimiento del playbook (3-4 tool calls) | Granular, uno por uno |
| `migrate-verify` | Verificación end-to-end (php -l, scan residual, smoke web, error_log) | Antes de subir a prod |
| `frontend-upgrade` (v1.1) | **Corrige** frontend (JS/CSS/HTML/Twig). **Paso 0: pregunta el nivel** modernize/restructure/redesign. Escanea, delega a `frontend-migrator`, verifica | Para elevar el frontend |
| `runtime-audit` (v1.2) | **Plan base post-migración**: diagnostica por evidencia (error.log+curl+integridad) y arregla imprimibles (PDF/XLSX/Word), descargas, errores de consola, vistas 500, reportes que "no terminan". Auto-actualiza el playbook | App ya corre pero fallan funciones reales |
| `ocrend-check` | Compatibilidad del CORE (Twig/Symfony/Silex/errores). Bloquea todo si falla | PRIMERO, antes de models/controllers |
| `security-audit` | Auditoría defensiva (SQLi, XSS, hashes, secretos, uploads, API sin auth) | Transversal |
| `session-audit` | Sesiones Ocrend bajo PHP 8.2 (cookies, gc_maxlifetime, regenerate_id) | Transversal |
| `frontend-verify` | HTML/CSS/JS/Twig consistentes con el backend migrado | Transversal |

### 3.4 Subagentes (`agents/`)

| Agente | Rol | Tools | Límite |
|---|---|---|---|
| `php-investigator` | Localiza riesgos (read-only). Tabla `file:line` por severidad. NO sugiere fixes | Read, Grep, Glob, Bash | Solo localiza |
| `php-migrator` | Aplica fixes mecánicos (MODEL, PDF-TEMPLATE, etc.). Devuelve recibo de cambios | Read, Edit, Write, Grep, Glob, Bash | **Máx 2 archivos**; rechaza 3+ |
| `frontend-migrator` (v1.1) | Aplica fixes frontend por nivel (JS-MODERNIZE, HTML-STRUCTURE, CSS-CLEANUP, FRONTEND-REDESIGN). Recibo de cambios | Read, Edit, Write, Grep, Glob, Bash | **Máx 2 archivos**; **rechaza redesign sin spec de diseño** |
| `php-reviewer` | Revisa regresiones post-migración. 1 línea por hallazgo | Read, Grep, Bash | No reescribe |
| `ocrend-compat` | Checklist PASS/FAIL del core | Read, Grep, Glob, Bash | Read-only + php -l |
| `security-tester` | Barrido de seguridad **defensiva**. Identifica y reporta, NO genera exploits | Read, Grep, Glob, Bash | Solo defensivo |

**Patrón de orquestación por archivo complejo:**
`php-investigator` (localiza) → `php-migrator` (arregla) → `php-reviewer` (valida).

### 3.5 Knowledge base (`knowledge/`)

- **`playbook.md`** — fuente de verdad. Árbol de decisión por ruta de archivo + 10
  procedimientos (`[OCREND-CORE]`, `[OCREND-COMPOSER]`, `[API-SILEX]`, `[CONTROLLER]`,
  `[MODEL]`, `[PDF-TEMPLATE]`, `[MPDF-UPDATE]`, `[PHPEXCEL-PATCH]`, `[CONFIG]`,
  `[ERROR-HANDLING]`). Cada uno trae causas de 500, scripts PowerShell exactos,
  verificación y prompt sugerido. Incluye §15 Historial y §16 Hallazgos cross-cutting.
  **Tiene protocolo de auto-actualización (§ inicial):** antes de cerrar cada tarea, si
  hubo hallazgo nuevo se integra al playbook; si no, se declara "Sin nuevos hallazgos".
- **`ocrend-php8.md`** — específico del core Ocrend: mapa del Kernel, puntos críticos PHP
  8.2 por impacto, manejo de errores, config `Ocrend.ini.yml`, sesiones, rutas prod vs local.
- **`deprecation-rules.json`** — reglas regex (sintaxis JS) que consume `deprecation_scan`. 23 `rules`
  PHP 8.x + 5 `security_rules`. Severidad: `fatal` (rompe runtime) / `warning` (deprecation
  no fatal) / `info` (riesgo lógico) / `high`/`medium` (seguridad).
- **`frontend-rules.json`** (v1.1) — reglas regex JS/CSS/HTML/Twig que consume `frontend_scan`. 22 reglas
  con campos extra `applies_to` (lenguaje), `level` (modernize/restructure/redesign) y `category`
  (legacy/a11y/xss/perf). Severidad `fatal/warning/info`.

---

## 4. Procedimientos del playbook (resumen del árbol de decisión)

| Ruta del archivo | Procedimiento | Qué arregla (resumen) |
|---|---|---|
| `Ocrend/Kernel/**/*.php` | `[OCREND-CORE]` | Twig 2→3, Symfony Debug→ErrorHandler, PHPMailer v6, `final private`, `sizeof`, nullable hints, `#[AllowDynamicProperties]`, variadic, `RedirectResponse::create` |
| `Ocrend/composer.json` | `[OCREND-COMPOSER]` | php≥8.2, twig ^3, symfony/* ^6.4, phpmailer ^6; eliminar silex y symfony/debug |
| `api/index.php`, `api/http/*` | `[API-SILEX]` | Silex (abandonado 2019) → `MicroApp.php` drop-in (ArrayAccess, misma API). Detectar rutas duplicadas (case-sensitive) |
| `app/controllers/*Controller.php` | `[CONTROLLER]` | `sizeof→count`, quitar BOM UTF-8 pre-`<?php` |
| `app/models/*.php` | `[MODEL]` | `sizeof→count`, null-wrappers (strtotime/substr/str_pad/strtoupper/strtolower/mb_strlen/trim/round/intval), `is_array` post json_decode, `false!==$rows` antes de offset, `ceros()` safe |
| `mPDF/*.php`, `Examples/*.php` | `[PDF-TEMPLATE]` | `display_errors` off, helper `_fdate`, validar `$data`, `$mpdf->Output($p,'F')` + JSON. Aplica también a endpoints JSON/SUNAT sin PDF |
| `mPDF/` librería | `[MPDF-UPDATE]` | mPDF ≥8.2 (las viejas usan `$str{0}` eliminado en PHP 8.0) |
| `mPDF/PHPExcel-1.8/Classes/**` | `[PHPEXCEL-PATCH]` | Curly-brace `$str{0}`→`$str[0]` (3 pases, Pass 3 restaura interpolación). Lib abandonada 2014 |
| `.yml`/`.ini` | `[CONFIG]` | Revisión manual (debug, BD, paths) |
| 500 silentes post-migración | `[ERROR-HANDLING]` | try/catch `\Throwable` + `firstAppFrame` + campo `app` en JSON. `framework.debug` |

### Hallazgos cross-cutting clave (de §16 del playbook)
- **`framework.debug` controla mucho más que mensajes:** sin él, `Debug::enable()` no corre,
  ErrorHandler responde **500 silente**. Local `true`, prod `false`.
- **Throw site ≠ frame de aplicación:** `$e->getFile()/getLine()` suele apuntar a vendor
  (PDO, Symfony, mPDF). El helper `firstAppFrame` recorre el trace y devuelve el primer
  frame en `app/models/` o `app/controllers/` → diagnóstico directo.
- **`{$var['k']}` en strings double-quoted es interpolación válida** — el regex curly-brace
  Pass 1 lo rompe, Pass 3 lo restaura. No confundir con `$str{0}`.
- **PHP routing es case-sensitive** (`/Form_Cheque` ≠ `/Form_CHEQUE`). Detectar duplicados
  con `Group-Object -CaseSensitive`. En MicroApp un duplicado **sobreescribe en silencio**.
- **error_log inundado ≠ fatal:** miles de líneas pueden ser 100% Warning/Deprecated del
  lib `Classes/`. Agrupar por `archivo:línea` antes de tocar el Example.
- **500 de DB ≠ 500 de migración:** un 500 puede ser `Unknown database` (entorno), no código.
  Distinguir con `debug:true` + `C:\xampp\apache\logs\error.log`.

---

## 5. Flujo de trabajo

```
/migrate-scan                 # inventario + migration-state.json
  -> /ocrend-check            # core primero (bloquea todo)
  -> /migrate-project         # proyecto entero, pipeline ordenado (recomendado)
     |  o granular:
  -> /migrate-file <archivo>  # uno por uno, por prioridad
       (php-investigator -> php-migrator -> php-reviewer)
  -> /migrate-verify          # confirmar antes de subir
  -> ftp_deploy (MCP)         # a prod
security-audit / session-audit / frontend-verify  # transversales
```

**Pipeline de `migrate-project` (orden estricto por dependencia):**
`SCAN+LIMPIEZA → COMPOSER → OCREND-CORE → API-SILEX → CONTROLLER → MODEL → PDF-TEMPLATE → VERIFY`

**Flujo objetivo por archivo (3-4 tool calls):** leer → aplicar script/Edits → `php -l`
(automático por hook) → reportar conteos.

---

## 6. Instalación y configuración

```powershell
# 1. Dependencias del MCP
cd Migrate_Php_8/mcp/afocat-migrate-mcp
npm install

# 2. Entorno
cp Migrate_Php_8/.env.example Migrate_Php_8/.env
# editar .env: rutas + credenciales FTP (la DB se lee de Ocrend.ini.yml)
# cargar las vars en el entorno ANTES de lanzar Claude Code (el MCP las lee de process.env)

# 3. Registrar el plugin
# /plugin marketplace add c:\xampp\htdocs\sys_Afocat\Migrate_Php_8
# /plugin install afocat-migrate
```

**Variables de entorno (`.env`):**

| Variable | Para qué |
|---|---|
| `AFOCAT_PROJECT_ROOT` | Proyecto destino (default: cwd) |
| `AFOCAT_PHP_BIN` | Ruta a `php.exe` (default: `php`) |
| `AFOCAT_OCREND_INI` | `Ocrend.ini.yml` — de aquí lee `db_schema` las credenciales BD |
| `AFOCAT_FTP_HOST/USER/PASS` | FTP prod (vacíos = deploy deshabilitado; el MCP exige los 3) |
| `AFOCAT_FTP_REMOTE_ROOT` | Raíz remota. Prod actual: `/home2/afoca4w2/public_html/erp` |
| `AFOCAT_FTP_SECURE` | `true` = FTPS |

> Los secretos van SOLO en `.env` (gitignored). Nunca en `plugin.json`. Las credenciales de
> DB NO se duplican en `.env` — se leen de `AFOCAT_OCREND_INI`.

---

## 7. Reutilizar en otro proyecto Ocrend

El motor es agnóstico; solo `knowledge/` está saborizado a Ocrend/sys_Afocat.

1. **Apuntar** (una de tres):
   - Ruta absoluta por llamada: `deprecation_scan path="C:\xampp\htdocs\OtroProyecto"` (sin reinstalar).
   - `AFOCAT_PROJECT_ROOT=C:\xampp\htdocs\OtroProyecto` antes de lanzar Claude Code.
   - Lanzar Claude Code desde el dir del otro proyecto (cwd lo toma).
2. **Confirmar** que es Ocrend (`Ocrend/Kernel/` presente) y que hay respaldo (git/`.bak`/externo).
3. **Correr** `/migrate-project`.

**Qué transfiere y qué no:**
- **Transfiere (cualquier PHP):** `deprecation_scan`, `php_lint`, `ftp_deploy`, null-safety
  wrappers, sizeof/curly-braces, funciones removidas.
- **Solo Ocrend:** el playbook (Silex→MicroApp, Twig/Symfony core, PHPExcel, mPDF),
  `db_schema` (lee `Ocrend.ini.yml`).
- **Atajo verificado:** el Kernel Ocrend es **idéntico** entre proyectos salvo los cambios
  de migración (diff `panel_PA` vs `sys_Afocat`: único delta = Twig ns + sizeof→count +
  getName). `MicroApp.php` (namespace `api`) se copia tal cual.

---

## 8. Estado actual de la migración (de dónde retomar)

### 8.1 `sys_Afocat` — completado
- `Ocrend/composer.json` ✓ · `Ocrend/Kernel/` ✓ · `api/` (MicroApp) ✓
- `app/controllers/*` ✓ · `app/models/*` (locales) ✓
- `app/models/Liquidacion_New.php`, `Ventas.php`, `Expediente.php` (vía FTP) ✓
- `mPDF/*` templates ✓ · `mPDF/vendor` (mpdf 8.3.1) ✓
- `mPDF/PHPExcel-1.8/Classes/` ✓ (226 reemplazos curly-brace, 215 archivos parsean)
- `[ERROR-HANDLING]` (MicroApp + Router + firstAppFrame) ✓
- Fixes raíz lib PHPExcel: `DefaultValueBinder.php:82`, `StringTable.php:61` ✓

### 8.2 `panel_PA` — completado (prueba de reutilización)
Migración COMPLETA local: COMPOSER + OCREND-CORE (13 archivos Kernel) + API-SILEX
(MicroApp copiado, 72 rutas) + MODEL + PDF-TEMPLATE. **47 archivos `php -l` 0 errores.**
Boot verificado hasta capa DB (500 = `Unknown database '__bd_panel_pa'`, entorno, NO migración).

### 8.3 Pendientes (de `TASKS.md`, raíz del proyecto)

**En progreso:**
- [ ] Continuar migración vía FTP: subir `Expediente.php`, otros modelos Siniestros.
- [ ] Importar DB `__bd_panel_pa` a MySQL local para test web completo de `panel_PA`.
- [ ] **Migrar `sys.Transportes`** (otro Ocrend en xampp/htdocs) — mismo pipeline que panel_PA.

**Backlog / bugs conocidos en `Expediente.php`:**
- [ ] L3021-3022 — `strtotime($snt_report_usint[0][0]."+ 1 week")` sin null-safety (la concatenación escapa al regex).
- [ ] L1401-1405 — `$ar_id_snt_carta_garantia[0][0]` post-insert sin guard formal.
- [ ] Gap de años <2015 — rama `$cat[1]` no cubre años anteriores a 2015 (`$tabla` undefined).
- [ ] Revisar otros modelos Siniestros: `Exp_Alerts.php`, Recaudación, Ventas.

**Pendiente de subir vía FTP** (código ya migrado local):
- `Format_CPE_SUNAT.php` → `Examples/`
- `DefaultValueBinder.php` + `StringTable.php` → `Classes/`

### 8.4 Nota importante
`migration-state.json` **NO existe** en la raíz de `sys_Afocat`. El SessionStart hook lo
avisa. Generarlo con `/migrate-scan` al retomar para tener inventario priorizado vivo.

---

## 9. Cómo continuar (próximos pasos sugeridos)

1. **Retomar FTP pendientes de `sys_Afocat`:** subir los 3 archivos de §8.3 con `ftp_deploy`
   (probar con `dry_run:true` primero) y verificar `error_log` de prod.
2. **Cerrar bugs de `Expediente.php`** (§8.3 backlog) con `/migrate-file` o el trío
   investigator→migrator→reviewer.
3. **`panel_PA`:** importar `__bd_panel_pa` y correr `/migrate-verify` con smoke web completo.
4. **`sys.Transportes`:** apuntar el plugin (ruta absoluta o `AFOCAT_PROJECT_ROOT`),
   confirmar Ocrend + respaldo, y correr `/migrate-project`.
5. **Higiene:** generar `migration-state.json` con `/migrate-scan`; mantener el protocolo de
   auto-actualización del `playbook.md` al cerrar cada tarea.

---

## 10. Decisiones de almacenamiento y seguridad

- **Código + knowledge** → en este repo (versionable).
- **Secretos** → `.env` gitignored. Nunca en `plugin.json`.
- **Estado de migración** → `migration-state.json` en la raíz del **proyecto destino**, no en el plugin.
- **Seguridad:** los componentes de seguridad son **defensivos** — identifican y reportan,
  no generan exploits. Contexto autorizado: el dueño audita su propio sistema.

---

## 11. Rutas de referencia

| | Local | Prod (DigitalOcean) |
|---|---|---|
| Raíz | `c:\xampp\htdocs\sys_Afocat\` | `/home2/afoca4w2/public_html/erp/` |
| FTP temp (FileZilla) | `C:\Users\migue\AppData\Local\Temp\fz3temp-*\` | — |
| `php.exe` | `c:\xampp\php\php.exe` | — |
| Apache error.log | `C:\xampp\apache\logs\error.log` | `<raíz prod>/error_log` |
| Config Ocrend | `Ocrend/Kernel/Config/Ocrend.ini.yml` | ídem |

---

*Fin del informe. Fuente de verdad operativa: `knowledge/playbook.md`. Estado vivo de
tareas: `TASKS.md` en la raíz del proyecto.*
