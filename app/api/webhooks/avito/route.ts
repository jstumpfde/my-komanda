// POST /api/webhooks/avito — приём входящих webhook-апдейтов от Авито.
//
// Авито Messenger API отправляет POST с JSON при новом сообщении/событии чата.
// Регистрация вебхука: POST https://api.avito.ru/messenger/v1/webhooks
// Документация: https://developers.avito.ru/api/messenger#webhook
//
// ─── Авторизация ─────────────────────────────────────────────────────────────
// Авито подписывает тело запроса SHA-256 HMAC ключом из авторизации приложения.
// Пока авторизации по подписи нет — используем env AVITO_WEBHOOK_SECRET как
// Bearer-токен в заголовке Authorization: Bearer {AVITO_WEBHOOK_SECRET}.
//
// ⚠️ УТОЧНИТЬ по документации Авито:
//   1. Точный заголовок/схему авторизации (HMAC-подпись или Bearer).
//   2. Формат поля user_id в payload (числовой vs строковый).
//   3. Поле для идентификации тенанта (по userId из интеграции).
//
// ─── Привязка к кандидату/лиду ───────────────────────────────────────────────
// TODO: реализовать поиск тенанта по user_id из payload → avito_integrations.user_id.
// Затем маршрутизировать входящее в pipeline аналогично hh/scan-incoming:
//   - найти кандидата по chat_id (аналог hhResponseId)
//   - классифицировать сообщение
//   - запустить chatbot / стоп-слова / дожим
// Сейчас: парсим, логируем, отвечаем 200 (Авито ждёт 200 иначе повторяет).

import { NextRequest, NextResponse } from "next/server"
import { avitoAdapter } from "@/lib/channels/avito"

// Секрет для простой авторизации webhook-запросов от Авито.
// Значение задаётся в env AVITO_WEBHOOK_SECRET.
// При регистрации вебхука передаётся Авито как auth_token.
const WEBHOOK_SECRET = process.env.AVITO_WEBHOOK_SECRET

export async function POST(req: NextRequest) {
  // ─── Авторизация ────────────────────────────────────────────────────────────
  // Авито передаёт секрет в заголовке Authorization: Bearer {secret}
  // (уточнить по документации; схема может отличаться для HMAC-подписи).
  if (WEBHOOK_SECRET) {
    const authHeader = req.headers.get("authorization") ?? ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader
    if (token !== WEBHOOK_SECRET) {
      console.warn("[webhook:avito] неверный Authorization заголовок")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  } else {
    // Если секрет не задан — принимаем без проверки (небезопасно, только для разработки).
    console.warn(
      "[webhook:avito] AVITO_WEBHOOK_SECRET не задан — вебхук принимается без авторизации",
    )
  }

  // ─── Парсинг тела ───────────────────────────────────────────────────────────
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    console.warn("[webhook:avito] не удалось распарсить JSON body")
    return NextResponse.json({ error: "Bad Request" }, { status: 400 })
  }

  // ─── Разбор сообщений через адаптер ────────────────────────────────────────
  const messages = avitoAdapter.parseInbound(payload)

  if (messages.length === 0) {
    // Служебный апдейт (read, typing и т.п.) — принимаем и игнорируем.
    return NextResponse.json({ ok: true, skipped: true })
  }

  // ─── Маршрутизация входящих ─────────────────────────────────────────────────
  // TODO: реализовать полную привязку к кандидату/лиду:
  //   1. По messages[0].toAccount найти компанию через avito_integrations.user_id
  //   2. По messages[0].from найти кандидата/лид (chat_id)
  //   3. Передать в pipeline аналогично hh/scan-incoming
  //
  // Пример (раскомментировать после реализации pipeline):
  //
  // for (const msg of messages) {
  //   await processAvitoInbound(msg)
  // }
  //
  // Пока: логируем входящее для отладки.
  console.info(
    `[webhook:avito] получено ${messages.length} сообщений:`,
    messages.map(m => ({
      from: m.from,
      toAccount: m.toAccount,
      textPreview: m.text.slice(0, 80),
    })),
  )

  // Авито ждёт HTTP 200 в течение нескольких секунд.
  // Если ответить 5xx или не ответить — Авито повторит запрос.
  return NextResponse.json({ ok: true, received: messages.length })
}
