import { NextRequest } from "next/server"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

const DADATA_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party"

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const inn = req.nextUrl.searchParams.get("inn")
    if (!inn) {
      return apiError("Missing 'inn' query parameter", 400)
    }

    const token = process.env.DADATA_API_KEY || process.env.DADATA_TOKEN
    if (!token) {
      return apiError("DaData token not configured", 500)
    }

    const response = await fetch(DADATA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${token}`,
        "X-Secret": "",
      },
      body: JSON.stringify({ query: inn }),
    })

    if (!response.ok) {
      return apiError("DaData request failed", 502)
    }

    const data = await response.json() as unknown
    return apiSuccess(data)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
