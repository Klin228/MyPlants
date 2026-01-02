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
      <body>{children}</body>
    </html>
  )
}

