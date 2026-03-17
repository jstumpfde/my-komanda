"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { BookOpen, Puzzle, Eye, Download, Clock, Plus, Save, FolderOpen } from "lucide-react"
import { toast } from "sonner"
import type { Lesson } from "@/lib/course-types"
import { createBlock } from "@/lib/course-types"

/* ═══ TEMPLATE DATA ═══ */
interface FullTemplate {
  emoji: string
  title: string
  category: string
  lessonsCount: number
  duration: string
  description: string
  lessons: Lesson[]
}

interface ModuleTemplate {
  emoji: string
  title: string
  category: string
  variables: string[]
  lesson: Lesson
}

function mkLesson(id: string, emoji: string, title: string, content: string, extra?: Partial<Lesson>): Lesson {
  return { id, emoji, title, blocks: [{ ...createBlock("text"), id: `${id}-b`, content }], ...extra }
}

const FULL_TEMPLATES: FullTemplate[] = [
  {
    emoji: "💼", title: "Менеджер по продажам B2B", category: "Продажи", lessonsCount: 12, duration: "~15 мин",
    description: "Полная демонстрация для менеджеров B2B продаж: компания, продукт, система дохода, карьера",
    lessons: [
      mkLesson("t1-1","👋","Приветствие","Здравствуйте, {{имя}}! Добро пожаловать в {{компания}}.\n\nМы подготовили для вас демонстрацию должности «{{должность}}». Узнайте всё о компании, задачах и доходе за 15 минут."),
      mkLesson("t1-2","🎥","Видео от руководителя","Основатель {{компания}} расскажет о миссии и ценностях."),
      mkLesson("t1-3","🏢","О компании","{{компания}} — лидер в своём сегменте.\n\n📍 Город: {{город}}\n👥 Команда: 150+ человек\n🏆 На рынке с 2018 года"),
      mkLesson("t1-4","🚀","Куда растёт компания","Планы развития на ближайший год:\n\n• Рост выручки на 40%\n• Запуск новых продуктов\n• Расширение географии"),
      mkLesson("t1-5","💰","Рынок и клиенты","Работаем с крупными B2B клиентами.\nСредний чек от 500 000 ₽.\n\nОтрасли: IT, финансы, промышленность."),
      mkLesson("t1-6","👤","Ваша роль","На позиции «{{должность}}» вы будете:\n\n• Привлекать новых B2B клиентов\n• Проводить переговоры и презентации\n• Вести сделки от первого контакта до закрытия\n• Развивать существующих клиентов"),
      mkLesson("t1-7","⚙️","Как устроена работа","📍 Офис: {{офис}}, {{город}}\n⏰ График: {{график}}\n\nИнструменты: CRM, корпоративная связь, ноутбук\nОнбординг: 2 недели с наставником"),
      mkLesson("t1-8","💵","Система дохода","💰 Оклад: {{зарплата_от}} – {{зарплата_до}} ₽\n\n📊 Бонусы:\n• 100% плана → +20%\n• 120% → +35%\n• 150% → +50%\n\nСредний доход менеджера: {{зарплата_до}} ₽"),
      mkLesson("t1-9","📍","Офис и команда","Современный офис в центре {{город}}.\n\n• Кухня и зона отдыха\n• Парковка\n• Команда: дружелюбная и профессиональная"),
      mkLesson("t1-10","📈","Рост и карьера","Карьерный путь:\nСтажёр → Менеджер → Старший → Руководитель группы → Руководитель отдела\n\nОбучение за счёт компании."),
      mkLesson("t1-11","✅","Задания",""  , { blocks: [{ ...createBlock("task"), id: "t1-11-b", taskDescription: "Ответьте на вопросы:", questions: [{ id: "tq1", text: "Расскажите о вашем опыте в B2B продажах", answerType: "text" as const, options: [] }, { id: "tq2", text: "Какой ваш самый крупный закрытый контракт?", answerType: "text" as const, options: [] }, { id: "tq3", text: "Какой у вас опыт продаж?", answerType: "single" as const, options: ["Нет опыта","До 1 года","1-3 года","3-5 лет","5+ лет"] }] }] }),
      mkLesson("t1-12","➡️","Что дальше","Спасибо за прохождение демонстрации! 🎉\n\nСледующие шаги:\n1. Мы проверим ваши ответы\n2. HR свяжется с вами\n3. Пригласим на собеседование"),
    ],
  },
  {
    emoji: "📞", title: "Телемаркетолог", category: "Продажи", lessonsCount: 10, duration: "~12 мин",
    description: "Для позиций с активными исходящими звонками: скрипты, KPI, мотивация",
    lessons: [
      mkLesson("t2-1","👋","Приветствие","Здравствуйте, {{имя}}! Рады видеть вас в {{компания}}."),
      mkLesson("t2-2","🏢","О компании","{{компания}} — динамично растущая компания в {{город}}."),
      mkLesson("t2-3","📞","Ваши задачи","Ежедневно:\n• 80-100 исходящих звонков\n• Назначение встреч для менеджеров\n• Работа по скриптам\n• Ведение CRM"),
      mkLesson("t2-4","💵","Доход","Оклад: {{зарплата_от}} ₽ + бонус за каждую назначенную встречу\n\nТоп-менеджеры зарабатывают {{зарплата_до}} ₽+"),
      mkLesson("t2-5","⚙️","Рабочий процесс","📍 {{офис}}, {{город}}\n⏰ {{график}}\n\nГарнитура, CRM, база контактов — всё предоставляем"),
      mkLesson("t2-6","📈","Карьера","Рост: Оператор → Старший → Супервайзер → Руководитель отдела"),
      mkLesson("t2-7","🚀","Адаптация","Первая неделя: обучение продукту и скриптам\nВторая неделя: работа с наставником"),
      mkLesson("t2-8","✅","Задания","", { blocks: [{ ...createBlock("task"), id: "t2-8-b", taskDescription: "Проверим вашу мотивацию:", questions: [{ id: "tq2-1", text: "Почему вам интересны продажи по телефону?", answerType: "text" as const, options: [] }] }] }),
      mkLesson("t2-9","🎥","Видео-визитка","", { blocks: [{ ...createBlock("task"), id: "t2-9-b", taskDescription: "Запишите короткое видео:", questions: [{ id: "vq2-1", text: "Представьтесь и расскажите о себе", answerType: "video" as const, options: [] }] }] }),
      mkLesson("t2-10","➡️","Что дальше","Спасибо! Мы свяжемся с вами в ближайшее время."),
    ],
  },
  {
    emoji: "🤝", title: "Клиентский менеджер", category: "Продажи", lessonsCount: 11, duration: "~13 мин",
    description: "Для сопровождения клиентов: сервис, аккаунтинг, развитие",
    lessons: [
      mkLesson("t3-1","👋","Приветствие","Здравствуйте, {{имя}}! Команда {{компания}} рада вашему интересу."),
      mkLesson("t3-2","🏢","О компании","{{компания}} — {{город}}, 150+ человек, лидер рынка."),
      mkLesson("t3-3","🤝","Ваша роль","Вы будете:\n• Сопровождать ключевых клиентов\n• Решать вопросы оперативно\n• Развивать отношения\n• Увеличивать LTV"),
      mkLesson("t3-4","💵","Доход","Оклад: {{зарплата_от}}–{{зарплата_до}} ₽\nБонус за NPS и retention"),
      mkLesson("t3-5","⚙️","Процесс работы","CRM, Slack, еженедельные планёрки.\n{{график}} в {{город}}."),
      mkLesson("t3-6","👥","Команда","Отдел из 8 человек. Руководитель: Алексей Петров."),
      mkLesson("t3-7","📈","Карьера","Менеджер → Старший → Team Lead → Руководитель направления"),
      mkLesson("t3-8","📍","Офис","{{офис}}, {{город}}. Кухня, лаунж, парковка."),
      mkLesson("t3-9","🚀","Адаптация","30 дней с наставником. Постепенное увеличение портфеля."),
      mkLesson("t3-10","✅","Задания","", { blocks: [{ ...createBlock("task"), id: "t3-10-b", taskDescription: "Вопросы:", questions: [{ id: "tq3-1", text: "Расскажите о вашем опыте работы с клиентами", answerType: "text" as const, options: [] }, { id: "tq3-2", text: "Как вы решаете конфликтные ситуации?", answerType: "text" as const, options: [] }] }] }),
      mkLesson("t3-11","➡️","Что дальше","Спасибо! До скорой встречи. 🤝"),
    ],
  },
  {
    emoji: "🏗", title: "Менеджер проектных продаж", category: "Строительство", lessonsCount: 12, duration: "~15 мин",
    description: "На основе реального примера ГК Орлинк — для строительных компаний",
    lessons: [
      mkLesson("t4-1","👋","Приветствие","Здравствуйте, {{имя}}! Добро пожаловать в {{компания}}."),
      mkLesson("t4-2","🏢","О компании","{{компания}} — проектирование и строительство зданий.\n\n📍 {{город}}\n🏗 500+ реализованных проектов"),
      mkLesson("t4-3","🏗","Наши объекты","Промышленные здания, склады, торговые центры.\nГеография: вся Россия."),
      mkLesson("t4-4","👤","Ваша роль","• Поиск и привлечение заказчиков\n• Расчёт коммерческих предложений\n• Ведение проекта от заявки до сдачи\n• Тендерная документация"),
      mkLesson("t4-5","💵","Доход","Оклад: {{зарплата_от}} ₽ + % от маржи проекта\n\nСредний проект: 5-50 млн ₽\nСредний доход менеджера: {{зарплата_до}} ₽+"),
      mkLesson("t4-6","⚙️","Процесс работы","CRM, 1С, AutoCAD (базовый уровень).\n\nКоманда: конструкторы, сметчики, прорабы — все в штате."),
      mkLesson("t4-7","📍","Офис","{{офис}}, {{город}}.\n{{график}}.\nКорпоративный транспорт на объекты."),
      mkLesson("t4-8","📈","Карьера","Менеджер → Руководитель направления → Коммерческий директор"),
      mkLesson("t4-9","🚀","Адаптация","2 недели: обучение продукту + выезды на объекты\n2 недели: работа с базой под наставничеством"),
      mkLesson("t4-10","✅","Задания","", { blocks: [{ ...createBlock("task"), id: "t4-10-b", taskDescription: "Вопросы:", questions: [{ id: "tq4-1", text: "Ваш опыт в проектных/строительных продажах", answerType: "text" as const, options: [] }, { id: "tq4-2", text: "Самый крупный проект, в котором участвовали", answerType: "text" as const, options: [] }] }] }),
      mkLesson("t4-11","🎥","Видео-визитка","", { blocks: [{ ...createBlock("task"), id: "t4-11-b", taskDescription: "Расскажите о себе в видео:", questions: [{ id: "vq4-1", text: "Кто вы и какой у вас опыт", answerType: "video" as const, options: [] }] }] }),
      mkLesson("t4-12","➡️","Что дальше","Спасибо! Мы рассмотрим вашу заявку и свяжемся."),
    ],
  },
  {
    emoji: "💻", title: "IT-специалист", category: "IT", lessonsCount: 10, duration: "~12 мин",
    description: "Для разработчиков, DevOps, QA — стек, команда, процессы",
    lessons: [
      mkLesson("t5-1","👋","Приветствие","Привет, {{имя}}! Рады что ты рассматриваешь {{компания}}."),
      mkLesson("t5-2","🏢","О компании","{{компания}} — IT-компания. Продукт / Аутстафф / Аутсорс."),
      mkLesson("t5-3","💻","Стек технологий","Frontend: React, TypeScript\nBackend: Go, PostgreSQL\nInfra: K8s, AWS, CI/CD"),
      mkLesson("t5-4","👤","Роль","{{должность}}: проектирование, разработка, код-ревью, менторство джунов."),
      mkLesson("t5-5","💵","Доход","{{зарплата_от}}–{{зарплата_до}} ₽ gross\n+ квартальная премия\n+ опционы\n+ MacBook Pro"),
      mkLesson("t5-6","⚙️","Процессы","Agile/Scrum, 2-недельные спринты, daily в 11:00\nGitHub, Jira, Slack, Notion"),
      mkLesson("t5-7","📍","Формат","{{город}} / удалёнка / гибрид\n{{график}}"),
      mkLesson("t5-8","📈","Рост","Junior → Middle → Senior → Lead → Architect"),
      mkLesson("t5-9","✅","Задания","", { blocks: [{ ...createBlock("task"), id: "t5-9-b", taskDescription: "Технические вопросы:", questions: [{ id: "tq5-1", text: "Опишите ваш опыт с текущим стеком", answerType: "text" as const, options: [] }, { id: "tq5-2", text: "Ссылка на GitHub/портфолио", answerType: "text" as const, options: [] }] }] }),
      mkLesson("t5-10","➡️","Что дальше","Спасибо! Следующий шаг — техническое интервью."),
    ],
  },
  {
    emoji: "📦", title: "Логист", category: "Логистика", lessonsCount: 9, duration: "~10 мин",
    description: "Для логистов и экспедиторов: маршруты, транспорт, KPI",
    lessons: [
      mkLesson("t6-1","👋","Приветствие","Здравствуйте, {{имя}}! {{компания}} ищет логиста."),
      mkLesson("t6-2","🏢","О компании","{{компания}} — логистическая компания, {{город}}."),
      mkLesson("t6-3","🚛","Задачи","Планирование маршрутов, работа с перевозчиками, контроль доставки."),
      mkLesson("t6-4","💵","Доход","Оклад: {{зарплата_от}}–{{зарплата_до}} ₽\nПремия за выполнение KPI"),
      mkLesson("t6-5","⚙️","Инструменты","1С, TMS-система, Excel\n{{график}} в {{город}}"),
      mkLesson("t6-6","📈","Карьера","Логист → Старший → Руководитель направления"),
      mkLesson("t6-7","📍","Офис и склад","{{офис}}, {{город}}"),
      mkLesson("t6-8","✅","Задания","", { blocks: [{ ...createBlock("task"), id: "t6-8-b", taskDescription: "Вопросы:", questions: [{ id: "tq6-1", text: "Ваш опыт в логистике", answerType: "text" as const, options: [] }] }] }),
      mkLesson("t6-9","➡️","Что дальше","Спасибо! Ждите звонка от HR."),
    ],
  },
  {
    emoji: "🔧", title: "Рабочая специальность", category: "Производство", lessonsCount: 8, duration: "~8 мин",
    description: "Для производственных позиций: условия, оплата, график смен",
    lessons: [
      mkLesson("t7-1","👋","Приветствие","Здравствуйте! {{компания}} приглашает на работу."),
      mkLesson("t7-2","🏭","О предприятии","{{компания}} — производственное предприятие в {{город}}."),
      mkLesson("t7-3","🔧","Обязанности","Работа на производственной линии, контроль качества, обслуживание оборудования."),
      mkLesson("t7-4","💵","Оплата","Оклад: {{зарплата_от}}–{{зарплата_до}} ₽\nПереработки оплачиваются x1.5"),
      mkLesson("t7-5","📍","Условия","{{офис}}, {{город}}\n{{график}}\nСпецодежда и питание"),
      mkLesson("t7-6","🚀","Обучение","Стажировка 1 неделя с наставником. Допуск после обучения ТБ."),
      mkLesson("t7-7","✅","Анкета","", { blocks: [{ ...createBlock("task"), id: "t7-7-b", taskDescription: "Заполните:", questions: [{ id: "tq7-1", text: "Ваша специальность и разряд", answerType: "text" as const, options: [] }] }] }),
      mkLesson("t7-8","➡️","Что дальше","Спасибо! Приходите на собеседование по адресу {{офис}}."),
    ],
  },
]

