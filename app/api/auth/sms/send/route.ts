import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { smsCodes } from "@/lib/db/schema"
import { eq, and, gt, count } from "drizzle-orm"

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { phone?: string }
    const rawPhone = body.phone ?? ""

    // Оставляем только цифры
    const digits = rawPhone.replace(/\D/g, "")

    if (digits.length !== 11) {
      return NextResponse.json({ error: "Введите корректный номер телефона (11 цифр)" }, { status: 400 })
    }

    const phone = digits

    // Проверка rate-limit: не более 3 активных кодов за последние 5 минут
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
    const [{ value: activeCount }] = await db
      .select({ value: count() })
      .from(smsCodes)
      .where(
        and(
          eq(smsCodes.phone, phone),
          eq(smsCodes.used, false),
          gt(smsCodes.expiresAt, fiveMinAgo),
        ),
      )

    if (Number(activeCount) >= 3) {
      return NextResponse.json(
        { error: "Слишком много попыток. Подождите 5 минут." },
        { status: 429 },
      )
    }

    const code = generateCode()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // +5 минут

    await db.insert(smsCodes).values({ phone, code, expiresAt })

    // Отправка через SMS.ru
    const apiKey = process.env.SMSRU_API_KEY
    if (apiKey) {
      const smsUrl = `https://sms.ru/sms/send?api_id=${apiKey}&to=${phone}&msg=${encodeURIComponent(`Ваш код входа my-komanda: ${code}`)}&json=1`
      const smsRes = await fetch(smsUrl)
      const smsData = await smsRes.json() as { status?: string; status_code?: number }
      if (smsData.status !== "OK") {
        console.error("SMS.ru error:", smsData)
        // Не блокируем — в dev-режиме ключ может отсутствовать
      }
    } else {
      // В разработке выводим код в консоль
      console.log(`[DEV] SMS код для ${phone}: ${code}`)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("SMS send error:", err)
    return NextResponse.json({ error: "Ошибка отправки SMS" }, { status: 500 })
  }
}
