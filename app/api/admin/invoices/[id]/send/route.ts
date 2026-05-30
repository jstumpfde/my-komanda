import { NextRequest } from "next/server"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"
import { sendInvoiceDocument, type BillingDocKind } from "@/lib/billing/send-documents"

// POST /api/admin/invoices/[id]/send  body: { kind: "invoice" | "act" }
// Вручную отправить счёт или акт на email компании.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const kind = (body as { kind?: BillingDocKind }).kind === "act" ? "act" : "invoice"

  const r = await sendInvoiceDocument(id, kind)
  if (!r.sent) return apiError(r.reason || "Не удалось отправить", 400)
  return apiSuccess({ sent: true, to: r.to, kind })
}
