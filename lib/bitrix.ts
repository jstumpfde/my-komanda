/**
 * Send candidate data to Bitrix24 via incoming webhook.
 * Fire-and-forget.
 */
export async function sendToBitrix(webhookUrl: string, candidateData: {
  name: string
  phone?: string
  email?: string
  vacancyTitle?: string
  aiScore?: number
}) {
  try {
    const [firstName, ...lastParts] = candidateData.name.split(" ")
    const lastName = lastParts.join(" ")

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    // Create lead in Bitrix24
    await fetch(`${webhookUrl}/crm.lead.add.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          TITLE: `Кандидат: ${candidateData.name} — ${candidateData.vacancyTitle || "вакансия"}`,
          NAME: firstName,
          LAST_NAME: lastName || undefined,
          PHONE: candidateData.phone ? [{ VALUE: candidateData.phone, VALUE_TYPE: "WORK" }] : undefined,
          EMAIL: candidateData.email ? [{ VALUE: candidateData.email, VALUE_TYPE: "WORK" }] : undefined,
          COMMENTS: `AI-скор: ${candidateData.aiScore ?? "не определён"}`,
          SOURCE_ID: "WEB",
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)
  } catch (err) {
    console.error("[bitrix] send error:", err instanceof Error ? err.message : err)
  }
}
