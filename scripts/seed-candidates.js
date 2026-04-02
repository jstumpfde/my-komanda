const postgres = require('postgres');
const crypto = require('crypto');
const db = postgres('postgresql://mykomanda:mykomanda2026@localhost:5432/mykomanda', { max: 1 });

const VACANCY_ID = '3232a0bb-6213-4e25-a1d8-a5d8ae2f544d';

const FIRST_M = ['Александр','Дмитрий','Максим','Сергей','Андрей','Алексей','Артём','Илья','Кирилл','Михаил','Никита','Матвей','Роман','Егор','Арсений','Иван','Денис','Евгений','Тимофей','Владислав','Игорь','Владимир','Павел','Руслан','Марк','Константин','Тимур','Олег','Ярослав','Антон','Николай','Данил','Вадим','Степан','Григорий','Пётр','Семён','Фёдор','Геннадий','Виктор','Юрий','Борис','Валерий','Леонид','Вячеслав','Георгий','Эдуард','Глеб','Лев','Захар'];
const FIRST_F = ['Анна','Мария','Елена','Ольга','Наталья','Екатерина','Татьяна','Ирина','Светлана','Юлия','Дарья','Алина','Виктория','Полина','Анастасия','Кристина','Валерия','Александра','Вероника','Диана','Ксения','Софья','Маргарита','Людмила','Галина','Надежда','Оксана','Лариса','Марина','Тамара','Зинаида','Нина','Вера','Любовь','Евгения','Алёна','Яна','Регина','Карина','Милена','Арина','Василиса','Злата','Ева','Камилла','Элина','Лилия','Жанна','Инна','Раиса'];
const LAST_M = ['Иванов','Петров','Сидоров','Козлов','Новиков','Морозов','Волков','Соловьёв','Васильев','Зайцев','Павлов','Семёнов','Голубев','Виноградов','Богданов','Воробьёв','Фёдоров','Михайлов','Беляев','Тарасов','Белов','Комаров','Орлов','Киселёв','Макаров','Андреев','Ковалёв','Ильин','Гусев','Титов','Кузьмин','Баранов','Куликов','Алексеев','Степанов','Яковлев','Сорокин','Сергеев','Романов','Захаров','Борисов','Королёв','Герасимов','Пономарёв','Григорьев','Лазарев','Медведев','Ершов','Никитин','Соболев','Рябов','Поляков','Цветков','Данилов','Жуков','Фролов','Журавлёв','Николаев','Крылов','Максимов','Сафонов','Симонов','Большаков','Лукьянов'];
const LAST_F = LAST_M.map(l => l.replace(/ёв$/, 'ёва').replace(/ов$/, 'ова').replace(/ев$/, 'ева').replace(/ин$/, 'ина'));
const PATR_M = ['Александрович','Дмитриевич','Сергеевич','Андреевич','Алексеевич','Михайлович','Владимирович','Николаевич','Павлович','Игоревич','Олегович','Юрьевич','Борисович','Валерьевич','Евгеньевич','Геннадьевич','Викторович','Петрович','Романович','Артёмович'];
const PATR_F = PATR_M.map(p => p.replace(/ич$/, 'на'));

// Stage distribution: 400 new, 250 demo, 200 interview, 100 offer, 80 hired, 70 rejected = 1100
const STAGES = [];
const dist = [['new',400],['demo',250],['interview',200],['offer',100],['hired',80],['rejected',70]];
for (const [s, n] of dist) for (let i = 0; i < n; i++) STAGES.push(s);

// Source: 50% hh, 30% site (direct), 20% referral
const SOURCES = [];
for (let i = 0; i < 550; i++) SOURCES.push('hh');
for (let i = 0; i < 330; i++) SOURCES.push('site');
for (let i = 0; i < 220; i++) SOURCES.push('referral');

// Cities: 40% Moscow, 20% SPb, 10% Ekb, 10% Kazan, 20% other
const CITIES = [];
for (let i = 0; i < 440; i++) CITIES.push('Москва');
for (let i = 0; i < 220; i++) CITIES.push('Санкт-Петербург');
for (let i = 0; i < 110; i++) CITIES.push('Екатеринбург');
for (let i = 0; i < 110; i++) CITIES.push('Казань');
const OTHER_CITIES = ['Новосибирск','Нижний Новгород','Самара','Омск','Ростов-на-Дону','Уфа','Красноярск','Воронеж','Пермь','Волгоград','Краснодар','Саратов','Тюмень','Тольятти','Ижевск','Барнаул','Иркутск','Хабаровск','Ярославль','Владивосток'];
for (let i = 0; i < 220; i++) CITIES.push(OTHER_CITIES[i % OTHER_CITIES.length]);

