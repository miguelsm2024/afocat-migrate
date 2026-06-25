# Prompt para Claude Code — Estandarización y robustez de tablas (Ocrend)

> **Cómo usarlo:** rellena el bloque **Parámetros** y pega todo en Claude Code Console, con la sesión abierta en la **raíz del proyecto Ocrend** indicado. Es autocontenido: lleva el contexto necesario para que el agente no redescubra. Si no anclas a un proyecto, deja `[PROYECTO]` = `el proyecto actual`.

### Parámetros (rellenar antes de pegar)

| Variable | Valor | Default si vacío |
|---|---|---|
| `[PROYECTO]` | _(p. ej. `erp__Fasmot`, `sys.Transportes`)_ | `el proyecto actual` |
| `[REPO]` | _(p. ej. `miguelsm2024/erp__Fasmot`)_ | inferir de `git remote` |
| `[PLAYBOOK]` | ruta al playbook del plugin afocat-migrate | `knowledge/playbook.md` (o donde lo tengas montado) |

> A lo largo del prompt, donde diga `[PROYECTO]` se refiere al proyecto de arriba.

---

## Rol y objetivo

Actúa como ingeniero frontend senior especializado en **DataTables.net** y en bases de código legacy jQuery + Bootstrap. Tu misión es lograr que **TODAS las tablas del proyecto** (las HTML simples y las que usan DataTables.net) tengan una configuración **unificada, estable y profesional**, con dos resultados concretos no negociables:

1. **Las tablas no deben perder sus proporciones ni la alineación header/cuerpo al cambiar el ancho** del contenedor, de la ventana o del iframe que las contiene. Las columnas deben mantener su proporción relativa; si el contenido excede el ancho disponible, debe resolverse con **scroll horizontal**, no aplastando columnas de forma despareja.
2. **La búsqueda por columna debe funcionar de forma consistente, performante y correcta en todas las tablas** (un filtro por columna, con debounce, sin romper paginación ni ordenamiento).

No reinventes: converge a una **capa compartida y parametrizable** (un CSS + un inicializador JS) en lugar de parchear cada tabla por separado.

---

## Contexto del proyecto (no romper esto)

- **Stack:** Ocrend Framework 2 corriendo en PHP 8.2. Frontend jQuery + Bootstrap (theme admin tipo "Modern Admin" en `app-assets/`). **DataTables.net** ya está presente como librería local.
- **Estructura relevante:**
  - Vistas/markup: `views/**/*.{twig,html,htm,phtml}`
  - JS propio del proyecto: `views/app/js/**`
  - CSS propio: `views/app/css/**`
  - **Theme y librerías de terceros:** `app-assets/**`, `vendors/**`, `*.min.js|css` → **NO editar**.
- **Navegación por iframes:** la app usa varios layouts (`overall`, `overall_snt`, `overall_basic`, `overall_graf`, `overall_two`, etc.); cada módulo se carga en su propio iframe, a veces oculto al inicio (patrón `mostrarModulo()` / `#page_iframe_*` / `#btn_i_*` en `inicio/menu.js`). **Esto es importante:** DataTables calcula ancho **0** si se inicializa dentro de un iframe/tab oculto, y queda roto al mostrarse.
- **Restricciones duras:**
  - **No** modifiques lógica de negocio ni los **códigos de respuesta del API** (`1`=OK, `2`=error lógico, `3`=excepción, `6`=advertencia, `7`=config, `99`=no auth).
  - **No** toques el backend PHP salvo que un cambio de markup en un `.twig` lo exija; y aun así, al mínimo.
  - **No** agregues CDNs nuevos: el entorno de producción puede correr **offline** (VPS sin internet). Si necesitas un asset (p. ej. localización de DataTables en español), **localízalo** reutilizando lo que ya existe.
  - **No** actualices la versión de DataTables como parte de esta tarea (control de alcance). Si detectas un bug que obliga a actualizar, **repórtalo aparte**.
  - **Idempotencia obligatoria:** todo init debe poder re-ejecutarse sin duplicar. Evita el error `Cannot reinitialise DataTable` con guarda (`$.fn.dataTable.isDataTable(el)`).
  - **Cache-bust + cache de Twig:** a cada `<script>`/`<link>` que edites o agregues, añádele `?v=YYYYMMDDx`; y al final **borra `app/templates/.cache/`** para que Twig recompile. Verifica con hard refresh (Ctrl+Shift+R).
  - Inyecta la capa compartida de forma **idempotente** en los layouts (antes de `</head>` el CSS, antes de `</body>` el JS), cuidando los layouts legacy con `</body>` **duplicado** (no inyectar dos veces).

