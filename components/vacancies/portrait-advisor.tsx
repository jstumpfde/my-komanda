"use client"

// AI-советчик ЗОНЫ «Портрет». В отличие от VacancyAdvisor (анализирует поля
// страницы «Вакансия» — название/зарплата/навыки/стоп-факторы вакансии), этот
// советчик читает ТОЛЬКО сам Портрет (CandidateSpec): критерии «Подходит»
// (niceToHave), стоп-факторы Портрета (stopFactors + dealBreakers «Не подходит»),
// эталон (idealProfile), реалистичность. Никаких данных вакансии и никаких
// «критично» — отсутствие стоп-факторов на этом этапе НЕ критично, а
// рекомендовано (Юрий, 26.06).

import { Bot, AlertTriangle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CandidateSpec } from "@/lib/core/spec/types"
import { normalizeNiceToHave, normalizeDealBreakers } from "@/lib/core/spec/types"
import { computeRealism, REALISM_TONE_CLASS } from "./spec-editor-helpers"

interface PortraitRec {
  id: string
  title: string
  message: string
}

function buildRecommendations(spec: CandidateSpec): PortraitRec[] {
  const recs: PortraitRec[] = []

  // 1. Критерии «Подходит» (niceToHave)
  const nice = normalizeNiceToHave(spec.niceToHave)
  if (nice.length === 0) {
    recs.push({
      id: "criteria-empty",
      title: "Критерии «Подходит»",
      message: "Пока не задано ни одного критерия. Добавьте 3–5 пунктов того, что хотите видеть в кандидате — по ним AI оценивает каждое резюме.",
    })
  } else if (nice.length > 5) {
    recs.push({
      id: "criteria-overflow",
      title: "Критерии «Подходит»",
      message: `Сейчас критериев — ${nice.length}. Рекомендуем оставить до 5 ключевых: больше критериев размывают оценку и снижают её точность.`,
    })
  }

  // 2. Стоп-факторы Портрета (структурные stopFactors + текстовые «Не подходит»).
  //    Отсутствие — РЕКОМЕНДАЦИЯ, не критично: на этом этапе просто пропускаем всех.
  const structuralStops = Object.values(spec.stopFactors ?? {})
    .filter(f => f && typeof f === "object" && (f as { enabled?: boolean }).enabled === true).length
  const textStops = normalizeDealBreakers(spec.dealBreakers).length
  if (structuralStops + textStops === 0) {
    recs.push({
      id: "stopfactors-empty",
      title: "Стоп-факторы",
      message: "Стоп-факторы Портрета не заданы — это не критично: на этом этапе пропускаем всех. Но с 1–3 жёсткими условиями («Не подходит», город/формат/опыт) бот сразу отсечёт явно неподходящих.",
    })
  }

  // 3. Эталон (idealProfile)
  if (!(spec.idealProfile ?? "").trim()) {
    recs.push({
      id: "ideal-empty",
      title: "Эталон кандидата",
      message: "Опишите эталонного кандидата одним абзацем — AI точнее сопоставит резюме с вашим Портретом.",
    })
  }

  return recs
}

export function PortraitAdvisor({ spec }: { spec: CandidateSpec }) {
  const realism = computeRealism(spec)
  const recs = buildRecommendations(spec)

  return (
    <div className="hidden lg:block w-[340px] shrink-0 self-stretch">
      <div className="space-y-3 border-l pl-4 h-full">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-[var(--ai)]" />
          <span className="text-sm font-semibold text-[var(--ai)]">AI-ассистент · Портрет</span>
        </div>

        {/* Реалистичность портрета */}
        <div className={cn("rounded-md border px-3 py-2 text-xs space-y-0.5", REALISM_TONE_CLASS[realism.tone])}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Реалистичность: {realism.level}</span>
            <span className="opacity-70" title="Ориентир, не строгий показатель">сколько кандидатов подойдёт</span>
          </div>
          {realism.warn && (
            <p className="opacity-80 leading-relaxed">Портрет очень узкий — подойдёт мало кандидатов. Смягчите часть критериев или стоп-факторов.</p>
          )}
        </div>

        {/* Рекомендации по Портрету (никаких «критично»). Зелёное «заполнен
            хорошо» НЕ показываем при низкой реалистичности — рядом с красным
            предупреждением читалось как противоречие (Юрий 03.07). */}
        {recs.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">Рекомендации</p>
            {recs.map(r => (
              <div
                key={r.id}
                className="w-full text-left rounded-lg border p-2.5 border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">{r.title}</span>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{r.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !realism.warn ? (
          <div className="rounded-lg border p-2.5 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">Портрет заполнен хорошо — критерии, стоп-факторы и эталон на месте.</p>
          </div>
        ) : null}

        <p className="text-[10px] text-muted-foreground leading-relaxed pt-1 border-t">
          Подсказки здесь — только по Портрету (критерии AI-скоринга). Советы по полям вакансии — на вкладке «Вакансия».
        </p>
      </div>
    </div>
  )
}
