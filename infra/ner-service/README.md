# NER-сервис (Natasha) — маскирование ФИО/адресов для 152-ФЗ

## Что это

Локальный Python/FastAPI сервис, извлекающий именованные сущности (ФИО и
адреса) из текста через библиотеку [Natasha](https://github.com/natasha/natasha)
(NewsEmbedding + NewsMorphTagger + NewsNERTagger, без синтаксического разбора —
эмпирически не влияет на качество NER, см. комментарий в `main.py`).

Используется модулем **ai-rop** (`lib/ai-rop/ner-mask.ts`,
`maskNamesAndAddresses()`) как необязательный доп.слой минимизации ПДн:
текст звонка ДО отправки зарубежному AI (Anthropic) прогоняется через этот
сервис, найденные ФИО/адреса заменяются плейсхолдерами `[ИМЯ]` / `[АДРЕС]`.
Сервис работает строго на `127.0.0.1` — текст не покидает сервер компании.
Деградация мягкая: если сервис недоступен, `ner-mask.ts` пропускает
NER-маскирование и логирует предупреждение (звонок не блокируется).

## Происхождение

Найден 12.07 на сервере `radar` (72.56.241.159), где кто-то (вероятно, в
рамках прежней разведки/пилота) поднял его как PM2-процесс под пользователем
`maria`:

```
/home/maria/ner-service/venv/bin/python3 venv/bin/uvicorn main:app --host 127.0.0.1 --port 8801
# pm2 start "venv/bin/uvicorn main:app --host 127.0.0.1 --port 8801" --name ner-service \
#   --cwd /home/maria/ner-service --max-memory-restart 700M
```

Это НЕ систематически задеплоенный компонент company24 — отдельная разовая
инсталляция на radar. На проде company24 (5.42.125.91) сервиса ещё нет.
Этот каталог — упаковка найденного исходника + инструкция по установке на
проде company24. Установка НЕ выполнена — только подготовлено.

## Контракт (сверен с `lib/ai-rop/ner-mask.ts`)

`ner-mask.ts` шлёт:

```
POST {NER_SERVICE_URL}/extract   (по умолчанию NER_SERVICE_URL=http://127.0.0.1:8801)
Content-Type: application/json
{"text": "..."}
```

и ждёт в ответ:

```json
{"entities": [{"type": "PER", "start": 11, "stop": 22, "text": "Иван Петров"}]}
```

где `type` ∈ `PER` (ФИО) | `LOC` (адрес/местоположение), `start`/`stop` —
индексы символов в исходном тексте (UTF-16/JS-совместимые, т.к. natasha и
JS оба работают по code units для обычного русского текста без суррогатных
пар — эмодзи/редкие юникод-символы теоретически могут сместить индексы,
это унаследованный риск оригинальной реализации, не новый).

Живой прогон на radar подтвердил точное совпадение формата:

```bash
$ curl -s -X POST http://127.0.0.1:8801/extract -H "Content-Type: application/json" \
    -d '{"text": "Меня зовут Иван Петров, адрес Москва улица Тверская дом 10"}'
{"entities":[{"type":"PER","start":11,"stop":22,"text":"Иван Петров"},
             {"type":"LOC","start":30,"stop":36,"text":"Москва"},
             {"type":"LOC","start":43,"stop":55,"text":"Тверская дом"}]}

$ curl -s http://127.0.0.1:8801/health
{"ok":true}
```

Контракт **совпадает на 100%** с тем, что ожидает `ner-mask.ts` — никаких
доработок протокола не требуется.

## Содержимое каталога

- `main.py` — исходник сервиса (FastAPI, 2 роута: `POST /extract`, `GET /health`)
- `requirements.txt` — точный `pip freeze` рабочего venv на radar (Python 3.12.3)
- `test_ner.py`, `test_ner2.py` — авторские тестовые скрипты с radar (сравнение
  качества NER с/без `parse_syntax`, замеры времени на разговорных whisper-стиль
  текстах) — не часть сервиса, оставлены для справки
- `company24-ner.service` — шаблон systemd unit
- `natasha-models/` — предзагруженные модели Natasha (~31 МБ: navec-эмбеддинги +
  slovnet morph/ner), чтобы установка на проде НЕ требовала исходящего доступа
  в интернет к GitHub-хранилищу natasha в момент первого запуска. Модель
  `slovnet_syntax_news_v1.tar` НЕ включена — `main.py` не использует
  `NewsSyntaxParser` (см. комментарий в коде)

## Локальная проверка (после установки)

```bash
curl -s -X POST http://127.0.0.1:8801/extract \
  -H "Content-Type: application/json" \
  -d '{"text": "Меня зовут Иван Петров, живу в Москве на улице Тверской"}'
# ожидаем: {"entities":[{"type":"PER",...,"text":"Иван Петров"}, {"type":"LOC",...}]}

curl -s http://127.0.0.1:8801/health
# ожидаем: {"ok":true}
```

Проверка, что `ner-mask.ts` реально достучится (на сервере company24, из
каталога приложения):

```bash
# NER_SERVICE_URL не задан в .env → используется дефолт http://127.0.0.1:8801,
# так и должно быть, если сервис ставится на этот же сервер
grep NER_SERVICE_URL /var/www/my-komanda/.env || echo "не задан — используется дефолт 127.0.0.1:8801, это ОК"
```

## Установка на проде company24 (5.42.125.91)

**Важно: этот раздел — инструкция, установка НЕ выполнена в рамках этой
задачи.** Не запускать без отдельного явного решения (лишний процесс/память
на живом проде).

1. Скопировать каталог `infra/ner-service/` (без `test_ner*.py` — не нужны
   в проде) на сервер, например через `git pull` в рабочей копии репозитория
   или `rsync`:

   ```bash
   rsync -az infra/ner-service/{main.py,requirements.txt,natasha-models} \
     root@5.42.125.91:/opt/ner-service/
   ```

2. Создать отдельного системного пользователя (сервис не должен работать от
   root или от пользователя, под которым крутится основное приложение):

   ```bash
   ssh root@5.42.125.91 'useradd --system --home-dir /opt/ner-service --shell /usr/sbin/nologin nerservice
   chown -R nerservice:nerservice /opt/ner-service'
   ```

3. Создать venv и поставить зависимости (Python 3.12+; на radar сервис
   тестировался под 3.12.3):

   ```bash
   ssh root@5.42.125.91 'cd /opt/ner-service && \
     python3 -m venv venv && \
     ./venv/bin/pip install --upgrade pip && \
     ./venv/bin/pip install -r requirements.txt'
   ```

4. Разложить предзагруженные модели, чтобы избежать обращения к интернету
   при первом запуске (natasha иначе попытается скачать их сама при первом
   создании `NewsEmbedding()`/`NewsNERTagger()`):

   ```bash
   ssh root@5.42.125.91 '
     PYVER=$(/opt/ner-service/venv/bin/python3 -c "import sys; print(f\"{sys.version_info.major}.{sys.version_info.minor}\")")
     DEST=/opt/ner-service/venv/lib/python$PYVER/site-packages/natasha/data
     mkdir -p "$DEST/emb" "$DEST/model"
     cp /opt/ner-service/natasha-models/emb/navec_news_v1_1B_250K_300d_100q.tar "$DEST/emb/"
     cp /opt/ner-service/natasha-models/model/slovnet_morph_news_v1.tar "$DEST/model/"
     cp /opt/ner-service/natasha-models/model/slovnet_ner_news_v1.tar "$DEST/model/"
     chown -R nerservice:nerservice /opt/ner-service/venv
   '
   ```

   (Если пропустить этот шаг — сервис сам скачает модели при первом старте
   ПРИ УСЛОВИИ, что есть исходящий доступ в интернет; ~31 МБ, разово.)

5. Установить systemd unit:

   ```bash
   scp company24-ner.service root@5.42.125.91:/etc/systemd/system/
   ssh root@5.42.125.91 '
     systemctl daemon-reload
     systemctl enable company24-ner
     systemctl start company24-ner
     systemctl status company24-ner --no-pager
   '
   ```

6. Проверить локально на сервере (curl из шага «Локальная проверка» выше).

7. **Порт 8801 держать закрытым снаружи.** Uvicorn и так слушает только
   `--host 127.0.0.1` (не `0.0.0.0`) — порт физически не биндится на внешний
   интерфейс. Дополнительно проверить, что файрвол (ufw/iptables) не содержит
   правила `ALLOW 8801` для внешних адресов:

   ```bash
   ssh root@5.42.125.91 'ufw status | grep 8801 || echo "нет явного правила — ОК, порт закрыт по умолчанию (бинд только на 127.0.0.1)"'
   ```

8. В `.env` приложения (`/var/www/my-komanda/.env`) НИЧЕГО добавлять не
   обязательно — дефолт в `ner-mask.ts` уже `http://127.0.0.1:8801`. Задать
   `NER_SERVICE_URL` явно нужно только если порт/хост будут другими.

9. Убедиться, что `pm2 reload my-komanda` не требуется — NER-сервис работает
   независимо от Next.js процесса (отдельный systemd-юнит), перезапуск
   основного приложения его не трогает.

## Потребление ресурсов

На radar процесс держит ~210 МБ RSS в простое (замер 12.07). Прод-сервер
company24 — 15 ГБ RAM (см. CLAUDE.md, `prod-deploy-shadow-build-and-ram-upgrade`);
запас есть, но стоит понаблюдать первую неделю на живом трафике звонков
call-agent, прежде чем полагаться на сервис как обязательный (сейчас он
и не обязателен — деградация мягкая).
