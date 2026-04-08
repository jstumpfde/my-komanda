import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { DEMO_VARIABLES } from "@/lib/demo-types"

// GET /api/demo-variables?vacancyId=xxx — all variables with current values
export async function GET(req: Request) {
  try {
    const user = await requireCompany()
    const { searchParams } = new URL(req.url)
    const vacancyId = searchParams.get("vacancyId")

    // Company data
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    // Vacancy data (optional)
    let vacancy: Record<string, unknown> | null = null
    if (vacancyId) {
      const [v] = await db
        .select()
        .from(vacancies)
        .where(eq(vacancies.id, vacancyId))
        .limit(1)
      vacancy = v as unknown as Record<string, unknown> ?? null
    }

    const values: Record<string, string> = {}
    if (company) {
      values["компания"] = company.name ?? ""
      values["компания_описание"] = company.description ?? ""
      values["год_основания"] = company.foundedYear?.toString() ?? ""
      values["сотрудников"] = company.employeeCount?.toString() ?? ""
      values["сфера"] = company.industry ?? ""
      values["адрес_офиса"] = company.officeAddress ?? ""
      values["график"] = ""
      values["email_компании"] = company.email ?? ""
      values["телефон"] = company.phone ?? ""
      values["сайт"] = company.website ?? ""
      values["руководитель"] = company.director ?? ""
    }
    if (vacancy) {
      values["должность"] = (vacancy.title as string) ?? ""
      values["зарплата_от"] = (vacancy.salaryMin as number)?.toString() ?? ""
      values["зарплата_до"] = (vacancy.salaryMax as number)?.toString() ?? ""
      values["обязанности"] = (vacancy.responsibilities as string) ?? ""
      values["требования"] = (vacancy.requirements as string) ?? ""
      values["условия"] = (vacancy.conditions as string) ?? ""
    }

    const variables = DEMO_VARIABLES.map((v) => ({
      ...v,
      value: values[v.key] ?? "",
    }))

    return apiSuccess({ variables })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demo-variables GET]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
