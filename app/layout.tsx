import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'All-Star Screening Portal',
  description: 'Pre-employment social media screening, done right.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-theme="allstar">
      <body>{children}</body>
    </html>
  )
}
