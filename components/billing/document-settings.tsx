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
import { Textarea } from "@/components/ui/textarea"
import { Loader2, FileText } from "lucide-react"
import { toast } from "sonner"

interface DocSettings {
  billingEmail: string | null
  paperInvoicesRequired: boolean | null
  paperInvoiceAddress: string | null
  autoInvoiceEnabled: boolean | null
  edoEnabled: boolean | null
  edoProvider: string | null
  edoOperatorId: string | null
  postalAddress: string | null
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
          <div className="space-y-1.5">
            <Label className="text-sm">Адрес для оригиналов</Label>
            <Textarea
              rows={2}
              value={s.paperInvoiceAddress ?? ""}
              onChange={e => patch({ paperInvoiceAddress: e.target.value })}
              placeholder={s.postalAddress ? `Напр.: ${s.postalAddress}` : "Индекс, город, улица, дом, офис, получатель"}
              className="resize-none"
            />
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
