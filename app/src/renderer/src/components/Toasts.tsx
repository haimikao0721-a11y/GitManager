import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info
}

const iconTone = {
  success: 'text-[var(--success)]',
  error: 'text-[var(--danger)]',
  info: 'text-[var(--accent)]'
}

const borderTone = {
  success: 'border-[var(--success-border)]',
  error: 'border-[var(--danger-border)]',
  info: 'border-[var(--accent-border)]'
}

export function Toasts() {
  const toasts = useAppStore((state) => state.toasts)
  const dismissToast = useAppStore((state) => state.dismissToast)

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[340px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = icons[toast.kind]
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.15 }}
              style={{ boxShadow: 'var(--shadow-lg)' }}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-[var(--panel-solid)] p-3',
                borderTone[toast.kind]
              )}
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconTone[toast.kind])} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-[var(--text-strong)]">{toast.title}</div>
                {toast.description ? (
                  <div className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-xs leading-4 text-[var(--muted)]">
                    {toast.description}
                  </div>
                ) : null}
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                className="focus-ring rounded p-0.5 text-[var(--faint)] transition-colors hover:text-[var(--text)]"
                aria-label="关闭提示"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
