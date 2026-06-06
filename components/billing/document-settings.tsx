"use client"

// Настройки документооборота: email для счетов/актов, бумажные оригиналы
// (флаг + адрес), задел под ЭДО, авто-создание счёта за 7 дней.
// Самодостаточный блок для /settings/billing.

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Loader2, FileText } from "lucide-react"
import { toast } from "sonner"

interface DocSettings {
  billingEmail: string | null
  paperInvoicesRequired: boolean | null
  paperInvoiceAddress: string | null
  paperInvoiceIndex: string | null
  paperInvoiceCity: string | null
  paperInvoiceRecipient: string | null
  autoInvoiceEnabled: boolean | null
  edoEnabled: boolean | null
  edoProvider: string | null
  edoOperatorId: string | null
  // Для «подтянуть из адреса компании»:
  postalAddress: string | null
  legalAddress: string | null
  city: string | null
  postalCode: string | null
}

// Разобрать адрес-блоб компании в индекс/город/адрес: выкинуть страну и
// боилерплейт, не дублировать город, сократить «административный округ».
function cleanRussianAddress(blob: string | null, fallbackCity: string | null, fallbackIndex: string | null) {
  let a = (blob ?? "").trim()
  const index = a.match(/\b(\d{6})\b/)?.[1] ?? (fallbackIndex ?? "")
  a = a.replace(/\b\d{6}\b/g, " ")
  a = a.replace(/российск(?:ая|ой)\s+федерац(?:ия|ии)/gi, " ")
       .replace(/\bроссия\b/gi, " ")
       .replace(/столица[^,]*/gi, " ")
       .replace(/город\s+федерального\s+значения/gi, " ")
  let city = (fallbackCity ?? "").trim()
  const cm = a.match(/(?:^|,)\s*(?:г\.?|город)\s+([А-ЯЁ][А-Яа-яЁё-]+)/)
  if (cm) city = cm[1]
  if (city) a = a.replace(new RegExp(`(?:г\\.?\\s*|город\\s+)?${city}\\b`, "gi"), " ")
  a = a.replace(/административный\s+округ/gi, "адм. округ")
  a = a.replace(/\s*,\s*/g, ", ").replace(/(?:,\s*){2,}/g, ", ").replace(/^[\s,]+|[\s,]+$/g, "").replace(/\s{2,}/g, " ")
  return { index, city, address: a }
}

