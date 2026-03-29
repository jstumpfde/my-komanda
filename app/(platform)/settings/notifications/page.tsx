"use client"

import { useState, useEffect } from "react"
import { Users, Bell, Megaphone, TrendingUp, Package, Globe, Mail, MessageCircle, Smartphone, ChevronDown, ChevronRight, Save, Loader2, Check, X } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface ModuleCategory {
  id: string
  label: string
}

interface ModuleConfig {
  id: string
  label: string
  icon: LucideIcon
  color: string
  categories: ModuleCategory[]
}

const MODULES_CONFIG: ModuleConfig[] = [
  {
    id: "hr", label: "HR и команда", icon: Users, color: "text-blue-600",
    categories: [
      { id: "hiring",      label: "Найм — новые кандидаты, статусы" },
      { id: "adaptation",  label: "Адаптация — задания, прогресс" },
      { id: "pulse",       label: "Пульс-опросы — результаты, алерты" },
      { id: "flight_risk", label: "Flight Risk — критические риски" },
      { id: "courses",     label: "Обучение — зачисления, сертификаты" },
      { id: "assessments", label: "Оценки — новые результаты" },
    ],
  },
  {
    id: "marketing", label: "Маркетинг", icon: Megaphone, color: "text-purple-600",
    categories: [
      { id: "campaigns",  label: "Кампании — запуск, результаты" },
      { id: "content",    label: "Контент — публикации, дедлайны" },
      { id: "reviews",    label: "Отзывы — новые, критические" },
    ],
  },
  {
    id: "sales", label: "Продажи", icon: TrendingUp, color: "text-emerald-600",
    categories: [
      { id: "deals",    label: "Сделки — изменения статуса" },
      { id: "tasks",    label: "Задачи — просроченные, новые" },
      { id: "meetings", label: "Встречи — напоминания" },
    ],
  },
  {
    id: "logistics", label: "Логистика", icon: Package, color: "text-orange-600",
    categories: [
      { id: "orders",    label: "Заказы — новые, статусы" },
      { id: "warehouse", label: "Склад — остатки, поставки" },
    ],
  },
  {
    id: "general", label: "Общие", icon: Bell, color: "text-gray-600",
    categories: [
      { id: "system",   label: "Системные — обновления платформы" },
      { id: "billing",  label: "Биллинг — счета, оплаты" },
      { id: "security", label: "Безопасность — вход, изменения" },
    ],
  },
]

interface PrefValue {
  email: boolean
  telegram: boolean
  push: boolean
  web: boolean
}

type PrefsMap = Record<string, PrefValue>

const DEFAULT_PREF: PrefValue = { email: true, telegram: false, push: false, web: true }

const CHANNELS = [
  { key: "email" as const,    label: "Email",    icon: Mail,          color: "text-amber-600" },
  { key: "telegram" as const, label: "Telegram", icon: MessageCircle, color: "text-blue-500" },
  { key: "push" as const,     label: "Push",     icon: Smartphone,    color: "text-purple-600" },
  { key: "web" as const,      label: "Web",      icon: Globe,         color: "text-gray-500" },
]

