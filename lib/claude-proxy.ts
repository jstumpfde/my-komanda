// Claude API base URL с поддержкой нескольких proxy с fallback.
//
// В RU прямой доступ к api.anthropic.com c прод-серверов часто заблокирован.
// Деплоим Cloudflare Worker (или несколько), которые reverse-proxy на
// api.anthropic.com и кладут x-api-key из env. Серверный код использует:
//
//   • getClaudeApiUrl() / getClaudeMessagesUrl() — для Anthropic SDK
//     (передаётся как baseURL). SDK сам делает fetch.
//   • fetchClaudeMessages(init) — для прямого fetch'а /v1/messages с
//     автоматическим fallback'ом по списку CLAUDE_PROXY_URLS, если основной
//     proxy упал (5xx, 403, network error). Так живёт hh-импорт даже когда
//     один из worker'ов сломан.
//
// Env:
//   CLAUDE_PROXY_URL      — основной proxy (для совместимости со старым кодом)
//   CLAUDE_PROXY_URLS     — список через запятую: «https://a, https://b, …»
//                            (если задан — имеет приоритет над CLAUDE_PROXY_URL)
//
// Если ни одна из переменных не задана — используется api.anthropic.com напрямую.

const DEFAULT_CLAUDE_API_URL = "https://api.anthropic.com"

function normalize(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url
}

// Возвращает упорядоченный список баз для запросов: сначала из
// CLAUDE_PROXY_URLS (через запятую), потом CLAUDE_PROXY_URL, потом дефолт.
// Дубли удаляются с сохранением порядка.
export function getClaudeApiUrls(): string[] {
  const urls: string[] = []

  const list = process.env.CLAUDE_PROXY_URLS
  if (list) {
    for (const raw of list.split(",")) {
      const u = raw.trim()
      if (u) urls.push(normalize(u))
    }
  }

  const single = process.env.CLAUDE_PROXY_URL
  if (single) urls.push(normalize(single))

  // Прямой fallback на api.anthropic.com — попробуем после proxy'ев.
  // С RU-серверов часто не работает, но иногда (новые IP, route rotation)
  // спасает; стоимость попытки — одна несвязанная сеть.
  urls.push(DEFAULT_CLAUDE_API_URL)

  // Уникализация с сохранением порядка
  const seen = new Set<string>()
  return urls.filter(u => (seen.has(u) ? false : (seen.add(u), true)))
}

// Первый URL — основной (используется Anthropic SDK).
export const getClaudeApiUrl = (): string => getClaudeApiUrls()[0]

export const getClaudeMessagesUrl = (): string =>
  `${getClaudeApiUrl()}/v1/messages`

// Признак ошибки, на которую стоит fallback'нуть на следующий proxy:
// network errors, 502/503/504, 403 (worker отказывает в обслуживании).
function isProxyFailure(res: Response | null, err: unknown): boolean {
  if (err) return true
  if (!res) return true
  if (res.status === 0) return true
  if (res.status === 403) return true       // worker деплой/allowlist сломан
  if (res.status === 502) return true       // bad gateway (cf worker → upstream)
  if (res.status === 503) return true       // service unavailable
  if (res.status === 504) return true       // gateway timeout
  return false
}

export interface FetchClaudeOptions {
  body:    BodyInit
  headers: HeadersInit
  signal?: AbortSignal
}

export interface FetchClaudeResult {
  response: Response
  /** Какой URL по факту отдал ответ (для логов и метрик). */
  via:      string
  /** Все попытки, кроме успешной, в порядке выполнения. */
  failures: Array<{ url: string; status?: number; error?: string }>
}

// POST /v1/messages с авто-fallback по getClaudeApiUrls(). Возвращает первый
// удачный ответ (status < 500 и !== 403). Если все proxy упали — возвращает
// последний Response (или throw'ит ошибку, если ни один fetch не дошёл).
//
// Используется hh-импортом и другими server-route'ами, которые делают
// прямой fetch (не через SDK). SDK-маршруты получают только основной URL
// через getClaudeApiUrl(); переключение между proxy у SDK нет — это плата
// за стримы и tool-use, которые fallback-helper не покроет без переписывания.
export async function fetchClaudeMessages(
  opts: FetchClaudeOptions,
): Promise<FetchClaudeResult> {
  const urls = getClaudeApiUrls()
  const failures: FetchClaudeResult["failures"] = []
  let lastResp: Response | null = null

  for (const base of urls) {
    const target = `${base}/v1/messages`
    try {
      const r = await fetch(target, {
        method:  "POST",
        body:    opts.body,
        headers: opts.headers,
        signal:  opts.signal,
      })
      lastResp = r
      if (!isProxyFailure(r, null)) {
        return { response: r, via: base, failures }
      }
      failures.push({ url: base, status: r.status })
      // Не дочитываем body, чтобы не блокировать — Response утечёт, но это GC.
    } catch (err) {
      failures.push({ url: base, error: err instanceof Error ? err.message : String(err) })
    }
  }

  // Все попытки завершились proxy-failure. Вернём последний полученный
  // Response (если был) — у вызывающего будет возможность прочитать body.
  if (lastResp) {
    return { response: lastResp, via: urls[urls.length - 1], failures: failures.slice(0, -1) }
  }
  // Сетевая катастрофа — никто не ответил вообще.
  throw new Error(
    `All Claude proxies failed: ${failures.map(f => `${f.url} (${f.status ?? f.error})`).join("; ")}`,
  )
}
