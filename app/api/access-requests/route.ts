import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { accessRequests } from "@/lib/db/schema"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, phone, companyName, comment } = body

    if (!name?.trim()) return NextResponse.json({ error: "Укажите имя" }, { status: 400 })
    if (!email?.trim()) return NextResponse.json({ error: "Укажите email" }, { status: 400 })

    const [request] = await db.insert(accessRequests).values({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      companyName: companyName?.trim() || null,
      comment: comment?.trim() || null,
    }).returning()

    return NextResponse.json({ ok: true, id: request.id }, { status: 201 })
  } catch (error) {
    console.error("Access request error:", error)
    return NextResponse.json({ error: "Ошибка при отправке заявки" }, { status: 500 })
  }
}
