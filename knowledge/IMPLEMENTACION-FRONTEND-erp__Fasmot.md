# Informe de implementación — Frontend erp__Fasmot (replicable a otro proyecto Ocrend)

> **Propósito:** registro detallado de TODO lo implementado/modificado en `erp__Fasmot`
> durante el ciclo frontend, con referencias a archivos y líneas, para **re-aplicarlo en
> otro proyecto Ocrend**. Los procedimientos generalizados están en `playbook.md`
> (§14b/§14c/§16); aquí el detalle concreto + el orden de re-aplicación.
>
> **Repo:** `miguelsm2024/erp__Fasmot`. **Rango de commits:** `13d0007` (base) → `83774f8`.
> **Stack:** Ocrend Framework 2 / PHP 8.2 / jQuery + Bootstrap 4 (theme "Modern Admin") /
> DataTables 1.10.8. **App local:** `http://localhost:8080/erp__Fasmot/`.

---

## 0. Arquitectura de layouts (ENTENDER PRIMERO — define dónde va cada cosa)

Ocrend renderiza vía `$this->template->render('modulo/vista', …)` (sin extensión; el
`TwigAutoExtLoader` agrega `.twig`; root `./app/templates/`). Hay 2 clases de layout:

| Layout | Rol | Navbar | Lo extienden |
|---|---|---|---|
| `overall/layout.twig`, `overall_snt/layout.twig` | **TOP** (página principal: navbar + sidebar + los `<iframe>`) | SÍ | — |
| `overall_two/layout.twig`, `overall_graf/layout.twig` | **CONTENIDO de iframe** (cada módulo lo `{% extends %}`) | NO | `cajas.twig` extends `overall_two`, etc. |
| `overall_basic/layout.twig` | mínimo (56 líneas) | NO | casos sueltos |

**Regla de oro:** un widget/elemento "global" puesto en un layout de CONTENIDO se renderiza
**dentro de cada iframe** → N copias. Los elementos globales (navbar, botón de tema, FAB de
soporte/tickets) van **solo en los layouts TOP**.

---

## 1. Capa de rediseño + delimitación de contenedores  (playbook §14b `[VIEW-REDESIGN]`)

**Archivos:** `views/app/css/redesign.css`, `views/app/js/redesign.js` (capa override, no toca el theme).

**Inyección (idempotente) en los 6 layouts** (`overall`, `_snt`, `_basic`, `_graf`, `_two`, `login`):
- anti-flash en `<head>` ANTES de los CSS: `<script>(function(){try{var t=localStorage.getItem('rd-theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>`
- `redesign.css` **al final** de los `<link>` (gana especificidad).
- `redesign.js` antes de `</body>`.

**Delimitación de contenedores** (queja "todo se ve plano"): el theme deja el borde de card ≈ el
fondo → no se distingue dónde empieza/termina un bloque. Fix por variables (no bordear cada div):
```css
:root { --rd-bg:#e7ebf2; --rd-border-strong:#aab7cc; --rd-card-shadow:0 1px 3px rgba(16,24,40,.10),0 8px 20px rgba(16,24,40,.14); }
html[data-theme="dark"]{ --rd-bg:#0c121d; --rd-border-strong:#3d4f6b; --rd-card-shadow:0 2px 8px rgba(0,0,0,.5),0 10px 26px rgba(0,0,0,.45); }
.card{ border:1px solid var(--rd-border-strong)!important; box-shadow:var(--rd-card-shadow)!important; }
.card-header:not([class*="bg-"]){ background:var(--rd-surface-2)!important; border-bottom:1px solid var(--rd-border-strong)!important; }
.card-header:empty{ display:none!important; }       /* headers vacíos sin barra fantasma */
fieldset,.panel,.box,.well{ background:var(--rd-surface)!important; border:1px solid var(--rd-border-strong)!important; border-radius:var(--rd-radius); box-shadow:var(--rd-card-shadow); padding:1rem 1.25rem; margin-bottom:1rem; }
.rd-box{ /* utilidad para delimitar a mano */ }
```
**No-obvio:** el fondo de app **más gris** que el surface es lo que hace "saltar" las cards. Subir
contraste con timidez (borde ≈ fondo) no se nota.

