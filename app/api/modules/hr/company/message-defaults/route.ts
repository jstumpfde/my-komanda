import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { getPlatformMessageDefaults } from "@/lib/platform/settings"

// GET — платформенные дефолтные тексты (для placeholder «наследуется с платформы»
// в разделе «Сообщения» Настроек найма). Компанийный override хранится в
// hiring_defaults_json.messageDefaults и приходит через hiring-defaults GET.
export async function GET() {
  try {
    await requireCompany()
    return NextResponse.json({ platform: await getPlatformMessageDefaults() })
  } catch (err) {
    if (err instanceof Response) return err
    throw err
  }
}
