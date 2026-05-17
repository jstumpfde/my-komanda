import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { saveCandidatePhoto } from "@/lib/hh/save-candidate-photo"

// POST /api/modules/hr/candidates/[id]/save-photo
// body: { photoUrl: string }
//
// Opportunistic backfill: фронт зовёт когда <img src=hh-URL> успешно
// загрузился (onLoad). Раз браузер сумел — подпись ?t&h ещё жива и
// сервер тоже скачает 200. Качаем тем же URL в /uploads/{id}/photo.jpg
// и подменяем в БД, чтобы следующая загрузка взяла локальный путь и
// не зависела от срока жизни подписи.
//
// Защиты:
//  • requireCompany — должен быть залогинен
//  • кандидат должен принадлежать компании пользователя (join по vacancy)
//  • SSRF: photoUrl должен начинаться с https://img.hhcdn.ru/
//  • идемпотентно: если в БД уже /uploads/... — возвращаем 200 без работы
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = (await req.json().catch(() => ({}))) as { photoUrl?: unknown }
    const photoUrl = typeof body.photoUrl === "string" ? body.photoUrl.trim() : ""
    if (!photoUrl) return apiError("photoUrl обязателен", 400)
    if (!photoUrl.startsWith("https://img.hhcdn.ru/")) {
      return apiError("photoUrl должен начинаться с https://img.hhcdn.ru/", 400)
    }

    const [row] = await db
      .select({ photoUrl: candidates.photoUrl })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!row) return apiError("Candidate not found", 404)

    if (row.photoUrl?.startsWith("/uploads/")) {
      return apiSuccess({ localUrl: row.photoUrl, alreadyLocal: true })
    }

    const local = await saveCandidatePhoto(id, photoUrl)
    if (!local) return apiError("Не удалось скачать фото", 502)

    await db.update(candidates).set({ photoUrl: local }).where(eq(candidates.id, id))
    return apiSuccess({ localUrl: local })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[save-photo POST]", err)
    return apiError("Internal server error", 500)
  }
}
