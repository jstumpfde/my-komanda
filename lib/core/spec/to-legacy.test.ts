// Юнит-тесты specToLegacy() — секция stopFactorsJson (unify 07.07, инцидент
// вакансии 2604V023). Полное покрытие остальных секций (requirementsJson/
// aiProcessSettings) не входит в эту задачу — здесь только то, что питает
// app/api/core/spec/[vacancyId]/route.ts::syncStopFactorsToLegacy.
// Запуск: pnpm exec tsx --test lib/core/spec/to-legacy.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { specToLegacy } from "./to-legacy"
import { CandidateSpecSchema } from "./types"

// Хелпер: полный валидный CandidateSpec с дефолтами схемы + переданным stopFactors.
function specWith(stopFactors: Record<string, unknown>) {
  return CandidateSpecSchema.parse({ stopFactors })
}

test("specToLegacy: пустой stopFactors → пустой патч (ни одного ключа)", () => {
  const spec = specWith({})
  const patch = specToLegacy(spec).stopFactorsJson
  assert.deepEqual(patch, {})
})

test("specToLegacy: только заданные факторы попадают в патч", () => {
  const spec = specWith({
    age: { enabled: true, minAge: 22, maxAge: 35 },
  })
  const patch = specToLegacy(spec).stopFactorsJson
  assert.deepEqual(Object.keys(patch), ["age"])
  assert.deepEqual(patch.age, { enabled: true, minAge: 22, maxAge: 35 })
})

test("specToLegacy: все 8 боевых ключей копируются 1:1 (включая nativeLanguage — багфикс unify 07.07)", () => {
  const raw = {
    city:              { enabled: true, allowedCities: ["Москва"], allowRelocation: true },
    format:            { enabled: true, allowedFormats: ["remote"] },
    age:               { enabled: true, minAge: 18, maxAge: 60 },
    experience:        { enabled: true, minYears: 2 },
    documents:         { enabled: true, required: ["med_book"] },
    citizenship:       { enabled: true, mode: "allow", allowed: ["RU"] },
    nativeLanguage:    { enabled: true, mode: "allow", allowed: ["rus"] },
    salaryExpectation: { enabled: true, maxAmount: 200000 },
  }
  const spec = specWith(raw)
  const patch = specToLegacy(spec).stopFactorsJson
  assert.deepEqual(patch.city, raw.city)
  assert.deepEqual(patch.format, raw.format)
  assert.deepEqual(patch.age, raw.age)
  assert.deepEqual(patch.experience, raw.experience)
  assert.deepEqual(patch.documents, raw.documents)
  assert.deepEqual(patch.citizenship, raw.citizenship)
  assert.deepEqual(patch.nativeLanguage, raw.nativeLanguage)
  assert.deepEqual(patch.salaryExpectation, raw.salaryExpectation)
})

test("specToLegacy: Spec-only поля (driverLicense/jobHopping/timezone/customFactors) НЕ попадают в патч — у боевого хранилища нет для них эквивалента", () => {
  const spec = specWith({
    driverLicense: { enabled: true, requiredCategories: ["B"] },
    jobHopping:    { enabled: true, maxJobs: 3, withinYears: 2 },
    timezone:      { enabled: true, baseUtcOffset: 3, maxDiffHours: 3, penalty: 15 },
    customFactors: [{ label: "Готовность к командировкам", enabled: true }],
  })
  const patch = specToLegacy(spec).stopFactorsJson
  assert.deepEqual(patch, {}, "ни один Spec-only ключ не должен попасть в legacy-патч")
})

test("specToLegacy: nativeLanguage мапится отдельно от citizenship (структурно похожи, но разные ключи)", () => {
  const spec = specWith({
    nativeLanguage: { enabled: true, mode: "deny", denied: ["eng"] },
  })
  const patch = specToLegacy(spec).stopFactorsJson
  assert.deepEqual(patch.nativeLanguage, { enabled: true, mode: "deny", denied: ["eng"] })
  assert.equal(patch.citizenship, undefined)
})
