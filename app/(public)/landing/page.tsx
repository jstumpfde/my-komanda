"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { VERSION, BUILD_DATE } from "@/lib/version"
import {
  Users, Megaphone, DollarSign, Truck, Brain, MessageSquare, BarChart3,
  Target, Zap, ArrowRight, Check, X, Minus,
  Clock, TrendingUp, Award, Building2,
  Bot, Handshake,
  Menu, X as XIcon, TrendingDown, Play,
  Crown, UserCheck, ShoppingCart, Briefcase, BookOpen, GraduationCap,
  Calendar, Store, Globe, Mail, FileText, PenTool, Search,
  PieChart, Phone, Database, FileSignature, Package, KanbanSquare,
  Send, MessageCircle, Palette, Bell, Share2,
  Stethoscope, Scissors, UtensilsCrossed, Wrench, Monitor, School,
  Home, Hotel, Dumbbell, Scale, TrendingUp as TrendingUpIcon, Factory,
  ChevronDown, ChevronUp, Sparkles, Shield, Eye, HeartPulse, Mic,
  RefreshCw, AlertTriangle, Calculator, ClipboardList, LayoutDashboard,
  FileBarChart, Lightbulb,
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

const FEATURE_TABS = [
  {
    id: "hiring", label: "Найм", color: "indigo",
    problem: { title: "Кандидатов много — релевантных мало", points: [
      "Сотни откликов, но HR тратит время на нерелевантных",
      "Хорошие кандидаты уходят, пока разбираете слабых",
      "Кандидаты приходят на собеседование просто узнать что предлагаете",
      "Ручная переписка с каждым — нужна целая команда рекрутеров",
    ]},
    solution: { title: "Company24.pro находит готовых кандидатов", points: [
      "Привлекаем кандидатов с hh.ru, Авито, SuperJob и других job-бордов",
      "AI автоматически фильтрует нерелевантных",
      "Прогрев, проверка навыков, отсев — без участия HR",
      "Демонстрация должности до собеседования",
      "К HR приходят только те, кто сказал «да, я хочу»",
    ]},
  },
  {
    id: "onboarding", label: "Ввод в должность", color: "amber",
    problem: { title: "Месяцы ожидания — покажет ли результат?", points: [
      "2-3 месяца чтобы понять, подходит ли сотрудник",
      "Огромная нагрузка на наставников и руководителей",
      "Не подошёл — потеряны месяцы и деньги",
      "Нет структурированного процесса адаптации",
    ]},
    solution: { title: "За 1-2 недели понимаем — подходит или нет", points: [
      "Курсы и тестовые задания с первого дня",
      "Проверяем ключевые навыки: звонки, письма, продажи",
      "Структурированный онбординг снимает нагрузку с наставников",
      "Не подошёл — узнаём за дни, а не за месяцы",
    ]},
  },
  {
    id: "training", label: "Обучение", color: "violet",
    problem: { title: "Обучение хаотичное и не системное", points: [
      "Сотрудники не знают что развивать",
      "Руководители не успевают обучать",
      "Нет единой базы знаний и контроля",
    ]},
    solution: { title: "AI прокачивает команду на автомате", points: [
      "AI анализирует слабые стороны каждого сотрудника",
      "Дозированные курсы и видео из библиотеки обучения",
      "Платформа напоминает когда пора учиться",
      "Прокачка навыков без участия руководителя",
    ]},
  },
  {
    id: "marketing", label: "Маркетинг", color: "rose",
    problem: { title: "Бюджеты сливаются — ROI непонятен", points: [
      "Непонятно какой канал приносит клиентов",
      "Конкуренты снижают цены, а вы не знаете",
      "Нет аналитики по каждому рублю рекламы",
    ]},
    solution: { title: "AI считает каждый рубль", points: [
      "ROI по каждому рекламному каналу",
      "Анализ конкурентов в реальном времени",
      "AI оптимизирует бюджет автоматически",
      "A/B тесты и прогнозы без маркетолога",
    ]},
  },
  {
    id: "sales", label: "Продажи", color: "orange",
    problem: { title: "Лиды теряются, сделки буксуют", points: [
      "Менеджеры забывают перезвонить",
      "Нет прогноза по сделкам",
      "Непонятно почему клиенты уходят",
    ]},
    solution: { title: "AI ведёт воронку продаж", points: [
      "Автоматические follow-up и напоминания",
      "AI-квалификация лидов — приоритет лучшим",
      "Прогноз закрытия каждой сделки",
      "Интеграция с Битрикс24 и AmoCRM",
    ]},
  },
  {
    id: "logistics", label: "Логистика", color: "emerald",
    problem: { title: "Склад и доставка вручную", points: [
      "Остатки не совпадают с реальностью",
      "Маршруты не оптимизированы",
      "Заказы теряются между этапами",
    ]},
    solution: { title: "AI управляет складом и доставкой", points: [
      "Учёт товаров и автозаказ у поставщиков",
      "Оптимизация маршрутов доставки",
      "Прогноз спроса и планирование закупок",
      "Интеграция с 1С",
    ]},
  },
]

const FEATURE_TAB_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  indigo: { bg: "bg-indigo-500", text: "text-indigo-500", border: "border-indigo-500" },
  amber: { bg: "bg-amber-500", text: "text-amber-500", border: "border-amber-500" },
  violet: { bg: "bg-violet-500", text: "text-violet-500", border: "border-violet-500" },
  rose: { bg: "bg-rose-500", text: "text-rose-500", border: "border-rose-500" },
  orange: { bg: "bg-orange-500", text: "text-orange-500", border: "border-orange-500" },
  emerald: { bg: "bg-emerald-500", text: "text-emerald-500", border: "border-emerald-500" },
}



