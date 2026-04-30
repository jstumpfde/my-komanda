-- Per-company privacy policy (ФЗ-152). Если privacy_policy_html = NULL,
-- на /politicahr2026 рендерится дефолтный шаблон, сгенерированный
-- по реквизитам компании (lib/legal/default-privacy-policy.ts).

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "privacy_policy_html"        text,
  ADD COLUMN IF NOT EXISTS "privacy_policy_updated_at"  timestamp;
