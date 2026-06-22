export default function LogoIcon({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/brand/icons/logoIcon.svg"
      alt="ExamBro"
      width={size}
      height={size}
      style={{ display: 'block' }}
    />
  )
}
