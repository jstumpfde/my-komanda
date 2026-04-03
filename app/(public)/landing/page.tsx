"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Users, Megaphone, DollarSign, Truck, Brain, MessageSquare, BarChart3,
  Target, Package, Zap, ArrowRight, Check, X, Minus,
  Clock, TrendingUp, Award, Building2, ChevronRight,
  Bot, UserCheck, Mail, LineChart, ShoppingCart, Route,
  Menu, XIcon,
} from "lucide-react"

// ─── Data ────────────────────────────────────────────────────────────────────

const NAV_LINKS = ["Возможности", "Модули", "Тарифы", "О нас"]

const PROBLEMS = [
  { icon: Users, title: "HR тонет в резюме", desc: "200+ откликов на вакансию, ручной скрининг каждого" },
  { icon: Megaphone, title: "Маркетинг без аналитики", desc: "Бюджеты сливаются, ROI непонятен" },
  { icon: DollarSign, title: "Продажи в хаосе", desc: "Лиды теряются, менеджеры забывают перезвонить" },
  { icon: BarChart3, title: "Руководитель не видит картину", desc: "Данные в 10 табличках, отчёты раз в месяц" },
]

const COMPARISON_ROWS = [
  { feature: "Автоматизация найма", c24: "check", crm: "no", erp: "partial", manual: "no" },
  { feature: "AI-скоринг кандидатов", c24: "check", crm: "no", erp: "no", manual: "no" },
  { feature: "Маркетинговая аналитика", c24: "check", crm: "partial", erp: "no", manual: "partial" },
  { feature: "Воронка продаж", c24: "check", crm: "check", erp: "partial", manual: "no" },
  { feature: "Управление складом", c24: "check", crm: "no", erp: "check", manual: "partial" },
  { feature: "Стоимость внедрения", c24: "check", crm: "partial", erp: "no", manual: "check" },
]

const MODULES = [
  {
    id: "hr", icon: Users, label: "HR и команда", color: "text-violet-600",
    features: [
      "AI-скоринг кандидатов за секунды",
      "Демо-курс «Один день в должности»",
      "Автоматическая воронка найма",
      "Интеграция с hh.ru, Авито, SuperJob",
      "Адаптация и онбординг",
      "Аналитика по каждой вакансии",
    ],
  },
  {
    id: "marketing", icon: Megaphone, label: "Маркетинг", color: "text-pink-600",
    features: [
      "Анализ конкурентов в реальном времени",
      "ROI по каждому каналу",
      "AI-генерация контента",
      "UTM-аналитика и атрибуция",
      "SEO-мониторинг",
    ],
  },
  {
    id: "sales", icon: DollarSign, label: "Продажи", color: "text-amber-600",
    features: [
      "AI-квалификация лидов",
      "Автоматические follow-up",
      "Воронка сделок с прогнозами",
      "Интеграция с Битрикс24 и AmoCRM",
      "Аналитика менеджеров",
    ],
  },
  {
    id: "logistics", icon: Truck, label: "Логистика и склад", color: "text-emerald-600",
    features: [
      "Управление заказами",
      "Складской учёт",
      "Маршрутизация доставок",
      "Аналитика закупок",
      "Прогноз спроса",
    ],
  },
]

const STEPS = [
  { num: "01", title: "Подключите", desc: "Регистрация за 2 минуты, импорт данных из CRM", icon: Zap },
  { num: "02", title: "AI настроит", desc: "Агенты анализируют ваш бизнес и настраивают автоматизации", icon: Brain },
  { num: "03", title: "Работает 24/7", desc: "AI ведёт рутину, вы принимаете решения", icon: Clock },
]

const AI_AGENTS = [
  { icon: UserCheck, name: "Скоринг-агент", desc: "Оценивает кандидатов по 50+ параметрам" },
  { icon: Mail, name: "Коммуникатор", desc: "Отправляет сообщения, назначает интервью" },
  { icon: LineChart, name: "Аналитик", desc: "Строит отчёты, находит узкие места" },
  { icon: Target, name: "Маркетолог", desc: "Анализирует конкурентов, оптимизирует бюджет" },
  { icon: ShoppingCart, name: "Продавец", desc: "Квалифицирует лиды, напоминает о follow-up" },
  { icon: Route, name: "Логист", desc: "Оптимизирует маршруты, прогнозирует спрос" },
]

