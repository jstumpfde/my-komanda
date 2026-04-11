# ТЗ: RAG семантический поиск (pgvector + embeddings)

## Концепция
Вместо текстового поиска по названию — семантический поиск по смыслу через embeddings. Ненси находит релевантные материалы даже если слова не совпадают.

## Шаг 1: Установить pgvector
На сервере PostgreSQL нужно расширение pgvector.
SQL: CREATE EXTENSION IF NOT EXISTS vector;

## Шаг 2: Добавить колонку embedding в таблицы
В schema.ts (используя sql для типа vector):
- knowledgeArticles: добавить embedding vector(1536)
- demoTemplates: добавить embedding vector(1536)

SQL миграция:
ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE demo_templates ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS idx_articles_embedding ON knowledge_articles USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_demos_embedding ON demo_templates USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

## Шаг 3: API для генерации embeddings
Файл: app/api/modules/knowledge/embeddings/route.ts

POST — пересчитать embeddings для всех материалов tenant:
1. requireCompany()
2. Получить все articles + demos для tenant
3. Для каждого: взять title + content (первые 8000 символов)
4. Вызвать OpenAI Embeddings API (text-embedding-3-small) или Voyage AI
5. Сохранить embedding в БД
6. Вернуть { ok, processed: N }

Альтернатива без OpenAI: использовать Claude для простого TF-IDF вектора (менее точно но без доп. API)

## Шаг 4: Обновить ai-search для семантического поиска
В app/api/knowledge/ai-search/route.ts:
1. Получить embedding для вопроса пользователя
2. Искать через: SELECT * FROM knowledge_articles ORDER BY embedding <=> $1 LIMIT 5
3. Объединить с текстовым поиском (гибридный подход)
4. Передать найденные материалы в контекст Claude

## Шаг 5: Автоматический пересчёт при сохранении
В API создания/обновления articles — после save пересчитать embedding

## Шаг 6: Седьмая строка accordion в settings
- Иконка: Brain (lucide)
- Текст: "Семантический поиск (RAG)"
- Badge: "X материалов проиндексировано" / "Не настроен"
- При раскрытии: кнопка "Проиндексировать все материалы", прогресс-бар

## ВАЖНО:
- НЕ ТРОГАТЬ: ai-assistant-widget.tsx, editor.tsx
- pgvector нужно установить отдельно на сервере
- Embeddings: предпочтительно OpenAI text-embedding-3-small (дешёвый)
- Если нет OpenAI ключа — сделать заглушку с текстовым поиском
