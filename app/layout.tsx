import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: 'AI Proof Prototype',
  description: 'AI summarization with Ethereum wallet signing and IPFS storage',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}