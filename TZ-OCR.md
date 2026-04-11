# ТЗ: OCR загрузок — картинки/чеки/фото в текст

## Концепция
Пользователь загружает изображение (фото документа, чек, скан) → Claude Vision API извлекает текст → результат сохраняется как статья в базу знаний.

## Шаг 1: API для OCR
Файл: app/api/modules/knowledge/ocr/route.ts

POST (multipart/form-data):
- requireCompany()
- Принять файл (image/jpeg, image/png, image/webp, application/pdf — до 10MB)
- Конвертировать в base64
- Отправить в Claude Vision API через прямой вызов (НЕ через getClaudeMessagesUrl — Vision нужен прямой Anthropic API)
- System prompt: "Извлеки весь текст из изображения. Сохрани структуру: заголовки, списки, таблицы. Если это чек или накладная — извлеки: дату, номер, позиции, суммы. Отвечай на русском."
- Вернуть: { ok: true, text: string, title: string }

Опционально POST с body { text, title, saveToKnowledge: true }:
- Сохранить как knowledgeArticle со status="draft"

## Шаг 2: Шестая строка accordion в settings
В knowledge-v2/settings/page.tsx добавить:
- Иконка: Camera (lucide)
- Текст: "OCR — распознавание документов"
- Подтекст: "Загрузите фото документа для извлечения текста"
- При раскрытии:
  - Зона drag-and-drop для загрузки файла (или кнопка "Выбрать файл")
  - После загрузки: спиннер "Распознаю..."
  - Результат: textarea с извлечённым текстом (редактируемый)
  - Кнопка "Сохранить в базу знаний" (primary)
  - Кнопка "Копировать текст" (secondary)

## Шаг 3: Также добавить OCR в виджет Ненси
НЕ МЕНЯТЬ ai-assistant-widget.tsx напрямую.
Вместо этого создать отдельный компонент:
Файл: components/knowledge/ocr-upload.tsx
- Кнопка с иконкой Camera рядом с микрофоном в виджете
- При клике — file input accept="image/*,application/pdf"
- После выбора — вызов OCR API → текст вставляется в поле ввода Ненси

## ВАЖНО:
- НЕ ТРОГАТЬ: ai-assistant-widget.tsx, editor.tsx
- Claude Vision API: model "claude-sonnet-4-20250514", content type "image"
- API ключ брать из process.env.ANTHROPIC_API_KEY
- Максимум файла: 10MB
- Поддержка: JPEG, PNG, WebP, PDF (первая страница)
