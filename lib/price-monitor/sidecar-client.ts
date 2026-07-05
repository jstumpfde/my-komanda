// HTTP-клиент сайдкара сбора цен (pyairbnb на зарубежном VPS).
// Airbnb недоступен с российских IP и защищён анти-ботом, поэтому сами запросы
// к площадке выполняет сайдкар; здесь — только вызовы его API по секретному ключу.

const DEFAULT_TIMEOUT_MS = 120_000

export class SidecarError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = "SidecarError"
  }
}

function sidecarConfig(): { baseUrl: string; key: string } {
  const baseUrl = process.env.PRICE_MONITOR_SIDECAR_URL
  const key = process.env.PRICE_MONITOR_SIDECAR_KEY
  if (!baseUrl || !key) {
    throw new SidecarError(
      "PRICE_MONITOR_SIDECAR_URL / PRICE_MONITOR_SIDECAR_KEY не заданы в env",
    )
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), key }
}

export async function sidecarPost<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const { baseUrl, key } = sidecarConfig()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PM-Key": key,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new SidecarError(
        `Сайдкар ответил ${res.status} на ${path}: ${text.slice(0, 300)}`,
        res.status,
      )
    }
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof SidecarError) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new SidecarError(`Сайдкар недоступен (${path}): ${message}`)
  } finally {
    clearTimeout(timer)
  }
}

export async function sidecarHealth(): Promise<boolean> {
  try {
    const { baseUrl } = sidecarConfig()
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(10_000) })
    return res.ok
  } catch {
    return false
  }
}
