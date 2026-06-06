"use client"

// Группа 38: переключатель «использовать брендинг компании» / собственный.
// Сохраняет vacancies.branding_override_enabled через PATCH вакансии.

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function BrandingOverrideSwitch({ vacancyId }: { vacancyId: string }) {
  const [override, setOverride] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/modules/hr/vacancies/${vacancyId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { brandingOverrideEnabled?: boolean } | null) => {
        if (d?.brandingOverrideEnabled === true) setOverride(true)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [vacancyId])

  const toggle = async (v: boolean) => {
    setOverride(v)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ branding_override_enabled: v }),
      })
      if (!res.ok) throw new Error("save_failed")
      toast.success(v ? "Используется собственный брендинг вакансии" : "Используется брендинг компании")
    } catch {
      setOverride(!v)
      toast.error("Не удалось переключить")
    }
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Label className="text-sm">Использовать брендинг компании</Label>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Логотип и цвета берутся из{" "}
          <Link href="/settings/branding" className="text-primary hover:underline">
            настроек компании
          </Link>
          . Отключите чтобы задать собственные значения для этой вакансии.
        </p>
      </div>
      <Switch
        checked={!override}
        onCheckedChange={(v) => toggle(!v)}
        disabled={!loaded}
      />
    </div>
  )
}
