"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Settings, ChevronDown, Globe, Truck, Percent,
  Link2, Bell, Lock, Ship, Plane, Train, Package, Warehouse,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// ─── Accordion ────────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, defaultOpen = false }: {
  title: string; icon: typeof Globe; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Icon className="w-4.5 h-4.5 text-orange-500" />
          </div>
          <span className="font-semibold text-sm">{title}</span>
        </div>
        <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && <div className="px-5 pb-5 border-t border-border/50 pt-4">{children}</div>}
    </div>
  )
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const REGIONS = [
  { id: "ru", flag: "🇷🇺", label: "Россия" },
  { id: "kz", flag: "🇰🇿", label: "Казахстан" },
  { id: "by", flag: "🇧🇾", label: "Беларусь" },
  { id: "uz", flag: "🇺🇿", label: "Узбекистан" },
  { id: "kg", flag: "🇰🇬", label: "Кыргызстан" },
  { id: "tj", flag: "🇹🇯", label: "Таджикистан" },
  { id: "az", flag: "🇦🇿", label: "Азербайджан" },
  { id: "ge", flag: "🇬🇪", label: "Грузия" },
  { id: "am", flag: "🇦🇲", label: "Армения" },
  { id: "tm", flag: "🇹🇲", label: "Туркменистан" },
  { id: "mn", flag: "🇲🇳", label: "Монголия" },
  { id: "cn", flag: "🇨🇳", label: "Китай" },
  { id: "tr", flag: "🇹🇷", label: "Турция" },
  { id: "in", flag: "🇮🇳", label: "Индия" },
  { id: "eu", flag: "🇪🇺", label: "Европа (ЕС)" },
  { id: "gb", flag: "🇬🇧", label: "Великобритания" },
  { id: "us", flag: "🇺🇸", label: "США / Канада" },
  { id: "other", flag: "🌍", label: "Другие" },
]

const TRANSPORTS = [
  { id: "ftl", icon: Truck, label: "Автоперевозки", desc: "FTL / LTL" },
  { id: "rail", icon: Train, label: "Железнодорожные", desc: "Контейнерные и вагонные" },
  { id: "sea", icon: Ship, label: "Морские контейнерные", desc: "FCL / LCL" },
  { id: "air", icon: Plane, label: "Авиаперевозки", desc: "Карго и экспресс" },
  { id: "multi", icon: Package, label: "Мультимодальные", desc: "Комбинированные маршруты" },
  { id: "wh", icon: Warehouse, label: "Складские услуги", desc: "Хранение и обработка" },
]

const PLATFORMS = [
  "ATI.su", "Della", "Trans.eu", "TimoCom", "Freightos", "SeaRates", "cargo.one", "WebCargo",
]

