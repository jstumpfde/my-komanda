-- ФЗ-152: авто-удаление персональных данных отказанных кандидатов по сроку
-- хранения компании (companies.hiring_defaults_json->>'dataRetention').
-- Маркер обезличивания: после чистки ПДн ставится personal_data_erased_at,
-- чтобы крон не обрабатывал строку повторно и был аудит-след.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS personal_data_erased_at timestamptz;
