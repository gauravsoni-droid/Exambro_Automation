import type { ReactNode } from 'react'

type Props = {
  icon: string
  title: string
  subtitle: string
  children: ReactNode
  className?: string
}

export default function SetSection({ icon, title, subtitle, children, className = '' }: Props) {
  return (
    <div className={`bg-white border border-border rounded-[16px] px-4 mb-[14px] shadow-card-sm ${className}`}>
      <div className="flex items-center gap-[10px] py-[13px]">
        <div className="w-8 h-8 rounded-[9px] bg-bg flex items-center justify-center text-[16px] flex-shrink-0 select-none">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-text m-0 leading-tight">{title}</p>
          <p className="text-[11.5px] font-medium text-muted mt-[2px] m-0 leading-snug">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}