export default function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<PrefsMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(["hr"]))

  useEffect(() => {
    fetch("/api/settings/notification-preferences")
      .then(r => r.json())
      .then(data => {
        const map: PrefsMap = {}
        if (Array.isArray(data.prefs)) {
          for (const p of data.prefs) {
            map[`${p.module}:${p.category}`] = {
              email: p.channelEmail,
              telegram: p.channelTelegram,
              push: p.channelPush,
              web: p.channelWeb,
            }
          }
        }
        setPrefs(map)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const getPref = (module: string, category: string): PrefValue => {
    return prefs[`${module}:${category}`] ?? { ...DEFAULT_PREF }
  }

  const setPref = (module: string, category: string, channel: keyof PrefValue, value: boolean) => {
    const key = `${module}:${category}`
    setPrefs(prev => ({
      ...prev,
      [key]: { ...getPref(module, category), ...prev[key], [channel]: value },
    }))
  }

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(moduleId)) next.delete(moduleId)
      else next.add(moduleId)
      return next
    })
  }

  const enableAll = (mod: ModuleConfig) => {
    setPrefs(prev => {
      const next = { ...prev }
      for (const cat of mod.categories) {
        next[`${mod.id}:${cat.id}`] = { email: true, telegram: true, push: true, web: true }
      }
      return next
    })
  }

  const disableAll = (mod: ModuleConfig) => {
    setPrefs(prev => {
      const next = { ...prev }
      for (const cat of mod.categories) {
        next[`${mod.id}:${cat.id}`] = { email: false, telegram: false, push: false, web: false }
      }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const prefsArr = []
      for (const mod of MODULES_CONFIG) {
        for (const cat of mod.categories) {
          const p = getPref(mod.id, cat.id)
          prefsArr.push({
            module: mod.id,
            category: cat.id,
            channelEmail: p.email,
            channelTelegram: p.telegram,
            channelPush: p.push,
            channelWeb: p.web,
          })
        }
      }
      const res = await fetch("/api/settings/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs: prefsArr }),
      })
      if (!res.ok) throw new Error()
      toast.success("Настройки уведомлений сохранены")
    } catch {
      toast.error("Ошибка при сохранении")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Уведомления</h1>
        <p className="text-muted-foreground text-sm">Настройте каналы и события уведомлений по модулям</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {MODULES_CONFIG.map(mod => {
            const ModIcon = mod.icon
            const isExpanded = expandedModules.has(mod.id)

            return (
              <Card key={mod.id} className="overflow-hidden">
                {/* Заголовок модуля */}
                <button
                  onClick={() => toggleModule(mod.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                >
                  <ModIcon className={cn("w-4 h-4 shrink-0", mod.color)} />
                  <span className="flex-1 text-sm font-medium text-foreground">{mod.label}</span>
                  <div className="flex items-center gap-2 mr-2">
                    <button
                      onClick={e => { e.stopPropagation(); enableAll(mod) }}
                      className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium px-2 py-0.5 rounded border border-emerald-200 hover:bg-emerald-50 transition-colors"
                    >
                      <Check className="w-3 h-3" /> Вкл. всё
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); disableAll(mod) }}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium px-2 py-0.5 rounded border border-border hover:bg-muted/50 transition-colors"
                    >
                      <X className="w-3 h-3" /> Выкл. всё
                    </button>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Таблица категорий */}
                {isExpanded && (
                  <CardContent className="p-0 border-t">
                    {/* Шапка таблицы */}
                    <div className="grid grid-cols-[1fr_repeat(4,_52px)] items-center px-4 py-2 bg-muted/20 border-b">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Событие</span>
                      {CHANNELS.map(ch => {
                        const ChIcon = ch.icon
                        return (
                          <div key={ch.key} className="flex flex-col items-center gap-0.5">
                            <ChIcon className={cn("w-3.5 h-3.5", ch.color)} />
                            <span className="text-[10px] text-muted-foreground">{ch.label}</span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Строки категорий */}
                    {mod.categories.map((cat, idx) => {
                      const p = getPref(mod.id, cat.id)
                      return (
                        <div
                          key={cat.id}
                          className={cn(
                            "grid grid-cols-[1fr_repeat(4,_52px)] items-center px-4 py-2.5",
                            idx % 2 === 0 ? "bg-background" : "bg-muted/10",
                            "border-b last:border-b-0"
                          )}
                        >
                          <Label className="text-sm text-foreground cursor-default">{cat.label}</Label>
                          {CHANNELS.map(ch => (
                            <div key={ch.key} className="flex justify-center">
                              <Switch
                                checked={p[ch.key]}
                                onCheckedChange={v => setPref(mod.id, cat.id, ch.key, v)}
                                className="data-[state=checked]:bg-primary"
                              />
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </CardContent>
                )}
              </Card>
            )
          })}

          <div className="flex justify-end pb-4 pt-2">
            <Button size="lg" className="gap-2" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Сохранение..." : "Сохранить настройки"}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
