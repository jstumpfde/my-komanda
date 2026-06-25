"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const CONSENT_KEY = "cookie_consent_v1"

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) {
      setVisible(true)
    }
  }, [])

  function accept() {
    localStorage.setItem(CONSENT_KEY, "accepted")
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-lg">
      <div className="container mx-auto flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Мы используем файлы cookie для корректной работы сайта и улучшения сервиса. Продолжая пользоваться сайтом, вы соглашаетесь с нашей{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Политикой конфиденциальности
          </Link>
          .
        </p>
        <Button size="sm" onClick={accept} className="shrink-0">
          Принять
        </Button>
      </div>
    </div>
  )
}
