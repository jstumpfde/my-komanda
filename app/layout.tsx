import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from '@/components/providers'
import { Toaster } from '@/components/ui/sonner'
import {
  getPlatformTitle,
  getPlatformDescription,
  getPlatformOgImage,
  getFaviconUrls,
  PLATFORM_TITLE_DEFAULT,
  PLATFORM_DESCRIPTION_DEFAULT,
  FAVICON_URLS_DEFAULT,
} from '@/lib/platform/settings'
import './globals.css'

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter' })

// generateMetadata в root layout поддерживается Next.js App Router.
// try/catch гарантирует, что при любой ошибке БД layout не падает —
// возвращаются хардкод-дефолты (те же значения, что были раньше).
export async function generateMetadata(): Promise<Metadata> {
  try {
    const [title, description, ogImage, favicon] = await Promise.all([
      getPlatformTitle(),
      getPlatformDescription(),
      getPlatformOgImage(),
      getFaviconUrls(),
    ])

    return {
      title,
      description,
      generator: 'v0.app',
      ...(ogImage ? {
        openGraph: {
          title,
          description,
          images: [{ url: ogImage }],
        },
      } : {}),
      icons: {
        icon: [
          { url: favicon.light, media: '(prefers-color-scheme: light)' },
          { url: favicon.dark,  media: '(prefers-color-scheme: dark)' },
          { url: favicon.svg,   type: 'image/svg+xml' },
        ],
        apple: favicon.apple,
      },
    }
  } catch {
    // Фолбэк при ошибке БД — статические дефолты
    return {
      title: PLATFORM_TITLE_DEFAULT,
      description: PLATFORM_DESCRIPTION_DEFAULT,
      generator: 'v0.app',
      icons: {
        icon: [
          { url: FAVICON_URLS_DEFAULT.light, media: '(prefers-color-scheme: light)' },
          { url: FAVICON_URLS_DEFAULT.dark,  media: '(prefers-color-scheme: dark)' },
          { url: FAVICON_URLS_DEFAULT.svg,   type: 'image/svg+xml' },
        ],
        apple: FAVICON_URLS_DEFAULT.apple,
      },
    }
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          {children}
        </Providers>
        <Toaster position="top-right" />
        <Analytics />
      </body>
    </html>
  )
}
