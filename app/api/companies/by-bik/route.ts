import { NextRequest } from "next/server"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

const DADATA_BANK_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/bank"

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const bik = req.nextUrl.searchParams.get("bik")
    if (!bik) {
      return apiError("Missing 'bik' query parameter", 400)
    }

    const token = process.env.DADATA_TOKEN
    if (!token) {
      return apiError("DaData token not configured", 500)
    }

    const response = await fetch(DADATA_BANK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${token}`,
      },
      body: JSON.stringify({ query: bik }),
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
