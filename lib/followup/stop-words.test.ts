import { test } from "node:test"
import assert from "node:assert/strict"
import { matchStopWordList, DEFAULT_STOP_WORDS_V2 } from "./stop-words"

// Гвард 07.07: подстрочный матч должен нормализовать пунктуацию, иначе
// «Нет, спасибо» (с запятой) не ловится, а это частая форма отказа.
test("matchStopWordList: «Нет, спасибо» с запятой ловится дефолтом", () => {
  assert.equal(matchStopWordList("Нет, спасибо", DEFAULT_STOP_WORDS_V2), "нет спасибо")
  assert.equal(matchStopWordList("нет, спасибо!", DEFAULT_STOP_WORDS_V2), "нет спасибо")
})

test("matchStopWordList: фраза «не подходит» внутри предложения", () => {
  assert.equal(matchStopWordList("мне это не подходит категорически", DEFAULT_STOP_WORDS_V2), "не подходит")
})

test("matchStopWordList: «интернет» НЕ ловится (нет одиночного «нет» в дефолте)", () => {
  assert.equal(matchStopWordList("работаю в интернете удалённо", DEFAULT_STOP_WORDS_V2), null)
})

test("matchStopWordList: вежливое «спасибо» без отказа НЕ ловится", () => {
  assert.equal(matchStopWordList("Спасибо, очень интересно, хочу пройти", DEFAULT_STOP_WORDS_V2), null)
})

test("matchStopWordList: пустой список → null", () => {
  assert.equal(matchStopWordList("отказываюсь", []), null)
})
