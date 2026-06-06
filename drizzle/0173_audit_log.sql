-- ФЗ-152: журнал аудита операций с персональными данными кандидатов.
-- Фиксируем: кто (user), в какой компании (tenant), что сделал (action) с какой
-- сущностью (entity_type/entity_id), сколько записей (count), доп. контекст (meta).
-- Доступ/экспорт/удаление ПДн логируются для соответствия закону.
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  user_email  text,                      -- денормализовано для читаемости журнала
  action      text NOT NULL,             -- candidate_export | candidate_delete | candidate_view_contacts | ...
  entity_type text,                       -- candidate | vacancy | ...
  entity_id   text,                       -- id сущности (или вакансии для пачки)
  count       integer,                    -- сколько записей затронуто (для пачек/экспорта)
  meta        jsonb DEFAULT '{}'::jsonb,  -- произвольный контекст (формат экспорта, причина, фильтры)
  ip          text,
  created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_tenant_created_idx ON audit_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action);
