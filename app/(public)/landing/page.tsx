"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Users, Megaphone, DollarSign, Truck, Brain, MessageSquare, BarChart3,
  Target, Zap, ArrowRight, Check, X, Minus,
  Clock, TrendingUp, Award, Building2,
  Bot, Handshake,
  Menu, X as XIcon, Play,
} from "lucide-react"

// ─── Scroll reveal hook ──────────────────────────────────────────────────────

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

// ─── Count-up hook ───────────────────────────────────────────────────────────

function useCountUp(end: number, duration = 2000) {
  const [value, setValue] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStarted(true); obs.disconnect() } },
      { threshold: 0.3 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return
    const startTime = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * end))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [started, end, duration])

  return { value, ref }
}

// ─── Data ────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Возможности", href: "#features" },
  { label: "Модули", href: "#modules" },
  { label: "Тарифы", href: "#pricing" },
  { label: "О нас", href: "#about" },
]



const MODULES = [
  {
    id: "hr", icon: Users, label: "HR и команда",
    gradient: "from-indigo-500 to-violet-500",
    lightBg: "bg-indigo-50", lightColor: "text-indigo-600",
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
    id: "marketing", icon: Megaphone, label: "Маркетинг",
    gradient: "from-rose-500 to-pink-500",
    lightBg: "bg-rose-50", lightColor: "text-rose-600",
    features: [
      "Анализ конкурентов в реальном времени",
      "ROI по каждому каналу",
      "AI-генерация контента",
      "UTM-аналитика и атрибуция",
      "SEO-мониторинг",
    ],
  },
  {
    id: "sales", icon: DollarSign, label: "Продажи",
    gradient: "from-amber-500 to-orange-500",
    lightBg: "bg-amber-50", lightColor: "text-amber-600",
    features: [
      "AI-квалификация лидов",
      "Автоматические follow-up",
      "Воронка сделок с прогнозами",
      "Интеграция с Битрикс24 и AmoCRM",
      "Аналитика менеджеров",
    ],
  },
  {
    id: "logistics", icon: Truck, label: "Логистика и склад",
    gradient: "from-emerald-500 to-teal-500",
    lightBg: "bg-emerald-50", lightColor: "text-emerald-600",
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
  { num: "01", title: "Подключите", desc: "Регистрация за 2 минуты, импорт данных из CRM", icon: Zap, gradient: "from-indigo-500 to-violet-500" },
  { num: "02", title: "AI настроит", desc: "Агенты анализируют ваш бизнес и настраивают автоматизации", icon: Brain, gradient: "from-rose-500 to-orange-500" },
  { num: "03", title: "Работает 24/7", desc: "AI ведёт рутину, вы принимаете решения", icon: Clock, gradient: "from-emerald-500 to-teal-500" },
]

const AI_AGENTS = [
  { icon: Brain, name: "Скоринг-агент", desc: "Оценивает кандидатов по 50+ параметрам", gradient: "from-indigo-500 to-violet-600", lightBg: "bg-indigo-50" },
  { icon: MessageSquare, name: "Коммуникатор", desc: "Отправляет сообщения, назначает интервью", gradient: "from-rose-500 to-pink-600", lightBg: "bg-rose-50" },
  { icon: BarChart3, name: "Аналитик", desc: "Строит отчёты, находит узкие места", gradient: "from-emerald-500 to-teal-600", lightBg: "bg-emerald-50" },
  { icon: Target, name: "Маркетолог", desc: "Анализирует конкурентов, оптимизирует бюджет", gradient: "from-amber-500 to-orange-600", lightBg: "bg-amber-50" },
  { icon: Handshake, name: "Продавец", desc: "Квалифицирует лиды, напоминает о follow-up", gradient: "from-violet-500 to-purple-600", lightBg: "bg-violet-50" },
  { icon: Truck, name: "Логист", desc: "Оптимизирует маршруты, прогнозирует спрос", gradient: "from-cyan-500 to-blue-600", lightBg: "bg-cyan-50" },
]

const TARIFFS = [
  { name: "Solo", price: "14 900", vacancies: "1 вакансия", candidates: "400 кандидатов", popular: false, features: ["1 пользователь", "Базовый AI-скоринг", "Email-поддержка"] },
  { name: "Starter", price: "24 900", vacancies: "3 вакансии", candidates: "1 200 кандидатов", popular: false, features: ["3 пользователя", "Расширенный AI", "Интеграция hh.ru", "Чат-поддержка"] },
  { name: "Business", price: "49 900", vacancies: "10 вакансий", candidates: "4 000 кандидатов", popular: true, features: ["10 пользователей", "Все AI-агенты", "Branding", "AI-видеоинтервью", "Приоритетная поддержка"] },
  { name: "Pro", price: "99 900", vacancies: "22 вакансии", candidates: "10 000 кандидатов", popular: false, features: ["Безлимит пользователей", "Все модули", "Custom domain", "API доступ", "Персональный менеджер"] },
]

const COUNTER_METRICS = [
  { end: 60, suffix: "%", prefix: "", label: "быстрее найм", icon: Clock },
  { end: 3, suffix: "x", prefix: "", label: "меньше рутины", icon: TrendingUp },
  { end: 4, suffix: "x", prefix: "ROI ", label: "за 3 месяца", icon: Award },
  { end: 500, suffix: "+", prefix: "", label: "компаний доверяют", icon: Building2 },
]

const FOOTER_COLS = [
  { title: "Продукт", links: ["Возможности", "Модули", "Тарифы", "API"] },
  { title: "Компания", links: ["О нас", "Блог", "Карьера", "Контакты"] },
  { title: "Юридическое", links: ["Политика конфиденциальности", "Условия использования", "Оферта"] },
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function MetricCounter({ end, suffix, prefix, label, icon: Icon }: typeof COUNTER_METRICS[number]) {
  const { value, ref } = useCountUp(end, 2000)
  return (
    <div ref={ref} className="text-center">
      <p className="text-5xl font-bold text-white mb-2 tracking-tight">
        {prefix}{value}{suffix}
      </p>
      <p className="text-white/60 text-sm">{label}</p>
    </div>
  )
}

// ─── Hero Dashboard ─────────────────────────────────────────────────────────

const DASH_TABS = [
  {
    id: "hr", label: "HR", color: "#6366f1",
    metrics: [
      { label: "Кандидатов", value: 1247, suffix: "" },
      { label: "Конверсия", value: 34, suffix: "%" },
      { label: "Время найма", value: 12, suffix: " дн" },
    ],
    nodes: [
      { x: 40, y: 105, label: "Отклик" },
      { x: 145, y: 55, label: "hh.ru" },
      { x: 145, y: 155, label: "Реферал" },
      { x: 280, y: 105, label: "Скрининг" },
      { x: 395, y: 55, label: "AI-оценка" },
      { x: 395, y: 155, label: "Интервью" },
      { x: 520, y: 105, label: "Оффер" },
    ],
    edges: [[0,1],[0,2],[1,3],[2,3],[3,4],[3,5],[4,6],[5,6]] as [number, number][],
    events: [
      "AI-скоринг: Иванов А. — 94 балла",
      "Новый отклик на Senior React",
      "Интервью назначено: 15:30",
      "Оффер отправлен: Петрова М.",
      "Реферал: рекомендация от отдела",
      "Скрининг: 12 резюме обработано",
    ],
  },
  {
    id: "mkt", label: "Маркетинг", color: "#f43f5e",
    metrics: [
      { label: "ROI", value: 4, suffix: ".2x" },
      { label: "Лиды", value: 892, suffix: "" },
      { label: "CTR", value: 7, suffix: "%" },
    ],
    nodes: [
      { x: 40, y: 105, label: "Трафик" },
      { x: 145, y: 55, label: "SEO" },
      { x: 145, y: 155, label: "Реклама" },
      { x: 280, y: 105, label: "Лендинг" },
      { x: 395, y: 55, label: "Заявка" },
      { x: 395, y: 155, label: "Ретаргет" },
      { x: 520, y: 105, label: "Лиды 892" },
    ],
    edges: [[0,1],[0,2],[1,3],[2,3],[3,4],[3,5],[4,6],[5,6]] as [number, number][],
    events: [
      "SEO: +12 позиций «автоматизация»",
      "CTR рекламы вырос до 7.2%",
      "Новая заявка с лендинга",
      "Ретаргет: 34 возврата за час",
      "ROI кампании: 4.2x",
      "Трафик: +18% за неделю",
    ],
  },
  {
    id: "sales", label: "Продажи", color: "#f59e0b",
    metrics: [
      { label: "Сделок", value: 156, suffix: "" },
      { label: "Выручка", value: 12, suffix: ".4M" },
      { label: "Конверсия", value: 28, suffix: "%" },
    ],
    nodes: [
      { x: 40, y: 105, label: "Лид" },
      { x: 145, y: 55, label: "Звонок" },
      { x: 145, y: 155, label: "Письмо" },
      { x: 280, y: 105, label: "КП" },
      { x: 395, y: 55, label: "Переговоры" },
      { x: 395, y: 155, label: "Демо" },
      { x: 520, y: 105, label: "Сделка" },
    ],
    edges: [[0,1],[0,2],[1,3],[2,3],[3,4],[3,5],[4,6],[5,6]] as [number, number][],
    events: [
      "Новый лид: ООО «Техносфера»",
      "КП отправлено: 2.4M ₽",
      "Демо запланировано на 16:00",
      "Сделка закрыта: 1.8M ₽",
      "Follow-up: 3 напоминания",
      "Звонок: конверсия 34%",
    ],
  },
  {
    id: "logistics", label: "Логистика", color: "#0ea5e9",
    metrics: [
      { label: "Заказов", value: 340, suffix: "" },
      { label: "В пути", value: 89, suffix: "" },
      { label: "Доставка", value: 2, suffix: ".1 дн" },
    ],
    nodes: [
      { x: 30, y: 105, label: "Заказ" },
      { x: 115, y: 55, label: "Наличие" },
      { x: 115, y: 155, label: "Закупка" },
      { x: 210, y: 105, label: "Комплект." },
      { x: 305, y: 55, label: "Упаковка" },
      { x: 305, y: 155, label: "Маршрут" },
      { x: 400, y: 105, label: "Доставка" },
      { x: 510, y: 105, label: "Готово" },
    ],
    edges: [[0,1],[0,2],[1,3],[2,3],[3,4],[3,5],[4,6],[5,6],[6,7]] as [number, number][],
    events: [
      "Заказ #4521 → комплектация",
      "Маршрут оптимизирован: −40 мин",
      "Закупка: поставщик подтвердил",
      "Доставка #4518 завершена",
      "Наличие: 98% позиций в стоке",
      "Упаковка: партия #89 готова",
    ],
  },
  {
    id: "warehouse", label: "Склад", color: "#10b981",
    metrics: [
      { label: "Позиций", value: 4200, suffix: "" },
      { label: "Оборот", value: 8, suffix: ".2M" },
      { label: "Точность", value: 99, suffix: ".8%" },
    ],
    nodes: [
      { x: 40, y: 105, label: "Приёмка" },
      { x: 145, y: 55, label: "Проверка" },
      { x: 145, y: 155, label: "Маркировка" },
      { x: 280, y: 105, label: "Хранение" },
      { x: 395, y: 55, label: "Сборка" },
      { x: 395, y: 155, label: "Упаковка" },
      { x: 520, y: 105, label: "Отгрузка" },
    ],
    edges: [[0,1],[0,2],[1,3],[2,3],[3,4],[3,5],[4,6],[5,6]] as [number, number][],
    events: [
      "Приёмка: 340 позиций принято",
      "Маркировка завершена: партия #89",
      "Сборка заказа #4520",
      "Инвентаризация: расхождение 0.2%",
      "Отгрузка: 12 паллет готово",
      "Проверка качества: OK",
    ],
  },
]

function HeroDashboard() {
  const [tab, setTab] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const [animatedMetrics, setAnimatedMetrics] = useState([0, 0, 0])
  const [eventIdx, setEventIdx] = useState(0)

  const current = DASH_TABS[tab]

  // Auto-rotate tabs every 6s
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTab((t) => (t + 1) % DASH_TABS.length)
    }, 6000)
    return () => clearInterval(timerRef.current)
  }, [])

  const handleTab = (i: number) => {
    setTab(i)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTab((t) => (t + 1) % DASH_TABS.length)
    }, 6000)
  }

  // Event feed rotation every 2s
  useEffect(() => {
    setEventIdx(0)
    const id = setInterval(() => setEventIdx((i) => i + 1), 2000)
    return () => clearInterval(id)
  }, [tab])

  // Animate metrics on tab change
  useEffect(() => {
    const targets = current.metrics.map((m) => m.value)
    const startTime = performance.now()
    const duration = 1200
    let raf: number
    const tick = (now: number) => {
      const p = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setAnimatedMetrics(targets.map((t) => Math.round(eased * t)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [tab, current.metrics])

  // Canvas network animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = 560 * dpr
    canvas.height = 220 * dpr
    ctx.scale(dpr, dpr)

    const { nodes, edges, color } = current
    const particles: { edge: number; t: number; speed: number }[] = []
    let running = true
    let lastSpawn = 0

    const draw = (now: number) => {
      if (!running) return
      ctx.clearRect(0, 0, 560, 220)

      // Spawn particles every 180ms
      if (now - lastSpawn > 180) {
        lastSpawn = now
        if (particles.length < 40) {
          const ei = Math.floor(Math.random() * edges.length)
          particles.push({ edge: ei, t: 0, speed: 0.0036 + Math.random() * 0.0048 })
        }
      }

      // Draw edges
      for (const [ai, bi] of edges) {
        const a = nodes[ai]
        const b = nodes[bi]
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = color + "25"
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Update and draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.t += p.speed
        if (p.t > 1) { particles.splice(i, 1); continue }
        const [ai, bi] = edges[p.edge]
        const a = nodes[ai]
        const b = nodes[bi]
        const x = a.x + (b.x - a.x) * p.t
        const y = a.y + (b.y - a.y) * p.t

        ctx.beginPath()
        ctx.arc(x, y, 3, 0, Math.PI * 2)
        ctx.fillStyle = color + "cc"
        ctx.fill()
      }

      // Draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        ctx.beginPath()
        ctx.arc(n.x, n.y, 20, 0, Math.PI * 2)
        ctx.fillStyle = color + "12"
        ctx.fill()
        ctx.strokeStyle = color + "35"
        ctx.lineWidth = 1.5
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(n.x, n.y, 13, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()

        ctx.fillStyle = "#fff"
        ctx.font = "bold 10px system-ui"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(String(i + 1), n.x, n.y)

        ctx.fillStyle = "#6b7280"
        ctx.font = "10px system-ui"
        ctx.fillText(n.label, n.x, n.y + 32)
      }

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => {
      running = false
      cancelAnimationFrame(animRef.current)
    }
  }, [tab, current])

  const evLen = current.events.length
  const visibleEvents = [0, 1, 2].map((offset) =>
    current.events[(eventIdx + offset) % evLen]
  )

  return (
    <div className="hidden lg:block" style={{ animation: "fade-in-up 1s ease-out 0.3s both" }}>
      <div className="rounded-2xl border border-gray-200 shadow-lg overflow-hidden bg-white">
        {/* Browser bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-400" />
            <span className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="w-3 h-3 rounded-full bg-emerald-400" />
          </div>
          <span className="text-xs text-gray-400 ml-2 font-medium">company24.pro</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-0">
          {DASH_TABS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => handleTab(i)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                tab === i
                  ? "text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              )}
              style={tab === i ? { backgroundColor: t.color } : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3 px-4 py-3">
          {current.metrics.map((m, i) => (
            <div key={m.label} className="rounded-xl bg-gray-50 px-3 py-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">{m.label}</p>
              <p className="text-xl font-bold tracking-tight" style={{ color: current.color }}>
                {animatedMetrics[i]}{m.suffix}
              </p>
            </div>
          ))}
        </div>

        {/* Canvas network */}
        <div className="px-4">
          <canvas
            ref={canvasRef}
            width={560}
            height={220}
            className="w-full rounded-xl bg-gray-50/50"
            style={{ height: 200 }}
          />
        </div>

        {/* Event feed */}
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="space-y-1.5">
            {visibleEvents.map((ev, i) => (
              <div
                key={`${eventIdx}-${i}`}
                className="flex items-center gap-2 text-[11px]"
                style={i === 0 ? { animation: "slide-in 0.3s ease-out" } : { opacity: 1 - i * 0.25 }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: i === 0 ? current.color : current.color + "80" }}
                />
                <span className="text-gray-500 truncate">{ev}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CSS Animations ──────────────────────────────────────────────────────────

const CUSTOM_STYLES = `
@keyframes blob-drift-1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(30px, -50px) scale(1.08); }
  50% { transform: translate(-20px, 30px) scale(0.94); }
  75% { transform: translate(40px, 20px) scale(1.04); }
}
@keyframes blob-drift-2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(-40px, 30px) scale(0.95); }
  50% { transform: translate(30px, -40px) scale(1.1); }
  75% { transform: translate(-20px, -30px) scale(1.02); }
}
@keyframes blob-drift-3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(25px, -35px) scale(1.06); }
  66% { transform: translate(-35px, 25px) scale(0.96); }
}
@keyframes pulse-ring {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.6); }
}
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes slide-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
`

// ─── Landing Page ────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [activeModule, setActiveModule] = useState("hr")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Section reveals
  const howWesolve = useReveal()
  const comparison = useReveal()
  const modules = useReveal()
  const steps = useReveal()
  const agents = useReveal()
  const pricing = useReveal()
  const cta = useReveal()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const currentModule = MODULES.find((m) => m.id === activeModule) ?? MODULES[0]

  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased scroll-smooth">
      <style dangerouslySetInnerHTML={{ __html: CUSTOM_STYLES }} />

      {/* ── HEADER ── */}
      <header className={cn(
        "sticky top-0 z-50 transition-all duration-300 border-b",
        scrolled
          ? "bg-white/90 backdrop-blur-xl border-gray-200/60 shadow-sm"
          : "bg-transparent border-transparent"
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-white font-bold text-base">C</span>
            </div>
            <span className="font-bold text-xl tracking-tight text-gray-800">Company24.pro</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {NAV_ITEMS.map((item) => (
              <a key={item.href} href={item.href} className="text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-800" asChild>
              <Link href="/login">Войти</Link>
            </Button>
            <Button size="sm" className="bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 shadow-lg shadow-indigo-500/20 text-white" asChild>
              <Link href="/register">Попробовать бесплатно</Link>
            </Button>
          </div>

          <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <XIcon className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white/95 backdrop-blur-xl px-4 py-4 space-y-3">
            {NAV_ITEMS.map((item) => (
              <a key={item.href} href={item.href} className="block text-sm font-medium text-gray-500" onClick={() => setMobileMenuOpen(false)}>
                {item.label}
              </a>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="flex-1" asChild>
                <Link href="/login">Войти</Link>
              </Button>
              <Button size="sm" className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white" asChild>
                <Link href="/register">Бесплатно</Link>
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden flex items-center">
        {/* Gradient mesh blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute -top-32 right-[-10%] w-[500px] h-[500px] rounded-full opacity-40"
            style={{ background: "radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)", animation: "blob-drift-1 18s ease-in-out infinite" }}
          />
          <div
            className="absolute bottom-[-10%] left-[-5%] w-[450px] h-[450px] rounded-full opacity-35"
            style={{ background: "radial-gradient(circle, rgba(244,114,82,0.25) 0%, transparent 70%)", animation: "blob-drift-2 22s ease-in-out infinite" }}
          />
          <div
            className="absolute top-[30%] left-[40%] w-[350px] h-[350px] rounded-full opacity-25"
            style={{ background: "radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 70%)", animation: "blob-drift-3 15s ease-in-out infinite" }}
          />
          <div
            className="absolute top-[15%] left-[15%] w-[250px] h-[250px] rounded-full opacity-30"
            style={{ background: "radial-gradient(circle, rgba(251,191,36,0.2) 0%, transparent 70%)", animation: "blob-drift-1 20s ease-in-out infinite reverse" }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-16 relative w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div style={{ animation: "fade-in-up 0.8s ease-out" }}>
              <div className="inline-flex items-center gap-2 text-xs font-medium tracking-wide uppercase text-indigo-600 bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-full mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75" style={{ animation: "pulse-ring 2s ease-in-out infinite" }} />
                  <span className="relative rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                AI Business OS
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-[56px] font-bold tracking-tight leading-[1.08] mb-5 text-gray-900">
                AI-система, которая ведёт бизнес{" "}
                <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">24/7</span>
              </h1>

              <p className="text-lg text-gray-500 mb-10 max-w-xl leading-relaxed">
                Company24.pro автоматизирует HR, маркетинг, продажи и логистику. AI-агенты берут на себя 80% рутины. Снижаем затраты и увеличиваем эффективность.
              </p>

              <div className="flex flex-wrap gap-4 mb-8">
                <Button size="lg" className="bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 h-14 px-10 text-base shadow-xl shadow-indigo-500/20 transition-all hover:shadow-2xl hover:shadow-indigo-500/30 hover:scale-[1.02] text-white rounded-2xl" asChild>
                  <Link href="/register">Начать бесплатно <ArrowRight className="w-5 h-5 ml-2" /></Link>
                </Button>
                <Button variant="outline" size="lg" className="h-14 px-10 text-base rounded-2xl border-gray-200 text-gray-600 hover:bg-white hover:border-indigo-200 hover:text-indigo-600 transition-all">
                  <Play className="w-4 h-4 mr-2" /> Смотреть демо
                </Button>
              </div>

              <p className="text-sm text-gray-400">
                Бесплатно 14 дней · Без привязки карты · company24.pro
              </p>
            </div>

            <HeroDashboard />
          </div>
        </div>
      </section>

      {/* ── КАК МЫ РЕШАЕМ ── */}
      <section id="features" className="py-24 bg-gray-50">
        <div
          ref={howWesolve.ref}
          className={cn(
            "max-w-5xl mx-auto px-4 sm:px-6 transition-all duration-700",
            howWesolve.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-medium tracking-widest uppercase text-indigo-500 bg-indigo-50 border border-indigo-100 px-4 py-1.5 rounded-full mb-4">
              Как мы решаем
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800">Проблемы бизнеса — и как Company24.pro их решает</h2>
          </div>

          {/* Блок 1 — Найм */}
          <div className="mb-16">
            <div className="flex justify-center mb-6">
              <span className="inline-block text-xs font-medium tracking-widest uppercase text-indigo-500 bg-indigo-50 border border-indigo-100 px-4 py-1.5 rounded-full">
                Найм
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-gray-100 border-l-4 border-l-red-400 p-8">
                <h3 className="font-bold text-lg mb-4 text-gray-800">Кандидатов много — релевантных мало</h3>
                <ul className="space-y-3">
                  {[
                    "Сотни откликов, но HR тратит время на нерелевантных",
                    "Хорошие кандидаты уходят, пока разбираете слабых",
                    "Кандидаты приходят на собеседование просто узнать что предлагаете",
                    "Ручная переписка с каждым — нужна целая команда рекрутеров",
                  ].map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-3 h-3 text-red-400" />
                      </div>
                      <span className="text-sm text-gray-500 leading-relaxed">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 border-l-4 border-l-emerald-400 p-8">
                <h3 className="font-bold text-lg mb-4 text-gray-800">Company24.pro находит готовых кандидатов</h3>
                <ul className="space-y-3">
                  {[
                    "Привлекаем кандидатов с hh.ru, Авито, SuperJob и других job-бордов",
                    "AI автоматически фильтрует нерелевантных",
                    "Прогрев, проверка навыков, отсев — без участия HR",
                    "Демонстрация должности до собеседования",
                    "К HR приходят только те, кто сказал «да, я хочу»",
                  ].map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-emerald-500" />
                      </div>
                      <span className="text-sm text-gray-600 leading-relaxed">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Блок 2 — Ввод в должность */}
          <div className="mb-16">
            <div className="flex justify-center mb-6">
              <span className="inline-block text-xs font-medium tracking-widest uppercase text-amber-500 bg-amber-50 border border-amber-100 px-4 py-1.5 rounded-full">
                Ввод в должность
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-gray-100 border-l-4 border-l-red-400 p-8">
                <h3 className="font-bold text-lg mb-4 text-gray-800">Месяцы ожидания — покажет ли результат?</h3>
                <ul className="space-y-3">
                  {[
                    "2-3 месяца чтобы понять подходит ли сотрудник",
                    "Огромная нагрузка на наставников и руководителей",
                    "Не подошёл — потеряны месяцы и деньги",
                    "Нет структурированного процесса адаптации",
                  ].map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-3 h-3 text-red-400" />
                      </div>
                      <span className="text-sm text-gray-500 leading-relaxed">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 border-l-4 border-l-emerald-400 p-8">
                <h3 className="font-bold text-lg mb-4 text-gray-800">За 1-2 недели понимаем — подходит или нет</h3>
                <ul className="space-y-3">
                  {[
                    "Курсы + тестовые задания с первого дня",
                    "Проверяем ключевые навыки: звонки, письма, продажи",
                    "Структурированный онбординг снимает нагрузку с наставников",
                    "Не подошёл — узнаём за дни, а не за месяцы",
                  ].map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-emerald-500" />
                      </div>
                      <span className="text-sm text-gray-600 leading-relaxed">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Блок 3 — Обучение и развитие */}
          <div>
            <div className="flex justify-center mb-6">
              <span className="inline-block text-xs font-medium tracking-widest uppercase text-violet-500 bg-violet-50 border border-violet-100 px-4 py-1.5 rounded-full">
                Обучение и развитие
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-gray-100 border-l-4 border-l-red-400 p-8">
                <h3 className="font-bold text-lg mb-4 text-gray-800">Обучение хаотичное и не системное</h3>
                <ul className="space-y-3">
                  {[
                    "Сотрудники не знают что развивать",
                    "Руководители не успевают обучать",
                    "Нет единой базы знаний и контроля",
                  ].map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-3 h-3 text-red-400" />
                      </div>
                      <span className="text-sm text-gray-500 leading-relaxed">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 border-l-4 border-l-emerald-400 p-8">
                <h3 className="font-bold text-lg mb-4 text-gray-800">AI прокачивает команду на автомате</h3>
                <ul className="space-y-3">
                  {[
                    "AI анализирует слабые стороны каждого сотрудника",
                    "Дозированные курсы и видео из библиотеки обучения",
                    "Платформа напоминает когда пора учиться",
                    "Прокачка навыков без участия руководителя",
                  ].map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-emerald-500" />
                      </div>
                      <span className="text-sm text-gray-600 leading-relaxed">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── СРАВНЕНИЕ ── */}
      <section className="py-24 md:py-28 bg-gradient-to-br from-violet-50/50 via-indigo-50/30 to-emerald-50/30">
        <div
          ref={comparison.ref}
          className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-700",
            comparison.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14 max-w-3xl mx-auto">
            <span className="inline-block text-xs font-medium tracking-widest uppercase text-indigo-500 bg-indigo-50 border border-indigo-100 px-4 py-1.5 rounded-full mb-4">
              Почему мы
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-800">
              Не CRM. Не ERP.{" "}
              <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">AI Business OS.</span>
            </h2>
            <p className="text-gray-500 text-lg">Операционная система для бизнеса, где AI делает работу, а не просто показывает графики.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
            {/* CRM */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8">
              <h3 className="font-bold text-xl mb-1 text-gray-400">CRM</h3>
              <p className="text-sm text-gray-400 mb-6">Только продажи</p>
              <ul className="space-y-3 mb-6">
                {([
                  { text: "Нет автоматизации найма", icon: "x" },
                  { text: "Нет AI-скоринга кандидатов", icon: "x" },
                  { text: "Частичная маркетинговая аналитика", icon: "partial" },
                  { text: "Воронка продаж", icon: "check" },
                  { text: "Нет управления складом", icon: "x" },
                ] as const).map((p) => (
                  <li key={p.text} className="flex items-start gap-3">
                    <div className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                      p.icon === "x" ? "bg-gray-100" : p.icon === "partial" ? "bg-amber-50" : "bg-emerald-50"
                    )}>
                      {p.icon === "x" && <X className="w-3 h-3 text-gray-300" />}
                      {p.icon === "partial" && <Minus className="w-3 h-3 text-amber-400" />}
                      {p.icon === "check" && <Check className="w-3 h-3 text-emerald-400" />}
                    </div>
                    <span className="text-sm text-gray-500">{p.text}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-400 font-medium">Среднее внедрение</p>
            </div>

            {/* Company24.pro */}
            <div className="relative bg-gradient-to-b from-indigo-50 to-white rounded-2xl border-2 border-indigo-500 p-8 shadow-xl">
              <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white px-4 py-1 rounded-full text-xs font-medium shadow-lg">
                Рекомендуем
              </span>
              <h3 className="font-bold text-xl mb-1 text-indigo-600">Company24.pro</h3>
              <p className="text-sm text-indigo-400 mb-6">AI делает работу за вас</p>
              <ul className="space-y-3 mb-6">
                {[
                  "Автоматизация найма",
                  "AI-скоринг кандидатов",
                  "Маркетинговая аналитика",
                  "Воронка продаж",
                  "Управление складом",
                  "Доступная стоимость",
                ].map((p) => (
                  <li key={p} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-emerald-500" />
                    </div>
                    <span className="text-sm text-gray-700 font-medium">{p}</span>
                  </li>
                ))}
              </ul>
              <Button className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white shadow-lg shadow-indigo-500/20 h-11 rounded-xl" asChild>
                <Link href="/register">Попробовать бесплатно</Link>
              </Button>
            </div>

            {/* ERP */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8">
              <h3 className="font-bold text-xl mb-1 text-gray-400">ERP</h3>
              <p className="text-sm text-gray-400 mb-6">Сложно и дорого</p>
              <ul className="space-y-3 mb-6">
                {([
                  { text: "Нет автоматизации найма", icon: "x" },
                  { text: "Нет AI-скоринга", icon: "x" },
                  { text: "Нет маркетинга", icon: "x" },
                  { text: "Частично воронка продаж", icon: "partial" },
                  { text: "Управление складом", icon: "check" },
                ] as const).map((p) => (
                  <li key={p.text} className="flex items-start gap-3">
                    <div className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                      p.icon === "x" ? "bg-gray-100" : p.icon === "partial" ? "bg-amber-50" : "bg-emerald-50"
                    )}>
                      {p.icon === "x" && <X className="w-3 h-3 text-gray-300" />}
                      {p.icon === "partial" && <Minus className="w-3 h-3 text-amber-400" />}
                      {p.icon === "check" && <Check className="w-3 h-3 text-emerald-400" />}
                    </div>
                    <span className="text-sm text-gray-500">{p.text}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-red-400 font-medium">Дорогое внедрение</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── МОДУЛИ ── */}
      <section id="modules" className="bg-white py-24 md:py-28">
        <div
          ref={modules.ref}
          className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-700",
            modules.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-medium tracking-widest uppercase text-emerald-500 bg-emerald-50 border border-emerald-100 px-4 py-1.5 rounded-full mb-4">
              Модули
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800">4 модуля — одна платформа</h2>
          </div>

          {/* Tabs */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex bg-white rounded-2xl border border-gray-100 p-1.5 gap-1">
              {MODULES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setActiveModule(m.id)}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                    activeModule === m.id
                      ? `bg-gradient-to-r ${m.gradient} text-white shadow-lg`
                      : "text-gray-500 hover:text-gray-700 hover:bg-white"
                  )}
                >
                  <m.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Module content */}
          <div className="bg-white rounded-3xl border border-gray-100 p-10 max-w-2xl mx-auto transition-all duration-300">
            <div className="flex items-center gap-4 mb-8">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", currentModule.lightBg)}>
                <currentModule.icon className={cn("w-6 h-6", currentModule.lightColor)} />
              </div>
              <h3 className="text-2xl font-bold text-gray-800">{currentModule.label}</h3>
            </div>
            <ul className="space-y-4">
              {currentModule.features.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5", currentModule.lightBg)}>
                    <Check className={cn("w-3.5 h-3.5", currentModule.lightColor)} />
                  </div>
                  <span className="text-[15px] text-gray-700">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── 3 ШАГА ── */}
      <section className="py-24 md:py-28 bg-gray-50">
        <div
          ref={steps.ref}
          className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-700",
            steps.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-medium tracking-widest uppercase text-gray-500 bg-white border border-gray-100 px-4 py-1.5 rounded-full mb-4">
              Как это работает
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800">3 шага к автоматизации</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <div key={s.num} className="relative bg-white rounded-3xl border border-gray-100 p-9 text-center transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                <div className={cn("w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center mx-auto mb-5 shadow-lg", s.gradient)}>
                  <s.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-bold text-xl mb-3 text-gray-800">{s.title}</h3>
                <p className="text-gray-500 leading-relaxed">{s.desc}</p>
                {i < 2 && (
                  <ArrowRight className="hidden md:block absolute -right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 z-10" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI-АГЕНТЫ ── */}
      <section className="py-24 md:py-28 bg-gradient-to-br from-orange-50/40 via-rose-50/30 to-indigo-50/40">
        <div
          ref={agents.ref}
          className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-700",
            agents.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-widest uppercase text-violet-500 bg-violet-50 border border-violet-100 px-4 py-1.5 rounded-full mb-4">
              <Bot className="w-3.5 h-3.5" /> AI-агенты
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800">6 агентов работают на вас</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {AI_AGENTS.map((a) => (
              <div key={a.name} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/60 p-7 flex items-start gap-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
                <div className="relative shrink-0">
                  <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center", a.gradient)}>
                    <a.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                    <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75" style={{ animation: "pulse-ring 2s ease-in-out infinite" }} />
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white" />
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-base mb-1 text-gray-800">{a.name}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{a.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── МЕТРИКИ ── */}
      <section className="py-20 md:py-24 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-white/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-white/5 rounded-full blur-3xl" />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 relative">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {COUNTER_METRICS.map((m) => (
              <MetricCounter key={m.label} {...m} />
            ))}
          </div>
        </div>
      </section>

      {/* ── ТАРИФЫ ── */}
      <section id="pricing" className="py-24 md:py-28 bg-white">
        <div
          ref={pricing.ref}
          className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-700",
            pricing.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-medium tracking-widest uppercase text-amber-500 bg-amber-50 border border-amber-100 px-4 py-1.5 rounded-full mb-4">
              Тарифы
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800">Выберите свой план</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {TARIFFS.map((t) => (
              <div
                key={t.name}
                className={cn(
                  "rounded-3xl p-7 flex flex-col relative transition-all duration-300 hover:scale-[1.02] hover:shadow-xl",
                  t.popular
                    ? "border-2 border-indigo-400 shadow-xl shadow-indigo-500/10 bg-white"
                    : "border border-gray-100 bg-white hover:border-indigo-200"
                )}
              >
                {t.popular && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white px-4 py-1 rounded-full text-xs font-medium shadow-lg">
                    Популярный
                  </span>
                )}
                <h3 className="font-bold text-xl mb-2 text-gray-800">{t.name}</h3>
                <div className="flex items-baseline gap-1.5 mb-5">
                  <span className="text-4xl font-bold tracking-tight text-gray-800">{t.price}</span>
                  <span className="text-sm text-gray-400">₽/мес</span>
                </div>
                <div className="text-xs text-gray-400 mb-5 space-y-1 pb-5 border-b border-gray-100">
                  <p>{t.vacancies}</p>
                  <p>{t.candidates}</p>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-gray-600">
                      <div className="w-5 h-5 rounded-md bg-indigo-50 flex items-center justify-center">
                        <Check className="w-3 h-3 text-indigo-500" />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={t.popular ? "default" : "outline"}
                  className={cn(
                    "w-full h-11 rounded-xl",
                    t.popular
                      ? "bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 shadow-lg shadow-indigo-500/20 text-white"
                      : "border-gray-200 text-gray-600 hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50/50"
                  )}
                  asChild
                >
                  <Link href="/register">Выбрать</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 md:py-28 relative overflow-hidden bg-white">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-br from-indigo-100/40 to-violet-100/40 rounded-full blur-3xl" />
        </div>
        <div
          ref={cta.ref}
          className={cn(
            "max-w-3xl mx-auto px-4 sm:px-6 text-center relative transition-all duration-700",
            cta.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-5 text-gray-800">
            Попробуйте Company24.pro{" "}
            <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">бесплатно</span>
          </h2>
          <p className="text-xl text-gray-500 mb-10">14 дней полного доступа. Без привязки карты.</p>
          <Button size="lg" className="bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 h-14 px-12 text-lg shadow-xl shadow-indigo-500/20 transition-all hover:shadow-2xl hover:scale-[1.02] text-white rounded-2xl" asChild>
            <Link href="/register">Начать бесплатно <ArrowRight className="w-5 h-5 ml-2" /></Link>
          </Button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer id="about" className="bg-gray-900 text-gray-400 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-4 gap-10 mb-14">
            <div>
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
                  <span className="text-white font-bold text-base">C</span>
                </div>
                <span className="font-bold text-xl text-white tracking-tight">Company24.pro</span>
              </div>
              <p className="text-sm leading-relaxed mb-6">AI-операционная система для бизнеса. Автоматизация HR, маркетинга, продаж и логистики.</p>
              <div className="flex gap-3">
                <a href="#" className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors" aria-label="Telegram">
                  <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-gray-400">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                </a>
                <a href="#" className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors" aria-label="VK">
                  <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-gray-400">
                    <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.391 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.864-.525-2.05-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-1.253.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.677.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.253-1.406 2.15-3.574 2.15-3.574.119-.254.322-.491.763-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.05.17.49-.085.744-.576.744z" />
                  </svg>
                </a>
              </div>
            </div>
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <h4 className="font-semibold text-white text-sm mb-5">{col.title}</h4>
                <ul className="space-y-3">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a href="#" className="text-sm hover:text-white transition-colors">{l}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-xs text-gray-600">
            &copy; 2026 Company24.pro. Все права защищены.
          </div>
        </div>
      </footer>
    </div>
  )
}
