// «Карта личности» — формула гербом: 4 крупные цифры в декоративной рамке
// с подписями позиций, оттенками (sourceDigits) и именем/датой снизу.
// Тёплая палитра (amber/stone), см. остальной /tip.
//
// Под гербом — строка редкости формулы (lib/tip/rarity.ts).

import { getFormulaRarity, formatRarityPct, rarityLabelNeuter } from "@/lib/tip/rarity"

interface FormulaPosition {
  value: number
  sourceDigits: number[]
  intermediate: number[]
}

interface TipFormulaLike {
  day: FormulaPosition
  month: FormulaPosition
  year: FormulaPosition
  fullDate: FormulaPosition
  formulaString: string
}

const POSITION_META: { key: "day" | "month" | "year" | "fullDate"; label: string; hint: string }[] = [
  { key: "day", label: "День", hint: "Базовая природа" },
  { key: "month", label: "Месяц", hint: "Эмоции и контакт" },
  { key: "year", label: "Год", hint: "Социальная реализация" },
  { key: "fullDate", label: "Полная дата", hint: "Жизненная задача" },
]

export function FormulaCard({
  formula,
  name,
  birthDate,
}: {
  formula: TipFormulaLike
  name?: string
  birthDate?: string
}) {
  const rarity = getFormulaRarity(formula.formulaString)

  return (
    <section className="mb-8">
      <div className="relative overflow-hidden rounded-3xl border-2 border-amber-300/70 bg-gradient-to-b from-amber-50 via-stone-50 to-white p-5 shadow-sm sm:p-8">
        {/* Декоративные угловые засечки — «герб» */}
        <div className="pointer-events-none absolute inset-3 rounded-2xl border border-amber-200/60 sm:inset-4" />
        <div className="pointer-events-none absolute left-0 top-0 h-16 w-16 rounded-tl-3xl border-l-2 border-t-2 border-amber-400/40" />
        <div className="pointer-events-none absolute right-0 top-0 h-16 w-16 rounded-tr-3xl border-r-2 border-t-2 border-amber-400/40" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-16 w-16 rounded-bl-3xl border-b-2 border-l-2 border-amber-400/40" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-16 rounded-br-3xl border-b-2 border-r-2 border-amber-400/40" />

        <div className="relative">
          {(name || birthDate) && (
            <p className="mb-4 text-center text-sm font-medium text-stone-500">
              {name ? name : "Ваша формула"}
              {birthDate ? ` · ${birthDate}` : ""}
            </p>
          )}

          <p className="mb-5 text-center font-mono text-4xl font-bold tracking-widest text-stone-900 sm:text-5xl">
            {formula.formulaString}
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {POSITION_META.map(({ key, label, hint }) => {
              const pos = formula[key]
              return (
                <div
                  key={key}
                  className="rounded-2xl border border-amber-200 bg-white/80 p-3 text-center shadow-sm sm:p-4"
                >
                  <p className="text-3xl font-extrabold text-amber-600 sm:text-4xl">{pos.value}</p>
                  <p className="mt-1.5 text-xs font-semibold text-stone-700">{label}</p>
                  <p className="text-[11px] leading-tight text-stone-400">{hint}</p>
                  {pos.sourceDigits.length > 0 && (
                    <p className="mt-2 text-[10px] leading-tight text-stone-300">
                      {pos.sourceDigits.join(" + ")}
                      {pos.intermediate.length > 0 && ` = ${pos.intermediate.join(" = ")}`}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Строка редкости ── */}
      <p className="mt-3 text-center text-sm text-stone-500">
        Формула{" "}
        <span className="font-semibold text-stone-700">{formula.formulaString}</span>{" "}
        встречается у{" "}
        <span className="font-semibold text-amber-600">~{formatRarityPct(rarity.pct)}%</span>{" "}
        людей —{" "}
        <span className="font-medium text-stone-600">
          {rarityLabelNeuter(rarity.label)} сочетание
        </span>
        .
      </p>
    </section>
  )
}
