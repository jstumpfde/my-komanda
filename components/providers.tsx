"use client"

import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider, useAuth } from "@/lib/auth"
import { MobileBottomNav } from "@/components/dashboard/mobile-nav"
import type { ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"

// Public pages — доступны без авторизации
const PUBLIC_PATHS = [
  "/candidate/", "/schedule/", "/vacancy/", "/ref/",
  "/register", "/login", "/onboarding",
]

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p))
}

// Guard: редирект на /login если не авторизован
function AuthGuard({ children }: { children: ReactNode }) {
  const { isLoggedIn } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!isLoggedIn && !isPublicPath(pathname)) {
      router.replace("/login")
    }
  }, [isLoggedIn, pathname, router])

  // Показываем публичные страницы всегда, защищённые — только если авторизован
  if (!isLoggedIn && !isPublicPath(pathname)) return null

  return <>{children}</>
}

function MobileNavWrapper() {
  const pathname = usePathname()
  if (isPublicPath(pathname)) return null
  return <MobileBottomNav />
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      themes={["light", "dark", "warm"]}
      disableTransitionOnChange
    >
      <AuthProvider>
        <AuthGuard>
          {children}
          <MobileNavWrapper />
        </AuthGuard>
      </AuthProvider>
    </ThemeProvider>
  )
}
