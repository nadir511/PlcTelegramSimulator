---
name: Industrial Tech Simulation
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#a4d64c'
  on-secondary: '#233600'
  secondary-container: '#719e13'
  on-secondary-container: '#1e2f00'
  tertiary: '#ffb786'
  on-tertiary: '#502400'
  tertiary-container: '#df7412'
  on-tertiary-container: '#461f00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#bff365'
  secondary-fixed-dim: '#a4d64c'
  on-secondary-fixed: '#131f00'
  on-secondary-fixed-variant: '#354e00'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb786'
  on-tertiary-fixed: '#311400'
  on-tertiary-fixed-variant: '#723600'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-xs:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 16px
  gutter: 12px
  canvas-grid: 20px
---

## Brand & Style

The design system is engineered for mission-critical industrial environments. It adopts a "Dark Industrial Tech" aesthetic, prioritizing information density and technical precision over decorative elements. The visual language is rooted in **Modern Minimalism** with **Technical/Tactile** influences, using structural borders and subtle status glows to mimic hardware control panels.

The interface must evoke a sense of robustness and absolute reliability. It targets automation engineers and PLC programmers who require high-legibility data streams and real-time feedback. Every UI element is purposeful, reducing cognitive load during complex simulation tasks while maintaining a high-fidelity, futuristic workspace.

## Colors

The palette is optimized for low-light control room environments. 
- **Core Surfaces:** The base uses `#121212` to eliminate screen glare, with secondary containers at `#1e1e1e` to create subtle depth.
- **Functional Accents:** Colors are strictly semantic. **Electric Blue** identifies primary interactions. **Cyber Lime** is reserved exclusively for raw data strings and monospaced code output to differentiate logic from UI.
- **Traffic Logic:** Inbound telegrams are coded in **Blue**, while Outbound telegrams use a **Violet** (`#8b5cf6`) to ensure immediate directional recognition in high-speed logs.
- **Status Indicators:** Use a high-vibrancy set for status icons. When a component is "Live," use a 10% opacity glow of the status color to simulate an LED indicator.

## Typography

This design system utilizes a dual-font strategy:
- **Inter** handles all functional UI, navigation, and labels. It is chosen for its exceptional legibility in dense layouts and high X-height.
- **JetBrains Mono** is mandatory for all PLC telegrams, hex values, and memory addresses. The monospaced nature ensures that byte-columns align perfectly for visual scanning.

Scale is kept intentionally small (base 14px) to maximize the amount of information visible on a single screen without scrolling. Use `label-xs` for technical metadata and column headers.

## Layout & Spacing

The layout is a **Fixed Panel Grid**. The interface is split into functional regions: a central simulation canvas and collapsible side panels for telemetry and logs.

- **Simulation Canvas:** Uses a `20px` dot-grid pattern (`#ffffff10`) for object alignment.
- **Data Density:** Use a strict `4px` baseline grid. Padding in data tables should be `8px` horizontal and `4px` vertical to allow for high row counts.
- **Breakpoints:** This tool is designed for Desktop (1440px+) and Industrial Tablets (1024px). Mobile is not supported for simulation editing but may be used for read-only status alerts.

## Elevation & Depth

Hierarchy is achieved through **Low-contrast Outlines** and **Tonal Layering** rather than shadows. 
- **Panels:** Use a 1px solid border (`#ffffff15`) to define panel boundaries.
- **Active State:** Elements that are selected or active should use a "Cyber Lime" or "Electric Blue" 1px border.
- **Glows:** For critical status (Error/Connect), apply a `0px 0px 8px` blur using the status color at 30% opacity to simulate hardware illumination.
- **Canvas:** The background is the lowest layer (`#121212`). All interactive panels sit at `#1e1e1e`.

## Shapes

The design system uses a **Soft (0.25rem)** roundedness for standard components to maintain a modern feel while remaining professional. 
- **Buttons & Inputs:** `4px` (rounded-sm).
- **Status Pills:** `12px` (rounded-full) to distinguish them from interactive buttons.
- **Nodes/Sensors:** Use sharp squares or circles to represent physical hardware components in the simulation view.

## Components

- **Buttons:** Primary buttons are solid `Electric Blue` with white text. Secondary buttons use a ghost style (1px border, no fill).
- **Telegram Logs:** Rows must alternate background colors (`#1e1e1e` and `#252525`). Inbound/Outbound icons should be placed at the start of each row using the defined traffic colors.
- **Input Fields:** Use dark backgrounds (`#121212`) with a subtle `1px` border. On focus, the border transitions to `Electric Blue`.
- **Status Badges:** Compact pills with a dot icon. The dot uses the status color with a subtle glow, and the text is `Inter Bold 11px`.
- **Canvas Elements:** Conveyor belts should be rendered as dark grey tracks with animated chevrons when in "Moving" state.
- **Monospaced Data Tables:** Column headers are uppercase labels. Cells containing Hex/Binary data must use `JetBrains Mono` at `13px`.