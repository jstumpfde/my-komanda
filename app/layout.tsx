import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Providers } from '@/components/providers'
import { Toaster } from '@/components/ui/sonner'
import { StaleDeploymentReload } from '@/components/stale-deployment-reload'
import { CookieConsentBanner } from '@/components/cookie-consent-banner'
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

// Локальный self-hosted Inter вместо next/font/google — Google Fonts периодически
// недоступен/медленный при сборке на серверах в РФ. InterVariable.woff2 —
// официальный variable-файл с github.com/rsms/inter (латиница+кириллица+доп.
// скрипты, вес 100-900), покрывает те же символы, что и прежние Google-сабсеты
// latin+cyrillic. declarations форсирует font-family: Inter (без него
// next/font сгенерировал бы другое имя) — сохраняет совместимость с
// --font-sans: 'Inter', 'Inter Fallback', ... в globals.css без правок там.
const inter = localFont({
  src: './fonts/inter/InterVariable.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-inter',
  declarations: [{ prop: 'font-family', value: 'Inter' }],
})

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
        <StaleDeploymentReload />
        <CookieConsentBanner />
      </body>
    </html>
  )
}