const MODULE_TEMPLATES: ModuleTemplate[] = [
  { emoji: "🏢", title: "О компании (универсальный)", category: "О компании", variables: ["компания","город"], lesson: mkLesson("m1","🏢","О компании","{{компания}} — современная компания.\n\n📍 {{город}}\n👥 Профессиональная команда\n🏆 Лидер в своём сегменте") },
  { emoji: "💰", title: "Система дохода (оклад + %)", category: "Доход", variables: ["зарплата_от","зарплата_до"], lesson: mkLesson("m2","💵","Система дохода","💰 Оклад: {{зарплата_от}} – {{зарплата_до}} ₽\n\n📊 Бонусная система:\n• 100% плана → +20%\n• 120% → +35%\n• 150% → +50%") },
  { emoji: "📍", title: "Офис и команда", category: "Команда", variables: ["офис","график"], lesson: mkLesson("m3","📍","Офис и команда","📍 Адрес: {{офис}}\n⏰ График: {{график}}\n\n• Современный офис\n• Кухня, лаунж\n• Парковка") },
  { emoji: "📈", title: "Рост и карьера", category: "Команда", variables: [], lesson: mkLesson("m4","📈","Рост и карьера","Карьерный путь:\n\nСтажёр → Специалист → Старший → Руководитель\n\nСреднее время роста: 6-12 месяцев.\nОбучение за счёт компании.") },
  { emoji: "✅", title: "Блок заданий (3 вопроса)", category: "Задания", variables: [], lesson: { id: "m5", emoji: "✅", title: "Задания и вопросы", blocks: [{ ...createBlock("task"), id: "m5-b", taskDescription: "Ответьте на вопросы:", questions: [{ id: "mq1", text: "Расскажите о себе", answerType: "text" as const, options: [] }, { id: "mq2", text: "Почему вас заинтересовала эта позиция?", answerType: "text" as const, options: [] }, { id: "mq3", text: "Ваши сильные стороны", answerType: "text" as const, options: [] }] }] } },
  { emoji: "🎥", title: "Видео-визитка кандидата", category: "Задания", variables: [], lesson: { id: "m6", emoji: "🎥", title: "Видео-визитка", blocks: [{ ...createBlock("task"), id: "m6-b", taskDescription: "Запишите видео (1-2 мин):", questions: [{ id: "mvq1", text: "Расскажите о себе и вашем опыте", answerType: "video" as const, options: [] }, { id: "mvq2", text: "Почему хотите работать у нас?", answerType: "video" as const, options: [] }] }] } },
  { emoji: "➡️", title: "Что дальше (финальный)", category: "О компании", variables: [], lesson: mkLesson("m7","➡️","Что дальше","Спасибо, что прошли демонстрацию! 🎉\n\nСледующие шаги:\n1. Мы проверим ваши ответы\n2. HR-менеджер свяжется с вами\n3. Пригласим на собеседование\n\nДо скорой встречи!") },
]