const NOTIFICATIONS = [
  { id: "new_request", label: "Новый запрос", default: true },
  { id: "offer_accepted", label: "Клиент принял оффер", default: true },
  { id: "status_change", label: "Статус перевозки", default: true },
  { id: "delay", label: "Задержка", default: true },
  { id: "docs_ready", label: "Документы готовы", default: true },
  { id: "follow_up", label: "Повторный контакт", default: true },
  { id: "email", label: "Email-уведомления", default: false },
  { id: "telegram", label: "Telegram-уведомления", default: false },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LogisticsSettingsPage() {
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set(["ru", "kz", "cn"]))
  const [enabledTransports, setEnabledTransports] = useState<Set<string>>(new Set(["ftl", "sea", "air"]))
  const [margin, setMargin] = useState({ standard: "5", min: "3", loyal: "3", new: "7" })
  const [rounding, setRounding] = useState("1000")
  const [currency, setCurrency] = useState("RUB")
  const [notifications, setNotifications] = useState<Set<string>>(
    new Set(NOTIFICATIONS.filter((n) => n.default).map((n) => n.id))
  )

  const toggleRegion = (id: string) => {
    setSelectedRegions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleTransport = (id: string) => {
    setEnabledTransports((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleNotification = (id: string) => {
    setNotifications((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleSave = () => {
    toast.success("Настройки сохранены")
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Настройки логистики</h1>
                <p className="text-sm text-muted-foreground mt-1">Регионы, транспорт, маржа и уведомления</p>
              </div>
              <Button className="rounded-xl shadow-sm hover:shadow-md gap-1.5" onClick={handleSave}>
                Сохранить
              </Button>
            </div>

            <div className="space-y-4">
              {/* 1. Regions */}
              <Section title="Регионы и география" icon={Globe} defaultOpen={true}>
                <p className="text-sm text-muted-foreground mb-3">Выберите регионы для работы</p>
                <div className="flex flex-wrap gap-2">
                  {REGIONS.map((r) => {
                    const selected = selectedRegions.has(r.id)
                    return (
                      <button
                        key={r.id}
                        onClick={() => toggleRegion(r.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-all",
                          selected
                            ? "bg-primary/10 border-primary text-primary"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        )}
                      >
                        <span>{r.flag}</span>
                        <span>{r.label}</span>
                      </button>
                    )
                  })}
                </div>
              </Section>

              {/* 2. Transport */}
              <Section title="Виды транспорта" icon={Truck}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {TRANSPORTS.map((t) => {
                    const enabled = enabledTransports.has(t.id)
                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "rounded-xl border p-4 transition-all",
                          enabled ? "border-primary/50 bg-primary/5" : "border-border/60"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <t.icon className="w-5 h-5 text-muted-foreground" />
                            <span className="font-medium text-sm">{t.label}</span>
                          </div>
                          <Switch checked={enabled} onCheckedChange={() => toggleTransport(t.id)} />
                        </div>
                        <p className="text-xs text-muted-foreground">{t.desc}</p>
                      </div>
                    )
                  })}
                </div>
              </Section>

              {/* 3. Margins */}
              <Section title="Маржа и наценка" icon={Percent}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div className="space-y-1.5">
                    <Label>Стандартная маржа %</Label>
                    <Input type="number" value={margin.standard} onChange={(e) => setMargin((p) => ({ ...p, standard: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Минимальная маржа %</Label>
                    <Input type="number" value={margin.min} onChange={(e) => setMargin((p) => ({ ...p, min: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Постоянные клиенты %</Label>
                    <Input type="number" value={margin.loyal} onChange={(e) => setMargin((p) => ({ ...p, loyal: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Новые клиенты %</Label>
                    <Input type="number" value={margin.new} onChange={(e) => setMargin((p) => ({ ...p, new: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Округление</Label>
                    <Select value={rounding} onValueChange={setRounding}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="100">До 100 ₽</SelectItem>
                        <SelectItem value="1000">До 1 000 ₽</SelectItem>
                        <SelectItem value="10usd">До $10</SelectItem>
                        <SelectItem value="none">Без округления</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Валюта</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RUB">RUB (₽)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="CNY">CNY (¥)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Section>

              {/* 4. Platforms */}
              <Section title="Площадки и сервисы" icon={Link2}>
                <p className="text-sm text-muted-foreground mb-3">Интеграции с транспортными площадками</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {PLATFORMS.map((name) => (
                    <div key={name} className="rounded-xl border border-border/60 bg-card p-4 opacity-60 cursor-not-allowed text-center">
                      <p className="font-semibold text-sm mb-1">{name}</p>
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Lock className="w-3 h-3" />
                        Скоро
                      </Badge>
                    </div>
                  ))}
                </div>
              </Section>

              {/* 5. Notifications */}
              <Section title="Уведомления логистики" icon={Bell}>
                <div className="space-y-3">
                  {NOTIFICATIONS.map((n) => (
                    <div key={n.id} className="flex items-center justify-between py-1">
                      <span className="text-sm">{n.label}</span>
                      <Switch
                        checked={notifications.has(n.id)}
                        onCheckedChange={() => toggleNotification(n.id)}
                      />
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
