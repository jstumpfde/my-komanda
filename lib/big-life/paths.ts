import path from "path"

// Big Life (biglife.company24.pro) — статический сайт-витрина ВНЕ репозитория
// my-komanda, живёт на том же сервере в /var/www/client-sites/biglife (см.
// nginx-конфиг /etc/nginx/sites-available/biglife.company24.pro). Публикация
// из платформенной админки пишет файлы туда напрямую через fs — без rsync/ssh,
// так как оба процесса (Next.js my-komanda и статика biglife) работают на
// одной машине. Путь читаем через env, чтобы не хардкодить прод-путь и чтобы
// в dev-окружении (Mac координатора) публикация no-op'илась вместо падения.
const DEFAULT_DIR = "/var/www/client-sites/biglife"

export function bigLifeDir(...segments: string[]): string {
  const base = process.env.BIGLIFE_STATIC_DIR || DEFAULT_DIR
  return path.join(base, ...segments)
}

export function bigLifeCoversAssetsDir(): string {
  return bigLifeDir("assets", "covers-archive")
}
