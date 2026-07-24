// Триаж text-only взаимодействий (email/chat) ПЕРЕД полным AI-анализом.
//
// Зачем: Bitrix DIRECTION у email ненадёжен (у Орлинка ВСЕ 1012 писем, включая
// исходящие письма самой компании, помечены direction=in) — поэтому решаем по
// содержимому. Входящий спам/КП третьих сторон, где наш менеджер вообще не
// участвовал, полного анализа не заслуживает: coaching_tips по чужой рассылке
// бессмысленны (инцидент 24.07 — совет менеджеру Орлинка по спаму «Доставка из
// Китая»), а каждый такой прогон стоит ~12k токенов premium-модели.
//
// Дешёвый вызов fast-модели (~600 токенов на обрезанном тексте) против ~12k
// полного анализа — на спаме экономит ~95%. Fail-open: любая ошибка триажа →
// 'dialogue' (полный анализ идёт как раньше, взаимодействие не теряем).
import { callWithTool } from "./ai-provider"

export type TextTriageKind =
  | "manager_written" // текст написан НАШИМ менеджером (исходящее письмо/КП компании)
  | "inbound_no_manager" // входящее от третьей стороны (спам/рассылка/чужое КП), менеджер не участвовал
  | "dialogue" // есть реплики обеих сторон — обычный анализ

export interface TextTriageResult {
  kind: TextTriageKind
  confidence: number
  reason: string
}

const TRIAGE_SCHEMA = {
  type: "object" as const,
  properties: {
    kind: {
      type: "string",
      enum: ["manager_written", "inbound_no_manager", "dialogue"],
      description:
        "manager_written — текст целиком написан менеджером нашей компании (исходящее письмо, КП, follow-up). " +
        "inbound_no_manager — текст целиком от внешнего отправителя (входящий спам, чужое КП, рассылка, уведомление), наш менеджер не написал ни слова. " +
        "dialogue — видны реплики обеих сторон (переписка).",
    },
    confidence: { type: "number", description: "Уверенность 0..1." },
    reason: { type: "string", description: "Одна короткая фраза-обоснование." },
  },
  required: ["kind", "confidence", "reason"],
}

/** Обрезка: триажу хватает начала и конца (подпись/реквизиты отправителя). */
function truncateForTriage(text: string): string {
  const t = text.trim()
  if (t.length <= 2000) return t
  return `${t.slice(0, 1500)}\n[…текст сокращён…]\n${t.slice(-500)}`
}

export async function triageTextInteraction(args: {
  text: string
  interactionType: "chat" | "email" | "meeting"
  /** Глоссарий компании (rop_settings.glossary) — чтобы модель знала, кто «мы». */
  glossary?: string | null
  companyId?: string
  callId?: string | null
  modelOverride?: string | null
}): Promise<TextTriageResult> {
  const glossaryText = (args.glossary ?? "").trim()
  try {
    const out = await callWithTool<TextTriageResult>({
      toolName: "save_triage",
      schema: TRIAGE_SCHEMA,
      system:
        "Ты классифицируешь деловую переписку отдела продаж. Определи, кто автор текста относительно НАШЕЙ компании. " +
        "Признаки inbound_no_manager: отправитель представляется другой компанией и продаёт/предлагает НАМ свои услуги, массовая рассылка, чужое коммерческое предложение, автоуведомление. " +
        "Признаки manager_written: автор пишет от лица нашей компании клиенту. " +
        "Направление в CRM ненадёжно — решай только по содержимому.",
      user: `${glossaryText ? `НАША компания (глоссарий): ${glossaryText}\n\n` : ""}Тип: ${args.interactionType}.\n\nТекст:\n"""\n${truncateForTriage(args.text)}\n"""\n\nВызови save_triage.`,
      modelTier: "fast",
      maxTokens: 300,
      companyId: args.companyId,
      callId: args.callId,
      action: "rop_triage",
      modelOverride: args.modelOverride,
    })
    const r = out.result
    if (!r?.kind) return { kind: "dialogue", confidence: 0, reason: "пустой ответ триажа" }
    return { kind: r.kind, confidence: r.confidence ?? 0, reason: r.reason ?? "" }
  } catch (e) {
    console.warn(`[ai-rop/text-triage] ошибка триажа (${(e as Error).message}) — fail-open, идём в полный анализ`)
    return { kind: "dialogue", confidence: 0, reason: "триаж недоступен" }
  }
}
