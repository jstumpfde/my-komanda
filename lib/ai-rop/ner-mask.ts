// Маскирование ФИО и адресов через локальный NER-сервис (порт call-agent
// lib/ner-mask.ts) — минимизация ПДн перед отправкой текста в зарубежный AI
// (152-ФЗ, трансграничная передача персональных данных).
//
// NER_SERVICE_URL — платформенный (не per-company) env, как и в оригинале:
// сервис (Natasha) поднимается один раз на сервере компании, а не настраивается
// в rop_settings. На проде company24 сервиса пока НЕТ (см. план, открытый
// вопрос №2 Юрию) — деградирует мягко (fail-open), см. docblock ниже.
const NER_SERVICE_URL = process.env.NER_SERVICE_URL || "http://127.0.0.1:8801";

interface NerEntity {
  type: "PER" | "LOC";
  start: number;
  stop: number;
  text: string;
}

/**
 * Маскирует ФИО и адреса через локальный NER-сервис (Natasha, 127.0.0.1 —
 * не покидает сервер). Деградирует мягко: если сервис недоступен/таймаут —
 * возвращает текст БЕЗ NER-маскирования (только regex-слой maskPII всё
 * равно применяется отдельно вызывающей стороной) и громко логирует —
 * не блокирует обработку звонка целиком ради необязательного доп.слоя защиты.
 */
export async function maskNamesAndAddresses(text: string): Promise<string> {
  if (!text) return text;
  try {
    const res = await fetch(`${NER_SERVICE_URL}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`NER-сервис HTTP ${res.status}`);
    const { entities } = (await res.json()) as { entities: NerEntity[] };
    if (!entities?.length) return text;
    let result = text;
    for (const e of [...entities].sort((a, b) => b.start - a.start)) {
      const placeholder = e.type === "PER" ? "[ИМЯ]" : "[АДРЕС]";
      result = result.slice(0, e.start) + placeholder + result.slice(e.stop);
    }
    return result;
  } catch (e) {
    console.warn(
      `[ai-rop/ner-mask] NER-сервис недоступен (${(e as Error).message}) — маскирование имён/адресов пропущено для этого текста, regex-маскирование телефон/email применяется отдельно`
    );
    return text;
  }
}
