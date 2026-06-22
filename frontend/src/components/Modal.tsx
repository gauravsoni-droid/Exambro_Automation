import type { ReactNode } from 'react'

interface ModalProps {
  title: ReactNode
  children: ReactNode
  actions: ReactNode
}

export default function Modal({ title, children, actions }: ModalProps) {
  return (
    <div className="fixed inset-0 bg-[rgba(15,23,42,0.45)] backdrop-blur-[8px] flex items-center justify-center z-[9999]">
      <div className="max-w-[460px] bg-white rounded-3xl p-7 border border-border shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
        <h3 className="m-0 mb-3">{title}</h3>
        <div className="text-[#666]">{children}</div>
        <div className="flex justify-end gap-3 mt-6">{actions}</div>
      </div>
    </div>
  )
}
