"use client"

import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/lib/auth"
import { MobileBottomNav } from "@/components/dashboard/mobile-nav"
import type { ReactNode } from "react"
import { usePathname } from "next/navigation"

// Public pages without mobile nav
const PUBLIC_PATHS = ["/candidate/", "/schedule/", "/vacancy/", "/ref/", "/register", "/login", "/onboarding"]

function MobileNavWrapper() {
  const pathname = usePathname()
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))
  if (isPublic) return null
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
        {children}
        <MobileNavWrapper />
      </AuthProvider>
    </ThemeProvider>
  )
}
