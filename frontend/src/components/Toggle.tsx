type Props = {
  on: boolean
  onChange: () => void
  disabled?: boolean
}

export default function Toggle({ on, onChange, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className={[
        'w-[42px] h-[25px] rounded-full relative flex-shrink-0 transition-colors duration-200 border-0 p-0 cursor-pointer',
        on ? 'bg-good' : 'bg-border-strong',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[3px] w-[19px] h-[19px] rounded-full bg-white shadow-sm transition-all duration-200',
          on ? 'left-[20px]' : 'left-[3px]',
        ].join(' ')}
      />
    </button>
  )
}
