/**
 * Лёгкий первый проход LLM (fast tier) для определения продукта по транскрипту —
 * порт call-agent lib/product-detector.ts. Используется pipeline.ts перед выбором
 * скрипта (rop_sales_scripts).
 */
import { callWithTool } from "./ai-provider"

export interface ProductCandidate {
  code: string // "МП" / "МК"
  name: string // "Металлопрокат"
  keywords: string[] // признаки в речи
}

interface DetectResult {
  product_code: string // один из codes или "unknown"
}

export async function detectProduct(
  transcript: string,
  candidates: ProductCandidate[],
  opts: {
    companyId?: string
    callId?: string
    /**
     * Приоритетная подсказка: код продукта, закреплённый за менеджером звонка.
     * НЕ жёсткая привязка — AI склоняется к нему при прочих равных, но может
     * выбрать другой продукт если разговор явно о нём.
     */
    hintProduct?: string | null
  } = {}
): Promise<string | null> {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0].code
  if (!transcript || transcript.length < 30) return null

  const productsList = candidates.map((p) => `- ${p.code}: ${p.name}`).join("\n")

  const candidatesWithPhrases = candidates.filter((p) => p.keywords.length > 0)
  const keyPhrasesBlock = candidatesWithPhrases.length
    ? `\nПодсказки для определения типа (ключевые фразы из настроек):\n` +
      candidatesWithPhrases.map((p) => `- Скрипт "${p.code}": ${p.keywords.join(", ")}`).join("\n") +
      `\nЕсли в разговоре встречаются эти фразы или похожие по смыслу — выбирай соответствующий скрипт.\n`
    : ""

  const hint = (opts.hintProduct || "").trim()
  const hintCandidate = hint ? candidates.find((p) => p.code.toLowerCase() === hint.toLowerCase()) : undefined
  const hintBlock = hintCandidate
    ? `\nУ этого менеджера обычно продукт "${hintCandidate.code}" — при прочих равных склоняйся к нему. ` +
      `Но если разговор явно о другом продукте из списка — выбери правильный, не цепляйся за подсказку.\n`
    : ""

  const codes = candidates.map((p) => p.code)
  const snippet = transcript.length > 2000 ? transcript.slice(0, 2000) + "..." : transcript

  const schema = {
    type: "object",
    properties: {
      product_code: {
        type: "string",
        enum: [...codes, "unknown"],
        description: "Код продукта который обсуждался в звонке, или 'unknown' если непонятно",
      },
    },
    required: ["product_code"],
  }

  const system = "Ты классификатор B2B-звонков. Отвечаешь только через инструмент save_detection. Никаких лишних слов."
  const user = `Определи о каком продукте идёт речь в звонке. Возможные варианты:
${productsList}
${keyPhrasesBlock}${hintBlock}
Если разговор слишком короткий или непонятно — product_code='unknown'.
Если упоминаются оба продукта — верни тот о котором говорят больше.

Стенограмма:
"""
${snippet}
"""

Вызови save_detection с product_code.`

  try {
    const out = await callWithTool<DetectResult>({
      toolName: "save_detection",
      schema,
      system,
      user,
      modelTier: "fast",
      maxTokens: 100,
      companyId: opts.companyId,
      callId: opts.callId,
      action: "rop_detect_product",
    })
    const answer = (out.result.product_code || "").trim()
    if (!answer || answer.toLowerCase() === "unknown") {
      console.log(`[ai-rop/detect:${out.provider}:${out.model}] result="unknown" → null`)
      return null
    }
    const match = candidates.find((p) => p.code.toLowerCase() === answer.toLowerCase())
    console.log(`[ai-rop/detect:${out.provider}:${out.model}] result="${answer}" → ${match ? match.code : "null"}`)
    return match?.code ?? null
  } catch (e) {
    console.warn("[ai-rop/detect] failed:", (e as Error).message)
    return null
  }
}
