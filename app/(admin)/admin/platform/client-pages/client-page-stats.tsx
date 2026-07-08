"use client"

// Панель статистики одного сайта витрины: сводка + разбивка по страницам +
// лента посетителей. Плюс генератор персональных ссылок (?to=<имя>), чтобы
// в ленте визит был подписан именем конкретного клиента.

import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  X, RefreshCw, Users, MousePointerClick, Clock, ChevronsDown, Copy, Link2,
} from "lucide-react"

interface PageStat { path: string; label: string; visitors: number; avgScrollPct: number; avgSeconds: number }
interface VisitorStat {
  visitorId: string; recipient: string | null; device: string; source: string | null
  pages: number; totalSeconds: number; maxScrollPct: number; firstAt: string; lastAt: string
}
interface Stats {
  slug: string
  totals: { visitors: number; pageOpens: number; totalSeconds: number; avgSecondsPerVisitor: number; avgScrollPct: number; lastAt: string | null }
  pages: PageStat[]
  visitors: VisitorStat[]
}

function fmtDur(sec: number): string {
  if (!sec) return "0 с"
  const m = Math.floor(sec / 60), s = sec % 60
  if (m === 0) return `${s} с`
  if (m < 60) return s ? `${m} мин ${s} с` : `${m} мин`
  const h = Math.floor(m / 60)
  return `${h} ч ${m % 60} мин`
}
function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  } catch { return iso }
}
function scrollColor(pct: number): string {
  if (pct >= 75) return "text-emerald-600"
  if (pct >= 40) return "text-amber-600"
  return "text-muted-foreground"
}

export function ClientPageStatsPanel({ slug, url, onClose }: { slug: string; url: string; onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/platform/client-pages/${slug}/stats`, { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Ошибка")
      setStats(d)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки статистики")
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => { load() }, [load])

  const personalLink = name.trim()
    ? `${url}${url.includes("?") ? "&" : "?"}to=${encodeURIComponent(name.trim())}`
    : ""

  function copyPersonal() {
    if (!personalLink) { toast.error("Впишите имя клиента"); return }
    navigator.clipboard?.writeText(personalLink)
    toast.success(`Ссылка для «${name.trim()}» скопирована`)
  }

  const t = stats?.totals

  return (
    <Card className="p-4 space-y-4 border-primary/40">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Статистика — <span className="font-mono">/{slug}</span></h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={load} disabled={loading} title="Обновить">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </div>

      {loading && !stats && <p className="text-sm text-muted-foreground">Загрузка…</p>}

      {stats && (
        <>
          {/* Сводка */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile icon={<Users className="h-4 w-4" />} label="Посетителей" value={t!.visitors} />
            <Tile icon={<MousePointerClick className="h-4 w-4" />} label="Открытий страниц" value={t!.pageOpens} />
            <Tile icon={<Clock className="h-4 w-4" />} label="Ср. время" value={fmtDur(t!.avgSecondsPerVisitor)} />
            <Tile icon={<ChevronsDown className="h-4 w-4" />} label="Ср. прокрутка" value={`${t!.avgScrollPct}%`} />
          </div>
          {t!.lastAt && (
            <p className="text-xs text-muted-foreground">Последний визит: {fmtWhen(t!.lastAt)}</p>
          )}

          {/* Персональная ссылка */}
          <div className="rounded-lg border border-dashed p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="h-4 w-4" /> Персональная ссылка (чтобы знать, кто открыл)
            </div>
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя клиента, напр. Иванов" className="max-w-xs" />
              <Button variant="outline" onClick={copyPersonal}><Copy className="h-4 w-4 mr-1" /> Скопировать</Button>
            </div>
            {personalLink && (
              <p className="text-xs text-muted-foreground font-mono break-all">{personalLink}</p>
            )}
            <p className="text-xs text-muted-foreground">Дай каждому клиенту свою ссылку — в ленте визитов увидишь его имя.</p>
          </div>

          {/* По страницам */}
          {stats.pages.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">По страницам</h3>
              <div className="space-y-1">
                {stats.pages.map((pg) => (
                  <div key={pg.path} className="flex items-center gap-3 text-sm py-1 border-b last:border-0">
                    <span className="flex-1 truncate">{pg.label}</span>
                    <span className="text-muted-foreground w-24 text-right">{pg.visitors} чел.</span>
                    <span className={`w-24 text-right ${scrollColor(pg.avgScrollPct)}`}>↓ {pg.avgScrollPct}%</span>
                    <span className="text-muted-foreground w-24 text-right">{fmtDur(pg.avgSeconds)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Лента посетителей */}
          <div>
            <h3 className="text-sm font-medium mb-2">Кто открывал ({stats.visitors.length})</h3>
            {stats.visitors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Пока никто не открывал ссылку. Как только клиент зайдёт — здесь появится визит.
              </p>
            ) : (
              <div className="space-y-1">
                {stats.visitors.map((v) => (
                  <div key={v.visitorId} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {v.recipient
                          ? <span className="font-medium truncate">{v.recipient}</span>
                          : <span className="text-muted-foreground truncate">Аноним · {v.visitorId.slice(0, 6)}</span>}
                        <Badge variant="secondary" className="text-[10px]">{v.device}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{fmtWhen(v.lastAt)}{v.source ? ` · ${v.source}` : ""}</span>
                    </div>
                    <span className="text-muted-foreground w-20 text-right">{v.pages} стр.</span>
                    <span className={`w-16 text-right ${scrollColor(v.maxScrollPct)}`}>↓ {v.maxScrollPct}%</span>
                    <span className="text-muted-foreground w-24 text-right">{fmtDur(v.totalSeconds)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  )
}
