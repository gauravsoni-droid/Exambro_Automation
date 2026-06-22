type Props = {
  balance: Record<string, number>
  className?: string
}

const COLORS = ['#2b88ca', '#f58645', '#058e6e', '#6b53c4', '#c2415c', '#e67333', '#1c5f94']

export default function PillarBar({ balance, className = '' }: Props) {
  const entries = Object.entries(balance).filter(([, v]) => v > 0)
  const total = entries.reduce((s, [, v]) => s + v, 0)
  if (!entries.length) return null

  return (
    <div className={className}>
      <div className="flex h-[10px] rounded-[6px] overflow-hidden bg-cream">
        {entries.map(([name, count], i) => (
          <div
            key={name}
            style={{ width: `${(count / total) * 100}%`, background: COLORS[i % COLORS.length] }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-[14px] gap-y-[9px] mt-[11px]">
        {entries.map(([name, count], i) => (
          <div key={name} className="flex items-center gap-[6px] text-[11px] font-semibold text-muted">
            <span
              className="w-[9px] h-[9px] rounded-[3px] flex-shrink-0"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            {name}
            <span className="text-text-2 font-bold">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
