// Конфигурация трекера продуктивности подрядчика.
//
// Сейчас следим за одним человеком (maria) и его репозиториями на отдельном
// сервере 72.56.241.159. Сбор идёт по SSH (read-only) — ничего на её машину не
// ставим. Доступ — ключ marketradar_ed25519 (тот же, которым ходим на Market
// Radar). На проде ключ должен лежать в ~/.ssh у пользователя cron'а.
//
// Всё переопределяется через env, чтобы при необходимости добавить второго
// человека/сервер без правки кода.

import os from "os"
import path from "path"

export interface RepoConfig {
  /** Машинный ключ репо (без пробелов). */
  key:   string
  /** Человеческий ярлык для UI. */
  label: string
  /** Абсолютный путь к рабочему дереву на сервере. */
  path:  string
}

// Порядок важен: дев-каталоги в /home идут раньше деплой-чекаутов в /var/www,
// чтобы при дедупе по SHA коммит относился к дев-репо, а не к staging.
export const REPOS: RepoConfig[] = [
  { key: "marketradar-leadgen", label: "Leadgen",        path: "/home/maria/marketradar-leadgen" },
  { key: "call-agent",          label: "Call-agent",     path: "/home/maria/call-agent" },
  { key: "marketradar-parser",  label: "Parser",         path: "/home/maria/marketradar-parser" },
  { key: "market-radar-bot",    label: "Bot",            path: "/home/maria/market-radar-bot" },
  { key: "market-radar",        label: "Market Radar",   path: "/var/www/market-radar" },
  { key: "market-radar-staging", label: "MR staging",    path: "/var/www/market-radar-staging" },
]

export const PERSON = process.env.DEV_ACTIVITY_PERSON ?? "maria"
export const PERSON_LABEL = process.env.DEV_ACTIVITY_PERSON_LABEL ?? "Мария"
// Заголовок страницы (продукт/проект, а не человек). PERSON_LABEL выше остаётся
// для контекста AI-разбора.
export const DISPLAY_LABEL = process.env.DEV_ACTIVITY_DISPLAY_LABEL ?? "Маркет Радар"

export interface SshConfig {
  host:    string
  user:    string
  keyPath: string
}

export function getSshConfig(): SshConfig {
  return {
    host:    process.env.DEV_ACTIVITY_SSH_HOST ?? "72.56.241.159",
    user:    process.env.DEV_ACTIVITY_SSH_USER ?? "root",
    // По умолчанию ~/.ssh/marketradar_ed25519 у текущего пользователя:
    // на Mac → /Users/juri/.ssh/..., на проде под root → /root/.ssh/...
    keyPath: process.env.DEV_ACTIVITY_SSH_KEY ?? path.join(os.homedir(), ".ssh", "marketradar_ed25519"),
  }
}

// Сколько дней истории тянуть из git за один сбор. Окно нормы — 28 дней,
// берём с запасом.
export const LOOKBACK_DAYS = 35

// Сколько последних календарных дней гарантированно показываем в журнале/графике
// (включая «тихие» дни без коммитов).
export const WINDOW_DAYS = 30
