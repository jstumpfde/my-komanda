# ТЗ-6: Forgot-password + SMTP интеграция + Политика конфиденциальности

**Цель:** (1) Реализовать восстановление пароля через email. (2) Настроить
SMTP-провайдер для отправки писем. (3) Реализовать публичную страницу политики
конфиденциальности с дефолтным шаблоном для клиентов.
**Оценка:** 60-90 минут.

---

## КОНТЕКСТ

- NextAuth v5 уже настроен в app/api/auth/[...nextauth]/route.ts
- Регистрация работает: /register и app/api/auth/register/route.ts
- В выводе билда видны существующие роуты /forgot-password и /politicahr2026 —
  проверь их состояние
- В таблице companies есть поля для контактов (email, INN, name)

**Что НЕ работает:**
- Невозможно восстановить пароль (форма может быть, но логики нет)
- Нет SMTP-конфига для отправки писем
- Нет таблицы password_reset_tokens
- Политика конфиденциальности — заглушка или пусто

---

# ЧАСТЬ 1: Forgot-password — БД и API

## 1.1 Таблица password_reset_tokens

В db/schema.ts:

  export const passwordResetTokens = pgTable('password_reset_tokens', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  });

Индексы на tokenHash и expiresAt.

Миграция drizzle/0077_password_reset_tokens.sql. НЕ применяй.

## 1.2 Endpoint POST /api/auth/forgot-password

app/api/auth/forgot-password/route.ts

Логика:
1. Принимает { email: string }
2. Проверяет существует ли пользователь
3. ВАЖНО: Возвращает один и тот же ответ независимо от того, есть юзер или
   нет (защита от user enumeration). Ответ:
   { ok: true, message: 'Если такой email зарегистрирован, мы отправили письмо' }
4. Если юзер есть:
   - Генерирует токен: crypto.randomBytes(32).toString('hex')
   - Хеширует SHA-256 → пишет в БД tokenHash
   - expiresAt = now + 1 hour
   - Отправляет email со ссылкой:
     https://company24.pro/reset-password?token={токен}
     (НЕ хеш, сам токен!)
5. Записывает ipAddress, userAgent (можно null)
6. Rate limiting: не больше 3 запросов с одного email за 15 минут
   (in-memory Map или таблица — на твой выбор)

## 1.3 Endpoint POST /api/auth/reset-password

app/api/auth/reset-password/route.ts

Логика:
1. Принимает { token: string, newPassword: string }
2. Валидация пароля: минимум 8 символов, хотя бы 1 буква и 1 цифра
3. Хеширует token → ищет в БД по tokenHash
4. Проверяет: запись существует, usedAt IS NULL, expiresAt > NOW()
5. Если ОК:
   - Обновляет users.passwordHash (та же функция что в register, скорее всего bcrypt)
   - Помечает usedAt = NOW()
   - Возвращает { ok: true }
6. Если не ОК — { ok: false, error: 'invalid_or_expired_token' }, статус 400

---

# ЧАСТЬ 2: SMTP интеграция (Timeweb)

## 2.1 SMTP-клиент

Сначала проверь package.json — есть ли nodemailer или resend.
Если нет — добавь nodemailer: pnpm add nodemailer @types/nodemailer

Файл lib/email/smtp.ts:

  import nodemailer from 'nodemailer';

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASSWORD!,
    },
  });

  export async function sendEmail({ to, subject, html, text }) {
    if (!process.env.SMTP_PASSWORD) {
      console.log('[EMAIL] would send to', to, ':', subject);
      return { ok: true, simulated: true };
    }
    return transporter.sendMail({
      from: 'Company24 <' + (process.env.SMTP_FROM || process.env.SMTP_USER) + '>',
      to, subject, html, text,
    });
  }

ВАЖНО: если SMTP_PASSWORD не задан — НЕ падай, логируй и возвращай ok.
Это позволит тестировать без настроенного SMTP.

## 2.2 Email-шаблоны

lib/email/templates.ts:

  export function passwordResetEmail({ resetUrl, userName }) {
    return {
      subject: 'Восстановление пароля Company24',
      html: '<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">' +
        '<h2>Здравствуйте' + (userName ? ', ' + userName : '') + '!</h2>' +
        '<p>Вы запросили восстановление пароля. Чтобы установить новый пароль, перейдите по ссылке:</p>' +
        '<p style="margin: 24px 0;"><a href="' + resetUrl + '" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Восстановить пароль</a></p>' +
        '<p style="color: #6b7280; font-size: 14px;">Ссылка действует 1 час. Если вы не запрашивали восстановление, просто проигнорируйте это письмо.</p>' +
        '<p style="color: #6b7280; font-size: 12px; margin-top: 32px;">Company24.pro — AI Business OS</p>' +
        '</div>',
      text: 'Здравствуйте! Перейдите по ссылке для восстановления пароля: ' + resetUrl + '. Ссылка действует 1 час.',
    };
  }

## 2.3 .env.example

