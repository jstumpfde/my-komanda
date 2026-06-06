import { readFileSync } from "fs"
import { join } from "path"
import Anthropic from "@anthropic-ai/sdk"
import { getClaudeApiUrl } from "@/lib/claude-proxy"

// Ключ из окружения; в dev — фолбэк на .env.local (дев-сервер мог стартовать
// до появления ключа). В проде process.env всегда заполнен → файл не читаем.
function resolveApiKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  if (process.env.NODE_ENV !== "production") {
    try {
      const env = readFileSync(join(process.cwd(), ".env.local"), "utf8")
      const m = env.match(/^ANTHROPIC_API_KEY=(.+)$/m)
      if (m) return m[1].trim().replace(/^["']|["']$/g, "")
    } catch { /* ignore */ }
  }
  return undefined
}

export function getScoringClient(): Anthropic {
  // baseURL = прокси (CLAUDE_PROXY_URL), как и остальной AI-код: прод ходит в
  // Claude только через прокси, прямой api.anthropic.com недоступен.
  return new Anthropic({ apiKey: resolveApiKey(), baseURL: getClaudeApiUrl() })
}
