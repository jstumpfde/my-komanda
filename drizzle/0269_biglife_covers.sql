-- Big Life: таблица архива обложек + сид текущими 30 обложками
-- (сгенерировано из уже задеплоенной статики biglife.company24.pro, 09.07.2026).
CREATE TABLE IF NOT EXISTS big_life_covers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  heading     text NOT NULL,
  period      text,
  year        text NOT NULL,
  image_path  text,
  price       integer,
  sale_price  integer,
  stock_qty   integer,
  sold_out    boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS big_life_covers_year_idx ON big_life_covers(year);
CREATE INDEX IF NOT EXISTS big_life_covers_sort_idx ON big_life_covers(sort_order);

INSERT INTO big_life_covers (title, heading, period, year, image_path, price, sale_price, stock_qty, sold_out, is_active, sort_order) VALUES
('BIG LIFE лето 2026 | Стас Михайлов', 'Стас Михайлов', 'BIG LIFE лето 2026', '2026', 'assets/covers-archive/00-big-life-2026.png', 1900, 1500, NULL, false, true, 0),
('BIG life март-апрель 2026', 'BIG life март-апрель 2026', NULL, '2026', 'assets/covers-archive/01-big-life-2026.png', NULL, NULL, NULL, false, true, 1),
('BIG life февраль-март 2026', 'BIG life февраль-март 2026', NULL, '2026', 'assets/covers-archive/02-big-life-2026.png', NULL, NULL, NULL, false, true, 2),
('BIG life январь-февраль 2026', 'BIG life январь-февраль 2026', NULL, '2026', 'assets/covers-archive/03-big-life-2026.png', NULL, NULL, NULL, false, true, 3),
('BIG life magazine январь 2026', 'BIG life magazine январь 2026', NULL, '2026', 'assets/covers-archive/04-big-life-magazine-2026.png', NULL, NULL, NULL, false, true, 4),
('BIG life март-май 2025', 'BIG life март-май 2025', NULL, '2025', 'assets/covers-archive/05-big-life-2025.png', NULL, NULL, NULL, false, true, 5),
('ЯНВАРЬ-МАРТ 2025', 'ЯНВАРЬ-МАРТ 2025', NULL, '2025', 'assets/covers-archive/06-2025.jpeg', NULL, NULL, NULL, false, true, 6),
('НОЯБРЬ-ЯНВАРЬ 2025', 'НОЯБРЬ-ЯНВАРЬ 2025', NULL, '2025', 'assets/covers-archive/07-2025.jpeg', NULL, NULL, NULL, false, true, 7),
('СЕНТЯБРЬ — ОКТЯБРЬ 2024', 'СЕНТЯБРЬ — ОКТЯБРЬ 2024', NULL, '2024', 'assets/covers-archive/08-8212-2024.jpg', NULL, NULL, NULL, false, true, 8),
('ИЮНЬ-СЕНТЯБРЬ 2024', 'ИЮНЬ-СЕНТЯБРЬ 2024', NULL, '2024', 'assets/covers-archive/09-2024.jpeg', NULL, NULL, NULL, false, true, 9),
('ИЮЛЬ-АВГУСТ 2023', 'ИЮЛЬ-АВГУСТ 2023', NULL, '2023', 'assets/covers-archive/10-2023.png', NULL, NULL, NULL, false, true, 10),
('АВГУСТ-СЕНТЯБРЬ 2022', 'АВГУСТ-СЕНТЯБРЬ 2022', NULL, '2022', 'assets/covers-archive/11-2022.png', NULL, NULL, NULL, false, true, 11),
('ИЮЛЬ-АВГУСТ 2022', 'ИЮЛЬ-АВГУСТ 2022', NULL, '2022', 'assets/covers-archive/12-2022.png', NULL, NULL, NULL, false, true, 12),
('МАРТ-АПРЕЛЬ 2022', 'МАРТ-АПРЕЛЬ 2022', NULL, '2022', 'assets/covers-archive/13-2022.jpeg', NULL, NULL, NULL, false, true, 13),
('Февраль — Март 2022', 'Февраль — Март 2022', NULL, '2022', 'assets/covers-archive/14-8212-2022.jpg', NULL, NULL, NULL, false, true, 14),
('Январь 2022', 'Январь 2022', NULL, '2022', 'assets/covers-archive/15-2022.jpg', NULL, NULL, NULL, false, true, 15),
('Декабрь 2021 — Январь 2022', 'Декабрь 2021 — Январь 2022', NULL, '2021', 'assets/covers-archive/16-2021-8212-2022.jpg', NULL, NULL, NULL, false, true, 16),
('Октябрь — Ноябрь 2021', 'Октябрь — Ноябрь 2021', NULL, '2021', 'assets/covers-archive/17-8212-2021.jpg', NULL, NULL, NULL, false, true, 17),
('Сентябрь — Октябрь — Ноябрь 2021', 'Сентябрь — Октябрь — Ноябрь 2021', NULL, '2021', 'assets/covers-archive/18-8212-8212-2021.jpg', NULL, NULL, NULL, false, true, 18),
('Май-Июнь 2021', 'Май-Июнь 2021', NULL, '2021', 'assets/covers-archive/19-2021.jpg', NULL, NULL, NULL, false, true, 19),
('Январь — Февраль 2021', 'Январь — Февраль 2021', NULL, '2021', 'assets/covers-archive/20-8212-2021.jpg', NULL, NULL, NULL, false, true, 20),
('Июль-Август 2020', 'Июль-Август 2020', NULL, '2020', 'assets/covers-archive/21-2020.jpg', NULL, NULL, NULL, false, true, 21),
('Июнь-Июль 2020', 'Июнь-Июль 2020', NULL, '2020', 'assets/covers-archive/22-2020.jpg', NULL, NULL, NULL, false, true, 22),
('Март-Апрель 2020', 'Март-Апрель 2020', NULL, '2020', 'assets/covers-archive/23-2020.jpg', NULL, NULL, NULL, false, true, 23),
('Январь-Февраль-Март 2020', 'Январь-Февраль-Март 2020', NULL, '2020', 'assets/covers-archive/24-2020.jpg', NULL, NULL, NULL, false, true, 24),
('Апрель-Июль 2019', 'Апрель-Июль 2019', NULL, '2019', 'assets/covers-archive/26-2019.jpg', NULL, NULL, NULL, false, true, 25),
('Октябрь-Ноябрь 2019', 'Октябрь-Ноябрь 2019', NULL, '2019', 'assets/covers-archive/29-2019.jpg', NULL, NULL, NULL, false, true, 26),
('Сентябрь-Ноябрь 2019', 'Сентябрь-Ноябрь 2019', NULL, '2019', 'assets/covers-archive/30-2019.jpg', NULL, NULL, NULL, false, true, 27),
('Июль-Сентябрь 2018', 'Июль-Сентябрь 2018', NULL, '2018', 'assets/covers-archive/27-2018.jpg', NULL, NULL, NULL, false, true, 28),
('Апрель-Май 2018', 'Апрель-Май 2018', NULL, '2018', 'assets/covers-archive/28-2018.jpg', NULL, NULL, NULL, false, true, 29);
