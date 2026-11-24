import { Toast as T } from 'radix-ui'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface ToastMessage {
  id: number
  title: string
  description?: string
}

const ToastContext = createContext<(title: string, description?: string) => void>(() => undefined)

/** `const toast = useToast(); toast('Saved')`. Toasts are polite: announced without stealing focus. */
export const useToast = () => useContext(ToastContext)

/**
 * Hosts toasts in a polite live region in the corner. Each stays until dismissed or for 8 seconds, and
 * pauses while hovered or focused; F8 moves focus to them.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const show = useCallback((title: string, description?: string) => {
    setToasts((t) => [
      ...t,
      { id: (t.at(-1)?.id ?? 0) + 1, title, ...(description ? { description } : {}) },
    ])
  }, [])
  const value = useMemo(() => show, [show])
  return (
    <ToastContext value={value}>
      <T.Provider duration={8000} swipeDirection="right" label="Notification">
        {children}
        {toasts.map((t) => (
          <T.Root
            key={t.id}
            type="background"
            onOpenChange={(open) => {
              if (!open) setToasts((all) => all.filter((x) => x.id !== t.id))
            }}
            className="rounded-md border-2 border-line bg-surface p-4 text-ink shadow-lg"
          >
            <T.Title className="font-bold">{t.title}</T.Title>
            {t.description && (
              <T.Description className="mt-1 text-ink-muted">{t.description}</T.Description>
            )}
            <T.Close className="mt-2 min-h-11 rounded-md border border-line px-3 outline-none focus-visible:outline-[3px] focus-visible:outline-focus focus-visible:outline-solid">
              Dismiss
            </T.Close>
          </T.Root>
        ))}
        <T.Viewport className="fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 outline-none" />
      </T.Provider>
    </ToastContext>
  )
}
