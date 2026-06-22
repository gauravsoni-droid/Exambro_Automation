type Props = {
  name: string
  className?: string
}

type Style = { bg: string; text: string; dot: string }

function styleFor(name: string): Style {
  const n = name.toLowerCase()
  if (n.includes('news') || n.includes('exam') || n.includes('update') || n.includes('date'))
    return { bg: 'bg-[#eaf1fa]', text: 'text-accent-700', dot: 'bg-accent' }
  if (n.includes('concept') || n.includes('pyq') || n.includes('question') || n.includes('topic'))
    return { bg: 'bg-orange-50', text: 'text-orange-600', dot: 'bg-orange' }
  if (n.includes('motiv') || n.includes('inspir') || n.includes('story'))
    return { bg: 'bg-[#e9f5ef]', text: 'text-good', dot: 'bg-good' }
  if (n.includes('tip') || n.includes('strat') || n.includes('study') || n.includes('revis'))
    return { bg: 'bg-[#eee9fb]', text: 'text-[#6b53c4]', dot: 'bg-[#6b53c4]' }
  if (n.includes('product') || n.includes('app') || n.includes('feature'))
    return { bg: 'bg-[#fbe9ec]', text: 'text-[#c2415c]', dot: 'bg-[#c2415c]' }
  return { bg: 'bg-accent-50', text: 'text-accent-700', dot: 'bg-accent' }
}

export default function TopicPill({ name, className = '' }: Props) {
  const s = styleFor(name)
  return (
    <span
      className={`inline-flex items-center gap-[6px] text-[10.5px] font-bold uppercase tracking-[.04em] px-[9px] py-[5px] rounded-full ${s.bg} ${s.text} ${className}`}
    >
      <span className={`w-[6px] h-[6px] rounded-full ${s.dot} flex-shrink-0`} />
      {name}
    </span>
  )
}
