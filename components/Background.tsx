// A subtle triangular tile pattern, layered over the All-Star blue.
// Matches the pattern in the All-Star Chat login screen.
// `variant`:
//   - "auth"   : full-screen gradient background (login, setup, reset, etc.)
//   - "shell"  : flat solid for use behind dashboard cards (lighter dust)
export function Background({
  variant = 'auth',
  children,
}: {
  variant?: 'auth' | 'shell'
  children: React.ReactNode
}) {
  return (
    <div
      className="min-h-screen relative"
      style={{
        background:
          variant === 'auth'
            ? 'linear-gradient(135deg, rgb(var(--canvas)) 0%, rgb(var(--canvas-mid)) 50%, rgb(var(--canvas)) 100%)'
            : 'rgb(var(--canvas))',
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(45deg, transparent 49.5%, rgba(255,255,255,0.07) 49.5%, rgba(255,255,255,0.07) 50.5%, transparent 50.5%),
            linear-gradient(-45deg, transparent 49.5%, rgba(255,255,255,0.07) 49.5%, rgba(255,255,255,0.07) 50.5%, transparent 50.5%)
          `,
          backgroundSize: '120px 120px',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}
