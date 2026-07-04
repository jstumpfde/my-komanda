"use client"

// Монтирует Vercel Analytics только если посетитель дал согласие на
// «Аналитика» в cookie-баннере — баннер и /privacy честно обещают именно
// это (см. components/cookie-consent-banner.tsx), поэтому подключение не
// должно быть безусловным.

import { useEffect, useState } from "react"
import { Analytics } from "@vercel/analytics/next"

const STORAGE_KEY = "c24_cookie_consent"

interface StoredConsent {
  analytics: boolean
}

function readAnalyticsConsent(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as StoredConsent
    return Boolean(parsed.analytics)
  } catch {
    return false
  }
}

export function AnalyticsGate() {
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    setAllowed(readAnalyticsConsent())
    const handler = () => setAllowed(readAnalyticsConsent())
    window.addEventListener("c24:consent-updated", handler)
    return () => window.removeEventListener("c24:consent-updated", handler)
  }, [])

  if (!allowed) return null
  return <Analytics />
}
