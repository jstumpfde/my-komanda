"use client"

import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/lib/auth"
import { BundleRefreshGuard } from "@/components/bundle-refresh-guard"
import { MobileBottomNav } from "@/components/dashboard/mobile-nav"
import { BrandColorInjector } from "@/components/brand-color-injector"
import { AiColorInjector } from "@/components/ai-color-injector"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"

// Public pages — доступны без авторизации. Список синхронизирован с
// PUBLIC_PREFIXES в middleware.ts: на этих маршрутах не показываем
// интерфейс платформы (мобильную навигацию).
const PUBLIC_PATHS = [
  "/candidate/", "/schedule/", "/vacancy/", "/ref/", "/v/", "/join/",
  "/register", "/login", "/dev-login", "/landing", "/hr/onboarding",
  "/demo/", "/intake/", "/test/", "/compare/", "/report/",
  "/vacancy-view/", "/candidate-update/",
  "/ask/", "/politicahr2026",
]

function isPublicPath(pathname: string) {
  if (pathname === "/") return true
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p))
}

function MobileNavWrapper() {
  const pathname = usePathname()
  if (isPublicPath(pathname)) return null
  return <MobileBottomNav />
}

// #28 ч.2: применяет company.defaultTheme при ПЕРВОМ визите юзера.
// Если в localStorage уже есть ключ "theme" — пользователь сам выбирал, не трогаем.
// Должен рендериться внутри ThemeProvider (нужен setTheme из next-themes).
const VALID_THEMES = ["light", "dark", "warm"] as const
function CompanyDefaultThemeApplier() {
  const { setTheme } = useTheme()
  useEffect(() => {
    // Проверяем, выбирал ли пользователь тему сам
    const userPicked = typeof window !== "undefined" && localStorage.getItem("theme")
    if (userPicked) return

    // Загружаем настройку компании и применяем, если задана
    let cancelled = false
    fetch("/api/companies")
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, unknown> | null) => {
        if (cancelled || !data) return
        const ct = (data.customTheme ?? data.custom_theme) as Record<string, unknown> | undefined
        const dt = ct?.defaultTheme as string | undefined
        if (dt && VALID_THEMES.includes(dt as typeof VALID_THEMES[number])) {
          setTheme(dt)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        themes={["light", "dark", "warm"]}
        disableTransitionOnChange
      >
        <AuthProvider>
          <BundleRefreshGuard />
          <BrandColorInjector />
          <AiColorInjector />
          <CompanyDefaultThemeApplier />
          {children}
          <MobileNavWrapper />
        </AuthProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
