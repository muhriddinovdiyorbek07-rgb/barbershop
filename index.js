
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// ─── ENV CHECK ────────────────────────────────────────────────────────────────
const botToken = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!botToken) { console.error('❌ BOT_TOKEN yetishmayapti'); process.exit(1); }
if (!supabaseUrl || !supabaseKey) { console.error('❌ SUPABASE_URL yoki SUPABASE_KEY yetishmayapti'); process.exit(1); }

// ─── CLIENTS ──────────────────────────────────────────────────────────────────
const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new Telegraf(botToken);

// ─── ADMIN CHECK ──────────────────────────────────────────────────────────────
const adminIds = (process.env.ADMIN_CHAT_IDS || '').split(',').map(s => s.trim());
const isAdmin = (ctx) => adminIds.includes(String(ctx.chat.id));

// ─── SUPABASE HELPERS ─────────────────────────────────────────────────────────
async function getSetting(key) {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();           // ← single() o'rniga maybeSingle — 0 qator bo'lsa ham xato bermaydi

  if (error) console.error(`❌ getSetting(${key}) xato:`, error.message);
  return data ? data.value : null;
}

async function setSetting(key, value) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value }, { onConflict: 'key' });

  if (error) {
    console.error(`❌ setSetting(${key}) xato:`, error.message);
    return false;
  }
  console.log(`✅ Supabase saqlandi: ${key} = ${value}`);
  return true;
}

async function getGallery() {
  const { data, error } = await supabase
    .from('gallery')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) console.error('❌ getGallery xato:', error.message);
  return data || [];
}

async function addGalleryImage(url, caption, isFileId) {
  const { error } = await supabase
    .from('gallery')
    .insert({ url, caption, is_file_id: isFileId });

  if (error) { console.error('❌ addGalleryImage xato:', error.message); return false; }
  return true;
}

async function deleteGalleryImage(id) {
  const { error } = await supabase.from('gallery').delete().eq('id', id);
  if (error) { console.error('❌ deleteGalleryImage xato:', error.message); return false; }
  return true;
}

async function getPrices() {
  const { data, error } = await supabase
    .from('prices')
    .select('*')
    .order('id');

  if (error) console.error('❌ getPrices xato:', error.message);
  return data || [];
}

async function addPrice(service, price) {
  const { error } = await supabase.from('prices').insert({ service, price });
  if (error) { console.error('❌ addPrice xato:', error.message); return false; }
  return true;
}

async function deletePrice(id) {
  const { error } = await supabase.from('prices').delete().eq('id', id);
  if (error) { console.error('❌ deletePrice xato:', error.message); return false; }
  return true;
}

// ─── KEYBOARDS ────────────────────────────────────────────────────────────────
const mainMenu = Markup.keyboard([
  ['📍 Joylashuv', '📸 Galereya'],
  ['🕒 Ish Vaqti', '💰 Narxlar'],
  ["📞 Bog'lanish"]
]).resize();

const adminMenu = Markup.keyboard([
  ["📍 Joylashuvni o'zgartir", "🖼 Rasm qo'sh"],
  ["🗑 Rasmni o'chir", "💰 Narx qo'sh"],
  ["🗑 Narxni o'chir", "🕒 Ish vaqtini o'zgartir"],
  ["📞 Kontaktni o'zgartir", '🔙 Asosiy menyu']
]).resize();

// ─── SESSION STATE ────────────────────────────────────────────────────────────
const userState = {};
const setState = (id, s) => { userState[id] = s; };
const getState = (id) => userState[id] || null;
const clearState = (id) => { delete userState[id]; };

// ─── /start ───────────────────────────────────────────────────────────────────
bot.start((ctx) => {
  clearState(ctx.chat.id);
  ctx.reply("👋 Salom! Premium Barber Shop botiga xush kelibsiz!\nQuyidagi menyudan tanlang:", mainMenu);
});

// ─── ASOSIY MENYULAR ──────────────────────────────────────────────────────────
bot.hears('📍 Joylashuv', async (ctx) => {
  const val = await getSetting('location');
  console.log('📍 Joylashuv so\'raldi, DB qiymati:', val);

  if (!val) {
    return ctx.reply("📍 Joylashuv hali kiritilmagan. Admin /admin panel orqali qo'shsin.");
  }

  const parts = val.split(',');
  if (parts.length !== 2) {
    return ctx.reply("❌ Joylashuv formati noto'g'ri. Admin qayta kiriting.");
  }

  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());

  if (isNaN(lat) || isNaN(lng)) {
    return ctx.reply("❌ Joylashuv koordinatalari xato. Admin qayta kiriting.");
  }

  await ctx.replyWithLocation(lat, lng);
});

bot.hears('📸 Galereya', async (ctx) => {
  const images = await getGallery();
  if (images.length === 0) {
    return ctx.reply("📸 Galereya hozircha bo'sh. Admin rasm qo'shsin.");
  }
  for (const img of images) {
    try {
      await ctx.replyWithPhoto(img.url, { caption: img.caption || '' });
    } catch (e) {
      console.error('❌ Rasm yuborishda xato:', e.message, img.url);
    }
  }
});

