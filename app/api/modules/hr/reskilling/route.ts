import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { reskillingAssessments, reskillingPlans } from "@/lib/db/schema"
import { eq, desc, and } from "drizzle-orm"

// GET /api/modules/hr/reskilling?type=assessments|plans
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const type = url.searchParams.get("type") || "assessments"

  if (type === "plans") {
    const plans = await db.select().from(reskillingPlans)
      .where(eq(reskillingPlans.tenantId, session.user.companyId))
      .orderBy(desc(reskillingPlans.createdAt))
    return NextResponse.json(plans)
  }

  const assessments = await db.select().from(reskillingAssessments)
    .where(eq(reskillingAssessments.tenantId, session.user.companyId))
    .orderBy(desc(reskillingAssessments.automationRisk))
  return NextResponse.json(assessments)
}

// POST /api/modules/hr/reskilling
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  if (body.action === "seed-demo") {
    const demoAssessments = [
      { position: "Бухгалтер",              dept: "Финансы",    risk: 78, level: "critical", summary: "Автоматизация отчётности, сверки, расчёта налогов через AI", tasks: [{ task: "Ввод первичных документов", riskPct: 95, alternative: "OCR + AI-парсинг" }, { task: "Расчёт зарплаты", riskPct: 85, alternative: "1С + AI-модуль" }, { task: "Подготовка отчётности", riskPct: 70, alternative: "Автоформирование" }] },
      { position: "Оператор колл-центра",   dept: "Поддержка",  risk: 72, level: "high", summary: "AI-чатботы и голосовые помощники заменяют первую линию", tasks: [{ task: "Ответы на типовые вопросы", riskPct: 90, alternative: "AI-чатбот" }, { task: "Маршрутизация обращений", riskPct: 80, alternative: "Автоклассификация" }] },
      { position: "Менеджер по продажам",    dept: "Продажи",    risk: 45, level: "medium", summary: "AI помогает с лидогенерацией и CRM, но переговоры остаются", tasks: [{ task: "Холодные звонки", riskPct: 60, alternative: "AI-обзвон + квалификация" }, { task: "Заполнение CRM", riskPct: 75, alternative: "Авто-логирование" }] },
      { position: "HR-менеджер",             dept: "HR",         risk: 35, level: "medium", summary: "Скрининг резюме автоматизируется, но адаптация и культура — нет", tasks: [{ task: "Скрининг резюме", riskPct: 80, alternative: "AI-скоринг" }, { task: "Назначение собеседований", riskPct: 65, alternative: "Автокалендарь" }] },
      { position: "Frontend-разработчик",    dept: "Разработка", risk: 25, level: "low", summary: "AI-копайлоты ускоряют работу, но не заменяют архитектурные решения", tasks: [{ task: "Написание бойлерплейта", riskPct: 70, alternative: "Copilot / Claude" }, { task: "Code review", riskPct: 30, alternative: "AI-линтер" }] },
      { position: "Руководитель отдела",     dept: "Управление", risk: 12, level: "low", summary: "Управление людьми и стратегия практически не автоматизируются", tasks: [{ task: "Аналитические отчёты", riskPct: 50, alternative: "AI-дашборды" }] },
    ]

    for (const a of demoAssessments) {
      await db.insert(reskillingAssessments).values({
        tenantId:         session.user.companyId,
        position:         a.position,
        department:       a.dept,
        automationRisk:   a.risk,
        riskLevel:        a.level,
        aiImpactSummary:  a.summary,
        tasksAtRisk:      a.tasks,
        recommendedSkills: [
          { skillName: "Промпт-инжиниринг", priority: "high" },
          { skillName: "Работа с AI-инструментами", priority: "high" },
          { skillName: "Анализ данных", priority: "medium" },
        ],
      })
    }

    return NextResponse.json({ seeded: demoAssessments.length })
  }

  if (body.action === "create-plan") {
    const [plan] = await db.insert(reskillingPlans).values({
      tenantId:        session.user.companyId,
      employeeId:      body.employeeId,
      employeeName:    body.employeeName,
      currentPosition: body.currentPosition,
      targetPosition:  body.targetPosition,
      skills:          body.skills || [],
      dueDate:         body.dueDate ? new Date(body.dueDate) : null,
      createdBy:       session.user.id,
    }).returning()
    return NextResponse.json(plan, { status: 201 })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
