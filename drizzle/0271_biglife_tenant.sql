-- Big Life как полноценный тенант платформы (09.07.2026): раньше /admin/platform/big-life-covers
-- был доступен только platform-admin'ам; теперь Big Life — обычная компания с director-аккаунтом,
-- доступ через requireCompany()/requireDirector() (см. lib/big-life/auth.ts).

INSERT INTO companies (id, name)
VALUES ('a39c8844-2e7a-4adb-bb29-8645b2fbc9ff', 'BIG Life online magazine')
ON CONFLICT (id) DO NOTHING;

-- Первый director-аккаунт для Big Life. Пароль сгенерирован одноразово и
-- сообщён владельцу вне репозитория — сменить при первом входе.
INSERT INTO users (id, email, name, password_hash, role, company_id)
VALUES (
  gen_random_uuid(),
  'director@biglife.company24.pro',
  'BIG Life',
  '$2b$10$oQ0b.1mVKHT0wqFC2iRNv.1q2LE2FTHQ1f5Ki3uMneyWkeCHGE2wO',
  'director',
  'a39c8844-2e7a-4adb-bb29-8645b2fbc9ff'
)
ON CONFLICT (email) DO NOTHING;

ALTER TABLE big_life_covers ADD COLUMN IF NOT EXISTS company_id uuid;
UPDATE big_life_covers SET company_id = 'a39c8844-2e7a-4adb-bb29-8645b2fbc9ff' WHERE company_id IS NULL;
ALTER TABLE big_life_covers ALTER COLUMN company_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'big_life_covers_company_id_companies_id_fk'
  ) THEN
    ALTER TABLE big_life_covers
      ADD CONSTRAINT big_life_covers_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS big_life_covers_company_idx ON big_life_covers(company_id);
