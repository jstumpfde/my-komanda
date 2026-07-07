"use client"

// Таб «Промокоды»: генерация пачки + таблица существующих кодов/ссылок.

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Copy, Plus, Filter } from "lucide-react"
import { toast } from "sonner"

interface PromoCode {
  id: string
  code: string
  runsGranted: number
  maxActivations: number | null
  activationsCount: number
  isFreeLink: boolean
  sourceLabel: string | null
  expiresAt: string | null
  createdAt: string
}

const RUNS_CHIPS = [1, 2, 3, 5, 10]

function fmtDate(s: string | null): string {
  if (!s) return "—"
  return new Date(s).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function codeToUrl(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://company24.pro"
  return `${origin}/tip/free/${code}`
}

export function PromoCodesTab() {
  const [codes, setCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState("")

  // Форма генерации
  const [count, setCount] = useState("10")
  const [runsGranted, setRunsGranted] = useState("1")
  const [maxActivations, setMaxActivations] = useState("1")
  const [sourceLabel, setSourceLabel] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [isFreeLink, setIsFreeLink] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [lastBatch, setLastBatch] = useState<PromoCode[] | null>(null)

  const load = useCallback(async (source?: string) => {
    setLoading(true)
    try {
      const url = source ? `/api/admin/tip/promo-codes?source=${encodeURIComponent(source)}` : "/api/admin/tip/promo-codes"
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Не удалось загрузить коды"); return }
      setCodes(data.codes ?? [])
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function generate() {
    const countNum = parseInt(count, 10)
    const runsNum = parseInt(runsGranted, 10)
    if (!Number.isInteger(countNum) || countNum < 1 || countNum > 100) {
      toast.error("Количество кодов — целое число от 1 до 100")
      return
    }
    if (!Number.isInteger(runsNum) || runsNum < 1) {
      toast.error("Прогонов на код — положительное целое число")
      return
    }
    setGenerating(true)
    try {
      const res = await fetch("/api/admin/tip/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: countNum,
          runsGranted: runsNum,
          maxActivations: maxActivations.trim() === "" ? null : parseInt(maxActivations, 10),
          sourceLabel: sourceLabel.trim() || null,
          expiresAt: expiresAt || null,
          isFreeLink,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Ошибка генерации"); return }
      setLastBatch(data.codes ?? [])
      toast.success(`Сгенерировано кодов: ${(data.codes ?? []).length}`)
      load(sourceFilter || undefined)
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setGenerating(false)
    }
  }

  function copyAll() {
    if (!lastBatch || lastBatch.length === 0) return
    const lines = lastBatch.map((c) => (c.isFreeLink ? codeToUrl(c.code) : c.code))
    navigator.clipboard.writeText(lines.join("\n"))
    toast.success("Скопировано")
  }

  function copyOne(c: PromoCode) {
    const text = c.isFreeLink ? codeToUrl(c.code) : c.code
    navigator.clipboard.writeText(text)
    toast.success("Скопировано")
  }

  return (
    <div className="space-y-5 pt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Сгенерировать пачку кодов</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pc-count">Количество кодов (1–100)</Label>
              <Input id="pc-count" type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Прогонов на код</Label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {RUNS_CHIPS.map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={runsGranted === String(n) ? "default" : "outline"}
                    onClick={() => setRunsGranted(String(n))}
                    className="h-8 px-2.5"
                  >
                    {n}
                  </Button>
                ))}
                <Input
                  type="number"
                  min={1}
                  value={runsGranted}
                  onChange={(e) => setRunsGranted(e.target.value)}
                  className="w-20 h-8"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-max-act">Лимит активаций (пусто = без лимита)</Label>
              <Input
                id="pc-max-act"
                type="number"
                min={1}
                placeholder="без лимита"
                value={maxActivations}
                onChange={(e) => setMaxActivations(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-expires">Срок действия (опционально)</Label>
              <Input id="pc-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="pc-source">Метка источника</Label>
              <Input
                id="pc-source"
                placeholder="напр. «блогер Иван», «розыгрыш июль»"
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2.5 pb-1.5">
              <Switch id="pc-free-link" checked={isFreeLink} onCheckedChange={setIsFreeLink} />
              <Label htmlFor="pc-free-link" className="cursor-pointer">Бесплатная ссылка (без ввода кода — прямой URL)</Label>
            </div>
          </div>
          <Button onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
            Сгенерировать
          </Button>

          {lastBatch && lastBatch.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Результат: {lastBatch.length} шт.</p>
                <Button size="sm" variant="outline" onClick={copyAll}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" />Скопировать все
                </Button>
              </div>
              <div className="max-h-40 overflow-auto font-mono text-xs space-y-0.5">
                {lastBatch.map((c) => (
                  <div key={c.id}>{c.isFreeLink ? codeToUrl(c.code) : c.code}</div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Существующие коды</CardTitle>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Фильтр по источнику"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") load(sourceFilter || undefined) }}
              className="h-8 w-56"
            />
            <Button size="sm" variant="outline" onClick={() => load(sourceFilter || undefined)}>Применить</Button>
            {sourceFilter && (
              <Button size="sm" variant="ghost" onClick={() => { setSourceFilter(""); load() }}>Сброс</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />Загрузка…
            </div>
          ) : codes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Кодов пока нет.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Код / ссылка</TableHead>
                    <TableHead>Прогонов</TableHead>
                    <TableHead>Активаций</TableHead>
                    <TableHead>Источник</TableHead>
                    <TableHead>Срок</TableHead>
                    <TableHead>Создан</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <span>{c.isFreeLink ? codeToUrl(c.code) : c.code}</span>
                          {c.isFreeLink && <Badge variant="outline" className="text-[10px] text-sky-700 border-sky-300 bg-sky-50">ссылка</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{c.runsGranted}</TableCell>
                      <TableCell>
                        {c.activationsCount}{c.maxActivations != null ? ` / ${c.maxActivations}` : " / ∞"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.sourceLabel ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(c.expiresAt)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDateTime(c.createdAt)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => copyOne(c)}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
