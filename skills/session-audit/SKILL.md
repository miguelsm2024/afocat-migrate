---
name: session-audit
description: Auditoria del manejo de sesiones de Ocrend bajo PHP 8.2. Revisa session_set_cookie_params (firma cambiada en 7.3+), flags HttpOnly/Secure/SameSite, gc_maxlifetime vs life_time:28800 del config, regeneracion de id tras login, y el flujo de bloqueo por 3 intentos del modelo Users. Triggers: "auditar sesiones", "session-audit", "revisar login", "manejo de sesion PHP 8".
---

# session-audit

Verifica que el manejo de sesiones de Ocrend siga seguro y compatible en PHP 8.2.

## Checklist

1. **Config** (`Ocrend.ini.yml`): `sessions.life_time: 28800` (8h), `unique: 0CR3ND2011`. Verificar coherencia con `session.gc_maxlifetime` de php.ini.

2. **Firma PHP 7.3+**: `session_set_cookie_params()` acepta array de opciones. Si el codigo usa la firma vieja posicional, migrar a:
```php
session_set_cookie_params([
  'lifetime' => 28800, 'path' => '/', 'httponly' => true,
  'secure' => true, 'samesite' => 'Lax'
]);
```

3. **Fijacion de sesion**: `session_regenerate_id(true)` tras login exitoso (modelo `Users.php`).

4. **Flujo de bloqueo**: max 3 intentos -> bloqueo 30 min. Verificar que el contador no sea bypasseable y que use almacenamiento server-side.

5. **Cierre**: `logout/` destruye sesion (`session_destroy` + unset cookie). Smoke: debe responder 302.

6. **PHP 8 gotchas**: acceso `$_SESSION['k']` sin isset -> warning (no fatal); `session_id()` retorno; handlers custom con return types de `SessionHandlerInterface`.

## Reporte
PASS/FAIL por item + fix puntual. Coordinar hallazgos con `security-audit`.

## Reglas
- Defensivo. Foco en hardening + compatibilidad, no en romper auth.
