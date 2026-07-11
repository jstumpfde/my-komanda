"use client"

// Скрипты продаж и чек-листы — CRUD (rop_sales_scripts) + «Из шаблона» (4
// готовых шаблона Орлинка — lib/ai-rop/script-templates.ts::TEMPLATES,
// применяются server-side по templateKey, текст шаблонов НЕ бандлится в клиент).
// Полноценный markdown/.docx-импорт — следующая под-фаза (план п.12).
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ListChecks, Plus, Pencil, Trash2, ChevronDown } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter } from "@/components/ui/sheet"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"

export interface ChecklistItemForm { id: string; title: string; weight: number; description: string }
export interface ScriptRow {
  id: string
  name: string
  product: string | null
  direction: "in" | "out" | "all"
  isActive: boolean
  contentMd: string
  checklistJson: ChecklistItemForm[]
  updatedAt: string
}

const TEMPLATE_OPTIONS = [
  { key: "mp", label: "Металлопрокат (МП)" },
  { key: "mk", label: "Металлоконструкции (МК)" },
  { key: "cold", label: "Холодный звонок" },
  { key: "deal", label: "Звонок по сделке" },
]
const DIRECTION_LABEL: Record<string, string> = { in: "Входящие", out: "Исходящие", all: "Оба направления" }

function emptyItem(): ChecklistItemForm { return { id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, title: "", weight: 3, description: "" } }

function ScriptEditorSheet({ script, open, onOpenChange }: { script: ScriptRow | Partial<ScriptRow> | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const isNew = !script?.id
  const [name, setName] = useState(script?.name ?? "")
  const [product, setProduct] = useState(script?.product ?? "")
  const [direction, setDirection] = useState<ScriptRow["direction"]>((script?.direction as ScriptRow["direction"]) ?? "all")
  const [isActive, setIsActive] = useState(script?.isActive ?? true)
  const [contentMd, setContentMd] = useState(script?.contentMd ?? "")
  const [checklist, setChecklist] = useState<ChecklistItemForm[]>(script?.checklistJson ?? [])
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  function updateItem(i: number, patch: Partial<ChecklistItemForm>) {
    setChecklist((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  async function save() {
    setBusy(true)
    try {
      const body = { name: name.trim() || "Без названия", product: product.trim() || null, direction, is_active: isActive, content_md: contentMd, checklist: checklist.filter((c) => c.title.trim()) }
      if (isNew) {
        await fetch("/api/modules/ai-rop/scripts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      } else {
        await fetch(`/api/modules/ai-rop/scripts/${script!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      }
      onOpenChange(false)
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader><SheetTitle>{isNew ? "Новый скрипт" : "Редактировать скрипт"}</SheetTitle></SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          <div><Label className="mb-1.5 block text-xs text-muted-foreground">Название</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="mb-1.5 block text-xs text-muted-foreground">Код продукта</Label><Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="МП" /></div>
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Направление</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as ScriptRow["direction"])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Оба</SelectItem><SelectItem value="in">Входящие</SelectItem><SelectItem value="out">Исходящие</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between"><span className="text-sm">Активен</span><Switch checked={isActive} onCheckedChange={setIsActive} /></div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Чек-лист QC</Label>
              <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setChecklist((p) => [...p, emptyItem()])}><Plus className="size-3" /> Пункт</Button>
            </div>
            <div className="flex flex-col gap-2">
              {checklist.map((item, i) => (
                <div key={item.id} className="rounded-lg border p-2.5">
                  <div className="grid grid-cols-[1fr_70px_28px] gap-2">
                    <Input value={item.title} onChange={(e) => updateItem(i, { title: e.target.value })} placeholder="Название пункта" className="h-8 text-xs" />
                    <Select value={String(item.weight)} onValueChange={(v) => updateItem(i, { weight: Number(v) })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{[1, 2, 3, 4, 5].map((w) => <SelectItem key={w} value={String(w)}>×{w}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => setChecklist((p) => p.filter((_, idx) => idx !== i))}><Trash2 className="size-3.5" /></Button>
                  </div>
                  <Input value={item.description} onChange={(e) => updateItem(i, { description: e.target.value })} placeholder="Что именно считается выполнением (для AI)" className="mt-1.5 h-8 text-xs" />
                </div>
              ))}
              {checklist.length === 0 && <div className="text-xs text-muted-foreground">Пунктов пока нет — добавьте вручную или начните «Из шаблона».</div>}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Текст скрипта (Markdown, опционально)</Label>
            <Textarea value={contentMd} onChange={(e) => setContentMd(e.target.value)} rows={8} className="font-mono text-xs" />
          </div>
        </SheetBody>
        <SheetFooter>
          <div className="flex w-full justify-end"><Button onClick={save} disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</Button></div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export function ScriptsCard({ scripts }: { scripts: ScriptRow[] }) {
  const [editing, setEditing] = useState<ScriptRow | Partial<ScriptRow> | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const router = useRouter()

  async function fromTemplate(key: string) {
    await fetch(`/api/modules/ai-rop/scripts/template?key=${key}`, { method: "POST" })
    router.refresh()
  }

  async function remove(id: string) {
    if (!confirm("Удалить скрипт?")) return
    await fetch(`/api/modules/ai-rop/scripts/${id}`, { method: "DELETE" })
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><ListChecks className="size-4 text-violet-600" /> Скрипты и чек-листы</CardTitle>
        <CardDescription>Активный скрипт по продукту определяет чек-лист, по которому AI оценивает звонок.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="gap-1.5">Из шаблона <ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {TEMPLATE_OPTIONS.map((t) => <DropdownMenuItem key={t.key} onClick={() => fromTemplate(t.key)}>{t.label}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="gap-1.5" onClick={() => { setEditing({ direction: "all", isActive: true, checklistJson: [] }); setSheetOpen(true) }}>
            <Plus className="size-3.5" /> Создать
          </Button>
        </div>

        {scripts.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Скриптов пока нет — начните с шаблона Орлинка или создайте свой.</div>
        ) : (
          <DataTable>
            <DataHead>
              <DataHeadCell>Название</DataHeadCell>
              <DataHeadCell>Продукт</DataHeadCell>
              <DataHeadCell>Направление</DataHeadCell>
              <DataHeadCell>Пунктов</DataHeadCell>
              <DataHeadCell>Статус</DataHeadCell>
              <DataHeadCell align="right">Действия</DataHeadCell>
            </DataHead>
            <tbody>
              {scripts.map((s) => (
                <DataRow key={s.id}>
                  <DataCell className="font-medium">{s.name}</DataCell>
                  <DataCell>{s.product || "—"}</DataCell>
                  <DataCell>{DIRECTION_LABEL[s.direction]}</DataCell>
                  <DataCell>{s.checklistJson?.length ?? 0}</DataCell>
                  <DataCell>{s.isActive ? <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">активен</Badge> : <Badge variant="outline" className="text-muted-foreground">выключен</Badge>}</DataCell>
                  <DataCell align="right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => { setEditing(s); setSheetOpen(true) }}><Pencil className="size-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => remove(s.id)}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </DataCell>
                </DataRow>
              ))}
            </tbody>
          </DataTable>
        )}
      </CardContent>

      {sheetOpen && <ScriptEditorSheet script={editing} open={sheetOpen} onOpenChange={setSheetOpen} />}
    </Card>
  )
}
