# RUNBOOK — поддомены компаний {sub}.company24.pro

> Цель: чтобы `mycompany.company24.pro` открывал карьерную страницу компании
> (её опубликованные вакансии). КОД готов и проверен на стейджинге; осталась ИНФРА.

## ✅ Что уже сделано (код, в develop / на стейджинге)
- HR задаёт поддомен: Настройки → Брендинг → «Поддомен компании» (проверка занятости + сохранение в companies.subdomain).
- middleware.ts: `{sub}.company24.pro` корень → rewrite на `/careers?sub=...`.
- app/(public)/careers/page.tsx: резолвит компанию по subdomain, показывает бренд + опубликованные вакансии (ссылки на /vacancy/{slug}).
- Проверено: /careers?sub=demohr → бренд + 2 реальные вакансии (200).

## ❌ Что осталось (ИНФРА — нужен доступ к Timeweb DNS у Юрия)
DNS-зона company24.pro — на **Timeweb** (ns1.timeweb.ru). Сейчас `*.company24.pro`
НЕ резолвится, wildcard-TLS нет, nginx обслуживает только `company24.pro`.

### Вариант A — простой, для первых компаний (рекомендую начать с него)
Per-subdomain, HTTP-01 (автопродление работает само).
1. **Timeweb DNS** (Юрий): добавить A-запись `mycompany` → `5.42.125.91`.
2. **На сервере** (могу я по команде): получить cert + nginx-блок одной командой:
   ```bash
   sudo certbot --nginx -d mycompany.company24.pro
   ```
   certbot сам создаст server-блок (proxy_pass localhost:3000) + TLS, автопродление.
   ⚠️ Важно: в созданном блоке должно быть `proxy_set_header Host $host;` (чтобы
   приложение видело поддомен). certbot копирует из дефолтного — проверить/добавить.
3. Готово: `mycompany.company24.pro` открывает карьерную страницу.

### Вариант B — wildcard, на вырост (много компаний)
1. **Timeweb DNS** (Юрий): A-запись `*` → `5.42.125.91`.
2. **Wildcard TLS** (DNS-01, Юрий добавляет TXT по запросу certbot):
   ```bash
   sudo certbot certonly --manual --preferred-challenges dns \
     -d "*.company24.pro" -d "company24.pro"
   ```
   certbot выдаст TXT `_acme-challenge.company24.pro` → добавить в Timeweb DNS →
   дождаться (`dig TXT _acme-challenge.company24.pro`) → Enter.
   ⚠️ Минус: ручное продление каждые 90 дней (если нет Timeweb DNS-API плагина).
3. **nginx wildcard-блок** (могу я): `/etc/nginx/sites-available/wildcard.company24.pro`:
   ```nginx
   server {
     listen 80;
     server_name *.company24.pro;
     return 301 https://$host$request_uri;
   }
   server {
     listen 443 ssl;
     server_name *.company24.pro;
     ssl_certificate     /etc/letsencrypt/live/company24.pro/fullchain.pem;  # wildcard
     ssl_certificate_key /etc/letsencrypt/live/company24.pro/privkey.pem;
     location / {
       proxy_pass http://localhost:3000;
       proxy_set_header Host $host;            # КРИТИЧНО: приложение читает поддомен
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```
   `ln -s` в sites-enabled, `nginx -t && systemctl reload nginx`.

## Порядок запуска (рекомендация)
1. Сначала Вариант A на ОДНОЙ компании — убедиться что весь путь работает на проде.
2. Если компаний много — перейти на Вариант B (wildcard).
3. Юрий делает DNS-записи в Timeweb; nginx/certbot на сервере выполняю я по команде.

## Проверка после настройки
`curl -I https://mycompany.company24.pro` → 200, открывается карьерная страница с
вакансиями компании, у которой companies.subdomain='mycompany'.