const MODULES = [
  {
    id: "hr", icon: Users, label: "HR и команда",
    desc: "Находим, оцениваем и адаптируем сотрудников на автомате",
    gradient: "from-indigo-500 to-violet-500",
    lightBg: "bg-indigo-500/10", lightColor: "text-indigo-400",
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
    desc: "Анализируем каналы, считаем ROI и оптимизируем бюджет",
    gradient: "from-rose-500 to-pink-500",
    lightBg: "bg-rose-500/10", lightColor: "text-rose-400",
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
    desc: "Ведём воронку, квалифицируем лиды, прогнозируем сделки",
    gradient: "from-amber-500 to-orange-500",
    lightBg: "bg-amber-500/10", lightColor: "text-amber-400",
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
    desc: "Управляем заказами, складом и маршрутами доставки",
    gradient: "from-emerald-500 to-teal-500",
    lightBg: "bg-emerald-500/10", lightColor: "text-emerald-400",
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
  { icon: Brain, name: "Скоринг-агент", desc: "Оценивает кандидатов по 50+ параметрам", gradient: "from-indigo-500 to-violet-600", lightBg: "bg-indigo-500/10" },
  { icon: MessageSquare, name: "Коммуникатор", desc: "Отправляет сообщения, назначает интервью", gradient: "from-rose-500 to-pink-600", lightBg: "bg-rose-500/10" },
  { icon: BarChart3, name: "Аналитик", desc: "Строит отчёты, находит узкие места", gradient: "from-emerald-500 to-teal-600", lightBg: "bg-emerald-500/10" },
  { icon: Target, name: "Маркетолог", desc: "Анализирует конкурентов, оптимизирует бюджет", gradient: "from-amber-500 to-orange-600", lightBg: "bg-amber-500/10" },
  { icon: Handshake, name: "Продавец", desc: "Квалифицирует лиды, напоминает о follow-up", gradient: "from-violet-500 to-purple-600", lightBg: "bg-violet-500/10" },
  { icon: Truck, name: "Логист", desc: "Оптимизирует маршруты, прогнозирует спрос", gradient: "from-cyan-500 to-blue-600", lightBg: "bg-cyan-500/10" },
]

const PRICING_MODULES = [
  { id: "hr", icon: Users, label: "HR и найм", desc: "Воронка, скоринг, онбординг, обучение", price: 19900, gradient: "from-indigo-500 to-violet-500", color: "indigo", available: true },
  { id: "marketing", icon: Megaphone, label: "Маркетинг", desc: "ROI, аналитика каналов, A/B тесты", price: 19900, gradient: "from-rose-500 to-pink-500", color: "rose", available: true },
  { id: "sales", icon: DollarSign, label: "Продажи", desc: "CRM, воронка, follow-up, прогнозы", price: 19900, gradient: "from-amber-500 to-orange-500", color: "amber", available: true },
  { id: "logistics", icon: Truck, label: "Логистика", desc: "Склад, маршруты, доставка, 1С", price: 19900, gradient: "from-cyan-500 to-cyan-400", color: "cyan", available: false },
]

const PRICING_MODULE_COLORS: Record<string, { border: string; bg: string; text: string; check: string }> = {
  indigo: { border: "border-indigo-500", bg: "bg-indigo-500/10", text: "text-indigo-400", check: "bg-indigo-500" },
  rose: { border: "border-rose-500", bg: "bg-rose-500/10", text: "text-rose-400", check: "bg-rose-500" },
  amber: { border: "border-amber-500", bg: "bg-amber-500/10", text: "text-amber-400", check: "bg-amber-500" },
  cyan: { border: "border-cyan-500", bg: "bg-cyan-500/10", text: "text-cyan-400", check: "bg-cyan-500" },
}

const COUNTER_METRICS = [
  { end: 60, suffix: "%", prefix: "", label: "быстрее найм", icon: Clock },
  { end: 3, suffix: "x", prefix: "", label: "меньше рутины", icon: TrendingUp },
  { end: 4, suffix: "x", prefix: "ROI ", label: "за 3 месяца", icon: Award },
]

const FOOTER_COLS: { title: string; links: { label: string; href: string }[] }[] = [
  { title: "Продукт", links: [{ label: "Возможности", href: "#" }, { label: "Модули", href: "#" }, { label: "Тарифы", href: "#" }, { label: "API", href: "#" }] },
  { title: "Компания", links: [{ label: "О нас", href: "/about" }, { label: "Блог", href: "#" }, { label: "Карьера", href: "#" }, { label: "Контакты", href: "#" }] },
  { title: "Юридическое", links: [{ label: "Политика конфиденциальности", href: "#" }, { label: "Условия использования", href: "#" }, { label: "Оферта", href: "#" }] },
]

// ─── Role cards data ────────────────────────────────────────────────────────

const ROLE_CARDS = [
  {
    icon: Crown,
    title: "Собственник бизнеса",
    color: "violet",
    borderColor: "border-violet-500/40",
    bgColor: "bg-violet-500/5",
    hoverBg: "hover:bg-violet-500/10",
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400",
    badgeColors: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    pains: [
      "Нет единой картины бизнеса",
      "Деньги уходят — непонятно куда",
      "Сотрудники работают вслепую",
    ],
    solution: "Дашборд всего бизнеса в одном окне. AI-агенты контролируют процессы и сигнализируют о проблемах до того, как они станут убытками",
    modules: ["ROI-аналитика", "MarketRadar", "TaskFlow AI"],
  },
  {
    icon: Users,
    title: "HR-директор",
    color: "emerald",
    borderColor: "border-emerald-500/40",
    bgColor: "bg-emerald-500/5",
    hoverBg: "hover:bg-emerald-500/10",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    badgeColors: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    pains: [
      "Сотни нерелевантных откликов",
      "Кандидаты уходят пока разбираете резюме",
      "Адаптация новичков — хаос",
    ],
    solution: "AI фильтрует кандидатов за секунды, проводит демонстрацию должности, назначает интервью. К вам приходят только те, кто сказал «да, я хочу»",
    modules: ["HR и найм", "Talent Pool", "Адаптация", "LMS"],
  },
  {
    icon: DollarSign,
    title: "Руководитель продаж",
    color: "orange",
    borderColor: "border-orange-500/40",
    bgColor: "bg-orange-500/5",
    hoverBg: "hover:bg-orange-500/10",
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-400",
    badgeColors: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    pains: [
      "Менеджеры забывают перезвонить",
      "Непонятно почему сделки сливаются",
      "Нет контроля качества звонков",
    ],
    solution: "AI-РОП слушает 100% звонков, оценивает каждого менеджера, подсказывает где теряются сделки. Автоматические follow-up и прогнозы",
    modules: ["CRM", "Речевая аналитика", "Email-рассылки"],
  },
  {
    icon: Megaphone,
    title: "Маркетолог",
    color: "pink",
    borderColor: "border-pink-500/40",
    bgColor: "bg-pink-500/5",
    hoverBg: "hover:bg-pink-500/10",
    iconBg: "bg-pink-500/10",
    iconColor: "text-pink-400",
    badgeColors: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    pains: [
      "Контент нужен каждый день — рук не хватает",
      "Непонятно какой канал приносит клиентов",
      "Конкуренты обгоняют",
    ],
    solution: "AI генерирует контент, анализирует конкурентов в реальном времени, считает ROI каждого канала. Вы управляете стратегией, рутину делает система",
    modules: ["MarketRadar", "Контент-завод", "SEO + реклама"],
  },
]

// ─── Modules grid data ──────────────────────────────────────────────────────

const MODULE_GRID = [
  { icon: Users, name: "HR и найм", desc: "Воронка найма на автопилоте — от отклика до оффера", status: "active" as const, color: "green" },
  { icon: UserCheck, name: "Talent Pool", desc: "База пассивных кандидатов с AI-скорингом и прогревом", status: "active" as const, color: "green" },
  { icon: BookOpen, name: "Адаптация и онбординг", desc: "Программы ввода в должность с наставниками и геймификацией", status: "active" as const, color: "green" },
  { icon: GraduationCap, name: "Обучение и развитие (LMS)", desc: "AI-курсы, матрица навыков, прогноз увольнений", status: "active" as const, color: "green" },
  { icon: Calendar, name: "Запись и бронирование", desc: "Онлайн-запись к специалистам и бронирование объектов", status: "soon" as const, color: "yellow" },
  { icon: Store, name: "Мини-каталог", desc: "Каталог товаров и услуг с публичной витриной", status: "soon" as const, color: "yellow" },
  { icon: Globe, name: "MarketRadar", desc: "Аудит бизнеса + мониторинг конкурентов из 35 источников", status: "active" as const, color: "green" },
  { icon: Mail, name: "Email + мессенджеры", desc: "Рассылки, цепочки, A/B-тесты по всем каналам", status: "soon" as const, color: "yellow" },
  { icon: PenTool, name: "Контент-завод", desc: "AI-генерация блогов, постов, описаний товаров", status: "soon" as const, color: "yellow" },
  { icon: Palette, name: "Конструктор сайтов", desc: "Лендинги и карьерные страницы drag-and-drop", status: "soon" as const, color: "yellow" },
  { icon: Search, name: "SEO + реклама + репутация", desc: "Позиции, Директ, мониторинг отзывов, AI-рекомендации", status: "soon" as const, color: "yellow" },
  { icon: PieChart, name: "ROI-аналитика", desc: "Единый дашборд: стоимость найма, CAC, unit-экономика", status: "soon" as const, color: "yellow" },
  { icon: Handshake, name: "CRM / воронка продаж", desc: "Контакты, сделки, прогнозы, интеграции с Битрикс24/AmoCRM", status: "soon" as const, color: "yellow" },
  { icon: Phone, name: "Речевая аналитика + AI-РОП", desc: "Транскрипция звонков, контроль качества, score менеджеров", status: "soon" as const, color: "yellow" },
  { icon: Database, name: "База знаний", desc: "Единая база компании — фундамент для всех AI-агентов", status: "active" as const, color: "green" },
  { icon: FileSignature, name: "Документы и договоры", desc: "Шаблоны, AI-заполнение, согласование, ЭЦП", status: "soon" as const, color: "yellow" },
  { icon: Package, name: "Склад, учёт, финансы", desc: "Остатки, P&L, cashflow, бюджетирование", status: "dev" as const, color: "gray" },
  { icon: KanbanSquare, name: "TaskFlow AI / проекты", desc: "Канбан задач с AI-назначением и координацией", status: "dev" as const, color: "gray" },
]

// ─── AI Agents expanded data ────────────────────────────────────────────────

const AI_AGENTS_EXPANDED = [
  // HR (green)
  { name: "Скоринг-агент", desc: "Оценивает кандидатов по 50+ параметрам", group: "HR", color: "emerald" },
  { name: "Коммуникатор", desc: "Пишет кандидатам, назначает интервью", group: "HR", color: "emerald" },
  { name: "Парсер резюме", desc: "Извлекает данные из любого формата", group: "HR", color: "emerald" },
  { name: "Стоп-фактор агент", desc: "Проверяет город, зарплату, опыт, гражданство", group: "HR", color: "emerald" },
  { name: "Агент демонстрации", desc: "Генерирует мини-курсы из анкеты вакансии", group: "HR", color: "emerald" },
  { name: "Агент адаптации", desc: "Ведёт новичка через онбординг", group: "HR", color: "emerald" },
  { name: "Flight Risk агент", desc: "Прогнозирует увольнения", group: "HR", color: "emerald" },
  { name: "Агент пульс-опросов", desc: "Проводит eNPS и анализирует тренды", group: "HR", color: "emerald" },
  { name: "Агент Talent Pool", desc: "Прогревает пассивных кандидатов", group: "HR", color: "emerald" },
  { name: "Реферальный агент", desc: "Трекинг рекомендаций и бонусов", group: "HR", color: "emerald" },
  // Sales (orange)
  { name: "AI-РОП", desc: "Контролирует качество 100% звонков", group: "Продажи", color: "orange" },
  { name: "Квалификатор лидов", desc: "Скорит входящие заявки", group: "Продажи", color: "orange" },
  { name: "Follow-up агент", desc: "Напоминает о забытых сделках", group: "Продажи", color: "orange" },
  { name: "Прогнозист", desc: "Предсказывает закрытие сделок", group: "Продажи", color: "orange" },
  { name: "Агент переписок", desc: "Анализирует чаты с клиентами", group: "Продажи", color: "orange" },
  { name: "Агент возражений", desc: "Выделяет паттерны возражений", group: "Продажи", color: "orange" },
  { name: "Агент обучения продажников", desc: "Подбирает лучшие звонки как примеры", group: "Продажи", color: "orange" },
  { name: "Агент SLA", desc: "Алерт если клиент ждёт ответ >2ч", group: "Продажи", color: "orange" },
  // Marketing (pink)
  { name: "Аналитик конкурентов", desc: "Мониторит 35 источников", group: "Маркетинг", color: "pink" },
  { name: "Контент-генератор", desc: "Пишет блоги, посты, описания", group: "Маркетинг", color: "pink" },
  { name: "SEO-агент", desc: "Рекомендации по позициям и мета-тегам", group: "Маркетинг", color: "pink" },
  { name: "Репутация-агент", desc: "Мониторит отзывы, генерирует ответы", group: "Маркетинг", color: "pink" },
  { name: "Email-агент", desc: "A/B тесты, оптимизация цепочек", group: "Маркетинг", color: "pink" },
  { name: "Рекламный агент", desc: "Оптимизация бюджетов Директ/VK Ads", group: "Маркетинг", color: "pink" },
  { name: "Контент-планер", desc: "Составляет план публикаций на месяц", group: "Маркетинг", color: "pink" },
  { name: "UTM-агент", desc: "Трекинг источников трафика", group: "Маркетинг", color: "pink" },
  // Operations (teal)
  { name: "Документ-агент", desc: "Заполняет шаблоны из CRM данных", group: "Операции", color: "teal" },
  { name: "Задач-координатор", desc: "Распределяет задачи по загрузке", group: "Операции", color: "teal" },
  { name: "Склад-агент", desc: "Алерты по минимальным остаткам", group: "Операции", color: "teal" },
  { name: "Финансовый агент", desc: "Прогноз cashflow", group: "Операции", color: "teal" },
  { name: "Инвентаризация-агент", desc: "Автосверка факт vs учёт", group: "Операции", color: "teal" },
  { name: "Бюджет-агент", desc: "Отклонения план-факт", group: "Операции", color: "teal" },
  // Analytics (blue)
  { name: "ROI-агент", desc: "Считает окупаемость каждого канала", group: "Аналитика", color: "blue" },
  { name: "Unit-экономика агент", desc: "LTV, CAC, маржа", group: "Аналитика", color: "blue" },
  { name: "Дашборд-агент", desc: "Собирает KPI из всех модулей", group: "Аналитика", color: "blue" },
  { name: "Отчёт-агент", desc: "Генерирует PDF по расписанию", group: "Аналитика", color: "blue" },
  { name: "AI-инсайты", desc: "Автоматические выводы и рекомендации", group: "Аналитика", color: "blue" },
  // Communications (purple)
  { name: "🤖 Telegram-бот", desc: "Рассылки, автоответы, мини-формы", group: "Коммуникации", color: "violet" },
  { name: "WhatsApp-агент", desc: "Шаблоны, очередь, статусы", group: "Коммуникации", color: "violet" },
  { name: "Email-конструктор", desc: "Drag-and-drop письма", group: "Коммуникации", color: "violet" },
  { name: "Напоминание-агент", desc: "SMS/🤖 Telegram за 24ч и 2ч до встречи", group: "Коммуникации", color: "violet" },
  { name: "VK-агент", desc: "Рассылки через сообщества", group: "Коммуникации", color: "violet" },
]

const AGENT_COLOR_MAP: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400", border: "border-emerald-500/20" },
  orange: { bg: "bg-orange-500/10", text: "text-orange-400", dot: "bg-orange-400", border: "border-orange-500/20" },
  pink: { bg: "bg-pink-500/10", text: "text-pink-400", dot: "bg-pink-400", border: "border-pink-500/20" },
  teal: { bg: "bg-teal-500/10", text: "text-teal-400", dot: "bg-teal-400", border: "border-teal-500/20" },
  blue: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400", border: "border-blue-500/20" },
  violet: { bg: "bg-violet-500/10", text: "text-violet-400", dot: "bg-violet-400", border: "border-violet-500/20" },
}

