import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import '../index.css'
import Providers from './providers'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-poppins',
})

export const metadata: Metadata = {
  title: 'ExamBro — AI Content',
  other: { 'theme-color': '#1393ef' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.className}>
      <head>
        <link rel="icon" type="image/png" href="/favicon.png" />
      </head>
      <body className="m-0 bg-bg text-text">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
