import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const fieldClass =
  'w-full bg-white border border-border rounded-[10px] text-text px-[0.9rem] py-[0.75rem] ' +
  'text-[0.95rem] font-sans transition-all duration-200 ease-in-out ' +
  'placeholder:text-[#a9a9a9] ' +
  'focus:outline-none focus:border-accent focus:shadow-[0_0_0_4px_rgba(43,136,202,0.12)]'

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldClass} ${className}`} {...props} />
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={`${fieldClass} min-h-[90px] resize-y ${className}`} {...props} />
  )
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${fieldClass} ${className}`} {...props} />
}