**Protocolo de cache (SIEMPRE tras editar css/js/twig):**
1. cache-bust `?v=YYYYMMDD[a-z]` en el `<link>`/`<script>` editado (en los 6 layouts). Versión actual erp: `redesign.css?v=20260724d`.
2. **vaciar `app/templates/.cache/*`** — ⚠ el CONTENIDO, NO el dir raíz (`rm -rf .../.cache` da **500** en todo el sitio: Twig auto-crea los subdirs hash pero no el root; ver §16). Usar `rm -rf app/templates/.cache/*`.
3. hard refresh (Ctrl+Shift+R).

---

## 2. Navbar → partial compartido  (playbook §14c `[LAYOUT-PARTIAL]`)

**Problema:** el `<nav>` estaba **copiado** en `overall` y `overall_snt` → derivó (brand distinto,
botones divergentes, ids duplicados, bugs en una copia y no en la otra).

**Solución:** extraído a **`app/templates/partials/navbar.twig`** (primer `{% include %}` del
proyecto). Cada layout TOP:
```twig
{% include 'partials/navbar' with {'navbar_brand': 'SysFASMOT'} %}   {# overall #}
{% include 'partials/navbar' with {'navbar_brand': 'CPanel Fasmot'} %}{# overall_snt #}
```
Lo que difiere → variable (`navbar_brand`). El include **hereda el contexto** del layout
(`owner_user`, `owner_cargos`, `Get_Acc`, `is_logged` siguen disponibles).

**Bugs corregidos al unificar** (revisar siempre al extraer un partial):
- **id duplicado** `lupa_buscar` (buscador CAT + USIN compartían id → HTML inválido; jQuery liga
  solo el 1º). CAT conserva `lupa_buscar` (lo usa `inicio_new2.js:80`), USIN → `lupa_buscar_usin`.
- `onclick="$('#cont_wapp').fadeIn()"` apuntaba a id inexistente → el `<li>` de WhatsApp pasó a `id="cont_wapp"`.
- typo de clase `dropdown-dcivider` → `dropdown-divider`.
- `<style>.bg-gradient-x-blue{…!important}` (tras el `<nav>`) pisaba el theming → **eliminado** de
  ambos layouts. El navbar ahora sigue dark/light vía redesign.css.
- borrados bloques comentados muertos e inline-styles que rompen dark (`box-shadow:1px 1px #fff`, `hue-rotate`).

**Theming del navbar** en `redesign.css` (bloque "Navbar homogeneizado"): `.header-navbar.bg-gradient-x-blue{background:var(--rd-surface)!important;background-image:none!important}` + brand/badges/dropdown/botones CAT-USIN (pill) tematizados.

---

## 3. Módulo Tickets / Incidencias  (feat completa — capturar pantalla + anotar + reportar)

Módulo que cualquier usuario logueado usa para reportar una incidencia: **captura la vista con
html2canvas, la anota con Fabric.js, y la envía**. Admin (`users.cargo == 1`) gestiona.

**Archivos NUEVOS:**
| Archivo | Rol |
|---|---|
| `app/controllers/ticketsController.php` | render de `tickets/tickets` (página de gestión) |
| `app/models/Tickets.php` | `Ticket_Reg()` / `Ticket_Get()` / `Ticket_Upd_Estado()` + `es_admin()` + `guardarCaptura()` |
| `app/templates/tickets/tickets.twig` | página de gestión (tabla de tickets) |
| `app/templates/overall/_ticket_widget.twig` | **modal + scripts** del widget (botón vive en navbar) |
| `views/app/js/tickets/tickets.js` | lógica: captura, fabric, ajax |
| `views/app/vendor/html2canvas/html2canvas.min.js`, `views/app/vendor/fabric/fabric.min.js` | libs **locales** (offline-safe) |
| `db/tickets.sql` | **DDL de la tabla** (no viajaba en git — ver §4) |
| `mPDF/TICKETS/.gitkeep` | carpeta de capturas (PNG) |

