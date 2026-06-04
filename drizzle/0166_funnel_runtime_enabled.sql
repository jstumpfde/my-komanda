-- Phase 3 консолидации воронки: отдельный флаг переключения РАНТАЙМА на чтение
-- Funnel Builder (funnel_config_json) вместо legacy-полей.
--
-- Зачем отдельный флаг, а не funnel_builder_enabled:
--   funnel_builder_enabled = «HR пользуется конструктором / включён dual-write»
--   и стоит true у 11 из 19 вакансий. Переключать рантайм по нему — значит
--   разом флипнуть 11 живых вакансий (включая чужие). Поэтому рантайм гейтится
--   ОТДЕЛЬНЫМ флагом, по умолчанию false — включаем точечно (полигон), обратимо.
--
-- Семантика чтения (lib/funnel-builder/runtime.ts isBlockEnabled):
--   funnel_runtime_enabled=false → рантайм читает legacy ровно как раньше.
--   funnel_runtime_enabled=true  → для блока берётся funnel_config_json.blocks[].enabled,
--                                   а если блок отсутствует в конфиге — fallback на legacy.
ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS funnel_runtime_enabled boolean NOT NULL DEFAULT false;
