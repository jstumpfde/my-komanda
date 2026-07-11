"use client"

// Расхождения с CRM — сравнение карточки Bitrix с транскриптом звонка (см.
// lib/db/schema.ts::ropSettings.discrepancy* + AI-ROP-MODULE-PLAN Group 22
// stop-factors-подобный контур). Полноценный пикер пользователей — за
// пределами каркаса фазы 4a, поля admin_user_ids/custom_fields — как
// comma-separated текст (совместимо с jsonb-массивом на бэкенде).
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Scale } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export interface DiscrepancyInitial {
  enabled: boolean
  recipientMode: "manager" | "admins"
  actionMode: "manual" | "auto_approve"
  severityMin: "low" | "medium" | "high"
  customFields: string[] | null
}

export function DiscrepancyCard({ initial }: { initial: DiscrepancyInitial }) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [recipientMode, setRecipientMode] = useState(initial.recipientMode)
  const [actionMode, setActionMode] = useState(initial.actionMode)
  const [severityMin, setSeverityMin] = useState(initial.severityMin)
  const [customFields, setCustomFields] = useState((initial.customFields || []).join(", "))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  async function save() {
    setBusy(true); setSaved(false)
    try {
      await fetch("/api/modules/ai-rop/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discrepancy: {
            enabled,
            recipientMode,
            actionMode,
            severityMin,
            customFields: customFields.split(",").map((s) => s.trim()).filter(Boolean),
          },
        }),
      })
      setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2000)
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><Scale className="size-4 text-violet-600" /> Расхождения с CRM</CardTitle>
        <CardDescription>AI сверяет карточку сделки/лида с содержанием разговора и предлагает исправления полей.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Включить сравнение</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Получатель уведомлений</Label>
            <Select value={recipientMode} onValueChange={(v) => setRecipientMode(v as typeof recipientMode)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="manager">Менеджер сделки</SelectItem><SelectItem value="admins">Директора/руководители</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Режим применения</Label>
            <Select value={actionMode} onValueChange={(v) => setActionMode(v as typeof actionMode)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="manual">Вручную (подтверждение)</SelectItem><SelectItem value="auto_approve">Автоприменение</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Мин. важность</Label>
            <Select value={severityMin} onValueChange={(v) => setSeverityMin(v as typeof severityMin)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="low">Низкая и выше</SelectItem><SelectItem value="medium">Средняя и выше</SelectItem><SelectItem value="high">Только высокая</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Доп. поля для сверки (через запятую)</Label>
          <Input value={customFields} onChange={(e) => setCustomFields(e.target.value)} placeholder="бюджет, срок поставки" />
        </div>
        <div className="flex justify-end gap-2">
          {saved && <span className="self-center text-xs text-emerald-600">Сохранено</span>}
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