export function DocumentSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [s, setS] = useState<DocSettings | null>(null)

  useEffect(() => {
    fetch("/api/modules/hr/company/billing-documents")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && !d.error) setS(d) })
      .finally(() => setLoading(false))
  }, [])

  function patch(p: Partial<DocSettings>) { setS(prev => prev ? { ...prev, ...p } : prev) }

  // Подтянуть адрес для оригиналов из адреса компании (юр./факт.-почтового).
  function pullFromCompany(kind: "legal" | "postal") {
    if (!s) return
    const addr = kind === "legal" ? s.legalAddress : s.postalAddress
    const { index, city, address } = cleanRussianAddress(addr, s.city, s.postalCode)
    patch({
      paperInvoiceAddress: address || s.paperInvoiceAddress || "",
      paperInvoiceCity: city || s.paperInvoiceCity || "",
      paperInvoiceIndex: index || s.paperInvoiceIndex || "",
    })
    toast.success(kind === "legal" ? "Подтянут юридический адрес" : "Подтянут фактический адрес")
  }

  async function save() {
    if (!s) return
    setSaving(true)
    try {
      const res = await fetch("/api/modules/hr/company/billing-documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingEmail: s.billingEmail ?? "",
          paperInvoicesRequired: !!s.paperInvoicesRequired,
          paperInvoiceAddress: s.paperInvoiceAddress ?? "",
          paperInvoiceIndex: s.paperInvoiceIndex ?? "",
          paperInvoiceCity: s.paperInvoiceCity ?? "",
          paperInvoiceRecipient: s.paperInvoiceRecipient ?? "",
          autoInvoiceEnabled: !!s.autoInvoiceEnabled,
          edoEnabled: !!s.edoEnabled,
          edoProvider: s.edoProvider ?? "",
          edoOperatorId: s.edoOperatorId ?? "",
        }),
      })
      if (res.ok) toast.success("Настройки документов сохранены")
      else { const b = await res.json().catch(() => ({})); toast.error(b.error || "Не удалось сохранить") }
    } catch { toast.error("Ошибка сети") } finally { setSaving(false) }
  }

  if (loading) return <Card className="p-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></Card>
  if (!s) return null

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Документы и доставка</h2>
      </div>

      {/* Email для счетов и актов */}
      <div className="space-y-1.5 max-w-md">
        <Label className="text-sm">Email для счетов и актов</Label>
        <Input
          type="email"
          value={s.billingEmail ?? ""}
          onChange={e => patch({ billingEmail: e.target.value })}
          placeholder="buh@company.ru"
        />
        <p className="text-xs text-muted-foreground">Сюда автоматически уходят счета и закрывающие акты в электронном виде.</p>
      </div>

      {/* Авто-счёт за 7 дней */}
      <div className="flex items-start justify-between gap-4 max-w-2xl">
        <div>
          <Label className="text-sm">Автосчёт на продление</Label>
          <p className="text-xs text-muted-foreground">За 7 календарных дней до окончания периода автоматически формировать счёт и отправлять на email.</p>
        </div>
        <Switch checked={!!s.autoInvoiceEnabled} onCheckedChange={v => patch({ autoInvoiceEnabled: v })} />
      </div>

      {/* Бумажные оригиналы */}
      <div className="space-y-3 max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="text-sm">Нужны бумажные оригиналы</Label>
            <p className="text-xs text-muted-foreground">Высылать оригиналы счетов почтой по указанному адресу.</p>
          </div>
          <Switch checked={!!s.paperInvoicesRequired} onCheckedChange={v => patch({ paperInvoicesRequired: v })} />
        </div>
        {s.paperInvoicesRequired && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-sm font-medium">Адрес для оригиналов</Label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">подтянуть:</span>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => pullFromCompany("legal")}>Юридический</Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => pullFromCompany("postal")}>Фактический</Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Получатель</Label>
              <Input value={s.paperInvoiceRecipient ?? ""} onChange={e => patch({ paperInvoiceRecipient: e.target.value })} placeholder="ООО «Компания» / ФИО" className="h-9" />
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Индекс</Label>
                <Input value={s.paperInvoiceIndex ?? ""} onChange={e => patch({ paperInvoiceIndex: e.target.value })} placeholder="101000" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Город</Label>
                <Input value={s.paperInvoiceCity ?? ""} onChange={e => patch({ paperInvoiceCity: e.target.value })} placeholder="Москва" className="h-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Улица, дом, офис</Label>
              <Input value={s.paperInvoiceAddress ?? ""} onChange={e => patch({ paperInvoiceAddress: e.target.value })} placeholder="ул. Тверская, д. 1, оф. 100" className="h-9" />
            </div>
          </div>
        )}
      </div>

      {/* ЭДО — Диадок (Контур). Задел на будущее: подключение API позже. */}
      <div className="space-y-3 max-w-2xl border-t pt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="text-sm">ЭДО через Диадок</Label>
            <p className="text-xs text-muted-foreground">Обмен счетами и актами через Контур.Диадок. Автоматическая отправка появится позже — пока укажите идентификатор организации в Диадоке.</p>
          </div>
          <Switch
            checked={!!s.edoEnabled}
            onCheckedChange={v => patch({ edoEnabled: v, ...(v && !s.edoProvider ? { edoProvider: "Диадок" } : {}) })}
          />
        </div>
        {s.edoEnabled && (
          <div className="space-y-1.5 max-w-md">
            <Label className="text-sm">Идентификатор организации в Диадок</Label>
            <Input value={s.edoOperatorId ?? ""} onChange={e => patch({ edoOperatorId: e.target.value })} placeholder="напр. 2AE3D09F-..." />
            <p className="text-xs text-muted-foreground">ID участника ЭДО (box_id). В Диадоке: Настройки → Реквизиты организации.</p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-1.5">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}Сохранить
        </Button>
      </div>
    </Card>
  )
}
