"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Copy, Link, Plus, Trash2, Loader2 } from "lucide-react"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"

export interface ReferralLink {
  id: string
  name: string
  position: string
  url: string
  clicks: number
  referred: number
  hired: number
  bonus: number
}

export function transliterate(text: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  }
  return text
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

interface ReferralLinksProps {
  links: ReferralLink[]
  bonusPerHire: number
  loading?: boolean
  onAdd: (name: string, position: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function ReferralLinks({ links, bonusPerHire, loading, onAdd, onDelete }: ReferralLinksProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: "", position: "" })
  const [saving, setSaving] = useState(false)

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(`https://${url}`)
    toast.success("Ссылка скопирована")
  }

  const handleAdd = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await onAdd(form.name.trim(), form.position.trim())
      setForm({ name: "", position: "" })
      setAddOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const totalPaid = links.reduce((sum, l) => sum + l.hired * bonusPerHire, 0)

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Link className="w-4 h-4 text-purple-600" />
              Ссылки сотрудников
            </CardTitle>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="w-3.5 h-3.5" />
              Добавить сотрудника
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable>
            <DataHead>
              <DataHeadCell>Сотрудник</DataHeadCell>
              <DataHeadCell>Ссылка</DataHeadCell>
              <DataHeadCell align="center">Переходов</DataHeadCell>
              <DataHeadCell align="center">Привёл</DataHeadCell>
              <DataHeadCell align="center">Нанято</DataHeadCell>
              <DataHeadCell align="right">Бонус</DataHeadCell>
              <DataHeadCell></DataHeadCell>
            </DataHead>
            <tbody>
              {links.map((r) => {
                const earnedBonus = r.hired * bonusPerHire
                return (
                  <DataRow key={r.id}>
                    <DataCell>
                      <p className="font-medium">{r.name}</p>
                      {r.position && <p className="text-[11px] text-muted-foreground">{r.position}</p>}
                    </DataCell>
                    <DataCell>
                      <code className="text-[11px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{r.url}</code>
                    </DataCell>
                    <DataCell align="center">{r.clicks}</DataCell>
                    <DataCell align="center">
                      <Badge variant="secondary" className="text-xs">{r.referred}</Badge>
                    </DataCell>
                    <DataCell align="center">
                      <Badge variant={r.hired > 0 ? "default" : "outline"} className="text-xs">{r.hired}</Badge>
                    </DataCell>
                    <DataCell align="right">
                      <span className={cn("font-semibold", earnedBonus > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                        {earnedBonus > 0 ? `${earnedBonus.toLocaleString("ru-RU")} ₽` : "—"}
                      </span>
                    </DataCell>
                    <DataCell>
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Копировать ссылку" onClick={() => handleCopy(r.url)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Удалить" onClick={() => onDelete(r.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </DataCell>
                  </DataRow>
                )
              })}
              {!loading && links.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Нет сотрудников. Добавьте первого участника программы.</td></tr>
              )}
              {loading && (
                <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка…</td></tr>
              )}
            </tbody>
          </DataTable>
          {links.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground">
              <span>{links.length} сотрудников в программе</span>
              <span>Выплачено: <span className="font-semibold text-emerald-600">{totalPaid.toLocaleString("ru-RU")} ₽</span></span>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Добавить сотрудника</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label className="text-xs">ФИО *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Иван Петров" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Должность</Label>
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Менеджер по продажам" />
            </div>
            {form.name.trim() && (
              <div className="p-2.5 bg-muted/30 rounded-lg">
                <p className="text-[11px] text-muted-foreground mb-1">Ссылка будет создана:</p>
                <code className="text-xs text-foreground">company24.pro/ref/{transliterate(form.name.trim())}</code>
              </div>
            )}
            <Button onClick={handleAdd} disabled={!form.name.trim() || saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Создать ссылку"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
