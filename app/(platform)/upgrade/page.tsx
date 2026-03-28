"use client"

import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, X, Zap, Lock } from "lucide-react"
import Link from "next/link"

// ─── Данные тарифов ────────────────────────────────────────────────────────────

const PLANS = [
  {
    slug:     "solo",
    name:     "Solo",
    price:    14900,
    interval: "мес",
    modules:  ["recruiting"],
    features: {
      vacancies:  "1",
      candidates: "400",
      users:      "3",
      hrOps:      false,
      talentPool: false,
      ai:         false,
      branding:   false,
      api:        false,
    },
  },
  {
    slug:     "starter",
    name:     "Starter",
    price:    24900,
    interval: "мес",
    modules:  ["recruiting", "hr-ops"],
    features: {
      vacancies:  "3",
      candidates: "1 200",
      users:      "10",
      hrOps:      true,
      talentPool: false,
      ai:         false,
      branding:   false,
      api:        false,
    },
  },
  {
    slug:     "business",
    name:     "Business",
    price:    49900,
    interval: "мес",
    highlight: true,
    badge:    "Популярный",
    modules:  ["recruiting", "hr-ops", "talent-pool"],
    features: {
      vacancies:  "10",
      candidates: "4 000",
      users:      "30",
      hrOps:      true,
      talentPool: true,
      ai:         true,
      branding:   true,
      api:        false,
    },
  },
  {
    slug:     "pro",
    name:     "Pro",
    price:    99900,
    interval: "мес",
    modules:  ["recruiting", "hr-ops", "talent-pool", "marketing"],
    features: {
      vacancies:  "22",
      candidates: "Безлимит",
      users:      "Безлимит",
      hrOps:      true,
      talentPool: true,
      ai:         true,
      branding:   true,
      api:        true,
    },
  },
]

const MODULE_INFO: Record<string, { name: string; description: string }> = {
  recruiting: {
    name: "Рекрутинг",
    description: "Управление вакансиями, кандидатами и воронкой найма",
  },
  "hr-ops": {
    name: "HR-операции",
    description: "Онбординг, адаптация и управление сотрудниками",
  },
  "talent-pool": {
    name: "Талант-пул",
    description: "База резервных кандидатов и управление кадровым резервом",
  },
  marketing: {
    name: "Маркетинг",
    description: "Контент, SEO и маркетинговая аналитика",
  },
}

const FEATURE_ROWS = [
  { key: "vacancies",  label: "Активных вакансий" },
  { key: "candidates", label: "Кандидатов" },
  { key: "users",      label: "Пользователей" },
  { key: "hrOps",      label: "HR-операции", boolean: true },
  { key: "talentPool", label: "Талант-пул", boolean: true },
  { key: "ai",         label: "AI-видеоинтервью", boolean: true },
  { key: "branding",   label: "Брендинг", boolean: true },
  { key: "api",        label: "API-доступ", boolean: true },
]

// ─── Компонент ─────────────────────────────────────────────────────────────────

function UpgradeContent() {
  const searchParams = useSearchParams()
  const moduleSlug = searchParams.get("module") ?? "recruiting"
  const mod = MODULE_INFO[moduleSlug]

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader title="Обновление тарифа" />

        <div className="p-6 max-w-5xl mx-auto space-y-8">

          {/* Блок: недоступный модуль */}
          <div className="flex items-start gap-4 p-5 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <div className="mt-0.5 shrink-0 w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                Модуль «{mod?.name ?? moduleSlug}» не подключён
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                {mod?.description ?? "Обновите тариф, чтобы получить доступ к этому разделу."}
              </p>
            </div>
          </div>

          {/* Заголовок таблицы */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Выберите тариф</h1>
            <p className="text-muted-foreground mt-1">
              Сравните возможности и выберите подходящий план для вашей компании
            </p>
          </div>

          {/* Карточки тарифов */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((plan) => (
              <div
                key={plan.slug}
                className={`relative rounded-xl border p-5 flex flex-col gap-4 transition-shadow ${
                  plan.highlight
                    ? "border-primary shadow-lg shadow-primary/10 bg-primary/5"
                    : "border-border"
                }`}
              >
                {plan.badge && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    {plan.badge}
                  </Badge>
                )}
                <div>
                  <p className="font-semibold text-base">{plan.name}</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-bold">
                      {plan.price.toLocaleString("ru-RU")} ₽
                    </span>
                    <span className="text-xs text-muted-foreground">/{plan.interval}</span>
                  </div>
                </div>
                <Button
                  asChild
                  size="sm"
                  variant={plan.highlight ? "default" : "outline"}
                  className="w-full"
                >
                  <Link href="/settings/billing">
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                    Выбрать
                  </Link>
                </Button>
              </div>
            ))}
          </div>

          {/* Сравнительная таблица */}
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground w-40">
                    Возможности
                  </th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan.slug}
                      className={`px-4 py-3 font-semibold text-center ${
                        plan.highlight ? "text-primary" : ""
                      }`}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_ROWS.map((row, i) => (
                  <tr
                    key={row.key}
                    className={i % 2 === 1 ? "bg-muted/20" : ""}
                  >
                    <td className="px-4 py-2.5 text-muted-foreground font-medium">
                      {row.label}
                    </td>
                    {PLANS.map((plan) => {
                      const val = (plan.features as Record<string, string | boolean>)[row.key]
                      return (
                        <td key={plan.slug} className="px-4 py-2.5 text-center">
                          {row.boolean ? (
                            val ? (
                              <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                            ) : (
                              <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                            )
                          ) : (
                            <span className={plan.highlight ? "font-semibold" : ""}>
                              {val as string}
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Подсказка */}
          <p className="text-center text-sm text-muted-foreground">
            Нужна помощь с выбором?{" "}
            <Link href="mailto:support@mykomanda.ru" className="text-primary hover:underline">
              Напишите нам
            </Link>
          </p>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function UpgradePage() {
  return (
    <Suspense fallback={null}>
      <UpgradeContent />
    </Suspense>
  )
}
