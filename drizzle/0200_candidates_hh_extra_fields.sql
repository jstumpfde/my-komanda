-- migration 0200: candidates_hh_extra_fields
-- Дополнительные поля из hh.ru резюме, которые раньше хранились только
-- в hh_responses.raw_data и не индексировались в candidates.
--
-- driver_licenses      — категории прав: ["A","B","C",...]
-- has_vehicle          — есть личный автомобиль
-- citizenship_names    — гражданство: ["Россия","Беларусь",...]
-- work_ticket_names    — разрешение на работу: ["Россия",...]
-- professional_roles   — желаемые профобласти/роли: ["Менеджер по продажам",...]

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS driver_licenses     text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS has_vehicle         boolean,
  ADD COLUMN IF NOT EXISTS citizenship_names   text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS work_ticket_names   text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS professional_roles  text[] DEFAULT '{}';