Добавь в .env.example:

  SMTP_HOST=smtp.timeweb.ru
  SMTP_PORT=465
  SMTP_USER=noreply@mycomanda24.ru
  SMTP_PASSWORD=
  SMTP_FROM=noreply@mycomanda24.ru

В docs/smtp-setup.md — короткая инструкция:
1. Зарегистрировать SMTP в Timeweb
2. Настроить DNS: SPF, DKIM, DMARC для mycomanda24.ru
3. Заполнить .env.local на сервере
4. pm2 restart

---

# ЧАСТЬ 3: UI восстановления пароля

## 3.1 Страница /forgot-password

app/(public)/forgot-password/page.tsx

Если страница уже есть — обнови. Если нет — создай.

UI:
- Поле email
- Кнопка «Отправить ссылку»
- После успеха — экран «Если такой email зарегистрирован, мы отправили
  письмо. Проверьте почту, в том числе папку Спам.»
- Ссылка «Вернуться к входу» → /login

## 3.2 Страница /reset-password

app/(public)/reset-password/page.tsx (новая)

UI:
- Извлекает ?token=xxx из URL
- Если токена нет — «Невалидная ссылка», ссылка на /forgot-password
- Если есть — поля «Новый пароль» + «Повторите пароль»
- Валидация: 8+ символов, 1 буква, 1 цифра, совпадение
- Кнопка «Установить пароль»
- После успеха — редирект /login с тостом «Пароль обновлён»
- Если токен невалидный/истёк — сообщение и ссылка на /forgot-password

## 3.3 Линк на /login

В app/(public)/login/page.tsx — под полем пароля ссылка «Забыли пароль?» →
/forgot-password. Если уже есть — оставь.

---

# ЧАСТЬ 4: Политика конфиденциальности (ФЗ-152)

## 4.1 Поле privacy_policy_html в companies

В companies (db/schema.ts):
  privacyPolicyHtml: text('privacy_policy_html'),
  privacyPolicyUpdatedAt: timestamp('privacy_policy_updated_at'),

Миграция drizzle/0078_company_privacy_policy.sql.

## 4.2 Дефолтный шаблон политики

lib/legal/default-privacy-policy.ts

  export function generateDefaultPrivacyPolicy(company: {
    name: string;
    inn: string;
    legalAddress?: string;
    email: string;
  }): string {
    return '<h1>Политика конфиденциальности</h1>' +
      '<p>Настоящая политика конфиденциальности определяет порядок обработки персональных данных в ' + company.name + ' (ИНН ' + company.inn + ').</p>' +
      // ... полный текст ~800-1200 слов, базовый шаблон ФЗ-152
      '';
  }

Шаблон должен содержать стандартные разделы:
- Общие положения
- Состав обрабатываемых ПД
- Цели обработки
- Правовые основания
- Способы обработки
- Сроки хранения
- Передача третьим лицам
- Права субъектов ПД
- Способы связи с оператором (использовать company.email)
- Дата вступления в силу

Не копируй чужие — напиши свой обобщённый текст ФЗ-152.

## 4.3 Страница /politicahr2026

app/(public)/politicahr2026/page.tsx

В выводе билда страница уже существует как dynamic route. Проверь и:
1. Принимает ?company={slug} или работает через домен
2. Показывает company.privacyPolicyHtml если есть, иначе дефолтный шаблон
3. Стиль — простая читаемая HTML-страница без хедера/футера платформы
4. Внизу: «Версия от {privacyPolicyUpdatedAt}» и «Powered by Company24»

## 4.4 UI редактирования политики

app/(modules)/settings/legal/page.tsx — из вывода билда роут /settings/legal есть.

UI:
- Textarea для редактирования privacyPolicyHtml
- Кнопка «Сгенерировать шаблон по умолчанию» — заполняет textarea дефолтным
- Кнопка «Сохранить»
- Превью со ссылкой «Открыть публичную страницу» → /politicahr2026
- Дата последнего обновления

## 4.5 API endpoint

app/api/admin/legal/[slug]/route.ts уже виден в билде.
Если PATCH для privacy_policy не реализован — добавь.

---

# ОБЩИЕ ТРЕБОВАНИЯ

- Атомарные коммиты по частям (1, 2, 3, 4)
- Миграции НЕ применять, только SQL-файлы
- Не запускать pnpm build, только pnpm tsc --noEmit
- НЕ ТРОГАТЬ зону HR/hh (app/api/integrations/hh/*, app/api/modules/hr/*,
  components/vacancies/*, components/candidates/*) — там ТЗ-5 в другом окне.
  Конфликты будут больно.
- Email отправка — если SMTP_PASSWORD не задан, не падай. Логируй и возвращай ok.
- Если nodemailer не установлен — добавь pnpm add nodemailer @types/nodemailer

## ГОТОВНОСТЬ
Напиши «ТЗ-6 готово» и перечисли:
1. Что сделано в каждой части (1, 2, 3, 4)
2. Изменённые/созданные файлы
3. SQL-миграции для применения
4. ENV-переменные для сервера
5. DNS-записи (SPF, DKIM, DMARC)
6. Что проверить в браузере
7. Известные TODO

Закоммить и запушь в main атомарными коммитами.