const MODULE_CATEGORIES = ["Все", "О компании", "Доход", "Команда", "Задания", "Мои"]

/* ═══ COMPONENT ═══ */

interface LibraryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentLessons: Lesson[]
  onApplyTemplate: (lessons: Lesson[]) => void
  onInsertModule: (lesson: Lesson) => void
  savedModules: Lesson[]
  savedTemplates: { title: string; category: string; lessons: Lesson[] }[]
}

export function LibraryDialog({
  open, onOpenChange, currentLessons,
  onApplyTemplate, onInsertModule,
  savedModules, savedTemplates,
}: LibraryDialogProps) {
  const [tab, setTab] = useState<"templates" | "modules">("templates")
  const [moduleFilter, setModuleFilter] = useState("Все")
  const [confirmAction, setConfirmAction] = useState<{ type: "replace" | "append"; lessons: Lesson[] } | null>(null)

  const handleUseTemplate = (lessons: Lesson[]) => {
    if (currentLessons.length === 0) {
      applyLessons(lessons)
    } else {
      setConfirmAction({ type: "replace", lessons })
    }
  }

  const applyLessons = (lessons: Lesson[]) => {
    const ts = Date.now()
    onApplyTemplate(lessons.map((l, i) => ({ ...l, id: `${l.id}-${ts}-${i}`, blocks: l.blocks.map((b) => ({ ...b, id: `${b.id}-${ts}-${i}` })) })))
    onOpenChange(false)
    setConfirmAction(null)
    toast.success("Шаблон применён")
  }

  const appendLessons = (lessons: Lesson[]) => {
    const ts = Date.now()
    const mapped = lessons.map((l, i) => ({ ...l, id: `${l.id}-${ts}-${i}`, blocks: l.blocks.map((b) => ({ ...b, id: `${b.id}-${ts}-${i}` })) }))
    onApplyTemplate([...currentLessons, ...mapped])
    onOpenChange(false)
    setConfirmAction(null)
    toast.success("Уроки добавлены")
  }

  const handleInsertModule = (lesson: Lesson) => {
    const ts = Date.now()
    onInsertModule({ ...lesson, id: `${lesson.id}-${ts}`, blocks: lesson.blocks.map((b) => ({ ...b, id: `${b.id}-${ts}` })) })
    onOpenChange(false)
    toast.success("Модуль вставлен")
  }

  const filteredModules = moduleFilter === "Все"
    ? MODULE_TEMPLATES
    : moduleFilter === "Мои"
      ? []
      : MODULE_TEMPLATES.filter((m) => m.category === moduleFilter)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-lg">Библиотека</DialogTitle>
        </DialogHeader>

        {/* Confirm dialog overlay */}
        {confirmAction && (
          <div className="absolute inset-0 z-50 bg-background/80 flex items-center justify-center">
            <Card className="w-96">
              <CardContent className="p-6 text-center space-y-4">
                <p className="text-sm font-medium">У вас уже есть уроки. Что сделать?</p>
                <div className="flex flex-col gap-2">
                  <Button onClick={() => applyLessons(confirmAction.lessons)} variant="destructive">Заменить всё</Button>
                  <Button onClick={() => appendLessons(confirmAction.lessons)} variant="outline">Добавить в конец</Button>
                  <Button onClick={() => setConfirmAction(null)} variant="ghost">Отмена</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Left — tabs */}
          <div className="w-48 border-r border-border flex flex-col bg-muted/30">
            <button onClick={() => setTab("templates")} className={cn("flex items-center gap-2 px-4 py-3 text-sm font-medium text-left transition-colors", tab === "templates" ? "bg-background text-foreground border-r-2 border-primary" : "text-muted-foreground hover:text-foreground")}>
              <BookOpen className="w-4 h-4" />Шаблоны
            </button>
            <button onClick={() => setTab("modules")} className={cn("flex items-center gap-2 px-4 py-3 text-sm font-medium text-left transition-colors", tab === "modules" ? "bg-background text-foreground border-r-2 border-primary" : "text-muted-foreground hover:text-foreground")}>
              <Puzzle className="w-4 h-4" />Модули
            </button>
          </div>

          {/* Right — content */}
          <div className="flex-1 overflow-y-auto p-6">
            {tab === "templates" ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold mb-1">Готовые шаблоны демонстраций</h3>
                  <p className="text-xs text-muted-foreground">Полные наборы уроков по ролям — используйте как есть или адаптируйте</p>
                </div>

                <div className="space-y-3">
                  {FULL_TEMPLATES.map((tpl, i) => (
                    <Card key={i} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 flex items-center gap-4">
                        <span className="text-3xl flex-shrink-0">{tpl.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{tpl.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <Badge variant="secondary" className="text-[10px]">{tpl.lessonsCount} уроков</Badge>
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Clock className="w-3 h-3" />{tpl.duration}</span>
                            <Badge variant="outline" className="text-[10px]">{tpl.category}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button size="sm" className="text-xs h-8" onClick={() => handleUseTemplate(tpl.lessons)}>
                            <Download className="w-3 h-3 mr-1.5" />Использовать
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Saved templates */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Мои сохранённые шаблоны</h4>
                  {savedTemplates.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 py-4 text-center">Пока пусто. Сохраните демонстрацию как шаблон через кнопку 💾 в редакторе.</p>
                  ) : (
                    <div className="space-y-2">
                      {savedTemplates.map((t, i) => (
                        <Card key={i} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-3 flex items-center gap-3">
                            <FolderOpen className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1"><p className="text-sm font-medium">{t.title}</p><p className="text-[10px] text-muted-foreground">{t.lessons.length} уроков · {t.category}</p></div>
                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleUseTemplate(t.lessons)}>Использовать</Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold mb-1">Модули</h3>
                  <p className="text-xs text-muted-foreground">Отдельные уроки — вставьте в любое место демонстрации</p>
                </div>

                {/* Filter */}
                <div className="flex gap-1.5 flex-wrap">
                  {MODULE_CATEGORIES.map((cat) => (
                    <Button key={cat} variant={moduleFilter === cat ? "default" : "outline"} size="sm" className="text-xs h-7" onClick={() => setModuleFilter(cat)}>{cat}</Button>
                  ))}
                </div>

                <div className="space-y-2">
                  {filteredModules.map((mod, i) => (
                    <Card key={i} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-3 flex items-center gap-3">
                        <span className="text-2xl flex-shrink-0">{mod.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{mod.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="secondary" className="text-[10px]">1 урок</Badge>
                            {mod.variables.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {mod.variables.map((v) => `{{${v}}}`).join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => handleInsertModule(mod.lesson)}>
                          <Plus className="w-3 h-3 mr-1.5" />Вставить
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Saved modules */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Мои модули</h4>
                  {savedModules.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 py-4 text-center">Пока пусто. Сохраните урок как модуль через ··· → 💾 Сохранить в библиотеку.</p>
                  ) : (
                    <div className="space-y-2">
                      {savedModules.map((m, i) => (
                        <Card key={i} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-3 flex items-center gap-3">
                            <span className="text-xl">{m.emoji}</span>
                            <div className="flex-1"><p className="text-sm font-medium">{m.title}</p></div>
                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleInsertModule(m)}>Вставить</Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
