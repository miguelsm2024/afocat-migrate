---
name: frontend-redesign-datatables
description: Estado del rediseño dark + capa de tablas en erp__Fasmot y procedimientos en el plugin
metadata: 
  node_type: memory
  type: project
  originSessionId: cda579ce-adc1-42b8-b8ef-8af47a3bb6df
---

Trabajo de frontend en `erp__Fasmot` (repo privado GitHub miguelsm2024/erp__Fasmot) + procedimientos codificados en el plugin afocat-migrate. Continúa [[erp-fasmot-validation]].

**Capa de rediseño (override, no reescribe el theme Modern Admin):**
- `views/app/css/redesign.css` — variables CSS light/dark, acento azul; tematiza navbar, sidebar (`#cont_menu *`), cards+hijos, modales, inputs/selects (incl. sin `.form-control`, ~534), nav-link/tabs, secciones, customizer, loader `#cargando`. Inline fijos neutralizados con `html[data-theme=dark] [style*=...] !important`.
- `views/app/js/redesign.js` — `window.RD` (toggle persistente, loader, toast, validarForm, lockBtn). Botón único `#rd-theme-toggle` (auto-flotante en iframes sin navbar). Sync padre↔iframes vía evento `storage`. Watchdog del loader `#cargando` (cierra a 10s si onload no dispara).
- Inyectado en los 5 layouts (overall/_snt/_basic/_graf/_two) + login. Cache-bust `?v=` (subir en cada cambio; va por `v=YYYYMMDD[a-z]`, actual `redesign.css?v=20260724d`) + **vaciar `app/templates/.cache/*` (CONTENIDO, NO el dir raíz → borrarlo entero = 500, ver playbook §16)**.

**Capa de tablas (DataTables 1.10.8) — playbook `[DATATABLES-CONFIG]`:**
- `views/app/js/tables-init.js` (`window.RDTables`: init idempotente, enhance, adjustAll resize/visible/load, debounce 300, language ES inline) + `views/app/css/tables.css`.
- Ancho por contenido en una línea (nowrap), scroll-x si excede. **NO pisar width/table-layout de `table.dataTable`** (rompe la sync head/body/foot de scrollX — dejar que DataTables lo maneje con autoWidth:true). Headers con color dinámico `var(--rd-accent)`.

**Plugin (afocat-migrate) actualizado:** playbook §14b `[VIEW-REDESIGN]` (+checklist de componentes a tematizar), `[DATATABLES-CONFIG]`, `[IFRAME-NAV]`; UI Skills integradas (12 reglas a11y/motion en frontend-rules.json + criterio por nivel). Tags de retorno: `Antes_de_UI_Skills`, `Antes_de_Update_VISTAS`.

**Objetivo tablas CERRADO/verificado end-to-end (2026-06-24):** confirmación visual humana OK (logueado, snippet DevTools en iframes de cajas/cajas_cpe/expedientes) → sin ancho-0, header alineado al resize, col-search OK, consola limpia. 0 fixes de código. Única tabla sin filtro = `tab_reportes_usint` (`searchable:false` intencional, no es bug).

**Verificación Parte 2 (2026-06-24, código estático):** objetivo cumplido en código, 0 fixes. Inits de módulo corren en `$(document).ready` → `enhance()` (en `window.load`) los alcanza, debouncea su footer search + `adjust`. Iframe ancho-0 **no aplica**: `<iframe src="" display:none>` + `mostrarModulo()` inyecta `src` al mostrar → bootea visible, mide ancho real. 0 módulos llaman `RDTables` explícito (todo vía enhance). Gap aislado: `expedientes_v2026/expedientes.js` tiene col-search **comentado** (L467,492) en ~3 tablas → sin filtro ahí (decisión de dev; enhance NO crea inputs, solo debouncea existentes). Falta solo confirmación visual humana (proporción al resize) con sesión iniciada — snippet DevTools `verify-tables.js`. App en `http://localhost:8080/erp__Fasmot/`.

**Avance sesión 2026-06-25 (todo en `main`, pusheado a origin):**
- **Arquitectura de layouts (clave):** `overall` + `overall_snt` = TOP (tienen navbar + los `<iframe>`); `overall_two` + `overall_graf` = CONTENIDO de iframe (los módulos los **extienden** vía `{% extends %}`, sin navbar; ej. `cajas.twig` extends `overall_two`); `overall_basic` = mínimo. Esto define dónde montar widgets globales (solo en TOP, no en los de contenido, o se repiten por iframe).
- **Navbar = partial compartido** `app/templates/partials/navbar.twig` (primer `{% include %}` del proyecto; `TwigAutoExtLoader` resuelve `.twig`). `overall`/`overall_snt` lo incluyen con `with {'navbar_brand': …}`. Editar el nav = 1 archivo. Ver playbook §14c `[LAYOUT-PARTIAL]`.
- **Delimitación de contenedores** (queja "todo plano"): `--rd-border-strong`, `--rd-card-shadow`, `--rd-bg` más gris en redesign.css. Playbook §14b.
- **Módulo tickets:** botón único `#btn_ticket_float` en el navbar junto a `#rd-theme-toggle` (NO flotante por iframe); widget (modal+scripts) solo en layouts TOP; captura corre en ventana top y compone iframes. Tabla `tickets` creada (InnoDB/utf16_spanish_ci como `users`); **DDL en `db/tickets.sql`** (no viajaba en git). Playbook §14c IFRAME-NAV + §16.
- **Módulo `expedientes_new` ELIMINADO** (muerto, no enlazado; el vivo es `expedientes`). Seguro logueado: el Router hace swap a `errorController` si el controller no existe (pre-auth), nunca toca el template borrado.
- **Unificación multi-PC:** rama `pc-oficina` (otra PC) mergeada a `main` y **eliminada**. Ahora 1 sola rama `main`. Plugin §16.
- **Plugin:** 5 lecciones de esta sesión backfilled (delimitación, LAYOUT-PARTIAL, widget-en-iframe, DDL-no-git, merge multi-PC) + §15 historial.

**No-obvios:**
- Cambio JS/CSS no surte efecto sin cache-bust `?v=` + hard refresh (el browser cachea agresivo).
- El theme pinta fondos en sub-elementos → tematizar contenedor NO basta; usar `#id *` o cubrir hijos.
- El usuario edita a veces el `.min.css` para dark; lo durable es override en capa propia (tables.css/redesign.css), no en el vendor min.