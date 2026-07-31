// Юнит-тесты резолвера имени кандидата (подстановка {{name}} + бэйдж «имя под вопросом»).
// Запуск: pnpm exec tsx --test lib/messaging/candidate-name.test.ts
//
// Покрываем кейсы Юрия: фамилия вместо имени, перепутанные поля hh, аноним/нет имени.
// confident=false → бот шлёт нейтральное «Здравствуйте» И на карточке бэйдж «⚠ имя».

import { test } from "node:test"
import assert from "node:assert/strict"
import { resolveGivenNameMeta } from "./candidate-name"

test("формат «Фамилия Имя» → берём имя (2-е слово), confident", () => {
  const m = resolveGivenNameMeta({ fullName: "Петренко Александр" })
  assert.equal(m.firstName, "Александр")
  assert.equal(m.confident, true)
})

test("перепутанные поля hh (фамилия в «Имя», имя в «Фамилию») → находит имя, confident", () => {
  const m = resolveGivenNameMeta({ hhFirst: "Макаренко", hhLast: "Сергей" })
  assert.equal(m.firstName, "Сергей")
  assert.equal(m.confident, true)
  assert.equal(m.source, "hh_last_swap")
})

test("ручная правка HR (override) → confident, она в приоритете", () => {
  const m = resolveGivenNameMeta({ override: "Иван", fullName: "Петренко Александр" })
  assert.equal(m.firstName, "Иван")
  assert.equal(m.confident, true)
  assert.equal(m.source, "override")
})

test("аноним → нейтральное «Здравствуйте», НЕ confident (бэйдж покажется)", () => {
  const m = resolveGivenNameMeta({ hhFirst: "Анонимный соискатель", fullName: "Аноним" })
  assert.equal(m.firstName, "Здравствуйте")
  assert.equal(m.confident, false)
})

test("нет имени / пусто → нейтральное, НЕ confident", () => {
  const m = resolveGivenNameMeta({ fullName: "" })
  assert.equal(m.firstName, "Здравствуйте")
  assert.equal(m.confident, false)
})

test("одно слово (вероятно фамилия) → нейтральное, НЕ confident (не угадываем)", () => {
  const m = resolveGivenNameMeta({ fullName: "Петренко" })
  assert.equal(m.firstName, "Здравствуйте")
  assert.equal(m.confident, false)
})

test("редкое/нерусское имя не из словаря → берём hh first_name, но НЕ confident (HR проверит)", () => {
  const m = resolveGivenNameMeta({ hhFirst: "Зейнаб" })
  assert.equal(m.firstName, "Зейнаб")
  assert.equal(m.confident, false)
  assert.equal(m.source, "hh_first_raw")
})

test("заглушка бэкфилла «Кандидат с hh.ru» → нейтральное, НЕ confident", () => {
  const m = resolveGivenNameMeta({ fullName: "Кандидат с hh.ru" })
  assert.equal(m.firstName, "Здравствуйте")
  assert.equal(m.confident, false)
})

// ── learned (самообучающийся платформенный справочник, 03.07.2026) ─────────

test("имя из learned-Set → опознано как словарное (hh_first), confident", () => {
  const learned = new Set(["елизаветта"])
  const m = resolveGivenNameMeta({ hhFirst: "Елизаветта", learned })
  assert.equal(m.firstName, "Елизаветта")
  assert.equal(m.confident, true)
  assert.equal(m.source, "hh_first")
})

test("имя НЕ в learned-Set → как раньше, hh_first_raw, НЕ confident", () => {
  const learned = new Set(["другоеимя"])
  const m = resolveGivenNameMeta({ hhFirst: "Елизаветта", learned })
  assert.equal(m.firstName, "Елизаветта")
  assert.equal(m.confident, false)
  assert.equal(m.source, "hh_first_raw")
})

test("learned не передан (undefined) → поведение как раньше, без регрессии", () => {
  const m = resolveGivenNameMeta({ hhFirst: "Елизаветта" })
  assert.equal(m.firstName, "Елизаветта")
  assert.equal(m.confident, false)
  assert.equal(m.source, "hh_first_raw")
})