const TARIFFS = [
  { name: "Solo", price: "14 900", vacancies: "1 вакансия", candidates: "400 кандидатов", popular: false, features: ["1 пользователь", "Базовый AI-скоринг", "Email-поддержка"] },
  { name: "Starter", price: "24 900", vacancies: "3 вакансии", candidates: "1 200 кандидатов", popular: false, features: ["3 пользователя", "Расширенный AI", "Интеграция hh.ru", "Чат-поддержка"] },
  { name: "Business", price: "49 900", vacancies: "10 вакансий", candidates: "4 000 кандидатов", popular: true, features: ["10 пользователей", "Все AI-агенты", "Branding", "AI-видеоинтервью", "Приоритетная поддержка"] },
  { name: "Pro", price: "99 900", vacancies: "22 вакансии", candidates: "10 000 кандидатов", popular: false, features: ["Безлимит пользователей", "Все модули", "Custom domain", "API доступ", "Персональный менеджер"] },
]

const METRICS = [
  { value: "На 60%", label: "быстрее найм", icon: Clock },
  { value: "В 3 раза", label: "меньше рутины", icon: TrendingUp },
  { value: "ROI x4", label: "за 3 месяца", icon: Award },
  { value: "500+", label: "компаний доверяют", icon: Building2 },
]

const FOOTER_COLS = [
  { title: "Продукт", links: ["Возможности", "Модули", "Тарифы", "API"] },
  { title: "Компания", links: ["О нас", "Блог", "Карьера", "Контакты"] },
  { title: "Юридическое", links: ["Политика конфиденциальности", "Условия использования", "Оферта"] },
]

function ComparisonIcon({ val }: { val: string }) {
  if (val === "check") return <Check className="w-4 h-4 text-emerald-600" />
  if (val === "no") return <X className="w-4 h-4 text-red-400" />
  return <Minus className="w-4 h-4 text-amber-500" />
}

