// OG-превью расшаренного разбора «Типология» (/tip/r/[shareToken]).
//
// next/og ImageResponse — рендерится на сервере в PNG 1200×630. Без внешних
// шрифтов (системный стек через fontFamily) и без сетевых запросов картинок —
// только текст и CSS-градиент, укладывается в бюджет ~300ms.
// revalidate=3600 — конвенционный файл Next.js кэширует результат на уровне
// route-сегмента на 1 час (тяжёлый публичный image-роут без auth, дёргается
// соцсетями/мессенджерами при каждом анфёрле ссылки).
//
// Если run не найден либо status != 'done' — отдаём generic-карточку без
// персональных данных (не палим внутренние id/ошибки во внешнем превью).

import { ImageResponse } from "next/og"
import { getRunByShareToken } from "@/lib/tip/service"

export const runtime = "nodejs"
export const revalidate = 3600
export const alt = "Типология — персональный разбор личности"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const run = await getRunByShareToken(token).catch(() => null)

  const isDone = run?.status === "done"
  const formulaString = isDone ? run?.formulaJson?.formulaString : undefined
  // Обрезаем имя перед рендером — защита от разъезжающейся вёрстки на
  // длинных значениях (в т.ч. старых прогонов до лимита длины в service.ts).
  const name = isDone ? run?.inputJson?.name?.slice(0, 40) : undefined

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 35%, #fafaf9 100%)",
          fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
          padding: "80px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: 1,
            color: "#78716c",
            textTransform: "uppercase",
          }}
        >
          Типология · прикладная поведенческая типология
        </div>

        {formulaString ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: 48,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 148,
                fontWeight: 800,
                letterSpacing: 4,
                color: "#1c1917",
                lineHeight: 1,
              }}
            >
              {formulaString}
            </div>
            {name ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 24,
                  fontSize: 36,
                  fontWeight: 500,
                  color: "#44403c",
                }}
              >
                {name}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: 64,
              maxWidth: 820,
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: "#1c1917" }}>
              Разбор личности по дате рождения
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 64,
            fontSize: 32,
            fontWeight: 600,
            color: "#92400e",
          }}
        >
          Открыть разбор →
        </div>
      </div>
    ),
    { ...size },
  )
}
