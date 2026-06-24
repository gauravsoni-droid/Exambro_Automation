'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void
}

const Ctx = createContext<ToastCtx>({ toast: () => {} })

export function useToast() {
  return useContext(Ctx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastItem[]>([])

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random()
    setList((prev) => [...prev, { id, message, kind }])
    setTimeout(() => setList((prev) => prev.filter((t) => t.id !== id)), 3200)
  }, [])

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-[80px] md:bottom-6 left-0 right-0 z-[300] flex flex-col items-center gap-[8px] pointer-events-none px-4">
        {list.map((t) => (
          <div
            key={t.id}
            className={[
              'pointer-events-auto px-4 py-[10px] rounded-[12px] text-[13px] font-semibold shadow-[0_4px_16px_rgba(0,0,0,.18)] max-w-[380px] w-full text-center',
              t.kind === 'success' ? 'bg-good text-white' :
              t.kind === 'error'   ? 'bg-bad text-white' :
                                     'bg-text text-white',
            ].join(' ')}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