// ─── Landing Page ────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [activeModule, setActiveModule] = useState("hr")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white text-foreground antialiased">
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#534AB7] flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-lg">Company24</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a key={l} href={`#${l.toLowerCase()}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {l}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link href="/login">Войти</Link>
            </Button>
            <Button size="sm" className="bg-[#534AB7] hover:bg-[#4338a8]" asChild>
              <Link href="/register">Попробовать бесплатно</Link>
            </Button>
          </div>

          <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <XIcon className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-white px-4 py-4 space-y-3">
            {NAV_LINKS.map((l) => (
              <a key={l} href={`#${l.toLowerCase()}`} className="block text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
                {l}
              </a>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="flex-1" asChild>
                <Link href="/login">Войти</Link>
              </Button>
              <Button size="sm" className="flex-1 bg-[#534AB7] hover:bg-[#4338a8]" asChild>
                <Link href="/register">Бесплатно</Link>
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#534AB7]/5 via-transparent to-violet-50/50" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 md:py-28 relative">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="outline" className="mb-4 text-[#534AB7] border-[#534AB7]/30 bg-[#534AB7]/5">
                AI Business OS
              </Badge>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
                AI-операционная система, которая ведёт бизнес{" "}
                <span className="text-[#534AB7]">24/7</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-lg leading-relaxed">
                Company24 автоматизирует HR, маркетинг, продажи и логистику. AI-агенты берут на себя 80% рутины — вы принимаете только ключевые решения.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" className="bg-[#534AB7] hover:bg-[#4338a8] h-12 px-8 text-base" asChild>
                  <Link href="/register">Начать бесплатно <ArrowRight className="w-4 h-4 ml-2" /></Link>
                </Button>
                <Button variant="outline" size="lg" className="h-12 px-8 text-base">
                  Посмотреть демо
                </Button>
              </div>
            </div>

            {/* Dashboard mock */}
            <div className="relative">
              <div className="bg-white rounded-2xl shadow-2xl border border-border/50 p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                  <span className="text-xs text-muted-foreground ml-2">Company24 — Дашборд</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Вакансий", val: "8", color: "text-violet-600" },
                    { label: "Кандидатов", val: "1 247", color: "text-blue-600" },
                    { label: "Нанято", val: "41", color: "text-emerald-600" },
                  ].map((m) => (
                    <div key={m.label} className="bg-muted/50 rounded-xl p-3">
                      <p className="text-[10px] text-muted-foreground">{m.label}</p>
                      <p className={cn("text-xl font-bold", m.color)}>{m.val}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {["Скоринг: 14 обработано", "Рассылка: 3 отправлено", "Парсинг: 8 новых"].map((t, i) => (
                    <div key={t} className="flex items-center gap-2 text-xs">
                      <span className={cn("w-1.5 h-1.5 rounded-full", i < 2 ? "bg-emerald-500" : "bg-amber-400")} />
                      <span className="text-muted-foreground">{t}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  {[85, 62, 45, 30, 18].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col justify-end h-20">
                      <div className="rounded-t bg-[#534AB7]/70 w-full" style={{ height: `${h}%` }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-[#534AB7]/10 rounded-full blur-3xl" />
            </div>
          </div>
        </div>
      </section>

      {/* ── ПРОБЛЕМЫ ── */}
      <section id="возможности" className="bg-zinc-50 py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-3">Знакомо?</Badge>
            <h2 className="text-3xl md:text-4xl font-bold">С чем сталкиваются компании каждый день</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="bg-white rounded-xl border border-border p-6 hover:shadow-lg transition-shadow">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center mb-4">
                  <p.icon className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="font-semibold mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── РЕШЕНИЕ ── */}
      <section className="py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 max-w-3xl mx-auto">
            <Badge variant="outline" className="mb-3 text-[#534AB7] border-[#534AB7]/30 bg-[#534AB7]/5">Company24 — всё в одном</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Не CRM. Не ERP. AI Business OS.</h2>
            <p className="text-muted-foreground text-lg">Операционная система для бизнеса, где AI делает работу, а не просто показывает графики.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 pr-4 font-medium text-muted-foreground" />
                  <th className="py-3 px-4 font-semibold text-[#534AB7]">Company24</th>
                  <th className="py-3 px-4 font-medium text-muted-foreground">CRM</th>
                  <th className="py-3 px-4 font-medium text-muted-foreground">ERP</th>
                  <th className="py-3 px-4 font-medium text-muted-foreground">Вручную</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((r) => (
                  <tr key={r.feature} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">{r.feature}</td>
                    <td className="py-3 px-4 text-center"><ComparisonIcon val={r.c24} /></td>
                    <td className="py-3 px-4 text-center"><ComparisonIcon val={r.crm} /></td>
                    <td className="py-3 px-4 text-center"><ComparisonIcon val={r.erp} /></td>
                    <td className="py-3 px-4 text-center"><ComparisonIcon val={r.manual} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── МОДУЛИ ── */}
      <section id="модули" className="bg-zinc-50 py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-3">Модули</Badge>
            <h2 className="text-3xl md:text-4xl font-bold">4 модуля — одна платформа</h2>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {MODULES.map((m) => (
              <Button
                key={m.id}
                variant={activeModule === m.id ? "default" : "outline"}
                size="sm"
                className={cn("gap-2", activeModule === m.id && "bg-[#534AB7] hover:bg-[#4338a8]")}
                onClick={() => setActiveModule(m.id)}
              >
                <m.icon className="w-4 h-4" />
                {m.label}
              </Button>
            ))}
          </div>

          {MODULES.filter((m) => m.id === activeModule).map((m) => (
            <div key={m.id} className="bg-white rounded-2xl border border-border p-8 max-w-2xl mx-auto">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[#534AB7]/10 flex items-center justify-center">
                  <m.icon className={cn("w-5 h-5", m.color)} />
                </div>
                <h3 className="text-xl font-semibold">{m.label}</h3>
              </div>
              <ul className="space-y-3">
                {m.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm">
                    <Check className="w-4 h-4 text-[#534AB7] mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3 ШАГА ── */}
      <section className="py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-3">Как это работает</Badge>
            <h2 className="text-3xl md:text-4xl font-bold">3 шага к автоматизации</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <div key={s.num} className="relative bg-white rounded-2xl border border-border p-8 text-center hover:shadow-lg transition-shadow">
                <span className="text-5xl font-bold text-[#534AB7]/10 absolute top-4 right-6">{s.num}</span>
                <div className="w-12 h-12 rounded-xl bg-[#534AB7]/10 flex items-center justify-center mx-auto mb-4">
                  <s.icon className="w-6 h-6 text-[#534AB7]" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI-АГЕНТЫ ── */}
      <section className="bg-zinc-50 py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-3 text-[#534AB7] border-[#534AB7]/30 bg-[#534AB7]/5">
              <Bot className="w-3 h-3 mr-1" /> AI-агенты
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold">6 AI-агентов работают на вас</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AI_AGENTS.map((a) => (
              <div key={a.name} className="bg-white rounded-xl border border-border p-6 flex items-start gap-4 hover:shadow-lg transition-shadow">
                <div className="w-10 h-10 rounded-lg bg-[#534AB7]/10 flex items-center justify-center shrink-0">
                  <a.icon className="w-5 h-5 text-[#534AB7]" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{a.name}</h3>
                  <p className="text-sm text-muted-foreground">{a.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ТАРИФЫ ── */}
      <section id="тарифы" className="py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-3">Тарифы</Badge>
            <h2 className="text-3xl md:text-4xl font-bold">Выберите свой план</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TARIFFS.map((t) => (
              <div
                key={t.name}
                className={cn(
                  "rounded-2xl border p-6 flex flex-col relative",
                  t.popular
                    ? "border-[#534AB7] shadow-lg shadow-[#534AB7]/10 bg-white"
                    : "border-border bg-white"
                )}
              >
                {t.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#534AB7]">Популярный</Badge>
                )}
                <h3 className="font-semibold text-lg mb-1">{t.name}</h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-bold">{t.price}</span>
                  <span className="text-sm text-muted-foreground">₽/мес</span>
                </div>
                <div className="text-xs text-muted-foreground mb-4 space-y-0.5">
                  <p>{t.vacancies}</p>
                  <p>{t.candidates}</p>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="w-3.5 h-3.5 text-[#534AB7] shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={t.popular ? "default" : "outline"}
                  className={cn("w-full", t.popular && "bg-[#534AB7] hover:bg-[#4338a8]")}
                  asChild
                >
                  <Link href="/register">Начать</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ЦИФРЫ ── */}
      <section className="bg-zinc-50 py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {METRICS.map((m) => (
              <div key={m.label} className="text-center">
                <div className="w-12 h-12 rounded-xl bg-[#534AB7]/10 flex items-center justify-center mx-auto mb-3">
                  <m.icon className="w-6 h-6 text-[#534AB7]" />
                </div>
                <p className="text-3xl font-bold text-[#534AB7] mb-1">{m.value}</p>
                <p className="text-sm text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 md:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Попробуйте Company24 бесплатно</h2>
          <p className="text-lg text-muted-foreground mb-8">14 дней полного доступа. Без привязки карты.</p>
          <Button size="lg" className="bg-[#534AB7] hover:bg-[#4338a8] h-12 px-10 text-base" asChild>
            <Link href="/register">Начать бесплатно <ArrowRight className="w-4 h-4 ml-2" /></Link>
          </Button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer id="о нас" className="bg-zinc-900 text-zinc-400 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#534AB7] flex items-center justify-center">
                  <span className="text-white font-bold text-sm">C</span>
                </div>
                <span className="font-bold text-lg text-white">Company24</span>
              </div>
              <p className="text-sm leading-relaxed">AI-операционная система для бизнеса. Автоматизация HR, маркетинга, продаж и логистики.</p>
            </div>
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <h4 className="font-semibold text-white text-sm mb-4">{col.title}</h4>
                <ul className="space-y-2">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a href="#" className="text-sm hover:text-white transition-colors">{l}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-zinc-800 pt-6 text-center text-xs text-zinc-500">
            &copy; 2026 Company24. Все права защищены.
          </div>
        </div>
      </footer>
    </div>
  )
}
