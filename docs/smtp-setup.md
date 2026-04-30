# SMTP Setup (Timeweb)

Транзакционные письма (восстановление пароля и т.п.) уходят через SMTP-провайдера
Timeweb с почтового ящика `noreply@mycomanda24.ru`.

## 1. Заказать почту в Timeweb

В панели Timeweb → «Почта» → создать ящик `noreply@mycomanda24.ru`.

Записать пароль — он понадобится для `SMTP_PASSWORD` на сервере.

## 2. Настроить DNS-записи для домена `mycomanda24.ru`

Без правильных DNS-записей письма будут попадать в спам или вообще отклоняться.

### SPF (TXT-запись на корне)

```
mycomanda24.ru.  IN  TXT  "v=spf1 include:_spf.timeweb.ru ~all"
```

### DKIM (TXT-запись)

В панели Timeweb → «Почта» → раздел DKIM → скопировать выданное значение
и добавить TXT-запись по указанному имени (обычно `mail._domainkey`).

```
mail._domainkey.mycomanda24.ru.  IN  TXT  "v=DKIM1; k=rsa; p=<публичный ключ от Timeweb>"
```

### DMARC (TXT-запись)

```
_dmarc.mycomanda24.ru.  IN  TXT  "v=DMARC1; p=quarantine; rua=mailto:postmaster@mycomanda24.ru; pct=100"
```

После добавления DNS подождать 15-60 минут до распространения, затем проверить:

```
dig +short TXT mycomanda24.ru
dig +short TXT mail._domainkey.mycomanda24.ru
dig +short TXT _dmarc.mycomanda24.ru
```

Можно также проверить через https://www.mail-tester.com — отправить тестовое письмо
и убедиться что SPF/DKIM/DMARC валидируются (целевой score 9-10/10).

## 3. Прописать `.env.local` на сервере

```
SMTP_HOST=smtp.timeweb.ru
SMTP_PORT=465
SMTP_USER=noreply@mycomanda24.ru
SMTP_PASSWORD=<пароль из шага 1>
SMTP_FROM=noreply@mycomanda24.ru
```

> Если `SMTP_PASSWORD` не задан — клиент не падает, а только пишет в лог
> «would send to ...». Удобно для dev-окружения.

## 4. Перезапуск приложения

```
pm2 restart mycomanda
pm2 logs mycomanda --lines 50
```

## 5. Проверка

1. Открыть `/forgot-password`
2. Ввести существующий email
3. В логах должна быть строка про отправку (или `[EMAIL] would send to ...`
   если пароль не задан)
4. Проверить почту — должно прийти письмо со ссылкой `/reset-password?token=...`
5. По ссылке установить новый пароль — войти с ним

## Troubleshooting

- **Письма падают в спам** — добавить SPF/DKIM/DMARC и подождать сутки.
- **`535 Authentication failed`** — проверить `SMTP_USER` и `SMTP_PASSWORD`,
  пересоздать пароль в панели Timeweb.
- **`Connection timeout`** — Timeweb может блокировать порт 25, использовать 465 (SSL/TLS).
- **Письма не приходят, в логах нет ошибок** — проверить, что `SMTP_PASSWORD`
  непустой; если пустой, клиент работает в режиме симуляции.
