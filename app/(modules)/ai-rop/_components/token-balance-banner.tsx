// Баннер низкого токен-баланса на дашборде AI-РОП — читает
// lib/ai-rop/tokens.ts::getBillingStatus() напрямую (server component).
// Показывается директору/владельцу (только они видят токены в настройках);
// для manager баннер скрыт — не его зона ответственности.
import Link from "next/link"
import { AlertTriangle, Coins } from "lucide-react"
import type { BillingStatus } from "@/lib/ai-rop/tokens"

export function TokenBalanceBanner({ status }: { status: BillingStatus }) {
  if (!status.enforce) return null
  if (!status.low && !status.blocked) return null

  return (
    <div className={`mb-4 flex items-start gap-3 rounded-lg border p-3 text-sm ${
      status.blocked
        ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
    }`}>
      {status.blocked ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Coins className="mt-0.5 size-4 shrink-0" />}
      <div className="leading-relaxed">
        {status.blocked ? (
          <>
            <b>Токены AI-РОП закончились.</b> Разбор новых звонков остановлен — баланс {status.balance}.{" "}
          </>
        ) : (
          <>
            <b>Токены AI-РОП заканчиваются.</b> Осталось {status.balance} (порог {status.lowThreshold}).{" "}
          </>
        )}
        <Link href="/ai-rop/settings" className="font-medium underline underline-offset-2">Пополнить в настройках</Link>
      </div>
    </div>
  )
}
