import { and, eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import {
  companies,
  learningAssignments,
  learningPlans,
  users,
} from "@/lib/db/schema"
import { auth } from "@/auth"

// Public (tenant-gated) сертификат в HTML с @media print стилями.
// Пользователь жмёт Ctrl/Cmd+P → «Сохранить как PDF». Никаких клиентских
// зависимостей от PDF-библиотек.

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ assignmentId: string }>
}

function formatDate(d: Date | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export default async function CertificatePage({ params }: PageProps) {
  const { assignmentId } = await params

  const session = await auth()
  if (!session?.user?.companyId) notFound()

  const [row] = await db
    .select({
      id: learningAssignments.id,
      status: learningAssignments.status,
      completedAt: learningAssignments.completedAt,
      assignedAt: learningAssignments.assignedAt,
      userName: users.name,
      userPosition: users.position,
      planTitle: learningPlans.title,
      planDescription: learningPlans.description,
      companyName: companies.name,
      companyBrand: companies.brandName,
    })
    .from(learningAssignments)
    .innerJoin(users, eq(users.id, learningAssignments.userId))
    .innerJoin(learningPlans, eq(learningPlans.id, learningAssignments.planId))
    .innerJoin(companies, eq(companies.id, learningAssignments.tenantId))
    .where(
      and(
        eq(learningAssignments.id, assignmentId),
        eq(learningAssignments.tenantId, session.user.companyId),
      ),
    )
    .limit(1)

  if (!row) notFound()

  const completedAt = row.completedAt
    ? new Date(row.completedAt)
    : row.assignedAt
      ? new Date(row.assignedAt)
      : new Date()

  const companyLabel = row.companyBrand || row.companyName || "Company24.pro"

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      {/* Print button (hidden on print) */}
      <div className="max-w-[900px] mx-auto mb-4 flex justify-end gap-2 print:hidden">
        <button
          onClick={() => {
            if (typeof window !== "undefined") window.print()
          }}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium"
          // server component workaround: render as <form>-less button that calls window.print via suppressHydrationWarning inline script
          suppressHydrationWarning
        >
          Сохранить PDF
        </button>
      </div>

      <style
        // noinspection ReactIntellisense
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              html, body { margin: 0; padding: 0; background: white; }
              .certificate-wrap { box-shadow: none !important; margin: 0 !important; }
              @page { size: A4 landscape; margin: 0; }
            }
          `,
        }}
      />

      {/* Inline script to wire the print button without hydration cost */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.currentScript.previousElementSibling; document.addEventListener('click', function(e){ var t=e.target; if(t && t.nodeType===1 && t.textContent==='Сохранить PDF'){ window.print(); }});`,
        }}
      />

      {/* Certificate A4 landscape */}
      <div
        className="certificate-wrap mx-auto bg-white shadow-xl"
        style={{
          width: "1123px",
          maxWidth: "95vw",
          aspectRatio: "1123 / 794",
          padding: "60px 80px",
          position: "relative",
          fontFamily: "Georgia, 'Times New Roman', serif",
          color: "#1a1a1a",
          backgroundImage:
            "linear-gradient(135deg, #faf8ff 0%, #ffffff 40%, #f0f4ff 100%)",
          border: "2px solid #7F77DD",
        }}
      >
        {/* Border ornament */}
        <div
          style={{
            position: "absolute",
            inset: "24px",
            border: "1px solid #b8b2e8",
            pointerEvents: "none",
          }}
        />

        {/* Header */}
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <div
            style={{
              fontSize: "14px",
              letterSpacing: "8px",
              textTransform: "uppercase",
              color: "#7F77DD",
              fontWeight: 600,
            }}
          >
            Сертификат
          </div>
          <div
            style={{
              fontSize: "20px",
              color: "#555",
              marginTop: "8px",
              fontStyle: "italic",
            }}
          >
            о прохождении обучения
          </div>
        </div>

        {/* Body */}
        <div style={{ textAlign: "center", marginTop: "60px" }}>
          <div style={{ fontSize: "16px", color: "#555" }}>Настоящим подтверждается, что</div>
          <div
            style={{
              fontSize: "48px",
              fontWeight: 700,
              marginTop: "16px",
              color: "#1a1a1a",
              borderBottom: "2px solid #7F77DD",
              display: "inline-block",
              paddingBottom: "8px",
              minWidth: "400px",
            }}
          >
            {row.userName}
          </div>
          {row.userPosition && (
            <div style={{ fontSize: "16px", color: "#777", marginTop: "12px" }}>
              {row.userPosition}
            </div>
          )}

          <div style={{ fontSize: "16px", color: "#555", marginTop: "40px" }}>
            успешно завершил(а) план обучения
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 600,
              marginTop: "12px",
              color: "#7F77DD",
              maxWidth: "800px",
              margin: "12px auto 0",
              lineHeight: 1.3,
            }}
          >
            «{row.planTitle}»
          </div>
          {row.planDescription && (
            <div
              style={{
                fontSize: "14px",
                color: "#888",
                marginTop: "12px",
                maxWidth: "700px",
                margin: "12px auto 0",
              }}
            >
              {row.planDescription}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: "80px",
            left: "80px",
            right: "80px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "13px",
                color: "#888",
                borderTop: "1px solid #b8b2e8",
                paddingTop: "8px",
                minWidth: "220px",
              }}
            >
              Дата выдачи
            </div>
            <div style={{ fontSize: "16px", fontWeight: 600, marginTop: "6px" }}>
              {formatDate(completedAt)}
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "13px",
                color: "#888",
                borderTop: "1px solid #b8b2e8",
                paddingTop: "8px",
                minWidth: "220px",
              }}
            >
              Выдано
            </div>
            <div style={{ fontSize: "16px", fontWeight: 600, marginTop: "6px" }}>
              {companyLabel}
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "13px",
                color: "#888",
                borderTop: "1px solid #b8b2e8",
                paddingTop: "8px",
                minWidth: "220px",
              }}
            >
              Платформа
            </div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 600,
                marginTop: "6px",
                color: "#7F77DD",
              }}
            >
              Company24.pro
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
