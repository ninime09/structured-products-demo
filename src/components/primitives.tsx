import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'critical' | 'ai'

export function Button({
  variant = 'secondary',
  icon: Icon,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  icon?: LucideIcon
}) {
  return (
    <button className={`ui-button ${variant} ${className}`.trim()} {...props}>
      {Icon ? <Icon aria-hidden size={15} strokeWidth={1.8} /> : null}
      {children}
    </button>
  )
}

export function IconButton({
  icon: Icon,
  label,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button className={`ui-icon-button ${className}`.trim()} aria-label={label} title={label} {...props}>
      <Icon aria-hidden size={17} strokeWidth={1.8} />
    </button>
  )
}

export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`ui-tag ${tone}`}>{children}</span>
}

export function Avatar({ initials, tone = 'primary', size = 'md' }: { initials: string; tone?: Tone; size?: 'sm' | 'md' }) {
  return <span className={`ui-avatar ${tone} ${size}`}>{initials}</span>
}

export function Panel({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`ui-panel ${className}`.trim()} {...props}>
      {children}
    </div>
  )
}

export function SectionLabel({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <div className="ui-section-label">
      <span>{children}</span>
      {typeof count === 'number' ? <span className="ui-count">{count}</span> : null}
    </div>
  )
}
