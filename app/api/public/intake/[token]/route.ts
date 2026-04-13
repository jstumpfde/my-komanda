import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancyIntakeLinks, vacancyIntakes, companies } from "@/lib/db/schema"

// GET — validate token and return company info
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    const [link] = await db
      .select({
        id: vacancyIntakeLinks.id,
        tenantId: vacancyIntakeLinks.tenantId,
        status: vacancyIntakeLinks.status,
        expiresAt: vacancyIntakeLinks.expiresAt,
        password: vacancyIntakeLinks.password,
        reusable: vacancyIntakeLinks.reusable,
      })
      .from(vacancyIntakeLinks)
      .where(eq(vacancyIntakeLinks.token, token))
      .limit(1)

    if (!link) {
      return NextResponse.json({ error: "Ссылка не найдена" }, { status: 404 })
    }

    if (link.status === "expired" || (link.expiresAt && new Date(link.expiresAt) < new Date())) {
      return NextResponse.json({ error: "Ссылка истекла" }, { status: 410 })
    }

    if (link.status === "used" && !link.reusable) {
      return NextResponse.json({ error: "Ссылка уже использована" }, { status: 410 })
    }

    // Get company info for branding
    const [company] = await db
      .select({ name: companies.name, logoUrl: companies.logoUrl })
      .from(companies)
      .where(eq(companies.id, link.tenantId))
      .limit(1)

    return NextResponse.json({
      valid: true,
      hasPassword: !!link.password,
      companyName: company?.name || "Компания",
      companyLogo: company?.logoUrl || null,
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST — submit intake form
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = (await req.json()) as { password?: string; data: Record<string, unknown>; files?: unknown[] }

    const [link] = await db
      .select()
      .from(vacancyIntakeLinks)
      .where(eq(vacancyIntakeLinks.token, token))
      .limit(1)

    if (!link) {
      return NextResponse.json({ error: "Ссылка не найдена" }, { status: 404 })
    }

    if (link.status === "expired" || (link.expiresAt && new Date(link.expiresAt) < new Date())) {
      return NextResponse.json({ error: "Ссылка истекла" }, { status: 410 })
    }

    if (link.status === "used" && !link.reusable) {
      return NextResponse.json({ error: "Ссылка уже использована" }, { status: 410 })
    }

    // Check password
    if (link.password && body.password !== link.password) {
      return NextResponse.json({ error: "Неверный пароль" }, { status: 403 })
    }

    // Save intake
    const [intake] = await db
      .insert(vacancyIntakes)
      .values({
        tenantId: link.tenantId,
        linkId: link.id,
        data: body.data,
        files: body.files || [],
        status: "new",
      })
      .returning()

    // Mark link as used (if not reusable)
    if (!link.reusable) {
      await db
        .update(vacancyIntakeLinks)
        .set({ status: "used" })
        .where(eq(vacancyIntakeLinks.id, link.id))
    }

    return NextResponse.json({ success: true, id: intake.id }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
