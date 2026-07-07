-- 0263: Типология — антифрод для реферальной механики.
--
-- Фарм рефералов через инкогнито/разные cookie с одного устройства: ip_hash
-- (sha256(ip + NEXTAUTH_SECRET), см. lib/tip/session.ts) позволяет тихо не
-- привязывать реферала и не начислять welcome/бонус, если реферер и
-- приглашённый пришли с одного IP (см. lib/tip/referral.ts::attachReferral,
-- processReferralActivation).
--
-- welcome_granted_at на tip_referrals — момент начисления welcome-прогонов
-- приглашённому, нужен для капа «не больше 2 welcome-начислений на один
-- ip_hash за последние 30 дней» (join tip_referrals -> tip_users по ip_hash).

ALTER TABLE tip_users ADD COLUMN IF NOT EXISTS ip_hash text;
CREATE INDEX IF NOT EXISTS tip_users_ip_hash_idx ON tip_users (ip_hash);

ALTER TABLE tip_referrals ADD COLUMN IF NOT EXISTS welcome_granted_at timestamptz;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
