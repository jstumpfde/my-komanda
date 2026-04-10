import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"

export async function GET() {
  try {
    await requireCompany()
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return NextResponse.json({ error: "API ключ не настроен" }, { status: 500 })
  }

  return NextResponse.json({ key })
}
