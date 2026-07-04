// Юниты чистой математики сжатия (node:test) — DOM-части тестируются руками
// в браузере (чек-лист в коммите фичи).
import { test } from "node:test"
import assert from "node:assert/strict"
import { computeVideoBitrate, fitDimensions, CompressionUnsupportedError } from "./compress-video"

const MB = 1024 * 1024

test("битрейт: типичный кейс — 300МБ файл, цель 190МБ, 10 минут → в пределах пола/потолка", () => {
  const b = computeVideoBitrate(190 * MB, 600)
  // (190МБ*8/600с)*0.9 − 128к ≈ 2.26 Mbps
  assert.ok(b > 2_000_000 && b < 2_500_000, String(b))
})

test("битрейт: короткий ролик упирается в потолок 6 Mbps", () => {
  assert.equal(computeVideoBitrate(190 * MB, 30), 6_000_000)
})

test("битрейт: очень длинный ролик упирается в пол 1.2 Mbps", () => {
  assert.equal(computeVideoBitrate(190 * MB, 3 * 3600), 1_200_000)
})

test("битрейт: нулевая/кривая длительность → CompressionUnsupportedError", () => {
  assert.throws(() => computeVideoBitrate(190 * MB, 0), CompressionUnsupportedError)
  assert.throws(() => computeVideoBitrate(190 * MB, NaN), CompressionUnsupportedError)
})

test("размеры: 4K → длинная сторона 1280, пропорции и чётность", () => {
  const { width, height } = fitDimensions(3840, 2160)
  assert.equal(width, 1280)
  assert.equal(height, 720)
})

test("размеры: портретное 4K → высота капается", () => {
  const { width, height } = fitDimensions(2160, 3840)
  assert.equal(height, 1280)
  assert.equal(width, 720)
})

test("размеры: HD и меньше не трогаем, FHD ужимается", () => {
  assert.deepEqual(fitDimensions(1280, 720), { width: 1280, height: 720 })
  assert.deepEqual(fitDimensions(1920, 1080), { width: 1280, height: 720 })
})
