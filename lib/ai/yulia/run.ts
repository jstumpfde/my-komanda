// Группа 28: вызов Claude Sonnet 4.6 для Юлии с поддержкой conversation
// history + tools. Возвращает текстовый ответ + опциональный pending_action
// (если модель решила вызвать инструмент).

import Anthropic from "@anthropic-ai/sdk"

import { getClaudeApiUrl } from "@/lib/claude-proxy"
import type { YuliaPendingAction } from "@/lib/db/schema"

import {
  YULIA_SYSTEM_PROMPT,
  YULIA_VACANCY_CREATION_TOOLS,
} from "./prompts"
import { AI_MODEL_MAIN } from "@/lib/ai/models"

const MODEL       = AI_MODEL_MAIN
const MAX_TOKENS  = 1500

let _client: Anthropic | null = null
function client(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey:  process.env.ANTHROPIC_API_KEY,
      baseURL: getClaudeApiUrl(),
    })
  }
  return _client
}

export interface YuliaTurn {
  role:    "user" | "assistant"
  content: string
}

export interface YuliaResponse {
  text:           string
  pendingAction?: YuliaPendingAction
}

// Запуск Юлии: история диалога + текущая фраза HR (последняя в history).
// Если модель вернула tool_use create_vacancy_draft — собираем pendingAction.
// Сам инструмент НЕ выполняется здесь — выполнение происходит в endpoint
// confirm-action только после явного подтверждения HR в UI.
export async function runYulia(history: YuliaTurn[]): Promise<YuliaResponse> {
  const resp = await client().messages.create({
    model:       MODEL,
    thinking: { type: "disabled" },
    max_tokens:  MAX_TOKENS,
    system:      YULIA_SYSTEM_PROMPT,
    tools:       YULIA_VACANCY_CREATION_TOOLS as unknown as Anthropic.Tool[],
    messages:    history.map(h => ({ role: h.role, content: h.content })),
  })

  let text = ""
  let pendingAction: YuliaPendingAction | undefined

  for (const block of resp.content) {
    if (block.type === "text") {
      text += block.text
    } else if (block.type === "tool_use") {
      if (block.name === "create_vacancy_draft") {
        pendingAction = {
          type:                  "create_vacancy_draft",
          params:                (block.input ?? {}) as Record<string, unknown>,
          requires_confirmation: true,
        }
      }
    }
  }

  // Если модель вернула только tool_use без текста — добавим короткое
  // подтверждение, чтобы UI было что показать рядом с карточкой действия.
  if (!text.trim() && pendingAction) {
    text = "Готово, проверьте параметры черновика ниже и подтвердите создание."
  }

  return { text: text.trim(), pendingAction }
}
