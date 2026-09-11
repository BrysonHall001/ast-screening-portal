export function PoweredBy({
  tone = 'light',
}: {
  tone?: 'light' | 'dark'
}) {
  return (
    <div
      className="fixed bottom-3 right-5 text-xs select-none pointer-events-none z-30"
      style={{
        color: tone === 'light' ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.55)',
      }}
    >
      Powered by{' '}
      <span className="font-semibold tracking-wide">ALL-STAR TALENT</span>
    </div>
  )
}
