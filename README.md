# afocat-migrate

Plugin de Claude Code para migrar proyectos **Ocrend 2** a **PHP 8.2** de forma ordenada: skills, subagentes, hooks y un MCP server. Origen: **sys_Afocat**, pero reutilizable en **cualquier proyecto Ocrend** (probado en `panel_PA`). Ver [Reutilizar en otro proyecto](#reutilizar-en-otro-proyecto-ocrend).

## Que incluye

| Tipo | Nombre | Para que |
|---|---|---|
| Skill | `migrate-scan` | Inventario inicial + `migration-state.json` |
| Skill | `migrate-project` | Migra un proyecto Ocrend COMPLETO end-to-end (pipeline ordenado) |
| Skill | `migrate-file` | Migrar UN archivo por procedimiento del playbook |
| Skill | `migrate-verify` | Verificacion end-to-end (php -l, scan, smoke, error_log) |
| Skill | `frontend-upgrade` | **Corrige** frontend (JS/CSS/HTML/Twig). Pregunta el nivel: modernize/restructure/redesign |
| Skill | `frontend-verify` | Verifica (read-only) consistencia frontend con el backend migrado |
| Skill | `runtime-audit` | **Plan base post-migración**: imprimibles/reportes/descargas que fallan, errores de consola, vistas 500. Diagnóstico por evidencia + fixes §16 |
| Skill | `security-audit` | Auditoria defensiva (SQLi, XSS, hashes, secretos) |
| Skill | `session-audit` | Sesiones Ocrend bajo PHP 8.2 |
| Skill | `ocrend-check` | Compatibilidad del core (Twig/Symfony/Silex/errores) |
| Agente | `php-migrator` | Aplica fixes PHP (1-2 archivos) |
| Agente | `frontend-migrator` | Aplica fixes frontend por nivel (1-2 archivos; rechaza redesign sin spec) |
| Agente | `php-investigator` | Localiza riesgos (read-only) |
| Agente | `php-reviewer` | Revisa regresiones post-migracion |
| Agente | `security-tester` | Barrido de seguridad defensiva |
| Agente | `ocrend-compat` | Checklist PASS/FAIL del core |
| Hook | SessionStart | Inyecta contexto + estado de migracion |
| Hook | PostToolUse | `php -l` automatico al editar/crear `.php` |
| MCP | `php_lint` | `php -l` recursivo (excluye vendor/node_modules/.git/.cache/dist/build + dups) |
| MCP | `deprecation_scan` | Aplica `deprecation-rules.json` (mismas exclusiones) |
| MCP | `frontend_scan` | Aplica `frontend-rules.json` a JS/CSS/HTML/Twig (excluye vendors/minificados/libs); scope por lenguaje y nivel |
| MCP | `db_schema` | Introspeccion `db_afocat` (+ tablas dinamicas) |
| MCP | `ftp_deploy` | Sube a prod via FTP/FTPS |

## Knowledge base
- `knowledge/playbook.md` — procedimientos por tipo de archivo (backend + frontend §14b, fuente de verdad, auto-actualizable).
- `knowledge/ocrend-php8.md` — especifico del core Ocrend.
- `knowledge/deprecation-rules.json` — reglas PHP 8.x machine-readable (consume `deprecation_scan`).
- `knowledge/frontend-rules.json` — reglas JS/CSS/HTML/Twig con `level` y `category` (consume `frontend_scan`).

## Instalacion

### 1. Dependencias del MCP
```powershell
cd Migrate_Php_8/mcp/afocat-migrate-mcp
npm install
```

### 2. Configurar entorno
```powershell
cp Migrate_Php_8/.env.example Migrate_Php_8/.env
# editar .env: rutas + credenciales FTP (DB se lee de Ocrend.ini.yml)
```
Cargar las vars de `.env` en el entorno antes de lanzar Claude Code (el MCP las lee de `process.env`).

### 3. Registrar el plugin
Marketplace local (`.claude-plugin/marketplace.json`) ya incluido. Agregar el marketplace y luego instalar:
```
/plugin marketplace add c:\xampp\htdocs\sys_Afocat\Migrate_Php_8
/plugin install afocat-migrate
```
O apuntar la config de plugins de Claude Code a esta carpeta.

## Flujo de trabajo

```
/migrate-scan                 # inventario + estado
  -> ocrend-check             # core primero (bloquea todo)
  -> /migrate-project         # proyecto entero, pipeline ordenado (recomendado)
     |  o granular:
  -> /migrate-file <archivo>  # uno por uno, por prioridad
       (php-investigator -> php-migrator -> php-reviewer)
  -> /migrate-verify          # confirmar antes de subir
  -> ftp_deploy (MCP)         # a prod
/frontend-upgrade             # frontend: PREGUNTA nivel (modernize/restructure/redesign) y corrige
  -> /frontend-verify         # verificar consistencia post-upgrade
/runtime-audit                # post-migración: imprimibles/reportes/descargas/consola/500
security-audit / session-audit  # transversales
```

**Backend y frontend:** el backend lleva el proyecto a PHP 8.2; `/frontend-upgrade` eleva JS/CSS/HTML/Twig. El frontend **siempre pregunta hasta dónde llegar** (modernize ⊂ restructure ⊂ redesign); nunca asume el nivel.

## Reutilizar en otro proyecto Ocrend

El motor es agnostico del proyecto; solo el `knowledge/` esta saborizado a Ocrend/sys_Afocat. Para migrar otro proyecto Ocrend en xampp/htdocs (probado en `panel_PA`):

1. **Apuntar** (una de tres):
   - Ruta absoluta por llamada: `deprecation_scan path="C:\xampp\htdocs\OtroProyecto"` (sin reinstalar).
   - `AFOCAT_PROJECT_ROOT=C:\xampp\htdocs\OtroProyecto` antes de lanzar Claude Code.
   - Lanzar Claude Code desde el dir del otro proyecto (cwd lo toma).
2. **Confirmar** que es Ocrend (`Ocrend/Kernel/` presente) y que hay respaldo (git/`.bak`/externo).
3. **Correr** `/migrate-project` — pipeline ordenado: COMPOSER -> OCREND-CORE -> API-SILEX -> CONTROLLER -> MODEL -> PDF-TEMPLATE -> VERIFY.

Que transfiere y que no:
- **Transfiere** (cualquier proyecto PHP): `deprecation_scan`, `php_lint`, `ftp_deploy`, null-safety wrappers, sizeof/curly-braces, funciones removidas.
- **Solo Ocrend**: el playbook (Silex->MicroApp, Twig/Symfony core, PHPExcel, mPDF), `db_schema` (lee `Ocrend.ini.yml`). Si el proyecto NO es Ocrend, aplica unicamente la capa generica.
- **Atajo**: el Kernel Ocrend es identico entre proyectos salvo los cambios de migracion, y `MicroApp.php` se copia tal cual.

## Almacenamiento (decisiones)
- Codigo + knowledge -> en este repo (versionable).
- Secretos -> `.env` gitignored. Nunca en `plugin.json`.
- Estado de migracion -> `migration-state.json` en la raiz del proyecto destino, no en el plugin.

## Seguridad
Los componentes de seguridad son **defensivos**: identifican y reportan, no generan exploits. Contexto: el dueño audita su propio sistema.
