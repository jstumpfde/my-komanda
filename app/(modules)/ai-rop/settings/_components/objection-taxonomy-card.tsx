"use client"

// Таксономия категорий возражений — фиксированный список, по которому AI
// раскладывает фразы клиентов при кластеризации (lib/ai-rop/objection-
// clusters.ts::getTaxonomy, DEFAULT_TAXONOMY — дефолт платформы). Per-tenant
// override — settings.objectionTaxonomy: массив { name, def }. По одной
// категории на строку в формате «Название | Определение» — если строк нет
// или все пустые, используется дефолт платформы.
import { useState } from "react"
import { useRouter } from "next/navigation"
import { MessageSquareWarning } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

export interface ObjectionCategory { name: string; def: string }

function toLines(categories: ObjectionCategory[] | null): string {
  return (categories ?? []).map((c) => (c.def ? `${c.name} | ${c.def}` : c.name)).join("\n")
}

function parseLines(text: string): ObjectionCategory[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf("|")
      if (idx === -1) return { name: line.trim(), def: "" }
      return { name: line.slice(0, idx).trim(), def: line.slice(idx + 1).trim() }
    })
    .filter((c) => c.name)
}

export function ObjectionTaxonomyCard({ initial }: { initial: ObjectionCategory[] | null }) {
  const [value, setValue] = useState(() => toLines(initial))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  async function save() {
    setBusy(true); setSaved(false)
    try {
      const categories = parseLines(value)
      await fetch("/api/modules/ai-rop/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectionTaxonomy: categories.length > 0 ? categories : null }),
      })
      setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2000)
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><MessageSquareWarning className="size-4 text-violet-600" /> Возражения — категории</CardTitle>
        <CardDescription>Фиксированная таксономия для AI-кластеризации возражений — по одной категории на строку: «Название | Определение». Пусто = дефолт платформы.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={8}
          placeholder={"Цена / дорого | клиент считает стоимость завышенной\nНет текущей потребности | не строимся, не актуально сейчас"}
          className="font-mono text-xs"
        />
        <div className="flex justify-end gap-2">
          {saved && <span className="self-center text-xs text-emerald-600">Сохранено</span>}
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
