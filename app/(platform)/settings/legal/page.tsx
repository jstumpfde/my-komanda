"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollText } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { LegalEditor } from "@/components/legal/legal-editor"

export default function LegalSettingsPage() {
  const { hasAccess } = useAuth()

  if (!hasAccess(["platform_admin"])) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <h1 className="text-xl font-semibold mb-2">Доступ ограничен</h1>
        <p className="text-sm text-muted-foreground">Эта страница доступна только администратору платформы.</p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-foreground mb-1">Юридические документы</h1>
        <p className="text-muted-foreground text-sm">
          Тексты юридических документов, опубликованные на сайте. Изменения вступают в силу сразу после сохранения.
        </p>
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base flex items-center gap-2">
              <ScrollText className="w-4 h-4" /> Политика конфиденциальности
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Опубликовано на странице{" "}
              <Link href="/politicahr2026" className="text-primary hover:underline" target="_blank">
                /politicahr2026
              </Link>
            </p>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-0">
            <LegalEditor slug="privacy_policy" />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
