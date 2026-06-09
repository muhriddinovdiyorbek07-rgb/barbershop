-- =============================================
-- BARBER SHOP BOT — Supabase SQL Setup
-- supabase.com > SQL Editor ga nusxalab ishlatng
-- =============================================

-- 1. SETTINGS jadvali (joylashuv, ish vaqti, kontakt)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 2. GALLERY jadvali (rasmlar)
CREATE TABLE IF NOT EXISTS gallery (
  id          SERIAL PRIMARY KEY,
  url         TEXT NOT NULL,
  caption     TEXT DEFAULT '',
  is_file_id  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PRICES jadvali (narxlar)
CREATE TABLE IF NOT EXISTS prices (
  id       SERIAL PRIMARY KEY,
  service  TEXT NOT NULL,
  price    TEXT NOT NULL
);

-- =============================================
-- DEFAULT qiymatlar (ixtiyoriy, birinchi ishga
-- tushishdan oldin qo'shib qo'yish mumkin)
-- =============================================

INSERT INTO settings (key, value) VALUES
  ('location',      '41.311151,69.279737'),
  ('working_hours', '📅 *Bizning ish vaqti*
🕒 Dushanba – Juma: 09:00 – 20:00
🕒 Shanba: 10:00 – 18:00
🕒 Yakshanba: Dam olish'),
  ('contact',       '📞 Telefon: +998 71 123 45 67
📧 Email: info@premiumbarbershop.uz')
ON CONFLICT (key) DO NOTHING;

INSERT INTO prices (service, price) VALUES
  ('Erkak soch kesish', '15 000'),
  ('Ayol soch kesish',  '12 000'),
  ('Buzoq balyaj',      '20 000'),
  ('Soch yuvish',        '5 000')
ON CONFLICT DO NOTHING;

-- =============================================
-- ROW LEVEL SECURITY — anon key bilan ishlash
-- =============================================

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery  ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices   ENABLE ROW LEVEL SECURITY;

-- Hamma ko'ra oladi
CREATE POLICY "Public read settings" ON settings FOR SELECT USING (true);
CREATE POLICY "Public read gallery"  ON gallery  FOR SELECT USING (true);
CREATE POLICY "Public read prices"   ON prices   FOR SELECT USING (true);

-- Hamma yoza oladi (bot server-side ishlaydi, OK)
CREATE POLICY "Public write settings" ON settings FOR ALL USING (true);
CREATE POLICY "Public write gallery"  ON gallery  FOR ALL USING (true);
CREATE POLICY "Public write prices"   ON prices   FOR ALL USING (true);
