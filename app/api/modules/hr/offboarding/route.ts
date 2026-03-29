import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { offboardingCases } from "@/lib/db/schema"
import { eq, desc, and } from "drizzle-orm"

const DEFAULT_CHECKLIST = [
  { id: "1",  title: "Уведомление руководителя",         done: false, assignedTo: "hr" },
  { id: "2",  title: "Передача текущих проектов",        done: false, assignedTo: "manager" },
  { id: "3",  title: "Передача доступов и паролей",      done: false, assignedTo: "it" },
  { id: "4",  title: "Возврат оборудования",             done: false, assignedTo: "admin" },
  { id: "5",  title: "Отключение корпоративной почты",   done: false, assignedTo: "it" },
  { id: "6",  title: "Расчёт зарплаты и компенсаций",   done: false, assignedTo: "finance" },
  { id: "7",  title: "Exit-интервью",                    done: false, assignedTo: "hr" },
  { id: "8",  title: "Подписание документов об увольнении", done: false, assignedTo: "hr" },
  { id: "9",  title: "Удаление из внутренних систем",    done: false, assignedTo: "it" },
  { id: "10", title: "Прощальное письмо команде",        done: false, assignedTo: "hr" },
]

// GET /api/modules/hr/offboarding
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const status = url.searchParams.get("status")

  const cases = await db
    .select()
    .from(offboardingCases)
    .where(and(
      eq(offboardingCases.tenantId, session.user.companyId),
      status ? eq(offboardingCases.status, status) : undefined,
    ))
    .orderBy(desc(offboardingCases.createdAt))

  return NextResponse.json(cases)
}

// POST /api/modules/hr/offboarding
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  if (body.action === "seed-demo") {
    const demoData = [
      { name: "Павел Игнатьев",  dept: "Продажи",   pos: "Менеджер",         reason: "voluntary",    status: "exit_interview" },
      { name: "Ирина Белова",    dept: "Маркетинг",  pos: "Дизайнер",         reason: "mutual",       status: "in_progress" },
      { name: "Олег Тарасов",    dept: "Разработка", pos: "QA-инженер",       reason: "contract_end", status: "completed" },
    ]

    for (const emp of demoData) {
      await db.insert(offboardingCases).values({
        tenantId:      session.user.companyId,
        employeeId:    `demo-off-${emp.name.toLowerCase().replace(/\s/g, '-')}`,
        employeeName:  emp.name,
        department:    emp.dept,
        position:      emp.pos,
        reason:        emp.reason,
        status:        emp.status,
        lastWorkDay:   new Date(Date.now() + 14 * 86400000),
        checklistJson: DEFAULT_CHECKLIST.map((item, i) => ({
          ...item,
          done: emp.status === "completed" ? true : i < 3 && emp.status !== "initiated",
        })),
        referralBridge: emp.reason === "voluntary",
        createdBy:     session.user.id,
      })
    }
    return NextResponse.json({ seeded: demoData.length })
  }

  const [created] = await db.insert(offboardingCases).values({
    tenantId:      session.user.companyId,
    employeeId:    body.employeeId,
    employeeName:  body.employeeName,
    department:    body.department,
    position:      body.position,
    reason:        body.reason || "voluntary",
    lastWorkDay:   body.lastWorkDay ? new Date(body.lastWorkDay) : null,
    checklistJson: DEFAULT_CHECKLIST,
    referralBridge: body.referralBridge ?? false,
    createdBy:     session.user.id,
  }).returning()

  return NextResponse.json(created, { status: 201 })
}