**Rutas API** (`api/http/post.php`): 
```php
$app->post('/Ticket_Reg',        function() use($app){ $u=new Model\Tickets; return $app->json($u->Ticket_Reg()); });
$app->post('/Ticket_Get',        function() use($app){ $u=new Model\Tickets; return $app->json($u->Ticket_Get()); });
$app->post('/Ticket_Upd_Estado', function() use($app){ $u=new Model\Tickets; return $app->json($u->Ticket_Upd_Estado()); });
```
**`.gitignore`:** `mPDF/TICKETS/*` + `!mPDF/TICKETS/.gitkeep` (capturas no se versionan, carpeta sí).

**Sidebar (overall):** link admin a la gestión, gated `{% if owner_user.cargo == 1 %}`:
`<li><a href="tickets/"><i class="fa fa-bug"></i> Tickets / Incidencias</a></li>`.

**⚠ Colocación del botón/widget (corrección importante):** originalmente el FAB `#btn_ticket_float`
se incluía en TODOS los layouts → se **repetía dentro de cada iframe**. Corregido:
- **Botón único** `#btn_ticket_float` en `partials/navbar.twig`, junto a `#rd-theme-toggle`, gated `is_logged`. CSS `.rd-nav-ticket` (naranja, redondo).
- `_ticket_widget.twig` (modal + scripts) incluido **solo en layouts TOP** (`overall`, `overall_snt`); **quitado** de `overall_two`/`overall_graf`.
- **Captura en ventana top que compone los iframes** (`tickets.js`): `html2canvas(document.body)` del padre + por cada `$('iframe:visible')` capturar su `doc.body` y dibujarlo sobre el canvas padre (a escala 1, coords = px CSS del viewport). Así un clic en el navbar captura el módulo visible aunque esté en iframe.

**Para re-aplicar el patrón widget:** montar en TOP, nunca en layout de contenido; trigger único en
navbar; si necesita capturar, componer iframes desde la ventana top (ver §0 y playbook §14c IFRAME-NAV).

---

## 4. Tabla `tickets` — el esquema NO viaja en git  (playbook §16)

El módulo se mergeó completo pero el `CREATE TABLE` se había creado a mano en una BD → en otra PC
faltaba la tabla. **DDL derivado del modelo** (`Tickets.php`: columnas de `insert()/update()`, el
`SELECT … FROM tickets`, tipos por uso) e **igualado engine/charset a una tabla existente**:
```sql
-- guardado en db/tickets.sql -> mysql -uroot <bd> < db/tickets.sql
CREATE TABLE IF NOT EXISTS tickets (
  id_ticket INT(11) NOT NULL AUTO_INCREMENT, nro_ticket VARCHAR(20) NOT NULL,
  id_user INT(11) NOT NULL, modulo VARCHAR(80) DEFAULT NULL, descripcion TEXT,
  captura VARCHAR(255) DEFAULT NULL, estado TINYINT(1) NOT NULL DEFAULT 0,
  respuesta TEXT, id_user_resp INT(11) DEFAULT NULL,
  f_sistema DATETIME DEFAULT NULL, f_resuelto DATETIME DEFAULT NULL,
  PRIMARY KEY (id_ticket), KEY idx_id_user (id_user), KEY idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf16 COLLATE=utf16_spanish_ci;
```
`estado`: 0=nuevo, 1=en proceso, 2=resuelto. **Lección:** al agregar un módulo con tabla nueva,
commitear su `.sql` (`db/`) junto al código. Sacar engine/charset con
`SELECT ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_NAME='users'`.

---

## 5. Capa DataTables  (ya documentada — playbook §14c `[DATATABLES-CONFIG]`)

`views/app/js/tables-init.js` (`window.RDTables`) + `views/app/css/tables.css`. Modo ancho-por-contenido
(`autoWidth:true` + `nowrap` + scroll-x; **NO** pisar `width`/`table-layout` de `table.dataTable`).
`enhance()` corre en `window.load` y mejora las tablas que cada módulo ya inicializó (debounce de
búsqueda por columna + `columns.adjust()`), sin reescribir inits. Verificado end-to-end.