test("learned — пустой Set → поведение как раньше", () => {
  const m = resolveGivenNameMeta({ hhFirst: "Елизаветта", learned: new Set() })
  assert.equal(m.confident, false)
  assert.equal(m.source, "hh_first_raw")
})

test("статический словарь всегда приоритетнее learned (learned не переопределяет known)", () => {
  // "сергей" в статическом словаре — попадёт в ветку hh_first ДО проверки learned.
  const learned = new Set(["сергей"])
  const m = resolveGivenNameMeta({ hhFirst: "Сергей", learned })
  assert.equal(m.source, "hh_first")
  assert.equal(m.confident, true)
})

test("learned сравнивается регистронезависимо (нормализация ё→е тоже применяется)", () => {
  const learned = new Set(["артемий"]) // нормализовано (ё→е, lower)
  const m = resolveGivenNameMeta({ hhFirst: "Артемий", learned })
  assert.equal(m.confident, true)
  assert.equal(m.source, "hh_first")
})

test("аноним с learned-Set — не должен ложно опознаваться (isRealName блокирует)", () => {
  const learned = new Set(["аноним"])
  const m = resolveGivenNameMeta({ hhFirst: "Анонимный соискатель", fullName: "Аноним", learned })
  assert.equal(m.firstName, "Здравствуйте")
  assert.equal(m.confident, false)
})

// ── hh middle_name / отчество-якорь (13.07.2026, инцидент с фамилией вместо
// имени у Юрия) ─────────────────────────────────────────────────────────────

test("hh middle_name заполнен и валиден → подтверждает hh first_name, даже редкое/нерусское", () => {
  // "Зейнаб" не из словаря — раньше уходило в hh_first_raw (НЕ confident).
  // Заполненный middle_name — структурное подтверждение: это точно имя.
  const m = resolveGivenNameMeta({ hhFirst: "Зейнаб", hhMiddle: "Тагировна" })
  assert.equal(m.firstName, "Зейнаб")
  assert.equal(m.confident, true)
  assert.equal(m.source, "hh_middle_confirmed")
})

test("hh middle_name не переопределяет уже уверенный словарный hh_first (ветка не трогается)", () => {
  const m = resolveGivenNameMeta({ hhFirst: "Сергей", hhMiddle: "Юрьевич" })
  assert.equal(m.firstName, "Сергей")
  assert.equal(m.source, "hh_first")
})

test("hh middle_name не переопределяет hh_last_swap — если словарь уже нашёл имя в last_name, он в приоритете", () => {
  // Поля перепутаны (Макаренко в «Имя», Сергей в «Фамилию»), но middle_name
  // валиден — тем не менее hh_last_swap (словарь) надёжнее и должен победить,
  // а не «подтверждать» заведомо неверное hh_first="Макаренко".
  const m = resolveGivenNameMeta({ hhFirst: "Макаренко", hhLast: "Сергей", hhMiddle: "Юрьевич" })
  assert.equal(m.firstName, "Сергей")
  assert.equal(m.source, "hh_last_swap")
})

test("hh middle_name пуст/невалиден (аноним) → ветка не срабатывает", () => {
  const m = resolveGivenNameMeta({ hhFirst: "Зейнаб", hhMiddle: "Анонимный соискатель" })
  assert.equal(m.source, "hh_first_raw")
  assert.equal(m.confident, false)
})

test("hh middle_name валиден, но hh first_name пуст → нечего подтверждать, ветка не срабатывает", () => {
  const m = resolveGivenNameMeta({ hhMiddle: "Юрьевич", fullName: "Дементьев Сергей Юрьевич" })
  // hh_middle_confirmed требует непустой w1f — пропускается. «Сергей» находится
  // раньше по цепочке — словарным перебором слов fullName (source "fullname").
  assert.equal(m.firstName, "Сергей")
  assert.equal(m.source, "fullname")
})

// ── Морфологический якорь по отчеству (patronymic_pattern) ─────────────────

test("реальный кейс инцидента: «Дементьев Сергей Юрьевич» → «Сергей» (словарь уже справляется)", () => {
  const m = resolveGivenNameMeta({ fullName: "Дементьев Сергей Юрьевич" })
  assert.equal(m.firstName, "Сергей")
  assert.equal(m.confident, true)
})

