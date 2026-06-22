export default function Logo({ height = 32 }: { height?: number }) {
  return (
    <img
      src="/brand/logos/logo.svg"
      alt="ExamBro"
      height={height}
      style={{ display: 'block' }}
    />
  )
}