---

## 6. Limpiezas / eliminaciones de esta sesión

- **`expedientes.twig`** (`fix` c1aa180): handsontable revertido de **CDN jsdelivr → local**
  (`views/app/js/…/Plugins/handsontable/handsontable.full.min.{js,css}`) — **offline-safe** (prod
  VPS sin internet; regla "no CDN nuevos"). Reparado un `<script>` que había quedado incrustado
  dentro de un comentario `<!-- jsQR -->` (HTML malformado).
- **Módulo `expedientes_new` ELIMINADO** (muerto): borrados sus templates (`expedientes_new/*.twig`,
  incl. backups `_____/___/__`) y controllers (`expedientes_newController.php` + backup `____`). No
  estaba enlazado (el módulo vivo es `expedientes`). **Seguro logueado:** `Router::executeController()`
  hace `if(!is_readable('app/controllers/<x>Controller.php')) $controller='errorController';` ANTES de
  auth/render → el controller borrado nunca se instancia, jamás toca el template faltante. `/expedientes_new` → errorController (200), no 500.
- **`home.twig`** (chore): quitado bloque "COMUNICADO" comentado + código muerto (~88 líneas).
- **`content-body`** (overall/overall_snt): `margin-top/right:1rem` (separación del contenido).
- **`Movimientos.php`** (chore): query `… ORDER BY S.año DESC LIMIT 2`. **`movimientosController.php`:** −67 líneas de código comentado muerto.

---

## 7. Re-aplicar a OTRO proyecto Ocrend — orden y checklist

1. **Mapear layouts** del proyecto destino: cuáles son TOP (con navbar+iframes) y cuáles de contenido (§0). Los nombres pueden variar.
2. **Capa rediseño** (§1): copiar `redesign.css`/`redesign.js`, inyectar anti-flash + links en todos los layouts + login. Tematizar por el **checklist de componentes** del playbook §14b (el theme pinta fondos en hijos → cubrir `#id *`, cards+hijos, modales, inputs sin `.form-control`, etc.). Aplicar delimitación.
3. **Navbar → partial** (§2): extraer a `partials/navbar.twig`, incluir con `with {brand}`. Auditar ids duplicados / onclick muertos / typos al unificar.
4. **DataTables** (§5): `tables-init.js` + `tables.css`, inyectar, dejar que `enhance()` mejore los inits existentes.
5. **Widget global** (si aplica, §3): trigger único en navbar, widget solo en TOP, capturar componiendo iframes.
6. **Tablas nuevas** (§4): derivar DDL del modelo, igualar engine/charset, guardar `db/*.sql`.
7. **Cache:** en cada cambio, cache-bust `?v=` + `rm -rf app/templates/.cache/*` (NO el dir) + hard refresh.
8. **Verificar:** rutas devuelven 200 (no 500); navbar + tablas + widget renderan; dark/light OK; consola limpia.

### Inventario de archivos del ciclo (erp__Fasmot)

**Nuevos:** `app/controllers/ticketsController.php`, `app/models/Tickets.php`,
`app/templates/tickets/tickets.twig`, `app/templates/overall/_ticket_widget.twig`,
`app/templates/partials/navbar.twig`, `views/app/js/tickets/tickets.js`,
`views/app/vendor/{html2canvas,fabric}/*.min.js`, `db/tickets.sql`, `mPDF/TICKETS/.gitkeep`.

**Modificados:** `views/app/css/redesign.css`, los 6 layouts (`overall`, `_snt`, `_basic`, `_graf`,
`_two`, `login`), `api/http/post.php`, `.gitignore`, `app/templates/home/home.twig`,
`app/models/Movimientos.php`, `app/controllers/movimientosController.php`,
`app/templates/expedientes/expedientes.twig`, `app/models/Cajas.php`,
`views/app/panel/app-assets/css/bootstrap-extended.css`.

**Borrados:** módulo `expedientes_new` completo (4 templates + 2 controllers).