bot.hears('🕒 Ish Vaqti', async (ctx) => {
  const val = await getSetting('working_hours');
  const text = val || "📅 *Bizning ish vaqti*\n🕒 Dushanba – Juma: 09:00 – 20:00\n🕒 Shanba: 10:00 – 18:00\n🕒 Yakshanba: Dam olish";
  ctx.replyWithMarkdown(text);
});

bot.hears('💰 Narxlar', async (ctx) => {
  const prices = await getPrices();
  if (prices.length === 0) return ctx.reply("💰 Narxlar hali kiritilmagan.");
  let text = '💈 *Barber shop narxlari*\n\n';
  prices.forEach(p => { text += `✂️ ${p.service} – ${p.price} UZS\n`; });
  ctx.replyWithMarkdown(text);
});

bot.hears("📞 Bog'lanish", async (ctx) => {
  const val = await getSetting('contact');
  const text = val || "📞 Telefon: +998 71 123 45 67\n📧 Email: info@premiumbarbershop.uz";
  ctx.reply(text);
});

// ─── /admin ───────────────────────────────────────────────────────────────────
bot.command('admin', (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⚠️ Siz admin emassiz.');
  clearState(ctx.chat.id);
  ctx.reply('🔧 Admin panelga xush kelibsiz!', adminMenu);
});

bot.hears('🔙 Asosiy menyu', (ctx) => {
  clearState(ctx.chat.id);
  ctx.reply('Asosiy menyuga qaytdingiz.', mainMenu);
});

// ─── ADMIN: JOYLASHUV ─────────────────────────────────────────────────────────
bot.hears("📍 Joylashuvni o'zgartir", (ctx) => {
  if (!isAdmin(ctx)) return;
  setState(ctx.chat.id, 'waiting_location');
  ctx.reply(
    "📍 Joylashuvni yuboring:\n\n*1-usul:* Telegram'da 📎 → Location tugmasi\n*2-usul:* Matn: `41.311151,69.279737`",
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ Bekor qilish']]).resize() }
  );
});

// ─── ADMIN: RASM ──────────────────────────────────────────────────────────────
bot.hears("🖼 Rasm qo'sh", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const images = await getGallery();
  setState(ctx.chat.id, 'waiting_photo');
  ctx.reply(`📸 Galereyada ${images.length} ta rasm bor.\n\nYangi rasm yuboring (foto sifatida):`,
    Markup.keyboard([['❌ Bekor qilish']]).resize());
});

bot.hears("🗑 Rasmni o'chir", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const images = await getGallery();
  if (images.length === 0) return ctx.reply("📸 Galereya bo'sh.", adminMenu);

  const buttons = images.map((img, i) => [`🗑 ${i + 1}. ${img.caption || ('rasm_' + img.id)}`]);
  buttons.push(['❌ Bekor qilish']);
  setState(ctx.chat.id, { action: 'delete_photo', images });
  ctx.reply("Qaysi rasmni o'chirmoqchisiz?", Markup.keyboard(buttons).resize());
});

// ─── ADMIN: NARX ──────────────────────────────────────────────────────────────
bot.hears("💰 Narx qo'sh", (ctx) => {
  if (!isAdmin(ctx)) return;
  setState(ctx.chat.id, 'waiting_price');
  ctx.reply(
    "💰 Xizmat va narxni kiriting:\n\nFormat: `Xizmat nomi | Narx`\nMisol: `Erkak soch kesish | 15000`",
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ Bekor qilish']]).resize() }
  );
});

bot.hears("🗑 Narxni o'chir", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const prices = await getPrices();
  if (prices.length === 0) return ctx.reply("💰 Narxlar bo'sh.", adminMenu);

  const buttons = prices.map(p => [`🗑 ${p.id}. ${p.service} – ${p.price} UZS`]);
  buttons.push(['❌ Bekor qilish']);
  setState(ctx.chat.id, { action: 'delete_price', prices });
  ctx.reply("Qaysi narxni o'chirmoqchisiz?", Markup.keyboard(buttons).resize());
});

// ─── ADMIN: ISH VAQTI ─────────────────────────────────────────────────────────
bot.hears("🕒 Ish vaqtini o'zgartir", (ctx) => {
  if (!isAdmin(ctx)) return;
  setState(ctx.chat.id, 'waiting_hours');
  ctx.reply(
    "🕒 Yangi ish vaqtini yozing:\n\nMisol:\n`📅 *Ish vaqti*\n🕒 Du–Ju: 09:00–20:00\n🕒 Shanba: 10:00–18:00`",
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ Bekor qilish']]).resize() }
  );
});

