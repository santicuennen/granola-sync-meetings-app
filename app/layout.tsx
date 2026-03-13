import './globals.css'

export const metadata = {
  title: 'Meetings Vault',
  description: 'Your Granola meetings, organized and searchable',
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
