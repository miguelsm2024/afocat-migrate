---
name: security-audit
description: Auditoria de seguridad defensiva del proyecto durante la migracion. Detecta SQL injection (interpolacion en queries), XSS (echo de input sin escapar), hashes debiles (md5/sha1 para passwords), eval/unserialize de input, secretos hardcodeados y configuracion de cookies de sesion. Usa deprecation_scan include_security:true. Triggers: "auditar seguridad", "security-audit", "revisar vulnerabilidades", "buscar SQL injection".
---

# security-audit

Auditoria defensiva. Identifica y reporta; aplica fix solo si el usuario lo pide. Contexto autorizado: el dueño del proyecto migrando su propio sistema.

## Pasos

1. **Scan automatico**: MCP `deprecation_scan` con `include_security:true`. Cubre: `sql-injection-interp`, `echo-unescaped-input`, `weak-hash`, `eval-usage`, `unserialize-input`.

2. **Secretos hardcodeados**: grep por credenciales en codigo (passwords, API keys, tokens) fuera de `Ocrend.ini.yml`/`.env`. Reportar ubicaciones.

3. **Sesiones** (coordinar con session-audit): cookies `HttpOnly`/`Secure`/`SameSite`, fijacion de sesion, `session_regenerate_id` tras login.

4. **Uploads**: validacion de tipo/extension en `__Files_CAT/`, `Files_Siniestros/` (modelos Ventas/Expediente). Path traversal en nombres de archivo.

5. **API**: endpoints en `api/http/post.php` sin check de auth (codigo `99`=no auth). Rutas que exponen datos sensibles.

## Reporte
Tabla `severidad | archivo:linea | problema | fix`. Ordenar high -> medium. Una linea por hallazgo.

## Reglas
- Defensivo. NO escribir exploits. NO tecnicas ofensivas.
- SQL injection preexistente: reportar SIEMPRE aunque no sea tema PHP 8.
- Marcar falsos positivos del regex (ej: query con var ya bindeada por el wrapper PDO de Ocrend).
- Delegar el barrido amplio al subagente `security-tester` si el proyecto es grande.
