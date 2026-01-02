import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Plant Collection',
  description: 'Manage your personal plant collection',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}