> **Antes de tocar nada, lee `[PLAYBOOK]` (por defecto `knowledge/playbook.md`):**
> - **§14c `[DATATABLES-CONFIG]`** — la **capa compartida de tablas ya está diseñada y documentada** (`tables-init.js` con `window.RDTables`, `tables.css`, defaults, búsqueda por columna debounced, `adjustAll()` para iframes, headers con `var(--rd-accent)`). **REUSA esto, no lo reinventes.** Lo de abajo es la referencia; el playbook es la fuente de verdad y puede traer fixes ya validados.
> - **§14b `[VIEW-REDESIGN]`** — la capa de override/dark (`redesign.css/js`) con la que se integran los headers de tabla.
> - **§14c `[IFRAME-NAV]`** — patrón de iframes (`mostrarModulo()`, `page_iframe_*`, `btn_i_*`) → de aquí sale el re-`adjust` al hacerse visible.
> - **§14c `[JS-SAFE-MODERNIZE]`** y **§16** (hallazgos cross-cutting).
>
> Usa el MCP `frontend_scan` si está disponible. Al cerrar, sigue el **protocolo de auto-actualización del playbook** (§ inicial).

---

## FASE 1 — ANÁLISIS (read-only, OBLIGATORIO antes de tocar una sola línea)

Analiza **cada una** de las tablas del proyecto. No edites código en esta fase.

1. **Inventaria** todas las tablas. Busca al menos: `<table`, `\.DataTable\(`, `\.dataTable\(`, `DataTables`, `<tfoot`, `columnDefs`, `autoWidth`, `scrollX`, `responsive`, `FixedHeader`, `FixedColumns`, `serverSide`, `"ajax"`, e inputs de filtro por columna existentes.
2. **Clasifica** cada tabla:
   - Tipo: **HTML simple** vs **DataTables**.
   - Procesamiento: **client-side** vs **serverSide** (`serverSide:true` / `ajax`).
   - ¿Se inicializa dentro de un **iframe/tab oculto** al cargar?
   - Nº de columnas; ¿tiene **anchos definidos**?; valor de `autoWidth`; `table-layout` en CSS.
   - ¿Estructura regular (un `<thead>` con `<th>`, `<tbody>`)? Marca las que tengan `colspan`/`rowspan`/celdas combinadas → DataTables no las maneja bien (van a fix manual).
3. **Captura** la config de init actual y el **método de búsqueda por columna actual** de cada tabla.
4. **Diagnostica la causa concreta** de cada síntoma (no descripciones genéricas):
   - *Pierde proporciones / anchos saltan* → típicamente `autoWidth:true` + sin `table-layout:fixed` + sin anchos explícitos.
   - *Header desalineado del cuerpo al redimensionar* → scroll/`scrollX` sin `columns.adjust()` en resize.
   - *Tabla colapsada / ancho 0 al mostrarse* → init en iframe/tab oculto sin re-`adjust` al hacerse visible.
   - *Búsqueda por columna rota/inconsistente* → inputs mal cableados, sin debounce, en el lugar equivocado, o re-init que los descarta.
   - *Doble init* (`Cannot reinitialise`).

### Entregable de la Fase 1 (preséntalo y DETENTE para mi confirmación)

Una **tabla-inventario** con estas columnas:

| Vista / archivo | Selector / id | Tipo | serverSide | ¿En iframe? | Nº col | Config actual (resumen) | Búsqueda por col actual | Problemas detectados | Fix propuesto |

Más un **resumen de patrones comunes** (qué se repite en casi todas) y la **propuesta de capa compartida** (nombres de archivo, API del inicializador, cómo se inyecta en los layouts). **No edites código hasta que yo confirme.**

---

## FASE 2 — Configuración estándar objetivo (diseño de la capa compartida)

Centraliza todo en **dos archivos nuevos**, parametrizables, sin lógica de negocio:

- `views/app/js/tables-init.js` — expone p. ej. `window.RDTables.init(selector, opts)` y un auto-bootstrap por clase (p. ej. `table[data-rdt]`).
- `views/app/css/tables.css` — reglas de proporción/overflow + estilo de los inputs de búsqueda.

Usa lo siguiente como **baseline de referencia**, adaptándolo por tabla según tu análisis (algunas necesitarán `scrollX`, otras `responsive`, otras anchos por `columnDefs`; las `serverSide` mantienen su `ajax`):

**Defaults de DataTables (estabilidad de ancho):**
```js
const TABLE_DEFAULTS = {
  autoWidth: false,        // CLAVE: no recalcular anchos por contenido
  scrollX: true,           // overflow horizontal en vez de aplastar columnas (si la tabla es ancha)
  scrollCollapse: true,
  orderCellsTop: true,     // ordenar por la fila de títulos cuando los filtros van en otra fila
  deferRender: true,
  // language: { url: '<ruta LOCAL del json es-ES de DataTables>' }, // localización offline-safe
  // columnDefs: [{ targets: [...], width: 'NN%' }],                 // anchos explícitos -> proporción estable
  // responsive: true,  // SOLO en tablas pensadas para colapsar en móvil; no combinar con scrollX
};
```

**Inicializador idempotente (evita doble init):**
```js
function initTable(el, opts) {
  const $el = $(el);
  if ($.fn.dataTable.isDataTable(el)) return $el.DataTable(); // ya inicializada -> reusar
  ensureFooter($el); // si no hay <tfoot>, clonar <thead> en <tfoot> para los filtros por columna
  const dt = $el.DataTable(Object.assign({}, TABLE_DEFAULTS, opts || {}));
  wireColumnSearch(dt, $el);
  return dt;
}
```

