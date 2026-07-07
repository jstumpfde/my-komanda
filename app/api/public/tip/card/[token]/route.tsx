// GET /api/public/tip/card/[token] — генерирует картинку-карточку разбора
// «Типология» для шеринга (next/og ImageResponse). Только для готовых
// прогонов (status='done'), по shareToken — без владения/cookie (как
// /api/public/tip/shared/[token]).
//
// Query:
//   ?format=story|square   1080x1920 (сторис) | 1080x1080 (квадрат). default: square
//   ?kind=formula|strengths  формула-герб (4 цифры) | «3 сильные стороны». default: formula
//
// Системные шрифты (без загрузки .ttf), БЕЗ эмодзи (ломает рендер @vercel/og).

import { NextRequest } from "next/server"
import { ImageResponse } from "next/og"
import { getRunByShareToken } from "@/lib/tip/service"
import { getFormulaRarity, formatRarityPct, rarityLabelNeuter } from "@/lib/tip/rarity"

export const runtime = "nodejs"

interface FormulaPosition {
  value: number
}
interface TipFormulaLike {
  day: FormulaPosition
  month: FormulaPosition
  year: FormulaPosition
  fullDate: FormulaPosition
  formulaString: string
}

const SIZES: Record<string, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
}

const BG = "linear-gradient(160deg, #fffaf0 0%, #fef3e2 40%, #ffffff 100%)"
const AMBER = "#d97706"
const AMBER_DARK = "#92400e"
const STONE_900 = "#1c1917"
const STONE_600 = "#57534e"
const STONE_400 = "#a8a29e"

function FormulaCardImage({
  formula,
  name,
  size,
}: {
  formula: TipFormulaLike
  name?: string
  size: { width: number; height: number }
}) {
  const rarity = getFormulaRarity(formula.formulaString)
  const positions: { label: string; hint: string; value: number }[] = [
    { label: "День", hint: "Базовая природа", value: formula.day.value },
    { label: "Месяц", hint: "Эмоции и контакт", value: formula.month.value },
    { label: "Год", hint: "Соц. реализация", value: formula.year.value },
    { label: "Дата", hint: "Жизненная задача", value: formula.fullDate.value },
  ]
  const isStory = size.height > size.width

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: BG,
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: isStory ? "120px 80px" : "80px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          border: `4px solid ${AMBER}88`,
          borderRadius: 48,
          padding: isStory ? "80px 60px" : "70px 60px",
          background: "rgba(255,255,255,0.6)",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, color: STONE_600, marginBottom: 32 }}>
          {name ? name : "Карта личности"}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: isStory ? 110 : 90,
            fontWeight: 800,
            letterSpacing: 6,
            color: STONE_900,
            marginBottom: 56,
          }}
        >
          {formula.formulaString}
        </div>

        <div style={{ display: "flex", flexDirection: "row", gap: 24, width: "100%", justifyContent: "center" }}>
          {positions.map((p) => (
            <div
              key={p.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: isStory ? 190 : 190,
                padding: "24px 12px",
                borderRadius: 28,
                border: `2px solid ${AMBER}55`,
                background: "#ffffffcc",
              }}
            >
              <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: AMBER }}>{p.value}</div>
              <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: STONE_900, marginTop: 8 }}>
                {p.label}
              </div>
              <div style={{ display: "flex", fontSize: 20, color: STONE_400, marginTop: 4, textAlign: "center" }}>
                {p.hint}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 56,
            fontSize: 28,
            color: AMBER_DARK,
            textAlign: "center",
          }}
        >
          {`Встречается у ~${formatRarityPct(rarity.pct)}% людей — ${rarityLabelNeuter(rarity.label)} сочетание`}
        </div>
      </div>

      <div style={{ display: "flex", marginTop: 56, fontSize: 30, color: STONE_600, fontWeight: 600 }}>
        company24.pro/tip
      </div>
    </div>
  )
}

function StrengthsCardImage({
  strengths,
  name,
  size,
}: {
  strengths: string[]
  name?: string
  size: { width: number; height: number }
}) {
  const isStory = size.height > size.width
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: BG,
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: isStory ? "140px 80px" : "90px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          border: `4px solid ${AMBER}88`,
          borderRadius: 48,
          padding: "70px 60px",
          background: "rgba(255,255,255,0.6)",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, color: STONE_600, marginBottom: 16 }}>
          {name ? `${name} — ` : ""}3 сильные стороны
        </div>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: STONE_900, marginBottom: 56 }}>
          Типология
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 32, width: "100%" }}>
          {strengths.map((s, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 24,
                padding: "28px 32px",
                borderRadius: 28,
                border: `2px solid ${AMBER}55`,
                background: "#ffffffcc",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  background: AMBER,
                  color: "#fff",
                  fontSize: 32,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </div>
              <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: STONE_900 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", marginTop: 56, fontSize: 30, color: STONE_600, fontWeight: 600 }}>
        company24.pro/tip
      </div>
    </div>
  )
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const run = await getRunByShareToken(token)

  if (!run || run.status !== "done" || !run.formulaJson) {
    return new Response("Разбор не найден", { status: 404 })
  }

  const searchParams = req.nextUrl.searchParams
  const format = searchParams.get("format") === "story" ? "story" : "square"
  const kind = searchParams.get("kind") === "strengths" ? "strengths" : "formula"
  const size = SIZES[format]

  const formula = run.formulaJson as unknown as TipFormulaLike
  const name = run.inputJson?.name

  // strengths — из tip_runs.highlights_json (lib/tip/highlights.ts,
  // extractTipHighlights встроен в runGeneration). Может отсутствовать для
  // старых/ещё не досчитавшихся прогонов — тогда фолбэк на формулу.
  const strengths = run.highlightsJson?.strengths?.filter(Boolean).slice(0, 3) ?? []

  if (kind === "strengths" && strengths.length > 0) {
    return new ImageResponse(
      <StrengthsCardImage strengths={strengths} name={name} size={size} />,
      { width: size.width, height: size.height },
    )
  }

  // Фолбэк на формулу — и когда явно запросили formula, и когда strengths
  // запрошены, но highlights ещё не посчитаны.
  return new ImageResponse(
    <FormulaCardImage formula={formula} name={name} size={size} />,
    { width: size.width, height: size.height },
  )
}
