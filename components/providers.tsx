"use client"

import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/lib/auth"
import { MobileBottomNav } from "@/components/dashboard/mobile-nav"
import type { ReactNode } from "react"
import { usePathname } from "next/navigation"

// Public pages — доступны без авторизации (guard теперь в middleware.ts)
const PUBLIC_PATHS = [
  "/candidate/", "/schedule/", "/vacancy/", "/ref/",
  "/register", "/login", "/onboarding",
]

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p))
}

function MobileNavWrapper() {
  const pathname = usePathname()
  if (isPublicPath(pathname)) return null
  return <MobileBottomNav />
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
          {children}
          <MobileNavWrapper />
        </AuthProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