**Búsqueda por columna (footer, debounced, idempotente; respeta serverSide):**
```js
function wireColumnSearch(dt, $table) {
  dt.columns().every(function () {
    const column = this;
    const $cell = $(column.footer());
    if (!$cell.length || $cell.find('input').length) return; // idempotente
    const $input = $('<input type="text" class="rdt-col-search" placeholder="Buscar…">');
    $cell.empty().append($input);
    let timer;
    $input.on('keyup change', function () {
      const val = this.value;
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (column.search() !== val) column.search(val).draw(); // en serverSide, DataTables manda el filtro al endpoint
      }, 300); // debounce
    });
    $input.on('click', e => e.stopPropagation()); // no disparar ordenamiento al tipear
  });
}
```

**Reajuste en resize y al hacerse visible (clave para iframes):**
```js
const adjustAll = debounce(function () {
  // solo tablas VISIBLES -> evita el ancho 0 de los iframes ocultos
  $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
}, 200);

$(window).on('resize', adjustAll);
// Integrar con el patrón de iframes (ver [IFRAME-NAV] del playbook): cuando un módulo/iframe se hace
// visible (mostrarModulo()/onload), llamar a adjustAll() — o, en la página interna del iframe,
// dt.columns.adjust().draw(false) — para recalcular con el ancho real.
```

**CSS (proporción estable + contenido que no rompe + inputs que no ensanchan):**
```css
/* El navegador respeta los anchos definidos y los reparte proporcionalmente */
table.dataTable, table.tbl-rdt { table-layout: fixed; width: 100% !important; }

/* Contenido largo no estira la columna (mostrar completo en title/hover) */
table.dataTable td, table.dataTable th,
table.tbl-rdt td, table.tbl-rdt th {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Scroll horizontal cuando la tabla excede el ancho del contenedor */
.dataTables_scrollBody { overflow-x: auto; }

/* Inputs de búsqueda por columna que NO ensanchan la columna */
.rdt-col-search { width: 100%; box-sizing: border-box; padding: 2px 4px; font-weight: normal; }
```

**Tablas HTML simples:** cuando la estructura sea regular, **inicialízalas con el mismo inicializador** para que hereden anchos estables + búsqueda por columna unificada. Si una tabla es estática/diminuta donde DataTables es excesivo, aplica solo el CSS (`table-layout: fixed`) y un filtro por columna mínimo. Las tablas con celdas combinadas (`colspan`/`rowspan`) van a tratamiento manual: documenta por qué.

> Para tablas con contenido largo, considera el plugin `ellipsis` de DataTables (si ya está disponible localmente) o un `title` con el valor completo, para que el texto truncado siga siendo legible.

---

## FASE 3 — Implementación (piloto → replicación)

1. Implementa la capa compartida (`tables-init.js` + `tables.css`) y aplícala primero en **un piloto representativo por cada tipo de layout** (al menos uno con DataTables ancha en iframe + una tabla simple).
2. Inyecta los includes en los layouts con cache-bust, de forma idempotente, cuidando `</body>` duplicados.
3. **Verifica el piloto** (ver Fase 4) y **DETENTE para mostrarme el resultado antes de replicar al resto.**
4. Con mi OK, **replica a todas** las tablas/vistas del inventario.

---

## FASE 4 — Verificación (definición de "terminado")

Para el piloto y luego para el conjunto, comprueba:

- [ ] Al **redimensionar la ventana y el panel/iframe**, las columnas **mantienen su proporción** y el header sigue **alineado** con el cuerpo.
- [ ] Una tabla que estaba en un **iframe/tab oculto** se ve correctamente al mostrarse (sin ancho 0, sin colapso).
- [ ] La **búsqueda por columna** filtra correctamente en **cada** columna, con debounce, **sin romper paginación ni ordenamiento**. En tablas `serverSide`, confirma que el endpoint **aplica** el filtro por columna; si no lo aplica, **repórtalo** (no cambies el backend a ciegas).
- [ ] **Consola limpia:** sin `Cannot reinitialise DataTable`, sin `undefined`, sin errores nuevos.
- [ ] Funciona en **todos los layouts** involucrados.
- [ ] **Cache-bust** aplicado en cada include editado y **`app/templates/.cache/` borrado**.
- [ ] **Cero** cambios en lógica de negocio ni en códigos de respuesta del API.

Prueba en al menos las vistas más usadas con tablas (lista las que verificaste).

---

## Registro (cierre)

Actualiza `[PLAYBOOK]` siguiendo su protocolo de auto-actualización: **edita** el procedimiento existente **§14c `[DATATABLES-CONFIG]`** (no crees uno nuevo) con cualquier causa→fix nueva, y agrega una línea en el **§15 Historial**. Si no hubo hallazgos nuevos respecto a lo ya documentado, decláralo en una línea.

---

### Resumen de lo que espero de vuelta
1. Inventario + diagnóstico (Fase 1) → **pausa**.
2. Capa compartida + piloto verificado (Fases 2–3) → **pausa**.
3. Replicación completa + checklist de verificación (Fases 3–4).
4. Playbook actualizado.
