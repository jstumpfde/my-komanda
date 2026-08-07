import { test } from "node:test"
import assert from "node:assert/strict"
import { matchStopWordList, matchStopWordWith, DEFAULT_STOP_WORDS_V2, STOP_WORDS } from "./stop-words"

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

// Аудит 10.07 (полнота): ё→е нормализация — «нашёл работу» (с ё) должно
// матчиться против словарной формы «нашел работу» (без ё), и наоборот.
test("matchStopWordWith: ё в сообщении кандидата матчит словарную форму без ё", () => {
  assert.equal(matchStopWordWith("Спасибо, я уже нашёл работу", STOP_WORDS), true)
})

test("matchStopWordWith: базовое «не хочу» продолжать переписку", () => {
  assert.equal(matchStopWordWith("не хочу больше общаться", STOP_WORDS), true)
})

test("matchStopWordList: ё в слове списка матчит текст без ё", () => {
  assert.equal(matchStopWordList("уже нашел другую работу", ["нашёл другую"]), "нашёл другую")
})

// Аудит 10.07: baseline∪custom — при заданном кастомном списке вакансии
// baseline НЕ должен отключаться (реальный кейс: кандидат пишет «передумал»,
// его нет в кастомном списке HR, но защита всё равно обязана сработать
// на уровне вызывающего кода через OR двух матчеров).
test("union: кастомный список не ловит, но baseline (STOP_WORDS) ловит «передумал»-подобные фразы", () => {
  const customOnly = ["наш особый стоп-текст"]
  assert.equal(matchStopWordList("я передумал, не интересно", customOnly), null)
  assert.equal(matchStopWordWith("я передумал, не интересно", STOP_WORDS), true)
})
