import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { getPlatformDripTemplates } from "@/lib/platform/settings"

// GET — платформенные drip-шаблоны (для конструктора воронки: генерация
// дефолтных цепочек касаний из редактируемого эталона, а не из хардкода).
export async function GET() {
  try {
    await requireCompany()
    return NextResponse.json({ templates: await getPlatformDripTemplates() })
  } catch (err) {
    if (err instanceof Response) return err
    throw err
  }
}
