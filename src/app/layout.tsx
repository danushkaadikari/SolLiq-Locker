'use client'

import { Inter } from 'next/font/google'
import './globals.css'
import dynamic from 'next/dynamic'
import { clusterApiUrl } from '@solana/web3.js'
import { useMemo } from 'react'

const WalletConnectionProvider = dynamic(
  () => import('../components/WalletConnectionProvider'),
  { ssr: false }
)

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const endpoint = useMemo(() => clusterApiUrl('devnet'), [])

  return (
    <html lang="en">
      <body className={inter.className}>
        <WalletConnectionProvider endpoint={endpoint}>
          {children}
        </WalletConnectionProvider>
      </body>
    </html>
  )
}
