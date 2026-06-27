// Унифицированные шаблоны дожима на переменных (бриф Юрия 27.06).
// Один набор текстов веток А/Б; этап подставляется через STEP_WORDS.
// Резолвер раскрывает {{step_noun/step_verb/step_verb_done/step_time/step_link}}
// в момент сборки цепочки → остаются только {{name}}/{{vacancy}}/{{<link>}}
// для рантайм-рендера (lib/template-renderer.ts). Капитализация не нужна —
// глаголы всегда в середине/конце фразы.

import type { DozhimTouch, DozhimPreset, StageActionType } from "./types"
import type { DripTemplates } from "@/lib/db/schema"

interface StepWords {
  noun:      string         // винительный: обзор / тест / анкету / задание / встречу
  verb:      string | null  // ветка А: посмотрите / пройдите / подтвердите (null → особый блок, напр. оффер)
  verb_done: string | null  // ветка Б: досмотрите / завершите (null → ветка Б не генерится)
  time:      string | null  // «5–7 минут» (null → строки со {{step_time}} пропускаются)
  link:      string         // плейсхолдер ссылки этапа (latin): demo_link / test_link / ""
}

// Словарь по реальным типам стадий v2.
export const STEP_WORDS: Record<string, StepWords> = {
  demo:             { noun: "обзор",   verb: "посмотрите",  verb_done: "досмотрите",  time: "5–7 минут",   link: "demo_link" },
  test:             { noun: "тест",    verb: "пройдите",    verb_done: "завершите",   time: "5–7 минут",   link: "test_link" },
  task:             { noun: "задание", verb: "выполните",   verb_done: "доделайте",   time: "15–20 минут", link: "test_link" },
  prequalification: { noun: "вопросы", verb: "ответьте",    verb_done: "доответьте",  time: "пару минут",  link: "demo_link" },
  // Живые этапы: verb_done = null → ветка Б НЕ генерится; time = null → строки со {{step_time}} пропускаются.
  interview:        { noun: "встречу", verb: "подтвердите", verb_done: null,          time: null,          link: "demo_link" },
  offer:            { noun: "оффер",   verb: null,          verb_done: null,          time: null,          link: "" },
}

const FALLBACK: StepWords = STEP_WORDS.demo

// ── Ветка А — «не открыл / не начал» (11 касаний). Глагол всегда строчный. ──
export const BRANCH_A_TEMPLATES: string[] = [
  "{{name}}, напоминаю про {{step_noun}} по «{{vacancy}}» — там кратко про задачи и условия, это {{step_time}}, {{step_verb}}: {{step_link}}",
  "{{name}}, чтобы двигаться дальше по «{{vacancy}}», {{step_verb}} {{step_noun}} — там про должность и условия, ждём вас: {{step_link}}",
  "{{name}}, чтобы не тратить время на лишние переписки, {{step_verb}} {{step_noun}} по «{{vacancy}}» — и сможем двигаться дальше: {{step_link}}",
  "{{name}}, мы всё ещё ждём вас. {{step_verb}} {{step_noun}} по «{{vacancy}}» — только суть, без воды: {{step_link}}",
  "{{name}}, напоминаю о вакансии «{{vacancy}}» — {{step_verb}} {{step_noun}}, и после сможем двигаться дальше, ждём вас: {{step_link}}",
  "{{name}}, напоминаю: чтобы двигаться дальше по «{{vacancy}}», осталось {{step_verb}} {{step_noun}} — после перейдём к следующему шагу: {{step_link}}",
  "{{name}}, мы всё ещё вас ждём. Хотим понять, идём ли дальше вместе, — осталось {{step_verb}} {{step_noun}}: {{step_link}}",
  "{{name}}, если ещё в поиске — напоминаю про {{step_noun}} по «{{vacancy}}», {{step_verb}}, ждём вас: {{step_link}}",
  "{{name}}, {{step_verb}} {{step_noun}} — и сразу станет понятно, стоит ли нам двигаться дальше: {{step_link}}",
  "{{name}}, ваш профиль всё ещё у нас на заметке по «{{vacancy}}» — {{step_verb}} {{step_noun}}: {{step_link}}",
  "{{name}}, не буду больше беспокоить. Если решите вернуться к «{{vacancy}}» — {{step_noun}} будет тут: {{step_link}}",
]

// ── Ветка Б — «открыл / начал, но не завершил» (11 касаний). Только если verb_done != null. ──
export const BRANCH_B_TEMPLATES: string[] = [
  "{{name}}, вы уже открывали {{step_noun}} по «{{vacancy}}», но не завершили — наверное, отвлеклись. Дублирую ссылку: {{step_link}}",
  "{{name}}, ваш профиль нам подходит по «{{vacancy}}», поэтому пишу — {{step_verb_done}} {{step_noun}} до конца, там про задачи и условия: {{step_link}}",
  "{{name}}, вы уже начали — осталось совсем немного, {{step_verb_done}} {{step_noun}} до конца, и сможем двигаться дальше: {{step_link}}",
  "{{name}}, напоминаю про {{step_noun}} по «{{vacancy}}» — самое полезное обычно ближе к концу, {{step_verb_done}}, ждём вас: {{step_link}}",
  "{{name}}, чтобы перейти к следующему шагу, нужно {{step_verb_done}} {{step_noun}} до конца — это пара минут: {{step_link}}",
  "{{name}}, ваш профиль нам понравился, поэтому возвращаюсь ещё раз — {{step_verb_done}} {{step_noun}} по «{{vacancy}}», и сможем двигаться дальше: {{step_link}}",
  "{{name}}, напоминаю: чтобы не тратить ваше и наше время, {{step_verb_done}} {{step_noun}} до конца — после перейдём к следующему шагу: {{step_link}}",
  "{{name}}, мы всё ещё вас ждём. Хотим понять, идём ли дальше вместе, — {{step_verb_done}} {{step_noun}}: {{step_link}}",
  "{{name}}, мы всё ещё ждём вас по «{{vacancy}}» — {{step_verb_done}} {{step_noun}}, когда будет минутка: {{step_link}}",
  "{{name}}, ваш профиль остаётся у нас на заметке — {{step_verb_done}} {{step_noun}} по «{{vacancy}}», чтобы понять, идём ли мы дальше вместе: {{step_link}}",
  "{{name}}, не буду больше беспокоить. Если решите вернуться к «{{vacancy}}» — {{step_noun}} будет тут: {{step_link}}",
]

