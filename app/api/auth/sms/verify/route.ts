import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { smsCodes, users } from "@/lib/db/schema"
import { eq, and, gt, desc } from "drizzle-orm"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { phone?: string; code?: string }
    const rawPhone = body.phone ?? ""
    const inputCode = (body.code ?? "").trim()

    const digits = rawPhone.replace(/\D/g, "")

    if (digits.length !== 11 || !inputCode) {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 })
    }

    const phone = digits
    const now = new Date()

    // Найти последний неиспользованный актуальный код
    const [smsRecord] = await db
      .select()
      .from(smsCodes)
      .where(
        and(
          eq(smsCodes.phone, phone),
          eq(smsCodes.used, false),
          gt(smsCodes.expiresAt, now),
        ),
      )
      .orderBy(desc(smsCodes.createdAt))
      .limit(1)

    if (!smsRecord) {
      return NextResponse.json({ error: "Код не найден или истёк. Запросите новый." }, { status: 400 })
    }

    // Увеличить счётчик попыток
    const newAttempts = (smsRecord.attempts ?? 0) + 1

    if (newAttempts >= 3 && smsRecord.code !== inputCode) {
      // Заблокировать код после 3 неудачных попыток
      await db
        .update(smsCodes)
        .set({ used: true, attempts: newAttempts })
        .where(eq(smsCodes.id, smsRecord.id))
      return NextResponse.json({ error: "Слишком много неверных попыток. Запросите новый код." }, { status: 400 })
    }

    if (smsRecord.code !== inputCode) {
      await db
        .update(smsCodes)
        .set({ attempts: newAttempts })
        .where(eq(smsCodes.id, smsRecord.id))
      return NextResponse.json({ error: "Неверный код" }, { status: 400 })
    }

    // Код верный — пометить как использованный
    await db
      .update(smsCodes)
      .set({ used: true, attempts: newAttempts })
      .where(eq(smsCodes.id, smsRecord.id))

    // Найти или создать пользователя по номеру телефона
    // Ищем по phone (если добавлено поле) или по email-подобному идентификатору
    // Так как в users нет поля phone, используем email = phone@sms.mykomanda.ru как fallback
    const syntheticEmail = `${phone}@sms.mykomanda.ru`

    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, syntheticEmail))
      .limit(1)

    if (!user) {
      const [newUser] = await db
        .insert(users)
        .values({
          email: syntheticEmail,
          name: `+${phone}`,
          passwordHash: "", // нет пароля — только SMS-вход
          role: "director",
        })
        .returning()
      user = newUser
    }

    return NextResponse.json({ ok: true, userId: user.id })
  } catch (err) {
    console.error("SMS verify error:", err)
    return NextResponse.json({ error: "Ошибка проверки кода" }, { status: 500 })
  }
}