const AGENT_GROUP_LABELS: Record<string, { label: string; color: string }> = {
  "HR": { label: "HR", color: "emerald" },
  "Продажи": { label: "Продажи", color: "orange" },
  "Маркетинг": { label: "Маркетинг", color: "pink" },
  "Операции": { label: "Операции", color: "teal" },
  "Аналитика": { label: "Аналитика", color: "blue" },
  "Коммуникации": { label: "Коммуникации", color: "violet" },
}

// ─── Industries data ────────────────────────────────────────────────────────

const INDUSTRIES = [
  { emoji: "🏥", name: "Клиника / стоматология", modules: ["Бронирование", "Каталог", "HR", "CRM"], desc: "Запись пациентов, расписание врачей, найм медперсонала — в одной системе" },
  { emoji: "✂️", name: "Салон красоты / барбершоп", modules: ["Бронирование", "Каталог", "Маркетинг"], desc: "Онлайн-запись, напоминания клиентам, учёт мастеров" },
  { emoji: "🍽️", name: "Ресторан / кафе", modules: ["Бронирование", "Склад", "HR", "Маркетинг"], desc: "Бронь столиков, складской учёт продуктов, найм поваров и официантов" },
  { emoji: "🔧", name: "Автосервис", modules: ["Бронирование", "CRM", "Склад", "Каталог"], desc: "Запись на ремонт, учёт запчастей, CRM для постоянных клиентов" },
  { emoji: "💻", name: "IT-компания", modules: ["HR", "LMS", "TaskFlow", "База знаний"], desc: "Найм разработчиков, онбординг, управление проектами" },
  { emoji: "📚", name: "Образование / курсы", modules: ["LMS", "Бронирование", "Контент", "Маркетинг"], desc: "Курсы, расписание занятий, набор преподавателей" },
  { emoji: "🏠", name: "Агентство недвижимости", modules: ["CRM", "Контент", "Лендинги", "Речевая аналитика"], desc: "Воронка сделок, контроль звонков менеджеров, генерация объявлений" },
  { emoji: "🏨", name: "Отель / хостел / глэмпинг", modules: ["Бронирование", "CRM", "Маркетинг"], desc: "Календарь занятости номеров, онлайн-бронирование, email-цепочки" },
  { emoji: "🏋️", name: "Фитнес / спорт", modules: ["Бронирование", "Каталог", "HR", "LMS"], desc: "Запись на тренировки, расписание тренеров, программы тренировок" },
  { emoji: "⚖️", name: "Юридическая компания", modules: ["CRM", "Документы", "База знаний", "TaskFlow"], desc: "Ведение дел, генерация договоров, контроль сроков" },
  { emoji: "📈", name: "Рекламное агентство", modules: ["MarketRadar", "Контент", "CRM", "TaskFlow"], desc: "Анализ конкурентов клиентов, генерация контента, управление проектами" },
  { emoji: "🏭", name: "Производство", modules: ["Склад", "TaskFlow", "HR", "Финансы"], desc: "Учёт сырья и продукции, планирование, найм рабочих" },
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function MetricCounter({ end, suffix, prefix, label }: typeof COUNTER_METRICS[number]) {
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

// ─── Hero Dashboard (4-panel) ───────────────────────────────────────────────

function HeroDashboard() {
  const [mounted, setMounted] = useState(false)
  const mktCanvasRef = useRef<HTMLCanvasElement>(null)
  const salesCanvasRef = useRef<HTMLCanvasElement>(null)
  const logCanvasRef = useRef<HTMLCanvasElement>(null)
  const [salesRevenue, setSalesRevenue] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 300)
    return () => clearTimeout(t)
  }, [])

  // Sales count-up
  useEffect(() => {
    if (!mounted) return
    const target = 248
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const p = Math.min((now - start) / 1500, 1)
      setSalesRevenue(Math.round((1 - Math.pow(1 - p, 3)) * target) / 10)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mounted])

  // Marketing bar chart
  useEffect(() => {
    if (!mounted) return
    const c = mktCanvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    c.width = 120 * dpr; c.height = 60 * dpr
    ctx.scale(dpr, dpr)
    const vals = [40, 55, 48, 70, 62, 80, 95]
    const max = 100
    const bw = 12, gap = 5
    vals.forEach((v, i) => {
      const h = (v / max) * 50
      ctx.fillStyle = i === vals.length - 1 ? "#F59E0B" : "#78716C"
      ctx.beginPath()
      ctx.roundRect(i * (bw + gap), 55 - h, bw, h, 2)
      ctx.fill()
    })
    ctx.fillStyle = "#9CA3AF"
    ctx.font = "9px system-ui"
    ctx.fillText("155K", 85, 10)
  }, [mounted])

  // Sales line chart
  useEffect(() => {
    if (!mounted) return
    const c = salesCanvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    c.width = 240 * dpr; c.height = 50 * dpr
    ctx.scale(dpr, dpr)
    const pts = [20, 25, 22, 30, 28, 35, 32, 40, 38, 42, 45, 48]
    const max = 55, w = 240, h = 50
    const xs = pts.map((_, i) => (i / (pts.length - 1)) * w)
    const ys = pts.map((v) => h - (v / max) * h + 2)
    // Fill
    ctx.beginPath()
    ctx.moveTo(xs[0], ys[0])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(xs[i], ys[i])
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath()
    ctx.fillStyle = "rgba(16,185,129,0.15)"
    ctx.fill()
    // Line
    ctx.beginPath()
    ctx.moveTo(xs[0], ys[0])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(xs[i], ys[i])
    ctx.strokeStyle = "#10B981"; ctx.lineWidth = 1.5; ctx.stroke()
    // Plan dashed
    ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(w, 18)
    ctx.strokeStyle = "#4B5563"; ctx.lineWidth = 1; ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = "#6B7280"; ctx.font = "8px system-ui"; ctx.fillText("План", w - 25, 15)
  }, [mounted])

  // Logistics curve
  useEffect(() => {
    if (!mounted) return
    const c = logCanvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    c.width = 240 * dpr; c.height = 50 * dpr
    ctx.scale(dpr, dpr)
    const w = 240, h = 50
    ctx.beginPath(); ctx.moveTo(0, 35)
    ctx.bezierCurveTo(60, 10, 120, 40, 180, 15)
    ctx.bezierCurveTo(200, 8, 220, 20, w, 12)
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath()
    ctx.fillStyle = "rgba(6,182,212,0.15)"; ctx.fill()
    ctx.beginPath(); ctx.moveTo(0, 35)
    ctx.bezierCurveTo(60, 10, 120, 40, 180, 15)
    ctx.bezierCurveTo(200, 8, 220, 20, w, 12)
    ctx.strokeStyle = "#06B6D4"; ctx.lineWidth = 1.5; ctx.stroke()
  }, [mounted])

  const ring = (pct: number, color: string, size: number) => {
    const r = (size - 6) / 2, c = size / 2, circ = 2 * Math.PI * r
    return (
      <svg width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#1F2937" strokeWidth={5} />
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={mounted ? circ * (1 - pct / 100) : circ}
          strokeLinecap="round" transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)" }} />
      </svg>
    )
  }

  const funnelBar = (label: string, value: number, pct: number, color: string) => (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-gray-500 w-14 text-right shrink-0">{label}</span>
      <div className="flex-1 h-[10px] bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: mounted ? `${pct}%` : "0%", backgroundColor: color, transition: "width 1.5s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
      <span className="text-[9px] text-gray-400 w-6">{value}</span>
    </div>
  )

  const pill = (label: string, color: string) => (
    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded" style={{ color, backgroundColor: color + "18" }}>{label}</span>
  )

  const pipelineSeg = (label: string, value: number, color: string, w: string) => (
    <div className="text-center" style={{ width: w }}>
      <div className="h-[6px] rounded-full mb-1" style={{ backgroundColor: color }} />
      <p className="text-[8px] text-gray-500">{label}</p>
      <p className="text-[10px] font-bold text-gray-300">{value}</p>
    </div>
  )

  return (
    <div className="hidden lg:block" style={{ animation: "fade-in-up 1s ease-out 0.3s both" }}>
      <div className="bg-gray-950 rounded-2xl overflow-hidden p-[2px] grid grid-cols-2 grid-rows-2 gap-[2px]" style={{ height: 420 }}>

        {/* Panel 1: HR */}
        <div className="bg-gray-900 rounded-xl p-3.5 overflow-hidden flex flex-col">
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-400">HR — НАЙМ И КОМАНДА</span>
          </div>
          <div className="flex gap-3 mb-2.5">
            <div className="relative shrink-0">
              {ring(73, "#10B981", 56)}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-sm font-bold text-emerald-400 leading-none">48</span>
                <span className="text-[7px] text-gray-500">человек</span>
              </div>
            </div>
            <div className="space-y-1.5 text-[10px]">
              <div className="flex justify-between"><span className="text-gray-500">Откр. вакансии</span><span className="text-white font-semibold">12</span></div>
              <div className="flex justify-between"><span className="text-gray-500">На испытат.</span><span className="text-amber-400 font-semibold">7</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Текучесть</span><span className="text-emerald-400 font-semibold">4.2% <span className="text-[8px]">↓1.3%</span></span></div>
            </div>
          </div>
          <p className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5 font-medium">Воронка найма</p>
          <div className="space-y-1 flex-1">
            {funnelBar("Отклики", 234, 100, "#4F46E5")}
            {funnelBar("Скрининг", 89, 38, "#818CF8")}
            {funnelBar("Интервью", 34, 15, "#FBBF24")}
            {funnelBar("Оффер", 8, 3, "#10B981")}
          </div>
        </div>

        {/* Panel 2: Marketing */}
        <div className="bg-gray-900 rounded-xl p-3.5 overflow-hidden flex flex-col">
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[11px] font-semibold tracking-wide text-amber-400">МАРКЕТИНГ — КАНАЛЫ</span>
          </div>
          <div className="flex gap-3 mb-2">
            <canvas ref={mktCanvasRef} width={120} height={60} style={{ width: 120, height: 60 }} />
            <div className="flex gap-2 items-start">
              <div className="relative">
                {ring(60, "#F59E0B", 44)}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-amber-400">60%</span>
                  <span className="text-[6px] text-gray-500">ROI</span>
                </div>
              </div>
              <div className="relative">
                {ring(85, "#818CF8", 44)}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-indigo-400">85%</span>
                  <span className="text-[6px] text-gray-500">CTR</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mt-auto">
            {pill("SEO +32%", "#10B981")}
            {pill("Контекст +18%", "#F59E0B")}
            {pill("SMM +45%", "#EC4899")}
            {pill("Email +12%", "#818CF8")}
          </div>
        </div>

        {/* Panel 3: Sales */}
        <div className="bg-gray-900 rounded-xl p-3.5 overflow-hidden flex flex-col">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <span className="text-[11px] font-semibold tracking-wide text-indigo-400">ПРОДАЖИ — CRM</span>
          </div>
          <div className="flex gap-4 mb-2 text-[10px]">
            <div><span className="text-gray-500">Выручка</span> <span className="text-emerald-400 font-bold">₽{salesRevenue.toFixed(1)}M</span></div>
            <div><span className="text-gray-500">Ср. чек</span> <span className="text-white font-bold">₽187K</span></div>
            <div><span className="text-gray-500">Конв.</span> <span className="text-amber-400 font-bold">18.4%↑</span></div>
          </div>
          <canvas ref={salesCanvasRef} width={240} height={50} className="w-full mb-2" style={{ height: 50 }} />
          <div className="flex gap-[2px] mt-auto">
            {pipelineSeg("Новые", 45, "#4F46E5", "22%")}
            {pipelineSeg("В работе", 128, "#818CF8", "34%")}
            {pipelineSeg("Счёт", 67, "#FBBF24", "20%")}
            {pipelineSeg("Закрыты", 156, "#10B981", "24%")}
          </div>
        </div>

        {/* Panel 4: Logistics */}
        <div className="bg-gray-900 rounded-xl p-3.5 overflow-hidden flex flex-col">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span className="text-[11px] font-semibold tracking-wide text-cyan-400">ЛОГИСТИКА — ДОСТАВКА</span>
          </div>
          <canvas ref={logCanvasRef} width={240} height={50} className="w-full mb-2" style={{ height: 50 }} />
          <div className="grid grid-cols-4 gap-1 mb-2">
            {[
              { label: "В пути", value: "342", color: "text-cyan-400" },
              { label: "Доставлено", value: "1,847", color: "text-emerald-400" },
              { label: "Ср. время", value: "2.1д", color: "text-white" },
              { label: "Возвраты", value: "1.2%", color: "text-amber-400" },
            ].map((m) => (
              <div key={m.label} className="bg-gray-800 rounded-md p-1.5 text-center">
                <p className="text-[7px] text-gray-500">{m.label}</p>
                <p className={`text-[10px] font-bold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-[2px] mt-auto">
            {[
              { label: "Доставлено 68%", color: "#10B981", w: "68%" },
              { label: "В пути 20%", color: "#06B6D4", w: "20%" },
              { label: "Задержка", color: "#FBBF24", w: "8%" },
              { label: "Возврат", color: "#EF4444", w: "4%" },
            ].map((s) => (
              <div key={s.label} className="text-center" style={{ width: s.w }}>
                <div className="h-[6px] rounded-full" style={{ backgroundColor: s.color }} />
                <p className="text-[7px] text-gray-500 mt-0.5 truncate">{s.label}</p>
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
@keyframes agent-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`

// ─── Landing Page ────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [activeModule, setActiveModule] = useState("hr")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeRole, setActiveRole] = useState<number | null>(null)
  const [moduleFilter, setModuleFilter] = useState<"all" | "active" | "soon">("all")
  // Section reveals
  const howWesolve = useReveal()
  const [featureTab, setFeatureTab] = useState(0)
  const forWhom = useReveal()
  const comparison = useReveal()
  const modules = useReveal()
  const steps = useReveal()
  const agents = useReveal()
  const pricing = useReveal()
  const [pricingUsers, setPricingUsers] = useState(3)
  const [selectedModules, setSelectedModules] = useState<Record<string, boolean>>({ hr: true })
  const cta = useReveal()
  const rolesReveal = useReveal()
  const moduleGridReveal = useReveal()
  const agentsNewReveal = useReveal()
  const industriesReveal = useReveal()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const currentModule = MODULES.find((m) => m.id === activeModule) ?? MODULES[0]

  const filteredModules = MODULE_GRID.filter((m) => {
    if (moduleFilter === "all") return true
    if (moduleFilter === "active") return m.status === "active"
    if (moduleFilter === "soon") return m.status === "soon" || m.status === "dev"
    return true
  })

  // Show first 20 agents visually
  const visibleAgents = AI_AGENTS_EXPANDED.slice(0, 20)
  const remainingAgentsCount = AI_AGENTS_EXPANDED.length - visibleAgents.length

  return (
    <div className="min-h-screen bg-gray-950 text-white antialiased scroll-smooth">
      <style dangerouslySetInnerHTML={{ __html: CUSTOM_STYLES }} />

      {/* ── HEADER ── */}
      <header className={cn(
        "sticky top-0 z-50 transition-all duration-300 border-b",
        scrolled
          ? "bg-gray-950/90 backdrop-blur-xl border-gray-700/60 shadow-sm"
          : "bg-transparent border-transparent"
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-white font-bold text-base">C</span>
            </div>
            <span className="font-bold text-xl tracking-tight text-gray-100">Company24.pro</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {NAV_ITEMS.map((item) => (
              <a key={item.href} href={item.href} className="text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white" asChild>
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
          <div className="md:hidden border-t border-gray-700 bg-gray-950/95 backdrop-blur-xl px-4 py-4 space-y-3">
            {NAV_ITEMS.map((item) => (
              <a key={item.href} href={item.href} className="block text-sm font-medium text-gray-400" onClick={() => setMobileMenuOpen(false)}>
                {item.label}
              </a>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="flex-1" asChild>
                <Link href="/login">Войти</Link>
              </Button>
              <Button size="sm" className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white" asChild>
                <Link href="/register">Демо</Link>
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
              <div className="inline-flex items-center gap-2 text-xs font-medium tracking-wide uppercase text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 rounded-full mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75" style={{ animation: "pulse-ring 2s ease-in-out infinite" }} />
                  <span className="relative rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                AI Business OS
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-[56px] font-bold tracking-tight leading-[1.08] mb-5 text-white">
                AI-система, которая ведёт бизнес{" "}
                <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">24/7</span>
              </h1>

              <p className="text-lg text-gray-400 mb-10 max-w-xl leading-relaxed">
                Company24.pro автоматизирует HR, маркетинг, продажи и логистику. AI-агенты берут на себя 80% рутины. Снижаем затраты и увеличиваем эффективность.
              </p>

              <div className="flex flex-wrap gap-4 mb-8">
                <Button size="lg" aria-label="Запросить бесплатное демо Company24" className="bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 h-14 px-10 text-base shadow-xl shadow-indigo-500/30 transition-all hover:shadow-2xl hover:shadow-indigo-500/40 hover:scale-[1.02] text-white rounded-2xl" asChild>
                  <Link href="/register">Попробовать бесплатно <ArrowRight className="w-5 h-5 ml-2" /></Link>
                </Button>
                <Button variant="outline" size="lg" className="h-14 px-10 text-base rounded-2xl border-gray-700 text-gray-300 hover:bg-gray-800 hover:border-indigo-500 hover:text-indigo-400 transition-all">
                  <Play className="w-4 h-4 mr-2" /> Смотреть демо
                </Button>
              </div>

              <p className="text-sm text-gray-500">
                Покажем платформу и подберём модули под ваш бизнес
              </p>

              <p className="text-xs text-purple-300 text-center mt-2">🚀 Powered by AI агентами 24/7</p>
            </div>

            <HeroDashboard />
          </div>
        </div>
      </section>

      {/* ── ВЫБЕРИТЕ СВОЮ РОЛЬ ── */}
      <section className="py-24 md:py-28 bg-gray-950">
        <div
          ref={rolesReveal.ref}
          className={cn(
            "max-w-6xl mx-auto px-4 sm:px-6 transition-all duration-700",
            rolesReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-medium tracking-widest uppercase text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full mb-4">
              Найдите себя
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-100 mb-3">Какую задачу вы решаете?</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">Company24.pro подстраивается под вашу роль в компании</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {ROLE_CARDS.map((role, idx) => {
              const isActive = activeRole === idx
              return (
                <button
                  key={role.title}
                  onClick={() => setActiveRole(isActive ? null : idx)}
                  className={cn(
                    "text-left rounded-2xl border p-6 transition-all duration-300 cursor-pointer",
                    "bg-gray-900 hover:shadow-xl",
                    isActive ? role.borderColor + " " + role.bgColor + " shadow-lg" : "border-gray-800 hover:-translate-y-1",
                    !isActive && activeRole !== null && "opacity-60"
                  )}
                >
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-4", role.iconBg)}>
                    <role.icon className={cn("w-6 h-6", role.iconColor)} />
                  </div>
                  <h3 className="font-bold text-lg mb-2 text-gray-100">{role.title}</h3>

                  <div className={cn(
                    "overflow-hidden transition-all duration-300",
                    isActive ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                  )}>
                    <div className="pt-3 space-y-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-red-400 mb-2">Боли</p>
                        <ul className="space-y-1.5">
                          {role.pains.map((pain) => (
                            <li key={pain} className="flex items-start gap-2 text-sm text-gray-400">
                              <X className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                              {pain}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-emerald-400 mb-2">Решение</p>
                        <p className="text-sm text-gray-300 leading-relaxed">{role.solution}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {role.modules.map((mod) => (
                          <span key={mod} className={cn("text-xs font-medium px-2.5 py-1 rounded-full border", role.badgeColors)}>
                            {mod}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={cn(
                    "flex items-center gap-1 mt-3 text-sm transition-colors",
                    isActive ? role.iconColor : "text-gray-500"
                  )}>
                    {isActive ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    <span>{isActive ? "Свернуть" : "Подробнее"}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── КАК МЫ РЕШАЕМ ── */}
      <section id="features" className="py-24 bg-gray-950">
        <div
          ref={howWesolve.ref}
          className={cn(
            "max-w-6xl mx-auto px-4 sm:px-6 transition-all duration-700",
            howWesolve.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-medium tracking-widest uppercase text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full mb-4">
              Как мы решаем
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-100">Проблемы бизнеса — и как Company24.pro их решает</h2>
          </div>

          {/* Tabs */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex flex-wrap justify-center bg-gray-800 rounded-2xl border border-gray-700 p-1.5 gap-1 shadow-sm">
              {FEATURE_TABS.map((t, i) => {
                const colors = FEATURE_TAB_COLORS[t.color]
                return (
                  <button
                    key={t.id}
                    onClick={() => setFeatureTab(i)}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                      featureTab === i
                        ? `${colors.bg} text-white shadow-md`
                        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                    )}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Content */}
          {(() => {
            const current = FEATURE_TABS[featureTab]
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Problem */}
                <div className="bg-gray-900 rounded-2xl border border-gray-800 border-l-4 border-l-red-400 p-10 shadow-sm">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                      <X className="w-5 h-5 text-red-400" />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-widest text-red-400">Проблема</span>
                  </div>
                  <h3 className="font-bold text-xl mb-5 text-gray-100">{current.problem.title}</h3>
                  <ul className="space-y-3.5">
                    {current.problem.points.map((p) => (
                      <li key={p} className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                          <X className="w-3 h-3 text-red-400" />
                        </div>
                        <span className="text-base text-gray-400 leading-relaxed">{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Solution */}
                <div className="bg-gray-900 rounded-2xl border border-gray-800 border-l-4 border-l-emerald-400 p-10 shadow-sm">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <Check className="w-5 h-5 text-emerald-500" />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-widest text-emerald-500">Решение</span>
                  </div>
                  <h3 className="font-bold text-xl mb-5 text-gray-100">{current.solution.title}</h3>
                  <ul className="space-y-3.5">
                    {current.solution.points.map((p) => (
                      <li key={p} className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-emerald-500" />
                        </div>
                        <span className="text-base text-gray-300 leading-relaxed">{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })()}
        </div>
      </section>

      {/* ── ДЛЯ КОГО ── */}
      <section className="py-24 md:py-28 bg-gray-950">
        <div
          ref={forWhom.ref}
          className={cn(
            "max-w-6xl mx-auto px-4 sm:px-6 transition-all duration-700",
            forWhom.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-medium tracking-widest uppercase text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full mb-4">
              Для вашего бизнеса
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-100 mb-3">Company24.pro — если вы хотите</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">Платформа для тех, кто строит бизнес на результат, а не на процессы</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: TrendingDown, color: "bg-indigo-500/10", iconColor: "text-indigo-500", title: "Снизить затраты на персонал в 2-3 раза", desc: "AI берёт на себя рутину рекрутинга, онбординга и обучения. Один HR-менеджер справляется с объёмом целого отдела." },
              { icon: Users, color: "bg-emerald-500/10", iconColor: "text-emerald-500", title: "Собрать команду из лучших", desc: "Привлекаем, фильтруем и прогреваем кандидатов автоматически. К вам приходят только те, кто действительно хочет работать." },
              { icon: TrendingUp, color: "bg-rose-500/10", iconColor: "text-rose-500", title: "Увеличить продажи и поток клиентов", desc: "AI ведёт воронку, квалифицирует лиды, напоминает о follow-up. Ни один клиент не теряется." },
              { icon: Target, color: "bg-amber-500/10", iconColor: "text-amber-500", title: "Обогнать конкурентов", desc: "Пока конкуренты нанимают отделы — вы автоматизируете. Скорость принятия решений и реакции в разы выше." },
              { icon: BarChart3, color: "bg-violet-500/10", iconColor: "text-violet-500", title: "Видеть всю картину бизнеса", desc: "Все данные в одном окне: HR, маркетинг, продажи, склад. Решения на основе цифр, а не интуиции." },
              { icon: Zap, color: "bg-cyan-500/10", iconColor: "text-cyan-500", title: "Масштабироваться без хаоса", desc: "Процессы упакованы в систему. Растёте — система растёт вместе с вами, без потери контроля." },
            ].map((card) => (
              <div key={card.title} className="bg-gray-900 rounded-2xl p-8 border border-gray-800 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-5", card.color)}>
                  <card.icon className={cn("w-7 h-7", card.iconColor)} />
                </div>
                <h3 className="font-bold text-lg mb-2 text-gray-100">{card.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── СРАВНЕНИЕ ── */}
      <section className="py-24 md:py-28 bg-gray-950">
        <div
          ref={comparison.ref}
          className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-700",
            comparison.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14 max-w-3xl mx-auto">
            <span className="inline-block text-xs font-medium tracking-widest uppercase text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full mb-4">
              Почему мы
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-100">
              Не CRM. Не ERP.{" "}
              <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">AI Business OS.</span>
            </h2>
            <p className="text-gray-400 text-lg">Операционная система для бизнеса, где AI делает работу, а не просто показывает графики.</p>
          </div>

          <div className="overflow-x-auto max-w-4xl mx-auto">
            <div className="bg-gray-900 rounded-2xl border border-gray-700 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-4 px-6" />
                    <th className="py-4 px-6 bg-indigo-500/10">
                      <span className="font-semibold text-indigo-400 bg-indigo-500/10 px-4 py-2 rounded-full text-sm">Company24.pro</span>
                    </th>
                    <th className="py-4 px-6 text-sm font-semibold uppercase tracking-wider text-gray-400">CRM</th>
                    <th className="py-4 px-6 text-sm font-semibold uppercase tracking-wider text-gray-400">ERP</th>
                    <th className="py-4 px-6 text-sm font-semibold uppercase tracking-wider text-gray-400">Вручную</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    { feature: "Автоматизация найма", c24: "check", crm: "no", erp: "no", manual: "no" },
                    { feature: "AI-скоринг кандидатов", c24: "check", crm: "no", erp: "no", manual: "no" },
                    { feature: "Ввод в должность и онбординг", c24: "check", crm: "no", erp: "no", manual: "partial" },
                    { feature: "Обучение и развитие персонала", c24: "check", crm: "no", erp: "no", manual: "partial" },
                    { feature: "Маркетинговая аналитика", c24: "check", crm: "partial", erp: "no", manual: "no" },
                    { feature: "Воронка продаж", c24: "check", crm: "check", erp: "partial", manual: "no" },
                    { feature: "Управление складом и логистика", c24: "check", crm: "no", erp: "check", manual: "no" },
                    { feature: "AI-агенты 24/7", c24: "check", crm: "no", erp: "no", manual: "no" },
                    { feature: "Стоимость внедрения", c24: "check", crm: "partial", erp: "no", manual: "check" },
                  ] as const).map((row, i) => {
                    const renderIcon = (val: "check" | "no" | "partial") => {
                      if (val === "check") return (
                        <div className="w-8 h-8 rounded-full bg-emerald-900/40 flex items-center justify-center mx-auto">
                          <Check className="w-5 h-5 text-emerald-400" />
                        </div>
                      )
                      if (val === "no") return (
                        <div className="w-8 h-8 rounded-full bg-red-900/40 flex items-center justify-center mx-auto">
                          <X className="w-5 h-5 text-red-500" />
                        </div>
                      )
                      return (
                        <div className="w-8 h-8 rounded-full bg-amber-900/40 flex items-center justify-center mx-auto">
                          <Minus className="w-5 h-5 text-amber-500" />
                        </div>
                      )
                    }
                    return (
                      <tr key={row.feature} className={cn("border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors", i % 2 === 1 && "bg-gray-800/50")}>
                        <td className="py-5 px-6 text-base font-medium text-gray-100">{row.feature}</td>
                        <td className="py-5 px-6 bg-indigo-500/10">{renderIcon(row.c24)}</td>
                        <td className="py-5 px-6">{renderIcon(row.crm)}</td>
                        <td className="py-5 px-6">{renderIcon(row.erp)}</td>
                        <td className="py-5 px-6">{renderIcon(row.manual)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── НОВАЯ СЕКЦИЯ: 15 МОДУЛЕЙ ── */}
      <section className="py-24 md:py-28 bg-gray-950">
        <div
          ref={moduleGridReveal.ref}
          className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-700",
            moduleGridReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-medium tracking-widest uppercase text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full mb-4">
              Модули
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-100 mb-3">15 модулей. Подключайте только нужные.</h2>
            <p className="text-gray-400 text-lg max-w-3xl mx-auto">Каждый модуль работает самостоятельно и усиливает остальные. Начните с одного — масштабируйтесь по мере роста.</p>
          </div>

          {/* Filter buttons */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex bg-gray-800 rounded-2xl border border-gray-700 p-1.5 gap-1">
              {([
                { key: "all" as const, label: "Все" },
                { key: "active" as const, label: "Работает" },
                { key: "soon" as const, label: "Скоро" },
              ]).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setModuleFilter(f.key)}
                  className={cn(
                    "px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                    moduleFilter === f.key
                      ? "bg-indigo-500 text-white shadow-md"
                      : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Module grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredModules.map((mod) => {
              const statusLabel = mod.status === "active" ? "Работает" : mod.status === "soon" ? "Скоро" : "В разработке"
              const statusColors = mod.status === "active"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : mod.status === "soon"
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-gray-700/50 text-gray-400 border-gray-600/30"
              const iconColorClass = mod.status === "active" ? "text-emerald-400" : mod.status === "soon" ? "text-amber-400" : "text-gray-500"
              const iconBgClass = mod.status === "active" ? "bg-emerald-500/10" : mod.status === "soon" ? "bg-amber-500/10" : "bg-gray-700/30"

              return (
                <div
                  key={mod.name}
                  className="bg-gray-900 rounded-2xl border border-gray-800 p-5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconBgClass)}>
                      <mod.icon className={cn("w-5 h-5", iconColorClass)} />
                    </div>
                    <span className={cn("text-[10px] font-medium px-2.5 py-1 rounded-full border", statusColors)}>
                      {statusLabel}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm text-gray-100 mb-1.5">{mod.name}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">{mod.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── МОДУЛИ (старая секция — табы) ── */}
      <section id="modules" className="bg-gray-950 py-24 md:py-28">
        <div
          ref={modules.ref}
          className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-700",
            modules.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-medium tracking-widest uppercase text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full mb-4">
              Платформа
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-100 mb-3">Автоматизируем ключевые процессы</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">Каждый модуль — это AI-агенты, которые берут рутину на себя. И мы не останавливаемся.</p>
          </div>

          {/* Tabs */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex bg-gray-800 rounded-2xl border border-gray-700 p-1.5 gap-1">
              {MODULES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setActiveModule(m.id)}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                    activeModule === m.id
                      ? `bg-gradient-to-r ${m.gradient} text-white shadow-lg`
                      : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                  )}
                >
                  <m.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Module content */}
          <div className="max-w-4xl mx-auto bg-gray-900 rounded-3xl border border-gray-700 shadow-lg overflow-hidden transition-all duration-300">
            <div className={cn("h-1.5 w-full bg-gradient-to-r", currentModule.gradient)} />
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* Left: info */}
              <div className="p-10">
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-5", currentModule.lightBg)}>
                  <currentModule.icon className={cn("w-7 h-7", currentModule.lightColor)} />
                </div>
                <h3 className="text-2xl font-bold text-gray-100 mb-3">{currentModule.label}</h3>
                <p className="text-gray-400 text-base leading-relaxed">{currentModule.desc}</p>
              </div>
              {/* Right: features */}
              <div className="p-10 bg-gray-800">
                <ul className="space-y-4">
                  {currentModule.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5", currentModule.lightBg)}>
                        <Check className={cn("w-3.5 h-3.5", currentModule.lightColor)} />
                      </div>
                      <span className="text-base text-gray-200">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ПРОЦЕССЫ ── */}
      <section className="py-24 bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-100 mb-3">Какие процессы автоматизирует Company24.pro</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">Каждый модуль экономит время и деньги — вот конкретные результаты</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mt-14">
            {[
              { icon: Users, iconBg: "bg-indigo-500/10", iconColor: "text-indigo-500", metricBg: "bg-indigo-500/10", metricBorder: "border-indigo-500/20", metricText: "text-indigo-400", title: "Найм и подбор", desc: "AI находит релевантных кандидатов, фильтрует, прогревает и проводит через демонстрацию должности", metric: "−68% времени на найм" },
              { icon: Zap, iconBg: "bg-amber-500/10", iconColor: "text-amber-500", metricBg: "bg-amber-500/10", metricBorder: "border-amber-500/20", metricText: "text-amber-400", title: "Ввод в должность", desc: "Онбординг с курсами и тестовыми заданиями. За 1-2 недели понимаем — подходит или нет", metric: "4x быстрее адаптация" },
              { icon: Brain, iconBg: "bg-violet-500/10", iconColor: "text-violet-500", metricBg: "bg-violet-500/10", metricBorder: "border-violet-500/20", metricText: "text-violet-400", title: "Обучение и развитие", desc: "AI анализирует слабые стороны, назначает курсы и видео. Прокачка навыков на автомате", metric: "+40% эффективность" },
              { icon: Megaphone, iconBg: "bg-rose-500/10", iconColor: "text-rose-500", metricBg: "bg-rose-500/10", metricBorder: "border-rose-500/20", metricText: "text-rose-400", title: "Маркетинг и аналитика", desc: "ROI по каждому каналу, анализ конкурентов, A/B тесты, оптимизация бюджета", metric: "−30% впустую на рекламу" },
              { icon: DollarSign, iconBg: "bg-emerald-500/10", iconColor: "text-emerald-500", metricBg: "bg-emerald-500/10", metricBorder: "border-emerald-500/20", metricText: "text-emerald-400", title: "Продажи и CRM", desc: "AI квалифицирует лиды, follow-up, контроль менеджеров, прогноз сделок", metric: "+35% конверсия" },
              { icon: Truck, iconBg: "bg-cyan-500/10", iconColor: "text-cyan-500", metricBg: "bg-cyan-500/10", metricBorder: "border-cyan-500/20", metricText: "text-cyan-400", title: "Логистика и склад", desc: "Учёт товаров, маршруты, прогноз спроса, автозаказ поставщикам", metric: "−25% затрат" },
              { icon: BarChart3, iconBg: "bg-orange-500/10", iconColor: "text-orange-500", metricBg: "bg-orange-500/10", metricBorder: "border-orange-500/20", metricText: "text-orange-400", title: "Управленческая аналитика", desc: "Дашборды, KPI, прогнозы, узкие места в реальном времени", metric: "3x быстрее решения" },
              { icon: Bot, iconBg: "bg-purple-500/10", iconColor: "text-purple-500", metricBg: "bg-purple-500/10", metricBorder: "border-purple-500/20", metricText: "text-purple-400", title: "AI-агенты 24/7", desc: "6 агентов работают круглосуточно: скоринг, коммуникация, аналитика, маркетинг, продажи, логистика", metric: "80% рутины на автомате" },
            ].map((card) => (
              <div key={card.title} className="bg-gray-800 border border-gray-700 rounded-2xl p-7 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col">
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", card.iconBg)}>
                  <card.icon className={cn("w-6 h-6", card.iconColor)} />
                </div>
                <h3 className="text-lg font-semibold text-white mt-4 mb-2">{card.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed flex-1">{card.desc}</p>
                <div className={cn("rounded-xl px-4 py-2.5 mt-5 border", card.metricBg, card.metricBorder)}>
                  <span className={cn("font-bold text-sm", card.metricText)}>{card.metric}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3 ШАГА (СКРЫТО) ── */}
      <section className="py-24 md:py-28 bg-gray-950 hidden">
        <div
          ref={steps.ref}
          className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-700",
            steps.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-medium tracking-widest uppercase text-gray-400 bg-gray-800 border border-gray-700 px-4 py-1.5 rounded-full mb-4">
              Как это работает
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-100">3 шага к автоматизации</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <div key={s.num} className="relative bg-gray-900 rounded-3xl border border-gray-800 p-9 text-center transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                <div className={cn("w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center mx-auto mb-5 shadow-lg", s.gradient)}>
                  <s.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-bold text-xl mb-3 text-gray-100">{s.title}</h3>
                <p className="text-gray-400 leading-relaxed">{s.desc}</p>
                {i < 2 && (
                  <ArrowRight className="hidden md:block absolute -right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 z-10" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI-АГЕНТЫ (НОВАЯ ВЕРСИЯ — 50+) ── */}
      <section className="py-24 md:py-28 bg-gray-950">
        <div
          ref={agentsNewReveal.ref}
          className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-700",
            agentsNewReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-widest uppercase text-violet-500 bg-violet-500/10 border border-violet-500/20 px-4 py-1.5 rounded-full mb-4">
              <Bot className="w-3.5 h-3.5" /> AI-агенты
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-100 mb-3">50+ AI-агентов работают на вас</h2>
            <p className="text-gray-400 text-lg max-w-3xl mx-auto">Каждый процесс обслуживает специализированный AI-агент. Они работают 24/7, не устают и не забывают.</p>
          </div>

          {/* Group labels */}
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {Object.entries(AGENT_GROUP_LABELS).map(([key, { label, color }]) => {
              const colors = AGENT_COLOR_MAP[color]
              return (
                <span key={key} className={cn("text-xs font-medium px-3 py-1.5 rounded-full border", colors.bg, colors.text, colors.border)}>
                  {label}
                </span>
              )
            })}
          </div>

          {/* Agent grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {visibleAgents.map((agent) => {
              const colors = AGENT_COLOR_MAP[agent.color]
              return (
                <div
                  key={agent.name}
                  className={cn(
                    "bg-gray-900/80 backdrop-blur-sm rounded-xl border border-gray-800 p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 group relative"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", colors.bg)}>
                        <Bot className={cn("w-4 h-4", colors.text)} />
                      </div>
                      <span
                        className={cn("absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full", colors.dot)}
                        style={{ animation: "agent-pulse 2s ease-in-out infinite" }}
                      />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm text-gray-100 truncate">{agent.name}</h4>
                      <p className="text-xs text-gray-500 leading-relaxed mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">{agent.desc}</p>
                    </div>
                  </div>
                  <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded mt-2 inline-block", colors.bg, colors.text)}>
                    {agent.group}
                  </span>
                </div>
              )
            })}
          </div>

          <p className="text-center text-gray-500 mt-8 text-base">
            И ещё {remainingAgentsCount}+ агентов для каждого процесса вашего бизнеса
          </p>
        </div>
      </section>

      {/* ── СТАРЫЕ AI-АГЕНТЫ (СКРЫТО) ── */}
      <section className="py-24 md:py-28 bg-gray-950 hidden">
        <div
          ref={agents.ref}
          className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-700",
            agents.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-widest uppercase text-violet-500 bg-violet-500/10 border border-violet-500/20 px-4 py-1.5 rounded-full mb-4">
              <Bot className="w-3.5 h-3.5" /> AI-агенты
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-100">6 агентов работают на вас</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {AI_AGENTS.map((a) => (
              <div key={a.name} className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/60 p-7 flex items-start gap-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
                <div className="relative shrink-0">
                  <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center", a.gradient)}>
                    <a.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                    <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75" style={{ animation: "pulse-ring 2s ease-in-out infinite" }} />
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-gray-900" />
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-base mb-1 text-gray-100">{a.name}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{a.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ОТРАСЛИ ── */}
      <section className="py-24 md:py-28 bg-gray-950">
        <div
          ref={industriesReveal.ref}
          className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-700",
            industriesReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-medium tracking-widest uppercase text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full mb-4">
              Отрасли
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-100 mb-3">Готовые решения для 15+ отраслей</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">Выберите свою нишу — мы уже знаем какие модули вам нужны</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {INDUSTRIES.map((ind) => (
              <div
                key={ind.name}
                className="bg-gray-900 rounded-2xl border border-gray-800 p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className="flex items-start gap-4 mb-3">
                  <span className="text-3xl">{ind.emoji}</span>
                  <div>
                    <h3 className="font-semibold text-base text-gray-100">{ind.name}</h3>
                    <p className="text-sm text-gray-400 mt-1 leading-relaxed">{ind.desc}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ind.modules.map((mod) => (
                    <span
                      key={mod}
                      className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                    >
                      {mod}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── МЕТРИКИ (СКРЫТО) ── */}
      <section className="py-20 md:py-24 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 relative overflow-hidden hidden">
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

      {/* ── ТАРИФЫ (СКРЫТО) ── */}
      <section id="pricing" className="py-24 md:py-28 bg-gray-950 hidden">
        <div
          ref={pricing.ref}
          className={cn(
            "max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-700",
            pricing.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-medium tracking-widest uppercase text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full mb-4">
              Конструктор тарифа
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">Соберите свой тариф</h2>
            <p className="text-gray-400 text-lg">Базовая платформа + нужные модули + количество пользователей</p>
          </div>

          {(() => {
            const extraUsers = Math.max(0, pricingUsers - 3)
            const modulesTotal = PRICING_MODULES.filter((m) => m.available && selectedModules[m.id]).reduce((s, m) => s + m.price, 0)
            const total = 9900 + extraUsers * 500 + modulesTotal
            const perUser = Math.round(total / pricingUsers)
            const hasModules = PRICING_MODULES.some((m) => m.available && selectedModules[m.id])
            const fmt = (n: number) => n.toLocaleString("ru-RU")

            return (
              <div className="max-w-2xl mx-auto space-y-4">
                {/* Base platform */}
                <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <span className="text-xs uppercase tracking-wider text-emerald-400">Старт</span>
                      <h3 className="font-bold text-white text-lg">Базовая платформа</h3>
                      <p className="text-sm text-gray-400">Личный кабинет, настройки, роли, аналитика</p>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-emerald-400 font-bold text-lg">9 900 ₽/мес</span>
                      <p className="text-xs text-gray-400">(включая все обновления)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-400">Пользователи</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setPricingUsers((u) => Math.max(1, u - 1))}
                        className="w-8 h-8 bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="text-xl font-bold text-white w-8 text-center">{pricingUsers}</span>
                      <button
                        onClick={() => setPricingUsers((u) => u + 1)}
                        className="w-8 h-8 bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors"
                      >
                        <span className="text-lg leading-none">+</span>
                      </button>
                    </div>
                    <span className="text-xs text-gray-500">3 входят в базу, далее +500 ₽/мес</span>
                  </div>
                </div>

                {/* Modules */}
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-3 px-1">Модули</p>
                  <div className="grid grid-cols-2 gap-3">
                    {PRICING_MODULES.map((m) => {
                      const selected = selectedModules[m.id] && m.available
                      const colors = PRICING_MODULE_COLORS[m.color]
                      return (
                        <button
                          key={m.id}
                          onClick={() => m.available && setSelectedModules((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
                          className={cn(
                            "bg-gray-900 border-2 rounded-xl p-4 text-left transition-all duration-200 relative",
                            !m.available && "opacity-50 cursor-not-allowed",
                            m.available && !selected && "border-gray-800 hover:border-gray-700 cursor-pointer",
                            selected && colors.border
                          )}
                          style={selected ? { backgroundColor: "rgba(99,102,241,0.05)" } : undefined}
                          disabled={!m.available}
                        >
                          {!m.available && (
                            <span className="absolute top-2 right-2 text-[10px] font-medium bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">Скоро</span>
                          )}
                          <div className="flex items-start justify-between mb-2">
                            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br", m.gradient)}>
                              <m.icon className="w-4.5 h-4.5 text-white" />
                            </div>
                            <div className={cn(
                              "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                              selected ? `${colors.check} border-transparent` : "border-gray-700"
                            )}>
                              {selected && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </div>
                          <h4 className="font-semibold text-white text-sm mb-0.5">{m.label}</h4>
                          <p className="text-xs text-gray-500 mb-2">{m.desc}</p>
                          <p className={cn("text-sm font-bold", selected ? colors.text : "text-gray-400")}>+{fmt(m.price)} ₽/мес</p>
                          <p className="text-xs text-gray-400">(включая все обновления)</p>
                        </button>
                      )
                    })}
                  </div>
                  {!hasModules && (
                    <p className="text-xs text-red-400 mt-2 px-1">Выберите хотя бы один модуль</p>
                  )}
                </div>

                {/* Total */}
                <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between"><span className="text-gray-400">Базовая платформа</span><span className="text-gray-300">{fmt(9900)} ₽</span></div>
                    {extraUsers > 0 && (
                      <div className="flex justify-between"><span className="text-gray-400">Доп. пользователи ({extraUsers})</span><span className="text-gray-300">+{fmt(extraUsers * 500)} ₽</span></div>
                    )}
                    {PRICING_MODULES.filter((m) => m.available && selectedModules[m.id]).map((m) => {
                      const colors = PRICING_MODULE_COLORS[m.color]
                      return (
                        <div key={m.id} className="flex justify-between">
                          <span className={colors.text}>{m.label}</span>
                          <span className="text-gray-300">+{fmt(m.price)} ₽</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="border-t border-gray-800 pt-4 flex items-end justify-between mb-4">
                    <span className="text-lg font-bold text-white">Итого</span>
                    <div className="text-right">
                      <span className="text-3xl font-bold text-indigo-400">{fmt(total)} ₽</span>
                      <span className="text-sm text-gray-500">/мес</span>
                      <p className="text-xs text-gray-400">(включая все обновления)</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">{fmt(perUser)} ₽ за пользователя</p>
                  <Button
                    className={cn(
                      "w-full py-4 text-base font-semibold rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white shadow-lg shadow-indigo-500/30 h-auto",
                      !hasModules && "opacity-50 cursor-not-allowed"
                    )}
                    disabled={!hasModules}
                    asChild={hasModules}
                  >
                    {hasModules ? (
                      <Link href="/register">Оставить заявку</Link>
                    ) : (
                      <span>Оставить заявку</span>
                    )}
                  </Button>
                </div>
              </div>
            )
          })()}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 md:py-28 relative overflow-hidden bg-gray-950">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-br from-indigo-900/20 to-violet-900/20 rounded-full blur-3xl" />
        </div>
        <div
          ref={cta.ref}
          className={cn(
            "max-w-3xl mx-auto px-4 sm:px-6 text-center relative transition-all duration-700",
            cta.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-5 text-gray-100">
            Попробуйте{" "}
            <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">Company24.pro</span>
          </h2>
          <p className="text-xl text-gray-400 mb-10">Оставьте заявку — покажем платформу и подберём модули под ваш бизнес</p>
          <Button size="lg" className="bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 h-14 px-12 text-lg shadow-xl shadow-indigo-500/20 transition-all hover:shadow-2xl hover:scale-[1.02] text-white rounded-2xl" asChild>
            <Link href="/register">Оставить заявку <ArrowRight className="w-5 h-5 ml-2" /></Link>
          </Button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer id="about" className="bg-gray-950 border-t border-gray-800 text-gray-400 py-20">
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
                <a href="#" className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors" aria-label="🤖 Telegram">
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
                    <li key={l.label}>
                      <a href={l.href} className="text-sm hover:text-white transition-colors">{l.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-xs text-gray-600">
            &copy; 2026 Company24.pro. Все права защищены. · Powered by Company24 Agents
            <p className="text-xs text-gray-500 text-center mt-1">Версия {VERSION} · Build {BUILD_DATE}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
