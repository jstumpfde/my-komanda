// Инфографика энергий: бары 1-9 по digitCounts. Выраженные цифры — сплошной
// амбер-акцент, отсутствующие — пунктирная рамка с подписью «развивается
// через опыт». Чистый CSS/Tailwind, без chart-библиотек. Mobile-first,
// компактная раскладка.

interface EnergyChartProps {
  digitCounts: Record<string | number, number>
  missingDigits: number[]
  repeatedDigits: number[]
}

export function EnergyChart({ digitCounts, missingDigits, repeatedDigits }: EnergyChartProps) {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const maxCount = Math.max(1, ...digits.map((d) => Number(digitCounts[d] ?? 0)))
  const missingSet = new Set(missingDigits)
  const repeatedSet = new Set(repeatedDigits)

  return (
    <section className="mb-8 rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
      <h3 className="mb-1 text-base font-semibold text-stone-900">Энергии в дате</h3>
      <p className="mb-4 text-xs text-stone-400">
        Сколько раз каждая цифра встречается в вашей дате рождения
      </p>

      <div className="flex items-end justify-between gap-1.5 sm:gap-2">
        {digits.map((digit) => {
          const count = Number(digitCounts[digit] ?? 0)
          const isMissing = missingSet.has(digit)
          const isRepeated = repeatedSet.has(digit)
          const heightPct = isMissing ? 8 : Math.max(14, (count / maxCount) * 100)

          return (
            <div key={digit} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex h-24 w-full items-end justify-center sm:h-28">
                {isMissing ? (
                  <div
                    className="w-full max-w-8 rounded-t-md border-2 border-dashed border-stone-300 bg-stone-50/50"
                    style={{ height: `${heightPct}%` }}
                  />
                ) : (
                  <div
                    className={
                      isRepeated
                        ? "w-full max-w-8 rounded-t-md bg-gradient-to-t from-amber-500 to-amber-400 shadow-sm"
                        : "w-full max-w-8 rounded-t-md bg-amber-300/70"
                    }
                    style={{ height: `${heightPct}%` }}
                  />
                )}
              </div>
              <span
                className={
                  isMissing
                    ? "text-sm font-medium text-stone-300"
                    : isRepeated
                      ? "text-sm font-bold text-amber-700"
                      : "text-sm font-semibold text-stone-600"
                }
              >
                {digit}
              </span>
              {count > 0 && !isMissing && (
                <span className="text-[10px] leading-none text-stone-400">×{count}</span>
              )}
            </div>
          )
        })}
      </div>

      {missingDigits.length > 0 && (
        <p className="mt-4 text-xs leading-relaxed text-stone-400">
          <span className="font-medium text-stone-500">Пунктиром</span> — отсутствующие цифры (
          {missingDigits.join(", ")}): не заданы от рождения, развиваются через опыт.
        </p>
      )}
    </section>
  )
}
