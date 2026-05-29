import { NextRequest } from "next/server"
import { scoreResumeRubric, type ScoringSpec } from "@/lib/scoring/rubric"
import { MARKETING_SPEC, SAMPLE_CANDIDATES } from "@/lib/scoring/sample-marketing"
import { apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/dev/score-rubric — прогнать все примеры через сид-спецификацию.
// Удобно для быстрой проверки движка одним запросом. Только не-прод.
export async function GET() {
  if (process.env.NODE_ENV === "production") return apiError("Not found", 404)
  try {
    const results = []
    for (const c of SAMPLE_CANDIDATES) {
      const r = await scoreResumeRubric(MARKETING_SPEC, c.resume)
      results.push({ candidate: c.label, total: r.total, verdict: r.verdict, knockoutHit: r.knockoutHit, summary: r.summary, cache: r.cache })
    }
    return apiSuccess({ results })
  } catch (e) {
    return apiError(`${e instanceof Error ? e.message : e}\n${e instanceof Error ? e.stack : ""}`, 500)
  }
}

// POST /api/dev/score-rubric — прототип рубричного скоринга (лаборатория).
// Body: { spec: ScoringSpec, resume: string, model?: string }
// Только не-прод: на проде отдаёт 404 (это инструмент демонстрации).
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return apiError("Not found", 404)
  }

  const body = await req.json().catch(() => ({}))
  const { spec, resume, model } = body as { spec?: ScoringSpec; resume?: string; model?: string }

  if (!spec || !Array.isArray(spec.criteria) || !spec.criteria.length) {
    return apiError("spec с критериями обязателен", 400)
  }
  if (!resume || !resume.trim()) {
    return apiError("resume обязателен", 400)
  }

  try {
    const result = await scoreResumeRubric(spec, resume, { model })
    return apiSuccess(result)
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Ошибка скоринга", 500)
  }
}
