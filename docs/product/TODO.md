# TODO

## Расшифровка видео-ответов кандидатов через Whisper API + AI оценка текста

Идея: видео-ответы из анкеты кандидата (block.type === "media",
`anketa_answers[i].answer.url` с `mediaType=video`) пропускаются через
Whisper API → текстовая транскрипция → AI-скоринг учитывает её наряду
с обычными текстовыми ответами.

### Проверка готовой инфраструктуры (29.04.2026)

- `grep -rin "whisper\\|transcrib"` по `app/` и `lib/` — Whisper упомянут
  только в `app/(modules)/qc/settings/page.tsx` как **планируемая**
  интеграция для QC-модуля (контроль качества звонков). В коде нет
  вызовов API, нет ENV-ключа, нет helper'а.
- `OPENAI_API_KEY` в `.env*` не присутствует (используется только
  `ANTHROPIC_API_KEY` через `lib/anthropic.ts` / `score-candidate` route).

Итого: расшифровки **нет** — нужно подключать с нуля.

### Минимальный план реализации

1. Добавить `OPENAI_API_KEY` (или взять Whisper через прокси-провайдера).
2. Создать `lib/transcription.ts` с функцией `transcribeMedia(url, mime)`
   — скачивает файл из `public/`, отправляет в `/v1/audio/transcriptions`.
3. После сохранения media-ответа в `app/api/public/demo/[token]/upload-media/route.ts`
   — фоном запустить транскрипцию, записать в `anketa_answers[i].answer.transcript`.
4. В `app/api/vacancies/[id]/score-candidate/route.ts` — учитывать
   `transcript` при формировании промпта.
5. В `components/candidates/answers-tab.tsx` — показывать транскрипцию
   рядом с видео/аудио плеером (collapse/expand).

### Риски

- Стоимость Whisper $0.006/мин — на 263 откликах с ~2-минутными
  видео-ответами это ≈$3, не страшно.
- Ассинхронность: транскрипция занимает 5-15 сек, не блокировать UX
  кандидата — fire-and-forget на стороне сервера.
