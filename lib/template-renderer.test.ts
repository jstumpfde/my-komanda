// Юнит-тесты renderTemplate. Используем node:test (встроенный в Node 20+),
// чтобы не тянуть vitest/jest. Запуск:
//   pnpm test
// (см. скрипт в package.json: tsx --test lib/template-renderer.test.ts)

import { test } from "node:test"
import assert from "node:assert/strict"
import { renderTemplate } from "./template-renderer"

// 1. Canonical {{name}} → подставляет
test("canonical {{name}} → подставляет", () => {
  const out = renderTemplate("Привет, {{name}}!", { name: "Иван" })
  assert.equal(out, "Привет, Иван!")
})

// 2. Single brace {name} → подставляет
test("single brace {name} → подставляет", () => {
  const out = renderTemplate("Привет, {name}!", { name: "Иван" })
  assert.equal(out, "Привет, Иван!")
})

// 3. Square brackets [Имя] → подставляет (legacy)
test("square brackets [Имя] → подставляет (legacy)", () => {
  const out = renderTemplate("Привет, [Имя]!", { name: "Иван" })
  assert.equal(out, "Привет, Иван!")
})

// 4. Lowercase {имя} → подставляет (legacy)
test("lowercase {имя} → подставляет (legacy)", () => {
  const out = renderTemplate("Привет, {имя}!", { name: "Иван" })
  assert.equal(out, "Привет, Иван!")
})

// 5. Long name {ссылка_на_демонстрацию} → подставляет
test("{ссылка_на_демонстрацию} → подставляет", () => {
  const out = renderTemplate("Ссылка: {ссылка_на_демонстрацию}", {
    demo_link: "https://company24.pro/demo/abc",
  })
  assert.equal(out, "Ссылка: https://company24.pro/demo/abc")
})

// 6. Unknown variable → возвращает {{key}} + warn
test("unknown variable → возвращает {{unknown_var}} + warn", () => {
  const warnings: string[] = []
  const orig = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args.join(" ")) }
  try {
    // Используем canonical-форму с canonical key, которого нет в vars.
    // Тогда resolveKey вернёт каноническое имя, а value === undefined → warn.
    const out = renderTemplate("hi {{interview_at}}", {})
    assert.equal(out, "hi {{interview_at}}")
    assert.ok(warnings.length === 1, `expected 1 warning, got ${warnings.length}`)
    assert.ok(warnings[0].includes("interview_at"), "warn should mention key")
  } finally {
    console.warn = orig
  }
})

// 7. Защита от двойной подстановки: значение, содержащее {{name}},
//    не должно перепарситься.
test("защита от двойной подстановки", () => {
  const out = renderTemplate("hi {{name}}", { name: "{{name}}" })
  assert.equal(out, "hi {{name}}")
})

// 8. Несколько плейсхолдеров и разных форматов в одной строке.
test("смешанные форматы в одной строке", () => {
  const out = renderTemplate("[Имя] ↔ {должность} ↔ {{company}}", {
    name: "Иван",
    vacancy: "Менеджер",
    company: "Company24",
  })
  assert.equal(out, "Иван ↔ Менеджер ↔ Company24")
})

// 9. Пустое значение → пустая строка (не undefined, не «undefined»).
test("пустое значение → пустая строка", () => {
  const out = renderTemplate("[Имя], hi", { name: "" })
  assert.equal(out, ", hi")
})

// 10. Незнакомая обёртка ({foo} с key которого нет в ALIASES) — оставить
//     как есть, чтобы не ломать чужой текст в фигурных скобках.
test("не-плейсхолдер в фигурных скобках → не трогаем", () => {
  const out = renderTemplate("set {x: 1}", { name: "Иван" })
  assert.equal(out, "set {x: 1}")
})

// 11. Двойные скобки + кириллические алиасы — сценарий превью сообщений
//     (EditableMessagePreview рендерит этим же движком; локальные
//     \w-регулярки кириллицу не матчили и {{Имя}} уходило литералом).
test("двойные скобки с кириллицей {{Имя}}/{{компания}} → подставляет", () => {
  const out = renderTemplate(
    "{{Имя}}, вакансия «{{Должность}}» ({{компания}}). Запись: {{schedule_link}}",
    { name: "Иван", vacancy: "Продавец", company: "Company24", schedule_link: "https://company24.pro/schedule/abc" },
  )
  assert.equal(out, "Иван, вакансия «Продавец» (Company24). Запись: https://company24.pro/schedule/abc")
})
