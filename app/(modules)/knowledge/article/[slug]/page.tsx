"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, Eye, Pencil, Archive, Pin, Calendar, User } from "lucide-react"

// ─── Mock data ──────────────────────────────────────────────────────────────

interface ArticleData {
  id: string
  slug: string
  title: string
  category: string
  categorySlug: string
  author: string
  date: string
  views: number
  isPinned: boolean
  tags: string[]
  content: string
}

const ARTICLES: Record<string, ArticleData> = {
  "kak-oformit-otpusk": {
    id: "1", slug: "kak-oformit-otpusk", title: "Как оформить отпуск",
    category: "HR-политики", categorySlug: "hr-policies", author: "Мария Петрова",
    date: "2026-03-15", views: 234, isPinned: true, tags: ["отпуск", "HR"],
    content: `## Порядок оформления отпуска

### 1. Подача заявления
Заявление на отпуск подаётся **не позднее чем за 14 дней** до начала отпуска.

Для подачи заявления:
- Откройте раздел «Заявления» в личном кабинете
- Выберите тип отпуска: ежегодный, без сохранения ЗП, учебный
- Укажите даты начала и окончания
- Нажмите «Отправить на согласование»

### 2. Согласование
Заявление проходит следующие этапы:
1. Непосредственный руководитель
2. HR-отдел
3. Бухгалтерия (для расчёта отпускных)

### 3. Отпускные
Выплата отпускных производится **не позднее чем за 3 дня** до начала отпуска.

### Важно
- Минимальная продолжительность отпуска — 14 календарных дней подряд (хотя бы один раз в год)
- Перенос отпуска возможен по согласованию с руководителем
- Отзыв из отпуска — только с письменного согласия сотрудника`,
  },
  "nastroyka-vpn": {
    id: "2", slug: "nastroyka-vpn", title: "Настройка VPN",
    category: "IT и безопасность", categorySlug: "it-security", author: "Алексей Морозов",
    date: "2026-03-10", views: 189, isPinned: true, tags: ["VPN", "безопасность"],
    content: `## Настройка корпоративного VPN

### Шаг 1. Получите учётные данные
Обратитесь в IT-отдел через тикет-систему или напишите на support@company.ru

### Шаг 2. Установите клиент
- **Windows / Mac**: скачайте WireGuard с официального сайта
- **Linux**: \`sudo apt install wireguard\`

### Шаг 3. Импортируйте конфиг
1. Откройте WireGuard
2. Нажмите «Импортировать туннель из файла»
3. Выберите файл .conf, полученный от IT-отдела

### Шаг 4. Подключитесь
Нажмите «Активировать» — готово!

### Решение проблем
- **Не подключается**: проверьте, не блокирует ли порт 51820 ваш провайдер
- **Медленная скорость**: попробуйте другой сервер (спросите у IT)
- **Истёк конфиг**: запросите новый через тикет`,
  },
  "skript-kholodnogo-zvonka-v2": {
    id: "3", slug: "skript-kholodnogo-zvonka-v2", title: "Скрипт холодного звонка v2",
    category: "Продажи", categorySlug: "sales", author: "Сергей Волков",
    date: "2026-03-20", views: 156, isPinned: false, tags: ["скрипт", "звонки"],
    content: `## Скрипт холодного звонка (версия 2)

### Приветствие
«Добрый день, [Имя]! Меня зовут [Ваше имя], компания [Название]. Удобно сейчас говорить?»

### Выявление потребности
«Скажите, вы сейчас используете какое-либо решение для [область]?»

### Презентация
- Кратко опишите 2-3 ключевых преимущества
- Используйте кейсы клиентов из той же отрасли

### Работа с возражениями
| Возражение | Ответ |
|-----------|-------|
| «Дорого» | «Давайте посмотрим на ROI...» |
| «Нет времени» | «Понимаю, именно поэтому предлагаю короткий звонок на 15 минут...» |
| «У нас уже есть» | «Отлично! А как вы оцениваете текущее решение по шкале от 1 до 10?» |

### Закрытие
«Предлагаю назначить демонстрацию на [дата]. Какое время удобно?»`,
  },
  "chek-list-pervogo-dnya": {
    id: "4", slug: "chek-list-pervogo-dnya", title: "Чек-лист первого дня",
    category: "Онбординг", categorySlug: "onboarding", author: "Анна Иванова",
    date: "2026-02-28", views: 142, isPinned: true, tags: ["новичок", "чек-лист"],
    content: `## Чек-лист первого рабочего дня

### До прихода в офис
- [ ] Получить пропуск на ресепшн
- [ ] Узнать номер рабочего места

### Первые шаги
- [ ] Познакомиться с наставником (buddy)
- [ ] Получить ноутбук и настроить учётную запись
- [ ] Подключиться к корпоративному Wi-Fi
- [ ] Установить необходимое ПО (список у IT)

### Доступы
- [ ] Корпоративная почта
- [ ] Slack / мессенджер
- [ ] Jira / таск-трекер
- [ ] VPN (если требуется)
- [ ] CRM (если требуется)

### Встречи первого дня
- 10:00 — Welcome-встреча с HR
- 11:00 — Знакомство с командой
- 14:00 — Встреча с руководителем

### Документы
- [ ] Подписать трудовой договор
- [ ] Подписать NDA
- [ ] Заполнить анкету сотрудника`,
  },
  "kak-zakazat-kantstovary": {
    id: "5", slug: "kak-zakazat-kantstovary", title: "Как заказать канцтовары",
    category: "Регламенты", categorySlug: "regulations", author: "Елена Сидорова",
    date: "2026-03-05", views: 98, isPinned: false, tags: ["канцтовары", "заказ"],
    content: `## Заказ канцтоваров

### Порядок заказа
1. Откройте форму заказа в разделе «Сервисы» → «Канцтовары»
2. Выберите нужные позиции из каталога
3. Укажите количество
4. Нажмите «Отправить заявку»

### Сроки
- Заявки обрабатываются **по понедельникам**
- Доставка — в течение 2-3 рабочих дней

### Лимиты
- Ручки, карандаши, стикеры — без ограничений
- Ежедневники, блокноты — 1 шт./квартал
- Техника (калькуляторы и пр.) — по согласованию с руководителем

### Контакты
По вопросам обращайтесь к офис-менеджеру: Ирина Смирнова, каб. 205`,
  },
}

