---
name: frontend-upgrade
description: Lleva el frontend (JS/CSS/HTML/Twig) al siguiente nivel aplicando correcciones reales, no solo verificando. SIEMPRE pregunta primero hasta donde llegar (modernize / restructure / redesign) y aplica solo las reglas de ese nivel y los inferiores. Corre frontend_scan, delega fixes mecanicos al agente frontend-migrator y verifica con frontend-verify. Triggers: "mejorar frontend", "frontend-upgrade", "modernizar JS/CSS/HTML", "siguiente nivel frontend", "limpiar frontend".
---

# frontend-upgrade

Corrige y eleva el frontend del proyecto. A diferencia de `frontend-verify` (que solo reporta), este **aplica** los cambios. Trabaja sobre cualquier proyecto Ocrend apuntando con `path`, ruta absoluta o `AFOCAT_PROJECT_ROOT`.

## Paso 0 — PREGUNTAR EL NIVEL (obligatorio, no asumir)
Antes de tocar nada, preguntar al usuario hasta donde llevar el frontend. **Nunca elegir por defecto.** Opciones:

| Nivel | Que hace | Riesgo |
|---|---|---|
| **modernize** | Corrige sin cambiar el diseno visual: HTML valido/semantico/accesible (alt, lang, sin tags deprecados), JS legacy->moderno (`var`->let/const, `==`->`===`, `$.ajax`->fetch, sin `document.write`), CSS prefijos obsoletos. Respeta el layout. | Bajo |
| **restructure** | Lo anterior + reorganiza: extrae JS/CSS inline (`onclick=`/`style=`) a archivos, quita `!important`, px->rem. Cambia organizacion del codigo, no el diseno visual. | Medio |
| **redesign** | Lo anterior + re-maqueta UI/UX (layout flexbox/grid, responsive). Subjetivo. **Requiere criterio de diseno por pantalla** (layout objetivo, breakpoints, referencia). | Alto |

`redesign` ⊇ `restructure` ⊇ `modernize`: el nivel elegido incluye las reglas de los inferiores.

## Pasos (tras conocer el nivel)
1. **Leer knowledge**: `${CLAUDE_PLUGIN_ROOT}/knowledge/frontend-rules.json` y la seccion frontend del `playbook.md`. NO re-leer si ya estan en contexto.
2. **Escanear**: `frontend_scan` con `level:<elegido>`. Acotar ruido en themes admin: scopear `path` al codigo propio o `severity:"warning"` para omitir info (`css-important`, `console.log`).
3. **Priorizar**: por categoria — primero `xss` y `a11y` (warning), luego `legacy`, al final `perf`/info. Agrupar por archivo.
4. **Aplicar**: delegar al agente `frontend-migrator` por lote de 1-2 archivos, pasando archivo + nivel + rule ids. Para `redesign`, recolectar primero la spec de diseno por pantalla; el agente rechaza redesign sin spec.
5. **No romper el backend**: mantener manejo de codigos API (1/2/3/6/7/99), endpoints, nombres de assets que el PHP referencia, sintaxis Twig 3.
6. **Verificar**: correr `/frontend-verify` sobre lo tocado. Si hay toolchain del proyecto (eslint/prettier/stylelint), usarla; no agregar dependencias.
7. **Actualizar estado**: bloque `frontend` de `migration-state.json` (status por archivo -> done).
8. **Auto-actualizar playbook**: si aparecio un patron nuevo, integrarlo (protocolo §inicial del playbook).

## Criterio de calidad por nivel (UI Skills)
Lo que una regla regex NO captura: taste, jerarquía, micro-interacción. Fuentes en `${CLAUDE_PLUGIN_ROOT}/knowledge/ui-skills-sources.md`. Filtrado a Twig/HTML/CSS/JS vanilla (sin React/Tailwind/GSAP).

**modernize** — accesibilidad + motion seguros (detectables por reglas + criterio):
- Todo control interactivo tiene nombre accesible; `<button>`/`<a>` solo-ícono → `aria-label` + ícono `aria-hidden`. Preferir HTML nativo antes que ARIA.
- Foco SIEMPRE visible: si se quita `outline`, dar reemplazo con `:focus-visible`.
- Animar SOLO `transform`/`opacity` (compositor), nunca props de layout; ≤200ms, `ease-out` en entrada; respetar `@media (prefers-reduced-motion: reduce)`.
- Números que cambian → `font-variant-numeric: tabular-nums` (evita salto de layout). `-webkit-font-smoothing: antialiased` en el root.
- *(baseline-ui, fixing-accessibility, fixing-motion-performance)*

**restructure** — jerarquía, foco, líneas de lectura, micro-interacción:
- Bloques de texto con **line-length 60–75ch** (`max-width`); jerarquía tipográfica clara (escala de tamaños/pesos intencional).
- **Escala de espaciado consistente** (no valores mágicos sueltos): derivar de un set (4/8/12/16/24/32…).
- **Concentric radius**: radio exterior = interior + padding (lo más común que hace ver "off" una UI anidada). Sombras en capas > bordes sólidos. Alineación óptica > geométrica en íconos/triángulos.
- Controles interactivos con **hit area ≥ 40×40px**; `scale(0.96)` al presionar para feedback táctil.
- Entradas: dividir en chunks y **stagger ~100ms**; salidas más sutiles que entradas; nunca `transition: all` (propiedades exactas).
- Forms: error junto a la acción, ligado con `aria-describedby` + `aria-invalid`; empty states con una acción clara; nunca depender solo del color.
- Modales: atrapar foco, foco inicial dentro, `Escape` cierra, restaurar foco al cerrar. Headings sin saltar niveles; `th` en tablas de datos.
- *(make-interfaces-feel-better, wcag-audit-patterns)*

**redesign** — criterio de diseño (REQUIERE spec; el agente rechaza sin ella):
- Evitar lo genérico-de-IA: hero = tesis (lo más característico del dominio), no el patrón "número grande + label + gradiente". Tipografía con personalidad (display + body deliberados), no una fuente neutra.
- Estructura = información: numeración/eyebrows/divisores solo si codifican algo real (no `01/02/03` decorativo).
- Un **signature element** memorable; **1 color de acento por vista**; restraint ("antes de salir, quitá un accesorio"). Motion deliberado, no disperso.
- Quality floor sin anunciarlo: responsive a mobile, foco visible por teclado, `prefers-reduced-motion` respetado.
- Copy desde el lado del usuario: voz activa ("Guardar cambios", no "Enviar"), mismo nombre de acción en todo el flujo, errores con dirección (qué pasó + cómo arreglarlo), empty = invitación a actuar.
- *(emil-design-eng, anthropics/frontend-design)*

## Reporte
Tabla por lenguaje: `archivo | nivel | fixes aplicados | validacion`. Separar JS / CSS / HTML / Twig. Conteos, sin relleno.

## Reglas
- **Paso 0 no es opcional.** Si el usuario no dio nivel, preguntarlo.
- modernize/restructure: mecanico. redesign: nunca a ciegas, siempre con spec + antes/despues.
- No cambiar copy ni logica de negocio.
- XSS preexistente: reportar; corregir solo con confirmacion (no alterar comportamiento en silencio).
