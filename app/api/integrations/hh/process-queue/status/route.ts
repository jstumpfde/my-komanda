import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhProcessJobs } from "@/lib/db/schema"

// GET /api/integrations/hh/process-queue/status?jobId=...
//
// Возвращает текущее состояние job'а из hh_process_jobs. UI polling раз
// в 2 сек до перехода status'а в completed/failed/stopped.
//
// Изоляция: проверяем что job принадлежит company пользователя — иначе 404
// (не отдаём 403 чтобы не светить факт существования job'а чужой компании).
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get("jobId")
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 })

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(jobId)) return NextResponse.json({ error: "Bad jobId" }, { status: 400 })

  const [job] = await db
    .select()
    .from(hhProcessJobs)
    .where(and(
      eq(hhProcessJobs.id, jobId),
      eq(hhProcessJobs.companyId, session.user.companyId),
    ))
    .limit(1)

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 })

  return NextResponse.json({
    jobId:            job.id,
    status:           job.status,
    processed:        job.processed,
    invited:          job.invited,
    rejected:         job.rejected,
    kept:             job.kept,
    deferredOffHours: job.deferredOffHours,
    results:          job.results,
    error:            job.error,
    createdAt:        job.createdAt,
    startedAt:        job.startedAt,
    finishedAt:       job.finishedAt,
  })
}
