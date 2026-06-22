import { Fragment } from 'react'

type Props = {
  /** 1 = picking topic, 2 = reviewing post, 3 = done */
  step: 1 | 2 | 3
}

type State = 'pending' | 'active' | 'done'

const STEPS = [
  { n: 1, label: 'Topic' },
  { n: 2, label: 'Post' },
  { n: 3, label: 'Done' },
]

function Bubble({ n, state }: { n: number; state: State }) {
  const base = 'w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 border-2'
  if (state === 'active')
    return <span className={`${base} bg-orange border-orange text-white`}>{n}</span>
  if (state === 'done')
    return <span className={`${base} bg-good border-good text-white`}>✓</span>
  return <span className={`${base} bg-white border-border text-muted`}>{n < 3 ? n : '✓'}</span>
}

export default function TapTracker({ step }: Props) {
  const stateOf = (n: number): State => (step > n ? 'done' : step === n ? 'active' : 'pending')

  return (
    <div className="flex items-center gap-2 bg-white border border-border rounded-[14px] px-3 py-[10px] mb-4 shadow-card-sm">
      {STEPS.map((s, i) => (
        <Fragment key={s.n}>
          <div className="flex items-center gap-[7px] flex-1 min-w-0">
            <Bubble n={s.n} state={stateOf(s.n)} />
            <span
              className={`text-[12px] font-semibold leading-none truncate ${
                stateOf(s.n) !== 'pending' ? 'text-text' : 'text-muted'
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="w-[14px] h-[2px] bg-border rounded-full flex-shrink-0" />
          )}
        </Fragment>
      ))}
    </div>
  )
}
