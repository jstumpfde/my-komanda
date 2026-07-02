// Центральный реестр AI-моделей платформы. ЕДИНСТВЕННОЕ место, где
// захардкожены model id — везде в коде импортировать отсюда.
//
// Политика (ревизия цен 02.07.2026):
//  - AI_MODEL_MAIN — основная модель (скоринг, генерация текстов, HR-чаты,
//    Нэнси/Юлия): claude-sonnet-5 — $2/$10 за MTok (промо до 31.08.2026,
//    далее $3/$15). Дешевле и новее claude-sonnet-4-6 ($3/$15), ~-33%.
//  - AI_MODEL_FAST — дешёвые/массовые задачи (пре/пост-фильтры чат-бота,
//    классификация ответов, скрининг резюме): claude-haiku-4-5 — $1/$5.
//
// ВАЖНО про claude-sonnet-5: non-default temperature/top_p/top_k → 400
// (у Sonnet 4.6 работали). НЕ передавать temperature в вызовы с AI_MODEL_MAIN.
export const AI_MODEL_MAIN = "claude-sonnet-5"
export const AI_MODEL_FAST = "claude-haiku-4-5-20251001"
