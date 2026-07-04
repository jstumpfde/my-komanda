import type { Metadata } from "next"
import { OPERATOR_REQUISITES, MARKETING_CONSENT_VERSION } from "@/lib/legal/operator-requisites"

export const metadata: Metadata = {
  title: "Согласие на рекламную рассылку | Company24",
  description:
    "Согласие на получение информационных и рекламных сообщений от Company24.pro.",
}

const H2 = "text-lg font-semibold text-gray-900 mt-8 mb-2"
const P = "text-sm leading-relaxed text-gray-700"
const LINK = "text-indigo-600 hover:text-indigo-500 underline underline-offset-2"

export default function MarketingConsentPage() {
  const v = OPERATOR_REQUISITES
  const revisionDate = new Date(MARKETING_CONSENT_VERSION).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })

  return (
    <div className="min-h-screen bg-gray-950 text-white antialiased">
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-6 text-center">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
          Согласие на получение информационной и рекламной рассылки
        </h1>
        <p className="text-gray-400 text-sm">Редакция от {revisionDate}</p>
      </div>

      <div className="max-w-3xl mx-auto px-6 pb-20">
        <div className="bg-white rounded-2xl shadow-xl px-6 py-8 md:px-10 md:py-10">
          <p className={P}>
            Настоящий документ регулирует получение пользователем сервиса{" "}
            <strong>company24.pro</strong> информационных, рекламных и маркетинговых сообщений
            от Оператора — {v.legalName}, ИНН {v.inn} (далее — «Оператор»).
          </p>

          <h2 className={H2}>1. Это отдельное, необязательное согласие</h2>
          <p className={P}>
            Согласие на получение рассылки — самостоятельный юридический документ,
            не являющийся частью{" "}
            <a href="/privacy" className={LINK}>Политики конфиденциальности</a> или{" "}
            <a href="/terms" className={LINK}>Публичной оферты</a>. Оно предоставляется
            добровольно и НЕ является обязательным условием для регистрации, оплаты тарифа
            или пользования Платформой. Отказ от рассылки не влияет на доступность
            функционала Платформы.
          </p>

          <h2 className={H2}>2. Что мы отправляем</h2>
          <p className={P}>
            Информацию о новых функциях Платформы, изменениях в тарифах, образовательные
            материалы по подбору персонала и маркетингу, а также рекламные предложения
            Оператора — по электронной почте, в мессенджерах (включая Telegram) или по
            телефону, на контакты, указанные пользователем в личном кабинете.
          </p>

          <h2 className={H2}>3. Правовое основание</h2>
          <p className={P}>
            Рассылка осуществляется в соответствии с ч. 1 ст. 18 Федерального закона от
            13.03.2006 № 38-ФЗ «О рекламе» (реклама по сетям электросвязи допускается только с
            предварительного согласия абонента) и Федеральным законом № 152-ФЗ «О персональных
            данных» в части обработки контактных данных для целей рассылки.
          </p>

          <h2 className={H2}>4. Срок действия и отзыв</h2>
          <p className={P}>
            Согласие действует бессрочно либо до его отзыва. Отозвать согласие можно в любой
            момент — любым из способов:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed text-gray-700">
            <li>перейти по ссылке «отписаться», которая присутствует в каждом рекламном сообщении;</li>
            <li>отключить рассылку в настройках личного кабинета;</li>
            <li>направить заявление на e-mail{" "}
              <a href={`mailto:${v.email}`} className={LINK}>{v.email}</a>.</li>
          </ul>
          <p className={P}>
            Отзыв согласия прекращает рассылку в срок не более 3 (трёх) рабочих дней и не
            влияет на согласие на обработку персональных данных в рамках оказания основных
            услуг Платформы, действующее отдельно.
          </p>

          <h2 className={H2}>5. Оператор персональных данных</h2>
          <p className={P}>
            {v.legalName}, ИНН {v.inn}, ОГРНИП {v.ogrnip}, адрес: {v.legalAddress}.
          </p>

          <p className="text-sm text-gray-500 mt-8">
            См. также: <a href="/privacy" className={LINK}>Политика конфиденциальности</a> ·{" "}
            <a href="/terms" className={LINK}>Публичная оферта</a>
          </p>
        </div>

        <p className="text-center mt-8">
          <a href="/" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4 text-sm">
            ← Вернуться на сайт
          </a>
        </p>
      </div>
    </div>
  )
}
