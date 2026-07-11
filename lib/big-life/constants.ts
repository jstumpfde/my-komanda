// Client-safe константа тенанта Big Life (без next/headers и db) — для
// гейтов ВИДИМОСТИ пунктов меню в шапке/сайдбаре. Серверная АВТОРИЗАЦИЯ —
// lib/big-life/auth.ts (requireBigLifeAccess), там env BIGLIFE_COMPANY_ID
// имеет приоритет над этим дефолтом.
export const BIGLIFE_COMPANY_ID = "a39c8844-2e7a-4adb-bb29-8645b2fbc9ff"
