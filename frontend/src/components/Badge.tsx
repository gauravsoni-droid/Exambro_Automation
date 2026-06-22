import type { HTMLAttributes } from 'react'

type Variant = 'default' | 'exception' | 'good' | 'bad'

const variants: Record<Variant, string> = {
  default: 'bg-accent-50 text-accent-600',
  exception: 'bg-orange-50 text-orange-600',
  good: 'bg-good/10 text-good',
  bad: 'bg-bad/10 text-bad',
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
}

export default function Badge({ variant = 'default', className = '', ...props }: BadgeProps) {
  return (
    <span
      className={`inline-block text-xs px-[0.6rem] py-[0.1rem] rounded-[10px] mr-2 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
