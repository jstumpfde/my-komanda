"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Calculator, Eye, EyeOff, Send, RefreshCw, Sparkles, Star,
  Check, AlertTriangle, X,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Quote {
  id: string; reqId: string; client: string; route: string; type: string
  variants: number; bestPrice: string; ourPrice: string; status: string
}

const QUOTES: Quote[] = [
  { id: "QUO-0023", reqId: "REQ-0038", client: "СтройМаркет", route: "Шанхай → Владивосток", type: "🚢 FCL 40'", variants: 4, bestPrice: "1,320K", ourPrice: "1,386K", status: "ready" },
  { id: "QUO-0022", reqId: "REQ-0039", client: "ГолдИмпорт", route: "Дубай → Москва", type: "✈️", variants: 3, bestPrice: "2,950K", ourPrice: "3,127K", status: "calculating" },
  { id: "QUO-0021", reqId: "REQ-0037", client: "МебельГрупп", route: "Стамбул → Москва", type: "🚛 FTL", variants: 5, bestPrice: "480K", ourPrice: "504K", status: "sent" },
  { id: "QUO-0020", reqId: "REQ-0036", client: "ЭлектроТрейд", route: "Гуанчжоу → Новосибирск", type: "🚢 FCL 20'", variants: 3, bestPrice: "980K", ourPrice: "1,029K", status: "sent" },
  { id: "QUO-0019", reqId: "REQ-0034", client: "КыргызПродукт", route: "Москва → Бишкек", type: "🚛 FTL", variants: 4, bestPrice: "350K", ourPrice: "371K", status: "sent" },
  { id: "QUO-0018", reqId: "REQ-0035", client: "БелТекстиль", route: "Минск → Москва", type: "🚛 LTL", variants: 3, bestPrice: "128K", ourPrice: "138K", status: "accepted" },
  { id: "QUO-0017", reqId: "REQ-0033", client: "ВиноГрад", route: "Москва → Тбилиси", type: "🚛 Рефриж.", variants: 4, bestPrice: "195K", ourPrice: "210K", status: "accepted" },
  { id: "QUO-0016", reqId: "REQ-0032", client: "ТехноИмпорт", route: "Шэньчжэнь → Москва", type: "🚢 FCL 40'HC", variants: 5, bestPrice: "1,680K", ourPrice: "1,780K", status: "calculating" },
]

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  ready:       { label: "Оффер готов", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  calculating: { label: "В расчёте",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  sent:        { label: "Отправлен",  cls: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" },
  accepted:    { label: "Принят",     cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
}

interface Variant {
  carrier: string; routeDesc: string; transit: string
  breakdown: string; price: string; recommended?: boolean
  pros: { icon: "check" | "warn" | "x"; text: string }[]
}

const DETAIL_VARIANTS: Variant[] = [
  {
    carrier: "COSCO", routeDesc: "Прямой", transit: "12-14 дн",
    breakdown: "Фрахт $13,200 + Терминал $800 + Таможня ~$400",
    price: "1,386,000", recommended: true,
    pros: [
      { icon: "check", text: "Прямой рейс" },
      { icon: "check", text: "Надёжная линия" },
      { icon: "warn", text: "Загруженность 85%" },
    ],
  },
  {
    carrier: "MSC", routeDesc: "Шанхай→Пусан→Владивосток", transit: "18-22 дн",
    breakdown: "$11,500 + $1,100 + ~$400",
    price: "1,260,000",
    pros: [
      { icon: "check", text: "Дешевле 9%" },
      { icon: "warn", text: "Перегрузка" },
      { icon: "warn", text: "Дольше" },
    ],
  },
  {
    carrier: "Maersk", routeDesc: "Прямой", transit: "10-12 дн",
    breakdown: "$14,800 + $700 + ~$400",
    price: "1,512,000",
    pros: [
      { icon: "check", text: "Самый быстрый" },
      { icon: "check", text: "Premium" },
      { icon: "x", text: "Дороже 9%" },
    ],
  },
  {
    carrier: "FESCO + РЖД", routeDesc: "Море + ж/д", transit: "25-30 дн",
    breakdown: "$8,200 + ж/д $2,400 + ~$600",
    price: "1,155,000",
    pros: [
      { icon: "check", text: "Самый дешёвый (-17%)" },
      { icon: "warn", text: "Долго" },
      { icon: "warn", text: "2 перегрузки" },
    ],
  },
]

const PRO_ICONS = {
  check: { Icon: Check, cls: "text-green-600" },
  warn: { Icon: AlertTriangle, cls: "text-amber-600" },
  x: { Icon: X, cls: "text-red-600" },
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LogisticsQuotesPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Расчёты и офферы</h1>
              <p className="text-sm text-muted-foreground mt-1">AI-сравнение ставок и формирование офферов</p>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border shadow-sm bg-card">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {["#", "Запрос", "Клиент", "Маршрут", "Тип", "Вариантов", "Лучшая цена", "Наша цена", "Статус", ""].map((h) => (
                        <th key={h} className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {QUOTES.map((q) => {
                      const st = STATUS_MAP[q.status]
                      const isExpanded = expandedId === q.id
                      return (
                        <>
                          <tr key={q.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{q.id}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{q.reqId}</td>
                            <td className="px-4 py-3 text-sm font-medium">{q.client}</td>
                            <td className="px-4 py-3 text-sm">{q.route}</td>
                            <td className="px-4 py-3 text-sm">{q.type}</td>
                            <td className="px-4 py-3 text-sm text-center font-bold">{q.variants}</td>
                            <td className="px-4 py-3 text-sm font-medium">₽{q.bestPrice}</td>
                            <td className="px-4 py-3 text-sm font-bold">₽{q.ourPrice}</td>
                            <td className="px-4 py-3">
                              <Badge variant="secondary" className={`text-[10px] border-0 font-medium ${st?.cls}`}>{st?.label}</Badge>
                            </td>
                            <td className="px-4 py-3">
                              <Button
                                variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                                onClick={() => setExpandedId(isExpanded ? null : q.id)}
                              >
                                {isExpanded ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                {isExpanded ? "Скрыть" : "Посмотреть"}
                              </Button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${q.id}-detail`}>
                              <td colSpan={10} className="p-0">
                                <div className="px-6 py-5 bg-muted/20 border-b border-border">
                                  {/* AI block */}
                                  <div className="rounded-xl border bg-gradient-to-br from-[#EEEDFE] via-[#E6F1FB] to-[#F3E8FF] dark:from-[#1a1830] dark:via-[#172030] dark:to-[#1f1530] p-4 mb-4">
                                    <div className="flex items-center gap-2">
                                      <Sparkles className="w-5 h-5 text-primary" />
                                      <span className="text-sm font-medium">Procurement-агент проверил 14 площадок, сравнил 23 ставки.</span>
                                    </div>
                                  </div>

                                  {/* Variants */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                    {DETAIL_VARIANTS.map((v, i) => (
                                      <div
                                        key={i}
                                        className={cn(
                                          "rounded-xl p-4 transition-all",
                                          v.recommended
                                            ? "border-2 border-primary shadow-md bg-card"
                                            : "border border-border/60 bg-card"
                                        )}
                                      >
                                        <div className="flex items-start justify-between mb-2">
                                          <div>
                                            <div className="flex items-center gap-2">
                                              {v.recommended && <Star className="w-4 h-4 text-primary fill-primary" />}
                                              <span className="font-semibold text-sm">
                                                {v.carrier}
                                                {v.recommended && <span className="text-primary ml-1">Рекомендуемый</span>}
                                              </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-0.5">{v.routeDesc} · {v.transit}</p>
                                          </div>
                                          <p className="text-2xl font-bold tabular-nums">₽{Number(v.price.replace(/,/g, "")).toLocaleString("ru-RU")}</p>
                                        </div>
                                        <p className="text-xs text-muted-foreground mb-2">{v.breakdown}</p>
                                        <div className="flex flex-wrap gap-2">
                                          {v.pros.map((p, j) => {
                                            const { Icon, cls } = PRO_ICONS[p.icon]
                                            return (
                                              <span key={j} className={`inline-flex items-center gap-1 text-xs ${cls}`}>
                                                <Icon className="w-3 h-3" />{p.text}
                                              </span>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Actions */}
                                  <div className="flex gap-2">
                                    <Button size="sm" className="gap-1.5" onClick={() => toast.success("Оффер отправлен клиенту")}>
                                      <Send className="w-4 h-4" />
                                      Отправить оффер
                                    </Button>
                                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toast.info("Пересчёт запущен...")}>
                                      <RefreshCw className="w-4 h-4" />
                                      Пересчитать
                                    </Button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
