---
name: migrate-verify
description: Verificacion end-to-end post-migracion. Corre php -l recursivo, deprecation_scan residual, smoke tests web (home, logout 302) y revisa error_log de prod por fatales. Confirma que un archivo/carpeta migrado realmente funciona en PHP 8.2. Triggers: "verificar migracion", "migrate-verify", "esta listo para subir", "smoke test".
---

# migrate-verify

Confirma que lo migrado funciona, no solo que parsea.

## Pasos

1. **Sintaxis**: MCP `php_lint` sobre la carpeta objetivo. 0 errores requerido.

2. **Deprecaciones residuales**: MCP `deprecation_scan` severity:"fatal". Debe dar 0 fatales. Warnings/info -> reportar pero no bloquean.

3. **Smoke web** (si XAMPP corriendo):
```powershell
Invoke-WebRequest -Uri "http://localhost:8080/sys_Afocat/" -UseBasicParsing
Invoke-WebRequest -Uri "http://localhost:8080/sys_Afocat/logout/" -MaximumRedirection 0 -UseBasicParsing  # espera 302
```

4. **Endpoints JSON/PDF**: si se migro un Example/mPDF, POST de prueba con payload minimo. Verificar que la respuesta sea JSON valido (no HTML de warnings).

5. **error_log prod**: agrupar por `archivo:linea`. Distinguir fatales (rompen) de Deprecated/Warning del lib (ruido). Si todo es ruido del lib -> el fix real es en `Classes/`, no en el Example (ver playbook §9/§16).

6. **Reporte**: PASS/FAIL por dimension. Si PASS, listar archivos listos para `ftp_deploy`.

## Reglas
- No declarar "listo" sin php -l + deprecation_scan fatal=0.
- error_log inundado != fatal. Leer la naturaleza de cada linea antes de alarmar.
