import { db } from "@/lib/db"
import { hhTokens, hhCandidates, candidates, vacancies, hhVacancies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { generateCandidateShortId } from "@/lib/short-id"

export interface HHVacancy {
  id: string
  name: string
  status: { id: string; name: string }
  counters?: { views: number; responses: number }
}

export interface HHVacancyPayload {
  name: string
  description: string
  salary?: { from?: number; to?: number; currency: string; gross: boolean }
  schedule: { id: string }
  area: { id: string }
  employer: { id: string }
  employment?: { id: string }
}

export interface HHApplication {
  id: string
  resume: {
    id: string
    first_name: string
    last_name: string
    middle_name?: string
    title?: string
    area?: { name: string }
    salary?: { amount: number; currency: string }
    total_experience?: { months: number }
    skill_set?: string[]
    contact?: Array<{ type: { id: string }; value: { formatted?: string; email?: string } }>
  }
}

const HH_API = "https://api.hh.ru"

export class HHClient {
  constructor(private companyId: string) {}

  async getToken(): Promise<string> {
    const rows = await db
      .select()
      .from(hhTokens)
      .where(eq(hhTokens.companyId, this.companyId))
      .limit(1)

    const tokenRow = rows[0]
    if (!tokenRow) throw new Error("hh.ru не подключён")

    // Refresh if expired (buffer 60 seconds)
    if (new Date(tokenRow.tokenExpiresAt).getTime() < Date.now() + 60_000) {
      return this.refreshToken(tokenRow.refreshToken)
    }

    return tokenRow.accessToken
  }

  private async refreshToken(refreshToken: string): Promise<string> {
    const url = `${HH_API}/oauth/token`
    if (process.env.INTEGRATIONS_DISABLED === "true") {
      console.log("[INTEGRATIONS_DISABLED] hh.ru call skipped:", url)
      throw new Error("hh.ru disabled on staging")
    }

    const clientId = process.env.HH_CLIENT_ID
    const clientSecret = process.env.HH_CLIENT_SECRET

    if (!clientId || !clientSecret) throw new Error("hh.ru не настроен")

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!res.ok) throw new Error("Не удалось обновить токен hh.ru")

    const data = await res.json()
    const expiresAt = new Date(Date.now() + (data.expires_in ?? 1209600) * 1000)

    await db
      .update(hhTokens)
      .set({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenExpiresAt: expiresAt,
      })
      .where(eq(hhTokens.companyId, this.companyId))

    return data.access_token
  }

  private async apiGet<T>(path: string): Promise<T> {
    const url = `${HH_API}${path}`
    if (process.env.INTEGRATIONS_DISABLED === "true") {
      console.log("[INTEGRATIONS_DISABLED] hh.ru call skipped:", url)
      throw new Error("hh.ru disabled on staging")
    }

    const token = await this.getToken()
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`HH API error: ${res.status} ${path}`)
    return res.json()
  }

  private async apiPost<T>(path: string, body: unknown): Promise<T> {
    const url = `${HH_API}${path}`
    if (process.env.INTEGRATIONS_DISABLED === "true") {
      console.log("[INTEGRATIONS_DISABLED] hh.ru call skipped:", url)
      throw new Error("hh.ru disabled on staging")
    }

    const token = await this.getToken()
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`HH API error: ${res.status} ${path}`)
    return res.json()
  }

  async getEmployerVacancies(): Promise<HHVacancy[]> {
    const tokenRows = await db
      .select()
      .from(hhTokens)
      .where(eq(hhTokens.companyId, this.companyId))
      .limit(1)

    const employerId = tokenRows[0]?.employerId
    if (!employerId) return []

    const data = await this.apiGet<{ items: HHVacancy[] }>(
      `/employers/${employerId}/vacancies?per_page=100`
    )
    return data.items ?? []
  }

  async publishVacancy(
    vacancyId: string,
    hhData: HHVacancyPayload
  ): Promise<{ hh_id: string }> {
    const result = await this.apiPost<{ id: string }>("/vacancies", hhData)
    return { hh_id: result.id }
  }

  async getApplications(hhVacancyId: string): Promise<HHApplication[]> {
    const data = await this.apiGet<{ items: HHApplication[] }>(
      `/vacancies/${hhVacancyId}/negotiations?per_page=100`
    )
    return data.items ?? []
  }

  async importApplications(vacancyId: string): Promise<{ imported: number }> {
    // Find hh_vacancy record
    const hhVacRow = await db
      .select()
      .from(hhVacancies)
      .where(eq(hhVacancies.localVacancyId, vacancyId))
      .limit(1)

    if (!hhVacRow[0]) return { imported: 0 }

    const applications = await this.getApplications(hhVacRow[0].hhVacancyId)
    let imported = 0

    for (const app of applications) {
      const resume = app.resume
      if (!resume?.id) continue

      // Check if already imported
      const existing = await db
        .select()
        .from(hhCandidates)
        .where(eq(hhCandidates.hhResumeId, resume.id))
        .limit(1)

      if (existing.length > 0) continue

      const fullName = [resume.first_name, resume.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "Кандидат с hh.ru"

      const phone = resume.contact?.find((c) => c.type?.id === "cell")?.value?.formatted ?? null
      const email = resume.contact?.find((c) => c.type?.id === "email")?.value?.email ?? null

      const newCandidate = await db.transaction(async (tx) => {
        const short = await generateCandidateShortId(tx, vacancyId)
        const [row] = await tx
          .insert(candidates)
          .values({
            vacancyId,
            name: fullName,
            phone,
            email,
            city: resume.area?.name ?? null,
            source: "hh",
            stage: "new",
            score: 50,
            salaryMin: resume.salary?.amount ?? null,
            salaryMax: resume.salary?.amount ?? null,
            experience: resume.total_experience
              ? `${Math.floor(resume.total_experience.months / 12)} лет`
              : null,
            skills: resume.skill_set ?? [],
            token: nanoid(32),
            shortId: short?.shortId ?? null,
            sequenceNumber: short?.sequenceNumber ?? null,
          })
          .returning()
        return row
      })

      await db.insert(hhCandidates).values({
        candidateId: newCandidate.id,
        hhResumeId: resume.id,
        hhApplicationId: app.id,
      })

      imported++
    }

    return { imported }
  }
}

// ─── Mock HH client for dev/no-token mode ────────────────────────────────────

export class HHMockClient {
  constructor(private companyId: string) {}

  async publishVacancy(
    _vacancyId: string,
    _hhData: HHVacancyPayload
  ): Promise<{ hh_id: string }> {
    return { hh_id: `mock-${Date.now()}` }
  }

  async importApplications(vacancyId: string): Promise<{ imported: number }> {
    const mockNames = [
      "Иван Петров",
      "Мария Сидорова",
      "Алексей Кузнецов",
    ]
    let imported = 0

    for (const name of mockNames) {
      const hhResumeId = `mock-resume-${nanoid(8)}`

      const newCandidate = await db.transaction(async (tx) => {
        const short = await generateCandidateShortId(tx, vacancyId)
        const [row] = await tx
          .insert(candidates)
          .values({
            vacancyId,
            name,
            phone: null,
            email: null,
            city: "Москва",
            source: "hh",
            stage: "new",
            score: Math.floor(Math.random() * 40) + 50,
            skills: [],
            token: nanoid(32),
            shortId: short?.shortId ?? null,
            sequenceNumber: short?.sequenceNumber ?? null,
          })
          .returning()
        return row
      })

      await db.insert(hhCandidates).values({
        candidateId: newCandidate.id,
        hhResumeId,
        hhApplicationId: null,
      })

      imported++
    }

    return { imported }
  }
}
