import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  clickable?: boolean
}

export default function Card({ clickable = false, className = '', ...props }: CardProps) {
  return (
    <div
      className={
        'bg-white border border-[#ece5db] rounded-xl px-[1.2rem] py-[1rem] mb-4 shadow-card-sm ' +
        (clickable
          ? 'cursor-pointer transition-all duration-200 ' +
            'hover:-translate-y-px hover:border-[#e2dace] hover:shadow-card '
          : '') +
        className
      }
      {...props}
    />
  )
}
