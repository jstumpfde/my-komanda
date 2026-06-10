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
//
// ─── Маршрутизация ───────────────────────────────────────────────────────────
// По payload.toAccount/user_id → avito_integrations.user_id → компания.
// По chat_id → найти/создать кандидата (surveyResponses.avitoChatId временно).
// Далее — pipeline: стоп-слова → AI чат-бот → classifyCandidateResponse.
// Полный алгоритм — lib/avito/scan-incoming.ts (аналогия с lib/hh/scan-incoming.ts).
//
// ─── Важно ───────────────────────────────────────────────────────────────────
// Авито ждёт HTTP 200 в течение ~5 секунд. Если не ответить — повторит запрос.
// Поэтому отвечаем 200 немедленно, а тяжёлую обработку запускаем асинхронно
// (fire-and-forget через void, ошибки логируются внутри processAvitoInbound).

import { NextRequest, NextResponse } from "next/server"
import { avitoAdapter } from "@/lib/channels/avito"
import { processAvitoInbound, type AvitoInboundMessage } from "@/lib/avito/scan-incoming"

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
  const messages = avitoAdapter.parseInbound(payload) as AvitoInboundMessage[]

  if (messages.length === 0) {
    // Служебный апдейт (read, typing и т.п.) — принимаем и игнорируем.
    return NextResponse.json({ ok: true, skipped: true })
  }

  // ─── Маршрутизация входящих ──────────────────────────────────────────────────
  // Отвечаем 200 сразу, обработку запускаем асинхронно (fire-and-forget).
  // Авито не ждёт результата обработки — только подтверждение получения.
  const dummyResult = { processed: 0, newCandidates: 0, rejectedRegex: 0, rejectedAi: 0, wantsContact: 0, errors: [] as string[] }
  void Promise.allSettled(
    messages.map(msg =>
      processAvitoInbound(msg, dummyResult).catch(err =>
        console.error("[webhook:avito] processAvitoInbound error:", err instanceof Error ? err.message : err),
      ),
    ),
  )

  // Авито ждёт HTTP 200 в течение нескольких секунд.
  return NextResponse.json({ ok: true, received: messages.length })
}
