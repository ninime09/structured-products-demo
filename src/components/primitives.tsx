import { useState } from 'react'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'critical' | 'ai'

/**
 * agent 回答下面那排「复制 / 有用 / 没用」。
 *
 * 反馈只存在这一条消息的本地 state：demo 里没有回收反馈的地方，
 * 假装它写进了什么后台反而是骗人——这里只负责让"我表过态"这件事看得见。
 * 复制走 navigator.clipboard，失败就静默（http 以外的场景拿不到剪贴板）。
 */
export function AnswerActions({ text, zh = true, className = '' }: { text: string; zh?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false)
  const [vote, setVote] = useState<'up' | 'down' | null>(null)
  const copy = () => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      },
      () => {},
    )
  }
  const label = (a: string, b: string) => (zh ? a : b)
  return (
    <div className={`answer-actions ${className}`.trim()}>
      <button className={copied ? 'acted' : ''} title={label('复制回答', 'Copy answer')} aria-label={label('复制回答', 'Copy answer')} onClick={copy}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        <span>{copied ? label('已复制', 'Copied') : label('复制', 'Copy')}</span>
      </button>
      <button
        className={vote === 'up' ? 'acted' : ''}
        title={label('这条有用', 'Helpful')}
        aria-label={label('这条有用', 'Helpful')}
        aria-pressed={vote === 'up'}
        onClick={() => setVote(vote === 'up' ? null : 'up')}
      >
        <ThumbsUp size={13} />
      </button>
      <button
        className={vote === 'down' ? 'acted' : ''}
        title={label('这条不对', 'Not helpful')}
        aria-label={label('这条不对', 'Not helpful')}
        aria-pressed={vote === 'down'}
        onClick={() => setVote(vote === 'down' ? null : 'down')}
      >
        <ThumbsDown size={13} />
      </button>
    </div>
  )
}

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
