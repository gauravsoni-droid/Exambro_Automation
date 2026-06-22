type Option = { label: string; value: string }

type Props = {
  options: Option[]
  value: string
  onChange: (v: string) => void
  className?: string
}

export default function SegControl({ options, value, onChange, className = '' }: Props) {
  return (
    <div className={`flex bg-cream rounded-[11px] p-[3px] gap-[3px] ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            'flex-1 border-0 rounded-[9px] py-[9px] px-2 text-[12px] font-bold cursor-pointer transition-all duration-150 leading-none',
            value === opt.value
              ? 'bg-white text-text shadow-sm'
              : 'bg-transparent text-muted hover:text-text-2',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