// ── Особые случаи ──
// Живые этапы (interview): есть ссылка/приглашение, нет «завершить» → только ветка А.
export const LIVE_TEMPLATES: string[] = [
  "{{name}}, напоминаю про {{step_noun}} по «{{vacancy}}» — {{step_verb}}, пожалуйста, удобное время: {{step_link}}",
  "{{name}}, ждём вас на {{step_noun}} по «{{vacancy}}» — подтвердите, когда вам удобно: {{step_link}}",
  "{{name}}, не буду больше беспокоить по «{{vacancy}}» — если будет удобно, {{step_verb}}: {{step_link}}",
]

// Оффер: без ссылки и без переменных этапа.
export const OFFER_TEMPLATES: string[] = [
  "{{name}}, по «{{vacancy}}» мы готовы сделать вам предложение — ждём вашего решения, на связи.",
  "{{name}}, напоминаю про оффер по «{{vacancy}}» — если есть вопросы по условиям, напишите, обсудим.",
  "{{name}}, не торопим, но хотим понимать ваш настрой по офферу на «{{vacancy}}» — дайте знать, пожалуйста.",
]

// Раскрывает {{step_*}} в шаблоне по словарю этапа. {{step_link}} → плейсхолдер
// ссылки этапа ({{demo_link}}/{{test_link}}) — его рендерит рантайм. Капитализацию
// НЕ трогаем (глаголы всегда в середине/конце).
function resolveStepVars(tpl: string, w: StepWords): string {
  return tpl
    .replace(/\{\{step_noun\}\}/g, w.noun)
    .replace(/\{\{step_verb\}\}/g, w.verb ?? "")
    .replace(/\{\{step_verb_done\}\}/g, w.verb_done ?? "")
    .replace(/\{\{step_time\}\}/g, w.time ?? "")
    .replace(/\{\{step_link\}\}/g, w.link ? `{{${w.link}}}` : "")
}

// Сколько касаний даёт пресет (дни). Импортируем динамически, чтобы не плодить связей.
import { FOLLOWUP_PRESETS } from "@/lib/followup/presets"
const PRESET_MAP: Record<DozhimPreset, "off" | "soft" | "standard" | "aggressive"> = {
  off: "off", soft: "soft", standard: "standard", strong: "aggressive",
}

/**
 * Собрать цепочку дожима из унифицированных шаблонов под конкретный этап.
 *  branch: "A" — «не открыл/не начал»; "B" — «открыл, но не завершил».
 *  Возвращает DozhimTouch[] с раскрытыми step-переменными (останутся
 *  {{name}}/{{vacancy}}/{{<link>}} для рантайма). Пустой массив, если ветка
 *  не применима (preset=off, или branch B при verb_done=null).
 */
// Платформенный СИД (последний фолбэк). Редактируемый эталон — в
// platform_settings['drip_templates']; конструктор воронки передаёт его сюда
// параметром `templates`. Тесты/рантайм без параметра используют этот сид.
export const DRIP_TEMPLATES_SEED: DripTemplates = {
  stepWords: STEP_WORDS,
  branchA:   BRANCH_A_TEMPLATES,
  branchB:   BRANCH_B_TEMPLATES,
  live:      LIVE_TEMPLATES,
  offer:     OFFER_TEMPLATES,
}

export function buildDozhimChain(
  action: StageActionType | undefined,
  preset: DozhimPreset,
  branch: "A" | "B",
  templates: DripTemplates = DRIP_TEMPLATES_SEED,
): DozhimTouch[] {
  if (preset === "off") return []
  const w = (action && templates.stepWords[action]) || FALLBACK

  // Оффер — отдельный блок, без step-переменных, только ветка А.
  if (action === "offer") {
    if (branch === "B") return []
    return withDays(templates.offer, preset)
  }

  // Ветка Б недоступна для живых этапов (verb_done=null).
  if (branch === "B" && !w.verb_done) return []

  let pool: string[]
  if (action === "interview") {
    if (branch === "B") return []
    pool = templates.live.map(t => resolveStepVars(t, w))
  } else {
    const base = branch === "A" ? templates.branchA : templates.branchB
    // Если time=null — пропускаем строки со {{step_time}} (в ядре это только А-№1).
    const filtered = w.time ? base : base.filter(t => !t.includes("{{step_time}}"))
    pool = filtered.map(t => resolveStepVars(t, w))
  }
  return withDays(pool, preset)
}

// Назначает дни касаний из пресета первым N текстам пула.
function withDays(texts: string[], preset: DozhimPreset): DozhimTouch[] {
  const fp = FOLLOWUP_PRESETS[PRESET_MAP[preset]]
  if (!fp || fp.days.length === 0) return []
  return fp.days
    .slice(0, texts.length)
    .map((day, i) => ({ text: texts[i] ?? "", delayDays: day }))
    .filter(t => t.text.length > 0)
}
