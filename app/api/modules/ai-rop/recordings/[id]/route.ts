// GET /api/modules/ai-rop/recordings/[id] — стрим аудиозаписи звонка для плеера.
//
// [id] — id звонка (rop_calls.id), НЕ путь к файлу — путь на диске никогда не
// приходит от клиента (защита от path traversal). Файл достаётся из БД
// (recordingPath) и дополнительно проверяется, что он лежит внутри
// ROP_RECORDINGS_DIR (звонки не хранятся в public/, см. план п.8).
import fs from "fs"
import path from "path"
import { Readable } from "stream"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { ropCanViewTeam, ropManagerScope } from "@/lib/ai-rop/access"
import { ropCallsScope, type RopScope } from "@/lib/ai-rop/rls"

const RECORDINGS_ROOT = process.env.ROP_RECORDINGS_DIR
  ? path.resolve(process.env.ROP_RECORDINGS_DIR)
  : path.join(process.cwd(), "storage", "rop-recordings")

const MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".opus": "audio/ogg",
  ".webm": "audio/webm",
  ".aac": "audio/aac",
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    if (!id) return new Response("bad id", { status: 400 })

    const scope: RopScope = {
      companyId: user.companyId,
      isTeamViewer: ropCanViewTeam(user),
      bitrixManagerId: null,
    }
    if (!scope.isTeamViewer) scope.bitrixManagerId = await ropManagerScope(user)

    const [row] = await db
      .select({ recordingPath: ropCalls.recordingPath })
      .from(ropCalls)
      .where(and(eq(ropCalls.id, id), ropCallsScope(scope)))
      .limit(1)
    if (!row) return new Response("not found", { status: 404 })

    const recordingPath = row.recordingPath
    if (!recordingPath) return new Response("recording not found", { status: 404 })

    // Защита от path traversal: резолвим и проверяем что итоговый путь всё ещё
    // внутри RECORDINGS_ROOT — на случай испорченной/старой записи в БД.
    const resolved = path.resolve(recordingPath)
    if (!resolved.startsWith(RECORDINGS_ROOT + path.sep) && resolved !== RECORDINGS_ROOT) {
      console.error(`[ai-rop/recordings] path outside RECORDINGS_ROOT: ${resolved}`)
      return new Response("recording not found", { status: 404 })
    }
    if (!fs.existsSync(resolved)) return new Response("recording not found", { status: 404 })

    const ext = path.extname(resolved).toLowerCase()
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream"
    const nodeStream = fs.createReadStream(resolved)
    const webStream = Readable.toWeb(nodeStream) as ReadableStream

    return new Response(webStream, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/recordings/:id] error:", err)
    return new Response("Internal server error", { status: 500 })
  }
}
