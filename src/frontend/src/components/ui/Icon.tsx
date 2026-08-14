interface IconProps {
  /** Material Symbols ligature name, e.g. `lan`, `power_settings_new`. */
  name: string
  className?: string
  filled?: boolean
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700
}

/** Decorative Material Symbols icon. Pair with visible/aria text for meaning. */
export function Icon({ name, className, filled = false, weight = 400 }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ''}`.trim()}
      style={{ fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}` }}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}
