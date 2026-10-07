---
version: alpha
name: Stellar Impulse
description: "Identidad táctica espacial para un RTS isométrico de navegador: precisión de consola, energía de propulsión y lectura inmediata del campo."
colors:
  primary: "#36A9FF"
  secondary: "#71E5DC"
  tertiary: "#FFD84D"
  space: "#070B14"
  space-deep: "#03070C"
  surface: "#131D2D"
  surface-raised: "#202E43"
  border: "#3A4A62"
  text: "#F2F6FA"
  muted: "#93A4B8"
  signal: "#71E5DC"
  blue-faction: "#36A9FF"
  red-faction: "#FF4F64"
  neutral: "#A978FF"
  energy: "#FFD84D"
  success: "#4AD69A"
  warning: "#FF9F43"
  metal: "#BFC9D6"
  core: "#F7E77C"
typography:
  display:
    fontFamily: "Rajdhani"
    fontSize: 1.25rem
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.06em"
  body:
    fontFamily: "Inter"
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Rajdhani"
    fontSize: 0.75rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.14em"
  numeric:
    fontFamily: "Rajdhani"
    fontSize: 1.375rem
    fontWeight: 600
    lineHeight: 1
    fontFeature: "tabular-nums"
rounded:
  none: 0px
  sm: 2px
  md: 8px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  section: 40px
elevation:
  panel: "0 10px 30px rgb(0 0 0 / 18%)"
  panel-strong: "0 24px 80px rgb(0 0 0 / 55%)"
  signal: "0 0 24px rgb(113 229 220 / 18%)"
  focus: "0 0 0 3px #FFD84D"
components:
  brand:
    textColor: "{colors.text}"
    typography: "{typography.display}"
    height: 32px
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  panel-raised:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#06111D"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  button-signal:
    backgroundColor: "{colors.signal}"
    textColor: "#06111D"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  status-success:
    backgroundColor: "{colors.success}"
    textColor: "#06111D"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  status-danger:
    backgroundColor: "{colors.red-faction}"
    textColor: "#06111D"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
---

## Overview

**Stellar Impulse** es una marca de ciencia ficción táctica: una flota opera en una
interfaz de mando compacta, legible y precisa. La experiencia debe sentirse como una
consola de navegación militar de alta tecnología, no como un panel de administración
genérico ni como un cyberpunk ruidoso.

La identidad combina tres ideas: el **impulse** como vector de movimiento, el **núcleo**
como punto de decisión y lo **stellar** como espacio profundo, escala y orientación.
La interfaz existente ya expresa esta dirección mediante fondos estelares, paneles
chamfered, HUD isométrico y estados de flota. Este archivo fija los valores normativos
para que las próximas pantallas no deriven entre cian, azul, verde y estilos de texto.

## Colors

- **Space / Space deep:** fondos de aplicación y escena. Deben dominar la superficie.
- **Surface / Surface raised:** paneles y controles. Mantener diferencias de luminosidad
  pequeñas pero suficientes para separar jerarquías.
- **Primary — Impulse Blue (#36A9FF):** interacción táctica, selección, rutas y foco del
  campo de batalla.
- **Signal Cyan (#71E5DC):** identidad de marca, navegación, labels y estados de consola.
- **Energy / Core (#FFD84D / #F7E77C):** recursos, núcleo, advertencias de objetivo y
  confirmaciones que requieren atención.
- **Blue faction / Red faction:** pertenencia de equipo. Nunca usar estos colores solos
  para comunicar estado; acompañar con texto, forma o icono.
- **Success / Warning:** estados operativos y atención no hostil.

Texto principal, texto secundario y los acentos principales mantienen contraste suficiente
sobre `space` para el uso de HUD. En superficies oscuras, los colores brillantes son
señales escasas: no convertir cada borde en un estado activo.

## Typography

- **Rajdhani** para marca, títulos, labels de HUD, números de recursos, códigos de sala y
  estados compactos. Usar mayúsculas solo para labels o nombres de sistema; títulos largos
  pueden usar capitalización normal.
- **Inter** para párrafos, descripciones, formularios y mensajes de error. Priorizar
  claridad sobre ambientación.
- Los valores numéricos deben usar `tabular-nums` y una jerarquía de al menos 1.4× entre
  el número y su label.
- Tracking recomendado: `0.14em` para labels, `0.06em` para títulos de sistema y entre
  `0` y `0.02em` para párrafos.

## Layout

La unidad base es 4 px; la mayoría de separaciones usa 8, 16, 24 o 32 px. Las pantallas
principales trabajan con una retícula de dos columnas y un ancho útil cercano a 1160–1200
px. El gameplay reserva el centro para el mapa: recursos arriba a la izquierda, estado de
sector arriba al centro, controles arriba a la derecha, minimapa abajo a la izquierda,
escuadrón abajo al centro y acciones en el lateral derecho.

El logo y el header deben conservar aire. Las pantallas de preparación, hangar y ajustes
pueden crecer verticalmente, pero no deben comprimir el mapa táctico ni ocultar el CTA
principal.

## Elevation & Depth

Los paneles usan un fondo oscuro casi opaco, borde de 1 px y sombra corta. Los glows de
cian o azul indican proximidad, selección o disponibilidad; no son decoración permanente
en todos los elementos. El fondo puede contener estrellas, anillos orbitales y scanlines,
siempre con opacidad baja para preservar la lectura.

## Shapes

La geometría de marca es angular: esquinas recortadas de 8–16 px, bordes rectos y radios
mínimos. Reservar `pill` para estados operativos, disponibilidad o filtros. No usar tarjetas
blancas, sombras suaves de producto SaaS ni gradientes multicolor fuera de fondos de energía.

## Components

- **Brand:** logo horizontal sobre `space-deep`; usar el mark aislado en espacios menores.
- **Panel:** `surface` con borde `border`; una esquina o línea superior puede usar `signal`.
- **Primary action:** azul para acciones tácticas; cian para acciones de consola o navegación.
- **Faction state:** azul para aliado, rojo para rival, violeta para neutral. Añadir texto o
  silueta para accesibilidad cromática.
- **HUD numeric:** Rajdhani, alto contraste, cifras alineadas y labels breves.
- **Focus:** contorno amarillo `energy`, 3 px, sin depender del glow.
- **Motion:** transiciones de 120–180 ms; órbitas y scanlines lentas; respetar
  `prefers-reduced-motion` y las preferencias internas de movimiento.

## Do's and Don'ts

- **Sí:** tratar la interfaz como una consola de mando espacial, con jerarquía y silencio
  visual alrededor del mapa.
- **Sí:** usar `Signal Cyan` como firma de marca y `Impulse Blue` como lenguaje táctico.
- **Sí:** acompañar color con texto, forma, posición o icono.
- **Sí:** mantener el logo plano y reproducible en una tinta.
- **No:** introducir otro cian, verde de éxito o amarillo de alerta sin registrarlo aquí.
- **No:** usar scanlines, glitch o glow para compensar una jerarquía débil.
- **No:** deformar, rotar o rellenar el logo dentro de tarjetas.
- **No:** usar la insignia de facción como sustituto del logo del juego.
