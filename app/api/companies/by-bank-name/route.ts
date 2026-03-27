import { NextRequest } from "next/server"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

const DADATA_BANK_SUGGEST_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/bank"

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const query = req.nextUrl.searchParams.get("q")
    if (!query) return apiError("Missing 'q' query parameter", 400)

    const token = process.env.DADATA_TOKEN
    if (!token) return apiError("DaData token not configured", 500)

    const response = await fetch(DADATA_BANK_SUGGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${token}`,
      },
      body: JSON.stringify({ query, count: 5 }),
    })

    if (!response.ok) return apiError("DaData request failed", 502)

    const data = await response.json() as unknown
    return apiSuccess(data)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