const SKILLS = ['B2B продажи','Холодные звонки','CRM','Переговоры','КП','Презентации','Работа с возражениями','Аналитика','Excel','1C','Тендеры','Networking','Digital маркетинг','Key Account','Планирование'];
const EXP = ['1 год','2 года','3 года','4 года','5 лет','6 лет','7 лет','8 лет','10 лет'];

function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function esc(s) { return s.replace(/'/g, "''"); }

shuffle(STAGES); shuffle(SOURCES); shuffle(CITIES);

const now = Date.now();
const DAY = 86400000;
const rows = [];

for (let i = 0; i < 1100; i++) {
  const male = Math.random() > 0.45;
  const fn = male ? pick(FIRST_M) : pick(FIRST_F);
  const ln = male ? pick(LAST_M) : pick(LAST_F);
  const pn = male ? pick(PATR_M) : pick(PATR_F);
  const name = `${ln} ${fn} ${pn}`;
  const stage = STAGES[i];
  const source = SOURCES[i];
  const city = CITIES[i];
  const token = crypto.randomBytes(16).toString('hex');
  const score = stage === 'hired' ? 75 + Math.floor(Math.random() * 25)
    : stage === 'rejected' ? 20 + Math.floor(Math.random() * 40)
    : 40 + Math.floor(Math.random() * 55);
  const salaryBase = 40000 + Math.floor(Math.random() * 120000);
  const salaryMin = Math.round(salaryBase / 1000) * 1000;
  const salaryMax = salaryMin + 10000 + Math.floor(Math.random() * 40000);
  const exp = pick(EXP) + ' в продажах';
  const skillCount = 2 + Math.floor(Math.random() * 4);
  const skills = shuffle([...SKILLS]).slice(0, skillCount);
  const phone = '+7' + (900 + Math.floor(Math.random() * 100)) + '' + (1000000 + Math.floor(Math.random() * 9000000));
  const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@mail.ru`.replace(/ё/g, 'e');
  const daysAgo = Math.floor(Math.random() * 30);
  const createdAt = new Date(now - daysAgo * DAY - Math.floor(Math.random() * DAY));
  const skillsArr = `{${skills.map(s => `"${s}"`).join(',')}}`;

  rows.push(`(gen_random_uuid(), '${VACANCY_ID}', '${esc(name)}', '${phone}', '${email}', '${esc(city)}', '${source}', '${stage}', ${score}, ${salaryMin}, ${salaryMax}, '${esc(exp)}', '${skillsArr}', '${token}', '${createdAt.toISOString()}'::timestamp, '${createdAt.toISOString()}'::timestamp)`);
}

(async () => {
  const CHUNK = 200;
  let total = 0;
  for (let c = 0; c < rows.length; c += CHUNK) {
    const chunk = rows.slice(c, c + CHUNK);
    await db.unsafe(`INSERT INTO candidates (id, vacancy_id, name, phone, email, city, source, stage, score, salary_min, salary_max, experience, skills, token, created_at, updated_at) VALUES ${chunk.join(',\n')}`);
    total += chunk.length;
    process.stdout.write(`\rInserted ${total}/1100`);
  }
  console.log('\nDone!');

  // Verify
  const [count] = await db.unsafe(`SELECT count(*) as cnt FROM candidates WHERE vacancy_id = '${VACANCY_ID}'`);
  console.log('Total candidates for vacancy:', count.cnt);

  const stages = await db.unsafe(`SELECT stage, count(*) as cnt FROM candidates WHERE vacancy_id = '${VACANCY_ID}' GROUP BY stage ORDER BY cnt DESC`);
  console.log('By stage:', stages.map(r => `${r.stage}: ${r.cnt}`).join(', '));

  const sources = await db.unsafe(`SELECT source, count(*) as cnt FROM candidates WHERE vacancy_id = '${VACANCY_ID}' GROUP BY source ORDER BY cnt DESC`);
  console.log('By source:', sources.map(r => `${r.source}: ${r.cnt}`).join(', '));

  const cities = await db.unsafe(`SELECT city, count(*) as cnt FROM candidates WHERE vacancy_id = '${VACANCY_ID}' GROUP BY city ORDER BY cnt DESC LIMIT 6`);
  console.log('Top cities:', cities.map(r => `${r.city}: ${r.cnt}`).join(', '));

  await db.end();
})().catch(e => { console.error(e); process.exit(1); });
