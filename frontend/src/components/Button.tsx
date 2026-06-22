import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'success'
type Size = 'default' | 'small'

const base =
  'rounded-[14px] font-sans font-bold cursor-pointer transition-all duration-150 ease-in-out inline-flex items-center justify-center gap-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 active:scale-[.98]'

const sizes: Record<Size, string> = {
  default: 'px-[15px] py-[13px] text-[14px] leading-none',
  small:   'px-[11px] py-[8px]  text-[12px] leading-none',
}

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-br from-orange to-orange-600 text-white border-none ' +
    'shadow-[0_8px_20px_rgba(245,133,69,.36)] hover:enabled:brightness-105',
  ghost:
    'bg-white border-[1.5px] border-[#ddd5c9] text-navy ' +
    'hover:enabled:border-[#8b93a1]',
  danger:
    'bg-bad text-white border-none ' +
    'hover:enabled:bg-[#b42318] hover:enabled:-translate-y-px',
  success:
    'bg-good text-white border-none ' +
    'hover:enabled:bg-[#047a5e] hover:enabled:-translate-y-px',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export default function Button({
  variant = 'primary',
  size = 'default',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
