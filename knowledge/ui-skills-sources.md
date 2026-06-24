# Fuentes UI Skills — trazabilidad

Principios de design-engineering integrados a la capa frontend del plugin
(`frontend-rules.json`, `skills/frontend-upgrade`, `agents/frontend-migrator`).

- **Vendoreados**: el conocimiento se transcribió/derivó a reglas y criterio propios. El plugin
  **NO** ejecuta `npx ui-skills start` ni depende de red en runtime.
- **Filtrado** al stack del plugin: Twig + HTML + CSS + JavaScript vanilla.
  Descartado todo lo específico de React / Tailwind / shadcn / Radix / Base UI / motion-react / GSAP
  (p.ej. `text-balance`, `size-*`, `z-*`, `cn`, Tailwind shadow scale, `useEffect`, `initial={false}`).
- **Fecha de fetch:** 2026-06-24 · vía HTTPS (https://www.ui-skills.com/skills/<autor>/<skill>).
- **Licencia:** cada skill es de su autor en el registro público UI Skills (ui-skills.com). Aquí se
  citan como fuente; los textos originales pertenecen a sus autores. Uso: referencia de criterio.

| Skill | Autor | URL | Qué derivó en este plugin |
|---|---|---|---|
| baseline-ui | ibelick | https://www.ui-skills.com/skills/ibelick/baseline-ui | Reglas `css-anima-layout-prop`, `css-transition-all`, `css-will-change-all`, `a11y-icon-button-sin-nombre`. Criterio modernize: transform/opacity ≤200ms ease-out, tabular-nums, 1 accent/vista, empty states con acción. |
| fixing-accessibility | ibelick | https://www.ui-skills.com/skills/ibelick/fixing-accessibility | Reglas `a11y-icon-button-sin-nombre`, `a11y-anchor-icon-sin-nombre`, `a11y-div-span-onclick`, `a11y-positive-tabindex`, `a11y-link-generico`, `a11y-input-sin-label`, `css-outline-none-sin-focus`, `css-keyframes-reduced-motion`. Criterio: nombres accesibles, teclado, foco/dialogs, native>ARIA, forms con aria-describedby/invalid. |
| wcag-audit-patterns | wshobson | https://www.ui-skills.com/skills/wshobson/wcag-audit-patterns | Criterio restructure: POUR, niveles A/AA, violaciones por impacto (alt funcional, labels, contraste, skip links, títulos, lang, link text, landmarks, heading hierarchy). Refuerza `a11y-link-generico`, `a11y-input-sin-label`. |
| fixing-motion-performance | ibelick | https://www.ui-skills.com/skills/ibelick/fixing-motion-performance | Reglas `css-anima-layout-prop`, `js-scroll-anim`, `css-will-change-all`, `css-transition-all`. Criterio motion: composite vs paint vs layout, no read/write mismo frame, IntersectionObserver/scroll-timeline, blur ≤8px, FLIP. |
| make-interfaces-feel-better | jakubkrehel | https://www.ui-skills.com/skills/jakubkrehel/make-interfaces-feel-better | Criterio restructure (micro-interacción): concentric radius, shadows>borders, alineación óptica, hit area 40×40, scale(0.96) press, enter split+stagger ~100ms, exit sutil, no `transition:all`, tabular-nums, font-smoothing, image outline 1px, cross-fade `cubic-bezier(0.2,0,0,1)` sin lib. |
| emil-design-eng | emilkowalski | https://www.ui-skills.com/skills/emilkowalski/emil-design-eng | Criterio redesign: polish, detalle, restraint, taste de design-engineering. |
| frontend-design | anthropics | https://www.ui-skills.com/skills/anthropics/frontend-design | Criterio redesign: anti-genérico (hero=tesis, tipografía con personalidad, estructura=información, signature element, 1 accent, restraint), quality floor (responsive/focus/reduced-motion), copy en voz activa con dirección. |

## Mapeo a niveles (modernize ⊂ restructure ⊂ redesign)
- **modernize** (detectable → reglas): baseline-ui + fixing-accessibility + fixing-motion-performance.
- **restructure** (+criterio): make-interfaces-feel-better + wcag-audit-patterns.
- **redesign** (+criterio, REQUIERE spec; `frontend-migrator` rechaza redesign sin spec): emil-design-eng + frontend-design.

## Reglas añadidas a frontend-rules.json (12, solo añadidos)
`a11y-icon-button-sin-nombre`, `a11y-anchor-icon-sin-nombre`, `a11y-div-span-onclick`,
`a11y-positive-tabindex`, `a11y-link-generico`, `a11y-input-sin-label` (restructure),
`css-outline-none-sin-focus`, `css-anima-layout-prop`, `css-transition-all`,
`css-will-change-all`, `css-keyframes-reduced-motion`, `js-scroll-anim`.
Heredan las exclusiones de `frontend_scan` (vendors/minificados/libs conocidas). Las 26 reglas previas no se modificaron.
