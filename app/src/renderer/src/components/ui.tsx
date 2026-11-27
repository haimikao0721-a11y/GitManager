import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { Check, ChevronDown, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'text-[var(--accent-fg)] bg-[var(--accent)] hover:bg-[var(--accent-strong)] active:bg-[var(--accent-strong)] border border-transparent',
  secondary:
    'bg-[var(--panel-soft)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--panel-hover)] hover:border-[var(--border-strong)]',
  ghost:
    'bg-transparent text-[var(--muted)] border border-transparent hover:text-[var(--text-strong)] hover:bg-[var(--panel-soft)]',
  danger:
    'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger-border)] hover:brightness-110',
  success:
    'bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success-border)] hover:brightness-110'
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs rounded-md gap-1.5',
  md: 'h-8 px-3 text-[13px] rounded-md gap-1.5',
  lg: 'h-9 px-4 text-[13px] rounded-md gap-2',
  icon: 'h-8 w-8 rounded-md justify-center'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'focus-ring inline-flex select-none items-center justify-center font-medium transition-colors duration-100 disabled:pointer-events-none disabled:opacity-45',
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  )
)
Button.displayName = 'Button'

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'outline' | 'muted'

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-[var(--panel-soft)] text-[var(--text)] border border-[var(--border)]',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]',
  success: 'bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success-border)]',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning-border)]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger-border)]',
  outline: 'bg-transparent text-[var(--muted)] border border-[var(--border)]',
  muted: 'bg-[var(--panel-soft)] text-[var(--muted)] border border-transparent'
}

export function Badge({
  children,
  variant = 'default',
  className,
  dot
}: {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
  dot?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium leading-4',
        badgeVariants[variant],
        className
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  )
}

export function Card({
  children,
  className,
  style
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div style={style} className={cn('panel relative overflow-hidden', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({
  title,
  action
}: {
  title: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[13px] font-semibold text-[var(--text-strong)]">{title}</h2>
      {action}
    </div>
  )
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'focus-ring h-9 w-full rounded-md border border-[var(--border)] bg-[var(--input-bg)] px-3 text-[13px] text-[var(--text)] placeholder:text-[var(--faint)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)]',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'focus-ring min-h-[84px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[13px] leading-6 text-[var(--text)] placeholder:text-[var(--faint)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)]',
      className
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export function Field({
  label,
  children,
  className
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">{label}</span>
      {children}
    </label>
  )
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          'focus-ring h-9 w-full appearance-none rounded-md border border-[var(--border)] bg-[var(--input-bg)] px-3 pr-8 text-[13px] text-[var(--text)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)]',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--faint)]" />
    </div>
  )
}

export function Switch({
  checked,
  onCheckedChange,
  disabled
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        'focus-ring relative h-5 w-9 shrink-0 rounded-full border transition-colors',
        checked
          ? 'border-transparent bg-[var(--accent)]'
          : 'border-[var(--border-strong)] bg-[var(--panel-soft)]'
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block h-3.5 w-3.5 rounded-full shadow-sm transition-transform duration-150',
          checked
            ? 'translate-x-[18px] bg-[var(--accent-fg)]'
            : 'translate-x-[2px] bg-[var(--switch-thumb-off)]'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export function Tooltip({
  children,
  content,
  side = 'top'
}: {
  children: React.ReactNode
  content: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-[100] rounded-md border border-[var(--border-strong)] bg-[var(--panel-solid)] px-2 py-1 text-[11px] text-[var(--text)] shadow-lg"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'max-w-lg'
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: string
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          style={{ boxShadow: 'var(--shadow-lg)' }}
          className={cn(
            'fixed left-1/2 top-1/2 z-[90] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--panel-solid)] p-5',
            width
          )}
        >
          <div className="mb-4 pr-7">
            <DialogPrimitive.Title className="text-[15px] font-semibold text-[var(--text-strong)]">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-xs leading-5 text-[var(--muted)]">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <div className="space-y-3.5">{children}</div>
          {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
          <DialogPrimitive.Close asChild>
            <button
              className="focus-ring absolute right-3.5 top-3.5 rounded-md p-1 text-[var(--faint)] transition-colors hover:bg-[var(--panel-soft)] hover:text-[var(--text)]"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-[var(--muted)]', className)} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-md', className)} />
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--panel-soft)] text-[var(--muted)]">
          {icon}
        </div>
      ) : null}
      <h3 className="text-[13px] font-medium text-[var(--text-strong)]">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-xs text-[var(--muted)]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'rounded border border-[var(--border)] bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)]',
        className
      )}
    >
      {children}
    </kbd>
  )
}

export function CheckBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--success)]">
      <Check className="h-3 w-3" /> {children}
    </span>
  )
}

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

export function ContextMenu({
  state,
  onClose
}: {
  state: { x: number; y: number; items: ContextMenuItem[] } | null
  onClose: () => void
}) {
  React.useEffect(() => {
    if (!state) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const handleDismiss = () => onClose()
    window.addEventListener('keydown', handleKey)
    window.addEventListener('mousedown', handleDismiss)
    window.addEventListener('scroll', handleDismiss, true)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('mousedown', handleDismiss)
      window.removeEventListener('scroll', handleDismiss, true)
    }
  }, [onClose, state])

  if (!state) return null

  const menuWidth = 192
  const menuHeight = state.items.length * 32 + 12
  const left = Math.min(state.x, Math.max(8, window.innerWidth - menuWidth - 8))
  const top = Math.min(state.y, Math.max(8, window.innerHeight - menuHeight - 8))

  return (
    <div
      style={{ left, top, boxShadow: 'var(--shadow-lg)' }}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-[110] min-w-[180px] rounded-md border border-[var(--border-strong)] bg-[var(--panel-solid)] p-1"
    >
      {state.items.map((item) => (
        <button
          key={item.label}
          type="button"
          disabled={item.disabled}
          onClick={() => {
            onClose()
            item.onSelect()
          }}
          className={cn(
            'focus-ring flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors disabled:pointer-events-none disabled:opacity-45',
            item.danger
              ? 'text-[var(--danger)] hover:bg-[var(--danger-soft)]'
              : 'text-[var(--text)] hover:bg-[var(--panel-soft)] hover:text-[var(--text-strong)]'
          )}
        >
          {item.icon ? <span className="shrink-0 opacity-80">{item.icon}</span> : null}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  )
}
