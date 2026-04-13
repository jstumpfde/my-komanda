/**
 * Send a webhook notification. Fire-and-forget.
 */
export async function sendWebhook(url: string, event: string, data: Record<string, unknown>) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), data }),
      signal: controller.signal,
    })

    clearTimeout(timeout)
  } catch (err) {
    console.error("[webhook] send error:", err instanceof Error ? err.message : err)
  }
}
