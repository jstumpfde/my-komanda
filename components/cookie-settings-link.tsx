"use client"

import { openCookieSettings } from "@/components/cookie-consent-banner"

export function CookieSettingsLink() {
  return (
    <button
      type="button"
      onClick={openCookieSettings}
      className="text-indigo-600 hover:text-indigo-500 underline underline-offset-2 text-sm"
    >
      Управление cookie
    </button>
  )
}