test("отчество-якорь: женский суффикс -овна, имя вне словаря → верно находит имя (2-е слово из 3)", () => {
  // "Гульнара" отсутствует в статическом словаре — без якоря ушло бы в
  // hh_first_raw/hh_first со значением ФАМИЛИИ, если поля hh перепутаны.
  const m = resolveGivenNameMeta({ fullName: "Ахметова Гульнара Рашидовна" })
  assert.equal(m.firstName, "Гульнара")
  assert.equal(m.confident, true)
  assert.equal(m.source, "patronymic_pattern")
})

test("отчество-якорь побеждает неуверенный hh_first_raw при перепутанных hh-полях", () => {
  // hh first_name="Ахметова" (на деле фамилия, поля перепутаны), словарь молчит
  // и по hhFirst, и по fullName-словам (Гульнара не в словаре) — раньше отдал бы
  // «Ахметова» (source hh_first_raw, НЕ confident). Отчество в fullName спасает.
  const m = resolveGivenNameMeta({ hhFirst: "Ахметова", fullName: "Ахметова Гульнара Рашидовна" })
  assert.equal(m.firstName, "Гульнара")
  assert.equal(m.confident, true)
  assert.equal(m.source, "patronymic_pattern")
})

test("отчество-якорь: каверзный кейс «Ильин Кузьма Ильич» — «Кузьма» не путается с «Ильич»-отчеством", () => {
  // "Кузьма" есть в статическом словаре имён — резолвится через fullname ДО
  // того, как дошло бы до patronymic_pattern. Проверяем результат целиком.
  const m = resolveGivenNameMeta({ fullName: "Ильин Кузьма Ильич" })
  assert.equal(m.firstName, "Кузьма")
  assert.equal(m.confident, true)
})

test("отчество-якорь НЕ применяется к 2-словным ФИО (порядок неоднозначен, старое поведение)", () => {
  // Оба слова вне словаря имён — раньше и сейчас позиционный fallback слепо
  // берёт 2-е слово, каким бы ни был реальный порядок (Имя-Фамилия или
  // Фамилия-Имя). Это ИЗВЕСТНОЕ ограничение — намеренно не трогаем его новой
  // эвристикой (она работает только для РОВНО 3 слов).
  const m = resolveGivenNameMeta({ fullName: "Тимербулатов Рашидов" })
  assert.equal(m.firstName, "Рашидов") // намеренно: fallbackFromFullName берёт 2-е слово как есть
  assert.equal(m.source, "neutral")
  assert.equal(m.confident, false)
})

test("отчество-якорь: 3 слова БЕЗ отчественного суффикса → ветка не срабатывает, идём дальше по цепочке", () => {
  const m = resolveGivenNameMeta({ fullName: "Иванов Марк Смирнов" })
  // Ни одно слово не отчество и Марк — в словаре → находится через fullname.
  assert.equal(m.firstName, "Марк")
  assert.equal(m.source, "fullname")
})

test("отчество-якорь: фамилия-омоним на -ич («Янкович») в 3-й позиции НЕ считается отчеством", () => {
  // "Милош" не в словаре имён и не отчество-якорь (Янкович — фамилия-омоним,
  // исключение) — patronymic_pattern НЕ срабатывает. Проваливается в позиционный
  // fallback (neutral), который тут случайно даёт то же слово, но БЕЗ уверенности
  // (confident=false) — честная разница с patronymic_pattern (который был бы
  // confident=true, если бы ошибочно сработал).
  const m = resolveGivenNameMeta({ fullName: "Стоянов Милош Янкович" })
  assert.equal(m.firstName, "Милош")
  assert.equal(m.source, "neutral")
  assert.equal(m.confident, false)
})

test("отчество-якорь: не переопределяет более надёжный явный hh_first_raw словарный кейс, но уступает hh_middle_confirmed по приоритету, если оба применимы", () => {
  // hh отдаёт middle_name напрямую — он ещё надёжнее суффиксного паттерна по
  // fullName, поэтому должен сработать раньше (см. порядок веток в коде).
  const m = resolveGivenNameMeta({ hhFirst: "Зейнаб", hhMiddle: "Тагировна", fullName: "Алиева Зейнаб Тагировна" })
  assert.equal(m.firstName, "Зейнаб")
  assert.equal(m.source, "hh_middle_confirmed")
})
