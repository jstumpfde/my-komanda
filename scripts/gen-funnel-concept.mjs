// Генератор Excalidraw-карты концепции воронки. Запуск: node scripts/gen-funnel-concept.mjs
import { writeFileSync } from "fs"

let seed = 1
const rnd = () => Math.floor((seed = (seed * 9301 + 49297) % 233280) / 233280 * 2e9)
const id = () => "el-" + (seed = (seed * 9301 + 49297) % 233280).toString(36) + "-" + rnd().toString(36)
const els = []
const base = (o) => ({ angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent",
  fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100,
  groupIds: [], frameId: null, roundness: { type: 3 }, seed: rnd(), version: 1, versionNonce: rnd(),
  isDeleted: false, boundElements: [], updated: 1, link: null, locked: false, ...o })

function box(x, y, w, h, bg, text, fs = 16) {
  const rid = id(), tid = id()
  els.push(base({ id: rid, type: "rectangle", x, y, width: w, height: h, backgroundColor: bg,
    boundElements: [{ type: "text", id: tid }] }))
  els.push(base({ id: tid, type: "text", x: x + 8, y: y + h / 2 - fs, width: w - 16, height: h - 8,
    text, fontSize: fs, fontFamily: 5, textAlign: "center", verticalAlign: "middle",
    containerId: rid, originalText: text, lineHeight: 1.25, roundness: null, strokeColor: "#1e1e1e" }))
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 }
}
function note(x, y, w, text, color = "#e8590c", fs = 13) {
  els.push(base({ id: id(), type: "text", x, y, width: w, height: 60, text, fontSize: fs,
    fontFamily: 5, textAlign: "left", verticalAlign: "top", containerId: null, originalText: text,
    lineHeight: 1.25, roundness: null, strokeColor: color }))
}
function arrow(a, b, dashed = false, color = "#1e1e1e") {
  const sx = a.cx, sy = a.y + a.h, ex = b.cx, ey = b.y
  els.push(base({ id: id(), type: "arrow", x: sx, y: sy, width: ex - sx, height: ey - sy,
    strokeColor: color, strokeStyle: dashed ? "dashed" : "solid", roundness: { type: 2 },
    points: [[0, 0], [ex - sx, ey - sy]], lastCommittedPoint: null,
    startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: "arrow" }))
}
function arrowSide(a, b, color = "#7048e8") {
  const sx = a.x + a.w, sy = a.cy, ex = b.x, ey = b.cy
  els.push(base({ id: id(), type: "arrow", x: sx, y: sy, width: ex - sx, height: ey - sy,
    strokeColor: color, strokeStyle: "dashed", roundness: { type: 2 },
    points: [[0, 0], [ex - sx, ey - sy]], lastCommittedPoint: null,
    startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: "arrow" }))
}

const BLUE = "#a5d8ff", YEL = "#ffec99", GRN = "#b2f2bb", VIO = "#d0bfff"
// Заголовок
note(340, -40, 520, "ВОРОНКА — концепция (черновик для обсуждения)", "#1e1e1e", 20)

// Спина (вертикаль)
const A1 = box(360, 30, 320, 64, BLUE, "Вакансия\nклиент · описание · параметры")
const A2 = box(360, 160, 320, 64, YEL, "AI-оценка резюме\n+ стоп-факторы (жёсткий отсев)")
const A3 = box(330, 290, 380, 70, "#ffd43b", "★ ВЫБОР СЦЕНАРИЯ ВОРОНКИ\n(в начале — определяет всё ниже)", 17)
const A4 = box(360, 430, 320, 70, GRN, "Работа с откликом\n1-е сообщение → аварийное → дожим")
const A5 = box(340, 570, 360, 78, GRN, "AI чат-бот — ведёт диалог\nвопросы · стоп-слова · авто-отказ · «созвониться»")
const A6 = box(360, 720, 320, 64, VIO, "Контент-шаги воронки\n(включаешь и двигаешь нужные)")
const A7 = box(360, 880, 320, 64, GRN, "Интервью → Оффер → Выход на работу")

// Кластер универсальных контент-шагов (справа от A6)
const B1 = box(770, 650, 250, 48, BLUE, "Презентация (текст)", 14)
const B2 = box(770, 712, 250, 48, BLUE, "Демонстрация (обзор)", 14)
const B3 = box(770, 774, 250, 48, BLUE, "Тест (вопросы / ответы)", 14)
const B4 = box(770, 836, 250, 48, BLUE, "Тестовое задание (+ файл)", 14)
note(770, 892, 280, "≈ один универсальный блок:\nконструктор + описание + вопросы.\nДобавляй / убирай / двигай.")

// Стрелки спины
arrow(A1, A2); arrow(A2, A3); arrow(A3, A4); arrow(A4, A5); arrow(A5, A6); arrow(A6, A7)
// Связь A6 → кластер
arrowSide(A6, B3)

// Открытые вопросы (аннотации)
note(20, 300, 300, "❓ Сейчас «Стадии воронки» спрятаны\nвнутри блока — вынести в этот\nвыбор сценария (в начало)?")
note(20, 575, 300, "→ Стоп-слова / авто-отказ /\nэскалацию «созвониться» —\nубрать ВНУТРЬ чат-бота")
note(20, 440, 300, "→ Отклик: первое + аварийное +\nдожим — одной группой/цепочкой")

writeFileSync("docs/architecture/funnel-concept.excalidraw", JSON.stringify({
  type: "excalidraw", version: 2, source: "https://excalidraw.com",
  elements: els, appState: { viewBackgroundColor: "#ffffff", gridSize: 20 }, files: {},
}, null, 2))
console.log("OK:", els.length, "elements")
