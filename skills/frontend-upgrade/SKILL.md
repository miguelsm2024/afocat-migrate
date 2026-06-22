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

## Reporte
Tabla por lenguaje: `archivo | nivel | fixes aplicados | validacion`. Separar JS / CSS / HTML / Twig. Conteos, sin relleno.

## Reglas
- **Paso 0 no es opcional.** Si el usuario no dio nivel, preguntarlo.
- modernize/restructure: mecanico. redesign: nunca a ciegas, siempre con spec + antes/despues.
- No cambiar copy ni logica de negocio.
- XSS preexistente: reportar; corregir solo con confirmacion (no alterar comportamiento en silencio).
