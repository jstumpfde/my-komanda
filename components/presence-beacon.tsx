"use client"

// Маяк присутствия. Раз в ~45 сек шлёт текущий путь в публичный /api/visit-log
// (анонимно — userId/tenantId там null для кандидатов). По свежим записям
// платформенная админка видит, кто сейчас на сайте (в т.ч. кандидаты на
// демо/анкетах) — гейт безопасности деплоя.
//
// Лёгкий, без зависимостей: ставится на публичные кандидатские страницы.

import { useEffect } from "react"

const SID_KEY = "myk_presence_sid"

function getSessionId(): string {
  try {
    let s = localStorage.getItem(SID_KEY)
    if (!s) {
      s = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `s_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
      localStorage.setItem(SID_KEY, s)
    }
    return s
  } catch {
    return "anon"
  }
}

// page — необязательная метка пути; по умолчанию берём фактический pathname.
export function PresenceBeacon({ page }: { page?: string }) {
  useEffect(() => {
    const sid = getSessionId()
    const ping = () => {
      const path = page ?? (typeof window !== "undefined" ? window.location.pathname : "")
      if (!path) return
      fetch("/api/visit-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: path, sessionId: sid }),
        keepalive: true,
      }).catch(() => {})
    }
    ping()
    const timer = setInterval(ping, 45_000)
    // Доп. пинг при возврате во вкладку — чтобы присутствие было «живым».
    const onVisible = () => { if (document.visibilityState === "visible") ping() }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [page])

  return null
}
