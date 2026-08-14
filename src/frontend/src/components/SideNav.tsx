import { Icon } from './ui/Icon'

interface NavItem {
  id: string
  label: string
  icon: string
}

const NAV_ITEMS: readonly NavItem[] = [
  { id: 'connection', label: 'Connection', icon: 'lan' },
  { id: 'telegrams', label: 'Telegrams', icon: 'swap_horiz' },
  { id: 'canvas', label: 'Canvas', icon: 'layers' },
  { id: 'automation', label: 'Automation', icon: 'settings_input_component' },
  { id: 'diagnostics', label: 'Diagnostics', icon: 'analytics' },
]

interface SideNavProps {
  activeId: string
  /** Ids of nav items that are implemented and clickable. Others are disabled. */
  enabledIds?: readonly string[]
  onNavigate?: (id: string) => void
}

const ITEM_BASE =
  'flex flex-col items-center justify-center gap-1 p-2 rounded w-full transition-colors duration-150'

export function SideNav({ activeId, enabledIds = [activeId], onNavigate }: SideNavProps) {
  const enabled = new Set(enabledIds)

  return (
    <nav
      aria-label="Primary"
      className="h-full w-20 flex flex-col items-center py-container-padding bg-surface-container border-r border-outline-variant z-20 shrink-0"
    >
      <div className="mb-8 grid h-10 w-10 place-items-center rounded bg-surface-container-high text-secondary-fixed">
        <Icon name="memory" filled />
      </div>

      <ul className="flex flex-col gap-4 w-full px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === activeId
          const isEnabled = enabled.has(item.id)

          if (isEnabled) {
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onNavigate?.(item.id)}
                  className={`${ITEM_BASE} ${
                    isActive
                      ? 'text-secondary-fixed border-l-2 border-secondary-fixed bg-surface-container-high'
                      : 'text-on-surface-variant hover:text-secondary-fixed hover:bg-surface-variant'
                  }`}
                >
                  <Icon name={item.icon} filled={isActive} />
                  <span className="font-label-xs text-label-xs text-center leading-tight">
                    {item.label}
                  </span>
                </button>
              </li>
            )
          }

          return (
            <li key={item.id}>
              <button
                type="button"
                disabled
                title={`${item.label} — coming soon`}
                aria-label={`${item.label} (coming soon)`}
                className={`${ITEM_BASE} text-on-surface-variant/50 cursor-not-allowed`}
              >
                <Icon name={item.icon} />
                <span className="font-label-xs text-label-xs text-center leading-tight">
                  {item.label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