// ─── ADMIN: KONTAKT ───────────────────────────────────────────────────────────
bot.hears("📞 Kontaktni o'zgartir", (ctx) => {
  if (!isAdmin(ctx)) return;
  setState(ctx.chat.id, 'waiting_contact');
  ctx.reply(
    "📞 Yangi kontaktni kiriting:\n\nMisol:\n`📞 +998 71 123 45 67\n📧 info@barbershop.uz\n💬 @username`",
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ Bekor qilish']]).resize() }
  );
});

// ─── BEKOR QILISH ─────────────────────────────────────────────────────────────
bot.hears('❌ Bekor qilish', (ctx) => {
  clearState(ctx.chat.id);
  ctx.reply('❌ Bekor qilindi.', isAdmin(ctx) ? adminMenu : mainMenu);
});

// ─── LOCATION HANDLER ─────────────────────────────────────────────────────────
bot.on('location', async (ctx) => {
  if (!isAdmin(ctx)) return;
  if (getState(ctx.chat.id) !== 'waiting_location') return;

  const { latitude, longitude } = ctx.message.location;
  const value = `${latitude},${longitude}`;
  const ok = await setSetting('location', value);
  clearState(ctx.chat.id);

  if (ok) {
    ctx.reply(`✅ Joylashuv saqlandi!\n📍 ${latitude}, ${longitude}`, adminMenu);
  } else {
    ctx.reply("❌ Supabase'ga saqlashda xato! Konsolni tekshiring.", adminMenu);
  }
});

// ─── PHOTO HANDLER ────────────────────────────────────────────────────────────
bot.on('photo', async (ctx) => {
  if (!isAdmin(ctx)) return;
  if (getState(ctx.chat.id) !== 'waiting_photo') return;

  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const fileId = photo.file_id;
  const caption = ctx.message.caption || '';

  const ok = await addGalleryImage(fileId, caption, true);
  clearState(ctx.chat.id);

  if (ok) {
    ctx.reply("✅ Rasm galereyaga qo'shildi!", adminMenu);
  } else {
    ctx.reply("❌ Rasmni saqlashda xato!", adminMenu);
  }
});

// ─── TEXT MESSAGE HANDLER ─────────────────────────────────────────────────────
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  const state = getState(chatId);
  if (!state) return;

  // Joylashuv — matn orqali
  if (state === 'waiting_location') {
    const match = text.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (!match) return ctx.reply("❌ Format: `41.311151,69.279737`", { parse_mode: 'Markdown' });
    const value = `${match[1]},${match[2]}`;
    const ok = await setSetting('location', value);
    clearState(chatId);
    return ok
      ? ctx.reply(`✅ Joylashuv saqlandi! ${match[1]}, ${match[2]}`, adminMenu)
      : ctx.reply("❌ Supabase'ga saqlashda xato!", adminMenu);
  }

  // Ish vaqti
  if (state === 'waiting_hours') {
    const ok = await setSetting('working_hours', text);
    clearState(chatId);
    return ok
      ? ctx.reply('✅ Ish vaqti yangilandi!', adminMenu)
      : ctx.reply("❌ Saqlashda xato!", adminMenu);
  }

  // Kontakt
  if (state === 'waiting_contact') {
    const ok = await setSetting('contact', text);
    clearState(chatId);
    return ok
      ? ctx.reply("✅ Kontakt ma'lumotlari yangilandi!", adminMenu)
      : ctx.reply("❌ Saqlashda xato!", adminMenu);
  }

  // Narx qo'shish
  if (state === 'waiting_price') {
    const parts = text.split('|').map(s => s.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return ctx.reply("❌ Format: `Xizmat nomi | 15000`", { parse_mode: 'Markdown' });
    }
    const ok = await addPrice(parts[0], parts[1]);
    clearState(chatId);
    return ok
      ? ctx.reply(`✅ Qo'shildi: ✂️ ${parts[0]} – ${parts[1]} UZS`, adminMenu)
      : ctx.reply("❌ Saqlashda xato!", adminMenu);
  }

  // Rasm o'chirish
  if (state && state.action === 'delete_photo') {
    const match = text.match(/^🗑 (\d+)\./);
    if (!match) return;
    const idx = parseInt(match[1]) - 1;
    const img = state.images[idx];
    if (!img) return ctx.reply('❌ Topilmadi.', adminMenu);
    const ok = await deleteGalleryImage(img.id);
    clearState(chatId);
    return ok
      ? ctx.reply("✅ Rasm o'chirildi!", adminMenu)
      : ctx.reply("❌ O'chirishda xato!", adminMenu);
  }

  // Narx o'chirish
  if (state && state.action === 'delete_price') {
    const match = text.match(/^🗑 (\d+)\./);
    if (!match) return;
    const priceId = parseInt(match[1]);
    const ok = await deletePrice(priceId);
    clearState(chatId);
    return ok
      ? ctx.reply("✅ Narx o'chirildi!", adminMenu)
      : ctx.reply("❌ O'chirishda xato!", adminMenu);
  }
});

// ─── LAUNCH ───────────────────────────────────────────────────────────────────
bot.launch();
console.log('✅ Bot ishga tushdi');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
