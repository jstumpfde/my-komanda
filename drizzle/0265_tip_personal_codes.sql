-- 0265: Типология — личные коды-пропуска (код-пароль в конкретный аккаунт).
--
-- is_personal=true + owner_user_id: активация такого кода на вебе НЕ
-- начисляет прогоны — вместо этого browser-cookie tip_uid переключается на
-- owner_user_id (см. lib/tip/session.ts::switchTipUserCookie,
-- lib/tip/service.ts::activatePromo, ветка is_personal). Личный код можно
-- вводить сколько угодно раз — НЕ пишем tip_promo_activations и НЕ
-- инкрементируем activations_count для персональных кодов.
--
-- Уникальный частичный индекс на owner_user_id гарантирует не больше одного
-- личного кода на пользователя (lib/tip/personal-code.ts::ensurePersonalCode
-- ловит unique_violation и перечитывает существующий код при гонке).

ALTER TABLE tip_promo_codes ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;
ALTER TABLE tip_promo_codes ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES tip_users(id);

CREATE INDEX IF NOT EXISTS tip_promo_codes_owner_idx ON tip_promo_codes (owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS tip_promo_codes_owner_personal_uq
  ON tip_promo_codes (owner_user_id)
  WHERE is_personal = true AND owner_user_id IS NOT NULL;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
