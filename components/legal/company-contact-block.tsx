"use client"

// Контактный блок компании для /settings/legal: редактируемые реквизиты
// «куда обращаться» (название/email/телефон/юр.адрес/ответственный),
// которые подставляются в публичную политику и документы. Хранятся в
// companies.legal_contact_json (независимо от основных реквизитов).

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Building2, AlertTriangle, Loader2, Save } from "lucide-react"

interface LegalContact {
  companyName?: string
  email?: string
  phone?: string
  legalAddress?: string
  responsible?: string
}

export function CompanyContactBlock() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Значения полей (из legalContactJson; плейсхолдеры — из fallback)
  const [form, setForm] = useState<LegalContact>({})
  const [fallback, setFallback] = useState<LegalContact>({})

  useEffect(() => {
    let cancelled = false
    fetch("/api/companies/legal-contact")
      .then((r) => r.json())
      .then((data: { ok?: boolean; data?: { legalContact?: LegalContact; fallback?: LegalContact } }) => {
        if (cancelled) return
        const d = data?.data ?? {}
        setForm(d.legalContact ?? {})
        setFallback(d.fallback ?? {})
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function set(field: keyof LegalContact, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/companies/legal-contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  const emailValue = form.email ?? ""
  const emailPlaceholder = fallback.email ?? ""

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="w-4 h-4" /> Контактные данные для документов
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Эти реквизиты подставляются в публичную политику конфиденциальности, укажите ваши данные
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-0">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Загрузка...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="lc-company" className="text-xs">Компания</Label>
                <Input
                  id="lc-company"
                  value={form.companyName ?? ""}
                  placeholder={fallback.companyName ?? "Название компании"}
                  onChange={(e) => set("companyName", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lc-responsible" className="text-xs">Ответственный за обработку ПДн</Label>
                <Input
                  id="lc-responsible"
                  value={form.responsible ?? ""}
                  placeholder="ФИО или должность"
                  onChange={(e) => set("responsible", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lc-email" className="text-xs">Email</Label>
                <Input
                  id="lc-email"
                  type="email"
                  value={emailValue}
                  placeholder={emailPlaceholder || "contact@example.ru"}
                  onChange={(e) => set("email", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lc-phone" className="text-xs">Телефон</Label>
                <Input
                  id="lc-phone"
                  value={form.phone ?? ""}
                  placeholder={fallback.phone ?? "+7 (000) 000-00-00"}
                  onChange={(e) => set("phone", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="lc-address" className="text-xs">Юридический адрес</Label>
                <Input
                  id="lc-address"
                  value={form.legalAddress ?? ""}
                  placeholder={fallback.legalAddress ?? "г. Москва, ул. Примерная, д. 1"}
                  onChange={(e) => set("legalAddress", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {!emailValue && !emailPlaceholder && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Не указан контактный email — без него не сгенерировать шаблон политики
                  и не на что принимать обращения по персональным данным.
                </span>
              </div>
            )}

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}

            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="h-8 gap-1.5"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Сохранить контактные данные
              </Button>
              {saved && (
                <span className="text-xs text-muted-foreground">Сохранено</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
