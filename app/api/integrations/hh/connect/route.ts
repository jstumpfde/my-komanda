import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getAuthUrl } from "@/lib/hh-api"

export async function GET() {
  const session = await auth()
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const state = Buffer.from(JSON.stringify({
    companyId: session.user.companyId,
    userId: session.user.id,
  })).toString("base64url")

  const url = getAuthUrl(state)
  return NextResponse.redirect(url)
}
