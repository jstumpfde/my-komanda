import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { internalProjects, projectApplications } from "@/lib/db/schema"
import { eq, desc, and, count } from "drizzle-orm"

// GET /api/modules/hr/marketplace
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const projects = await db.select().from(internalProjects)
    .where(eq(internalProjects.tenantId, session.user.companyId))
    .orderBy(desc(internalProjects.createdAt))

  // Count applications per project
  const withCounts = await Promise.all(projects.map(async (p) => {
    const [{ cnt }] = await db.select({ cnt: count() }).from(projectApplications)
      .where(eq(projectApplications.projectId, p.id))
    return { ...p, applicationCount: Number(cnt) }
  }))

  return NextResponse.json(withCounts)
}

// POST /api/modules/hr/marketplace
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  if (body.action === "seed-demo") {
    const demoProjects = [
      {
        title: "Внедрение AI-чатбота для поддержки",
        description: "Разработка и настройка AI-чатбота для первой линии клиентской поддержки. Нужны специалисты с навыками NLP и промпт-инжиниринга.",
        dept: "Разработка",
        skills: [{ skillName: "Промпт-инжиниринг", minLevel: 3 }, { skillName: "Python", minLevel: 3 }, { skillName: "API-интеграции", minLevel: 2 }],
        status: "open",
        max: 3,
      },
      {
        title: "Редизайн корпоративного сайта",
        description: "Обновление дизайна и UX корпоративного сайта компании. Нужны дизайнеры и фронтенд-разработчики.",
        dept: "Маркетинг",
        skills: [{ skillName: "UI/UX дизайн", minLevel: 3 }, { skillName: "Frontend", minLevel: 3 }],
        status: "open",
        max: 4,
      },
      {
        title: "Автоматизация отчётности отдела продаж",
        description: "Создание автоматических дашбордов и отчётов для отдела продаж. Требуется знание Excel, SQL и BI-инструментов.",
        dept: "Продажи",
        skills: [{ skillName: "Анализ данных", minLevel: 3 }, { skillName: "Excel", minLevel: 4 }, { skillName: "SQL", minLevel: 2 }],
        status: "in_progress",
        max: 2,
      },
      {
        title: "Программа наставничества для стажёров",
        description: "Разработка программы менторинга для новых стажёров. Ищем опытных сотрудников с навыками обучения.",
        dept: "HR",
        skills: [{ skillName: "Коммуникация", minLevel: 4 }, { skillName: "Управление проектами", minLevel: 3 }],
        status: "completed",
        max: 5,
      },
    ]

    for (const p of demoProjects) {
      await db.insert(internalProjects).values({
        tenantId:        session.user.companyId,
        title:           p.title,
        description:     p.description,
        department:      p.dept,
        requiredSkills:  p.skills,
        status:          p.status,
        maxParticipants: p.max,
        startDate:       new Date(),
        endDate:         new Date(Date.now() + 30 * 86400000),
        createdBy:       session.user.id,
      })
    }

    return NextResponse.json({ seeded: demoProjects.length })
  }

  // Create project
  const [project] = await db.insert(internalProjects).values({
    tenantId:        session.user.companyId,
    title:           body.title,
    description:     body.description,
    department:      body.department,
    requiredSkills:  body.requiredSkills || [],
    maxParticipants: body.maxParticipants || 5,
    startDate:       body.startDate ? new Date(body.startDate) : null,
    endDate:         body.endDate ? new Date(body.endDate) : null,
    createdBy:       session.user.id,
  }).returning()

  return NextResponse.json(project, { status: 201 })
}
