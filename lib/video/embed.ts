// Универсальное распознавание провайдеров видео для блока «Видео».
// Поддерживает: YouTube, Vimeo, RuTube, VK Видео, Яндекс.Диск, прямые .mp4/.webm.
// Используется на публичной демо-странице (app/(public)/demo/[token]/demo-client.tsx)
// и в редакторе (components/vacancies/demo-card.tsx).

export type VideoProvider =
  | "youtube"
  | "vimeo"
  | "rutube"
  | "vk"
  | "yandex_disk"
  | "direct"
  | "unknown"

export interface VideoEmbedInfo {
  provider:    VideoProvider
  embedUrl:    string | null  // URL для iframe
  directUrl:   string | null  // URL для <video> тега (mp4/webm/ogg/mov)
  originalUrl: string         // То что вставил пользователь
}

const DIRECT_VIDEO_EXT = /\.(mp4|webm|ogg|mov)(\?.*)?$/i

const YOUTUBE_PATTERNS: RegExp[] = [
  /youtube\.com\/watch\?[^#]*v=([A-Za-z0-9_-]{11})/,
  /youtu\.be\/([A-Za-z0-9_-]{11})/,
  /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  /youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{11})/,
]

function matchYoutubeId(url: string): string | null {
  for (const re of YOUTUBE_PATTERNS) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

function matchVimeoId(url: string): string | null {
  // vimeo.com/{id}, player.vimeo.com/video/{id}, vimeo.com/channels/.../{id}
  const m1 = url.match(/player\.vimeo\.com\/video\/(\d+)/)
  if (m1) return m1[1]
  const m2 = url.match(/vimeo\.com\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|video\/)?(\d+)/)
  if (m2) return m2[1]
  return null
}

function matchRutubeId(url: string): string | null {
  // rutube.ru/video/{id}/, rutube.ru/play/embed/{id}, rutube.ru/video/private/{id}
  const m = url.match(/rutube\.ru\/(?:video\/(?:private\/)?|play\/embed\/)([a-f0-9]+)/i)
  return m ? m[1] : null
}

function matchVkVideo(url: string): { oid: string; id: string } | null {
  // vk.com/video{owner}_{id}, vk.com/clip{owner}_{id}, vkvideo.ru/video{owner}_{id}
  const m = url.match(/(?:vk\.com|vkvideo\.ru)\/(?:video|clip)(-?\d+)_(\d+)/)
  if (!m) return null
  return { oid: m[1], id: m[2] }
}

function matchYandexDiskId(url: string): string | null {
  // disk.yandex.ru/i/{id}, yadi.sk/i/{id}
  const m = url.match(/(?:disk\.yandex\.[a-z]+|yadi\.sk)\/i\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

export function detectVideoProvider(url: string): VideoProvider {
  if (!url || typeof url !== "string") return "unknown"
  const trimmed = url.trim()
  if (matchYoutubeId(trimmed))     return "youtube"
  if (matchVimeoId(trimmed))       return "vimeo"
  if (matchRutubeId(trimmed))      return "rutube"
  if (matchVkVideo(trimmed))       return "vk"
  if (matchYandexDiskId(trimmed))  return "yandex_disk"
  if (DIRECT_VIDEO_EXT.test(trimmed)) return "direct"
  return "unknown"
}

export function getVideoEmbedInfo(url: string): VideoEmbedInfo {
  const original = (url ?? "").trim()
  if (!original) {
    return { provider: "unknown", embedUrl: null, directUrl: null, originalUrl: url ?? "" }
  }

  const ytId = matchYoutubeId(original)
  if (ytId) {
    return {
      provider:    "youtube",
      embedUrl:    `https://www.youtube.com/embed/${ytId}?rel=0`,
      directUrl:   null,
      originalUrl: original,
    }
  }

  const vimeoId = matchVimeoId(original)
  if (vimeoId) {
    return {
      provider:    "vimeo",
      embedUrl:    `https://player.vimeo.com/video/${vimeoId}`,
      directUrl:   null,
      originalUrl: original,
    }
  }

  const rutubeId = matchRutubeId(original)
  if (rutubeId) {
    return {
      provider:    "rutube",
      embedUrl:    `https://rutube.ru/play/embed/${rutubeId}`,
      directUrl:   null,
      originalUrl: original,
    }
  }

  const vk = matchVkVideo(original)
  if (vk) {
    return {
      provider:    "vk",
      embedUrl:    `https://vk.com/video_ext.php?oid=${vk.oid}&id=${vk.id}&hd=2`,
      directUrl:   null,
      originalUrl: original,
    }
  }

  const ydId = matchYandexDiskId(original)
  if (ydId) {
    // Яндекс.Диск часто блокирует iframe через X-Frame-Options.
    // Пытаемся через preview, в UI помечаем риском.
    return {
      provider:    "yandex_disk",
      embedUrl:    `https://disk.yandex.ru/preview/${ydId}`,
      directUrl:   null,
      originalUrl: original,
    }
  }

  if (DIRECT_VIDEO_EXT.test(original) || original.startsWith("blob:") || original.startsWith("data:")) {
    return {
      provider:    "direct",
      embedUrl:    null,
      directUrl:   original,
      originalUrl: original,
    }
  }

  return { provider: "unknown", embedUrl: null, directUrl: null, originalUrl: original }
}

export const VIDEO_PROVIDER_LABELS: Record<VideoProvider, string> = {
  youtube:     "YouTube",
  vimeo:       "Vimeo",
  rutube:      "RuTube",
  vk:          "VK Видео",
  yandex_disk: "Яндекс.Диск",
  direct:      "Прямой файл",
  unknown:     "Неизвестно",
}
