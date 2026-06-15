-- Маркер «тест отправлен» для кандидата.
-- Раньше отправка теста двигала стадию кандидата в test_task_sent → в колонке
-- «Статус» появлялось «Тест отправлен» (нежелательно). Теперь факт отправки
-- хранится отдельно и драйвит ТОЛЬКО колонку «Тест» (= «отп.»), не трогая воронку.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS test_invite_sent_at timestamptz;

-- Бэкфилл: кандидаты, которым тест отправили через РУЧНУЮ рассылку hh
-- (она двигала стадию в test_task_sent, но НЕ создавала follow_up_messages),
-- возвращаем в «Первичный контакт» (где они и были) и ставим маркер отправки.
-- Балл/прогресс теста (если есть сабмишен) остаётся в колонке «Тест» — на стадию
-- он не влияет (как у Наумова: «Пер. контакт» + балл в колонке).
-- Кандидаты от регулярного «Отправить тест» имеют follow_up_messages(branch='test_invite')
-- — их НЕ трогаем.
UPDATE candidates c
SET stage = 'primary_contact',
    test_invite_sent_at = COALESCE(c.test_invite_sent_at, c.updated_at, now()),
    updated_at = now()
WHERE c.stage = 'test_task_sent'
  AND NOT EXISTS (
    SELECT 1 FROM follow_up_messages f
    WHERE f.candidate_id = c.id AND f.branch = 'test_invite'
  );