// Simple markdown renderer
function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-8 mb-3">$1</h2>')
    .replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.split("|").filter(Boolean).map((c) => c.trim())
      return `<tr>${cells.map((c) => `<td class="border px-3 py-1.5 text-sm">${c}</td>`).join("")}</tr>`
    })
    .replace(/(<tr>.*<\/tr>\n?)+/g, (match) => {
      const rows = match.trim().split("\n").filter((r) => !r.includes("---"))
      if (rows.length === 0) return match
      const header = rows[0]
        .replace(/<td/g, "<th")
        .replace(/<\/td>/g, "</th>")
        .replace(/class="[^"]*"/g, 'class="border px-3 py-1.5 text-sm font-semibold bg-muted/40"')
      return `<table class="w-full border-collapse my-4">${header}${rows.slice(1).join("\n")}</table>`
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-sm">$1</code>')
    .replace(/^- \[ \] (.+)$/gm, '<div class="flex items-center gap-2 ml-4 my-1"><input type="checkbox" disabled class="rounded" /><span>$1</span></div>')
    .replace(/^- \[x\] (.+)$/gm, '<div class="flex items-center gap-2 ml-4 my-1"><input type="checkbox" checked disabled class="rounded" /><span class="line-through text-muted-foreground">$1</span></div>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 my-0.5 list-disc list-inside">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 my-0.5 list-decimal list-inside">$2</li>')
    .replace(/«(.+?)»/g, "&laquo;$1&raquo;")
    .replace(/\n{2,}/g, '<div class="h-3"></div>')
    .replace(/\n/g, "")
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const article = ARTICLES[slug]

  if (!article) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="flex-1 overflow-auto bg-background min-w-0">
            <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
              <p className="text-muted-foreground">Статья не найдена</p>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
              <Link href="/knowledge" className="hover:text-foreground transition-colors">База знаний</Link>
              <ChevronRight className="size-3.5" />
              <Link href={`/knowledge/category/${article.categorySlug}`} className="hover:text-foreground transition-colors">
                {article.category}
              </Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium truncate max-w-[300px]">{article.title}</span>
            </div>

            {/* Article header */}
            <div className="mb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                    {article.isPinned && <Pin className="size-5 text-amber-500 shrink-0" />}
                    {article.title}
                  </h1>
                  <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <User className="size-3.5" />
                      {article.author}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      {formatDate(article.date)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Eye className="size-3.5" />
                      {article.views} просмотров
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {article.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="font-normal">{tag}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/knowledge/article/${article.slug}/edit`}>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Pencil className="size-3.5" />
                      Редактировать
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground">
                    <Archive className="size-3.5" />
                    В архив
                  </Button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="border rounded-xl p-8 bg-card max-w-4xl">
              <div
                className="prose prose-sm max-w-none text-foreground leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(article.content) }}
              />
            </div>

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
