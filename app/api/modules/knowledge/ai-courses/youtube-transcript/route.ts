import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  try { await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const url = req.nextUrl.searchParams.get("url")
  if (!url) return NextResponse.json({ error: "URL обязателен" }, { status: 400 })

  try {
    const { YoutubeTranscript } = await import("youtube-transcript")
    const transcript = await YoutubeTranscript.fetchTranscript(url)
    const text = transcript.map((t: { text: string }) => t.text).join(" ")

    // Extract video ID for title
    const match = url.match(/(?:v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/)
    const videoId = match?.[1] ?? "video"

    return NextResponse.json({
      title: `YouTube: ${videoId}`,
      transcript: text,
      duration: `${Math.ceil(text.split(" ").length / 150)} мин чтения`,
      wordCount: text.split(/\s+/).length,
    })
  } catch (e) {
    console.error("YouTube transcript error:", e)
    return NextResponse.json({ error: "Не удалось извлечь субтитры. Возможно, видео не имеет субтитров." }, { status: 422 })
  }
}
