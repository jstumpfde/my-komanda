"use client"

// ТЗ №1: секция «Профиль продукта (для найма)» в hiring-settings.
// Ручное заполнение профиля продукта/продаж компании. Хранится в
// hiring_defaults_json.productProfiles[] + defaultProductProfileId.
// Без связи с вакансией и sales-модулем (это следующие ТЗ).

import { useState } from "react"
import { Package, Save, Loader2, Plus, Trash2, Star, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { CompanyHiringDefaults } from "@/lib/db/schema"
import {
  SALES_TYPES, DEAL_CYCLES, SALES_CHANNELS, makeProductProfile, normalizeProductProfiles,
  type ProductProfile,
} from "@/lib/hiring/product-profile"

export function ProductProfileSection({ defaults, onPatch }: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}) {
  const initial = normalizeProductProfiles(defaults.productProfiles)
  const [profiles, setProfiles] = useState<ProductProfile[]>(initial.length ? initial : [makeProductProfile()])
  const [defaultId, setDefaultId] = useState<string>(
    defaults.defaultProductProfileId && initial.some(p => p.id === defaults.defaultProductProfileId)
      ? defaults.defaultProductProfileId
      : (initial[0]?.id ?? ""),
  )
  const [saving, setSaving] = useState(false)

  const single = profiles.length === 1
  const update = (id: string, patch: Partial<ProductProfile>) => setProfiles(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p))
  const addProfile = () => { const p = makeProductProfile(`Продукт ${profiles.length + 1}`); setProfiles(ps => [...ps, p]) }
  const removeProfile = (id: string) => setProfiles(ps => {
    const next = ps.filter(p => p.id !== id)
    if (id === defaultId) setDefaultId(next[0]?.id ?? "")
    return next.length ? next : [makeProductProfile()]
  })

  const save = async () => {
    setSaving(true)
    try {
      const did = profiles.some(p => p.id === defaultId) ? defaultId : (profiles[0]?.id ?? "")
      await onPatch({ productProfiles: profiles, defaultProductProfileId: did })
      toast.success("Профиль продукта сохранён")
    } catch { toast.error("Не удалось сохранить") }
    finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Package className="w-5 h-5 text-primary" /> Профиль продукта (для найма)</CardTitle>
        <CardDescription>Что и кому вы продаёте. Найм использует это для генерации анкет и критериев оценки под продажников и клиентоориентированные роли.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {profiles.map((p, i) => (
          <div key={p.id} className={cn("rounded-lg border p-4 space-y-4", !single && p.id === defaultId && "border-primary/40 bg-primary/[0.03]")}>
            {!single && (
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setDefaultId(p.id)} className={cn("inline-flex items-center gap-1.5 text-xs", p.id === defaultId ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground hover:text-foreground")}>
                  <Star className={cn("w-3.5 h-3.5", p.id === defaultId && "fill-amber-400")} /> {p.id === defaultId ? "Профиль по умолчанию" : "Сделать по умолчанию"}
                </button>
                <button type="button" onClick={() => removeProfile(p.id)} className="text-muted-foreground hover:text-destructive p-1" aria-label="Удалить продукт"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            )}

            <ProfileForm profile={p} index={i} onChange={(patch) => update(p.id, patch)} />
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" onClick={addProfile} className="gap-1.5"><Plus className="w-4 h-4" /> Добавить продукт</Button>
        <p className="text-[11px] text-muted-foreground">Несколько продуктов с разным чеком — несколько профилей (напр. «готовые 30–100к» + «кастом 500к+»).</p>

        <div className="flex justify-end pt-1">
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Форма одного профиля ─────────────────────────────────────────────────────
function ProfileForm({ profile, index, onChange }: {
  profile: ProductProfile; index: number; onChange: (p: Partial<ProductProfile>) => void
}) {
  const [objDraft, setObjDraft] = useState("")
  const cr = profile.checkRange
  const toggleChannel = (v: string) => onChange({ channels: profile.channels.includes(v) ? profile.channels.filter(c => c !== v) : [...profile.channels, v] })
  const addObjection = () => { const t = objDraft.trim(); if (!t) return; onChange({ objections: [...profile.objections, t] }); setObjDraft("") }

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Название</Label>
          <Input value={profile.name} onChange={e => onChange({ name: e.target.value })} placeholder={`Продукт ${index + 1}`} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Тип продаж</Label>
          <Select value={profile.salesType} onValueChange={v => onChange({ salesType: v })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{SALES_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Что продаём — и какую задачу клиента решает</Label>
        <Textarea value={profile.productDescription} onChange={e => onChange({ productDescription: e.target.value })} placeholder="Кратко: что за продукт и какую боль клиента закрывает." className="min-h-[80px]" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Чек, ₽</Label>
          <div className="flex items-center gap-2">
            <Input type="number" value={cr.min || ""} onChange={e => onChange({ checkRange: { ...cr, min: Math.max(0, Number(e.target.value) || 0) } })} placeholder="от" className="h-9" />
            <span className="text-muted-foreground text-sm">—</span>
            <Input type="number" value={cr.max ?? ""} onChange={e => onChange({ checkRange: { ...cr, max: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) } })} placeholder="до (пусто = и выше)" className="h-9" />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer pt-0.5">
            <Switch checked={cr.recurring} onCheckedChange={v => onChange({ checkRange: { ...cr, recurring: v } })} /> Подписка / recurring
          </label>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Цикл сделки</Label>
          <Select value={profile.dealCycle} onValueChange={v => onChange({ dealCycle: v })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{DEAL_CYCLES.map(c => <SelectItem key={c.v} value={c.v}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">ICP — кто покупает и кто принимает решение</Label>
        <Textarea value={profile.icp} onChange={e => onChange({ icp: e.target.value })} placeholder="Кто покупает и кто принимает решение, напр.: собственники и коммерческие директора SMB 10–500 чел." className="min-h-[70px]" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Каналы продаж</Label>
        <div className="flex flex-wrap gap-1.5">
          {SALES_CHANNELS.map(ch => {
            const active = profile.channels.includes(ch.v)
            return <button key={ch.v} type="button" onClick={() => toggleChannel(ch.v)} className={cn("text-xs px-2.5 py-1 rounded-md border transition-colors", active ? "bg-primary/10 border-primary/40 text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted/50")}>{ch.label}</button>
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Типичные возражения по продукту</Label>
        {profile.objections.length > 0 && (
          <div className="space-y-1.5">
            {profile.objections.map((o, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
                <span className="flex-1 text-sm break-words">{o}</span>
                <button type="button" onClick={() => onChange({ objections: profile.objections.filter((_, idx) => idx !== i) })} className="text-muted-foreground hover:text-destructive shrink-0"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input value={objDraft} onChange={e => setObjDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addObjection() } }} placeholder="напр. «Дорого» / «Уже есть похожее»" className="h-9" />
          <Button type="button" size="icon" variant="outline" onClick={addObjection} className="shrink-0" disabled={!objDraft.trim()}><Plus className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  )
}
