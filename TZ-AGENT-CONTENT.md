# ТЗ: Агент автогенерации контента

## Концепция
Кнопка "AI-генерация" на странице создания материала. Пользователь выбирает тип документа, вводит тему — агент генерирует полный документ по мастер-шаблону из system prompt Ненси и сохраняет как черновик.

## Шаг 1: API генерации

Файл: app/api/modules/knowledge/generate/route.ts

POST:
- requireCompany()
- body: { type: string, topic: string, department?: string, audience?: string }
- type: "regulation" | "instruction" | "sales_script" | "onboarding" | "job_description" | "faq" | "article" | "test" | "privacy_policy" | "offer" | "cookie_policy"
- Для каждого type — свой system prompt (использовать мастер-шаблоны из SYSTEM_PROMPT Ненси)
- Вызвать Claude API через getClaudeMessagesUrl()
- Сохранить результат как knowledgeArticle со status="draft"
- Вернуть { ok: true, articleId, title }

## Шаг 2: UI кнопка на странице создания

В существующей странице /knowledge-v2/create найти каталог типов.
Для каждого типа который "Скоро" — заменить на рабочую кнопку:
- При клике открывается модалка: поле "Тема" + опционально "Отдел" + кнопка "Сгенерировать"
- После генерации — редирект на редактор статьи

Если это сложно встроить — альтернативный вариант:
Добавить четвёртую строку accordion в knowledge-v2/settings:
- Иконка: Sparkles (lucide)
- Текст: "AI-генерация документов"
- При раскрытии: select типа документа + поле темы + кнопка "Сгенерировать"
- После генерации показать ссылку на созданный черновик

## ВАЖНО:
- НЕ ТРОГАТЬ: ai-assistant-widget.tsx, editor.tsx
- Мастер-шаблоны брать из SYSTEM_PROMPT в ai-assistant-widget.tsx (скопировать нужные структуры в API)
- Claude API через getClaudeMessagesUrl()
- Сохранять через INSERT в knowledgeArticles
