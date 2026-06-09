require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// ─── ENV CHECK ────────────────────────────────────────────────────────────────
const botToken = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

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
  const { data } = await supabase.from('settings').select('value').eq('key', key).single();
  return data ? data.value : null;
}

async function setSetting(key, value) {
  await supabase.from('settings').upsert({ key, value }, { onConflict: 'key' });
}

async function getGallery() {
  const { data } = await supabase.from('gallery').select('*').order('created_at', { ascending: false });
  return data || [];
}

async function getPrices() {
  const { data } = await supabase.from('prices').select('*').order('id');
  return data || [];
}

// ─── KEYBOARDS ────────────────────────────────────────────────────────────────
const mainMenu = Markup.keyboard([
  ['📍 Joylashuv', '📸 Galereya'],
  ['🕒 Ish Vaqti', '💰 Narxlar'],
  ['📞 Bog\'lanish']
]).resize();

const adminMenu = Markup.keyboard([
  ['📍 Joylashuvni o\'zgartir', '🖼 Galereya boshqaruvi'],
  ['💰 Narxlarni boshqar', '🕒 Ish vaqtini o\'zgartir'],
  ['📞 Kontaktni o\'zgartir', '🔙 Ortga qaytish']
]).resize();

// ─── SESSION STATE ────────────────────────────────────────────────────────────
const userState = {};

function setState(chatId, state) { userState[chatId] = state; }
function getState(chatId) { return userState[chatId] || null; }
function clearState(chatId) { delete userState[chatId]; }

// ─── /start ───────────────────────────────────────────────────────────────────
bot.start((ctx) => {
  clearState(ctx.chat.id);
  ctx.reply('👋 Salom! Premium Barber Shop botiga xush kelibsiz!\nQuyidagi menyudan tanlang:', mainMenu);
});

// ─── FOYDALANUVCHI MENYULARI ──────────────────────────────────────────────────
bot.hears('📍 Joylashuv', async (ctx) => {
  const val = await getSetting('location');
  if (val) {
    const [lat, lng] = val.split(',').map(Number);
    await ctx.replyWithLocation(lat, lng);
  } else {
    ctx.reply('📍 Joylashuv hali kiritilmagan. Admin /admin panel orqali qo\'shsin.');
  }
});

bot.hears('📸 Galereya', async (ctx) => {
  const images = await getGallery();
  if (images.length === 0) {
    return ctx.reply('📸 Galereya hozircha bo\'sh. Admin rasm qo\'shsin.');
  }
  for (const img of images) {
    await ctx.replyWithPhoto(img.url, { caption: img.caption || '' });
  }
});

bot.hears('🕒 Ish Vaqti', async (ctx) => {
  const val = await getSetting('working_hours');
  const text = val || `📅 *Bizning ish vaqti*\n🕒 Dushanba – Juma: 09:00 – 20:00\n🕒 Shanba: 10:00 – 18:00\n🕒 Yakshanba: Dam olish`;
  ctx.replyWithMarkdown(text);
});

bot.hears('💰 Narxlar', async (ctx) => {
  const prices = await getPrices();
  if (prices.length === 0) {
    return ctx.reply('💰 Narxlar hali kiritilmagan.');
  }
  let text = '💈 *Barber shop narxlari*\n\n';
  prices.forEach(p => { text += `✂️ ${p.service} – ${p.price} UZS\n`; });
  ctx.replyWithMarkdown(text);
});

bot.hears('📞 Bog\'lanish', async (ctx) => {
  const val = await getSetting('contact');
  const text = val || '📞 Telefon: +998 71 123 45 67\n📧 Email: info@premiumbarbershop.uz';
  ctx.reply(text);
});

// ─── /admin BUYRUG'I ──────────────────────────────────────────────────────────
bot.command('admin', (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⚠️ Admin panel – Siz adminsiz.');
  clearState(ctx.chat.id);
  ctx.reply('🔧 Admin panelga xush kelibsiz!\n\nQuyidagi amallardan birini tanlang:', adminMenu);
});

// ─── ADMIN: ORTGA QAYTISH ─────────────────────────────────────────────────────
bot.hears('🔙 Ortga qaytish', (ctx) => {
  clearState(ctx.chat.id);
  ctx.reply('✅ Asosiy menyuga qaytdingiz.', mainMenu);
});

// ─── ADMIN: JOYLASHUV ─────────────────────────────────────────────────────────
bot.hears('📍 Joylashuvni o\'zgartir', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const current = await getSetting('location');
  let currentText = '';
  if (current) {
    const [lat, lng] = current.split(',');
    currentText = `\n📌 Hozirgi: ${lat}, ${lng}`;
  }
  setState(ctx.chat.id, 'waiting_location');
  ctx.reply(
    `📍 Yangi joylashuvni yuboring:${currentText}\n\n` +
    `📎 Telegram\'da joylashuv yuborish:\n` +
    `📎 → 📍 Location tugmasini bosing\n\n` +
    `Yoki qo\'lda kiriting:\n\`41.311151,69.279737\``,
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ Bekor qilish']]).resize() }
  );
});

// ─── ADMIN: GALEREYA BOSHQARUVI ───────────────────────────────────────────────
bot.hears('🖼 Galereya boshqaruvi', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const images = await getGallery();
  const galleryMenu = Markup.keyboard([
    ['➕ Rasm qo\'sh', '🗑 Rasm o\'chir'],
    ['🔙 Admin menyuga']
  ]).resize();
  ctx.reply(
    `📸 Galereya boshqaruvi\n📊 Hozirgi rasmlar soni: ${images.length}`,
    galleryMenu
  );
});

bot.hears('➕ Rasm qo\'sh', async (ctx) => {
  if (!isAdmin(ctx)) return;
  setState(ctx.chat.id, 'waiting_photo');
  ctx.reply(
    '📸 Yangi rasm yuboring (foto sifatida).\n\nIzohlash uchun rasmga caption (sarlavha) yozing.',
    Markup.keyboard([['❌ Bekor qilish']]).resize()
  );
});

bot.hears('🗑 Rasm o\'chir', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const images = await getGallery();
  if (images.length === 0) {
    return ctx.reply('📸 Galereya bo\'sh. O\'chirish uchun rasm yo\'q.', Markup.keyboard([['🔙 Admin menyuga']]).resize());
  }

  // Show images first so admin can see which to delete
  ctx.reply('📸 Mavjud rasmlar:');
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    await ctx.replyWithPhoto(img.url, {
      caption: `${i + 1}. ${img.caption || '(izohsiz)'}`
    });
  }

  const buttons = images.map((img, i) => [`🗑 ${i + 1}. ${img.caption || 'Rasm ' + (i + 1)}`]);
  buttons.push(['❌ Bekor qilish']);

  setState(ctx.chat.id, { action: 'delete_photo', images });
  ctx.reply('Qaysi rasmni o\'chirmoqchisiz?', Markup.keyboard(buttons).resize());
});

bot.hears('🔙 Admin menyuga', (ctx) => {
  if (!isAdmin(ctx)) return;
  clearState(ctx.chat.id);
  ctx.reply('🔧 Admin panel:', adminMenu);
});

// ─── ADMIN: NARXLARNI BOSHQARISH ─────────────────────────────────────────────
bot.hears('💰 Narxlarni boshqar', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const prices = await getPrices();
  const pricesMenu = Markup.keyboard([
    ['➕ Narx qo\'sh', '✏️ Narxni tahrirlash'],
    ['🗑 Narxni o\'chir', '🔙 Admin menyuga']
  ]).resize();

  let text = '💰 Narxlarni boshqarish\n\n';
  if (prices.length === 0) {
    text += '📋 Hozircha narxlar yo\'q.';
  } else {
    text += '📋 Mavjud narxlar:\n';
    prices.forEach((p, i) => { text += `${i + 1}. ${p.service} – ${p.price} UZS\n`; });
  }
  ctx.reply(text, pricesMenu);
});

bot.hears('➕ Narx qo\'sh', (ctx) => {
  if (!isAdmin(ctx)) return;
  setState(ctx.chat.id, 'waiting_price_add');
  ctx.reply(
    '💰 Yangi xizmat va narxni kiriting:\n\nFormat: `Xizmat nomi | Narx`\nMisol: `Erkak soch kesish | 15000`',
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ Bekor qilish']]).resize() }
  );
});

bot.hears('✏️ Narxni tahrirlash', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const prices = await getPrices();
  if (prices.length === 0) {
    return ctx.reply('💰 Tahrirlash uchun narxlar yo\'q.', Markup.keyboard([['🔙 Admin menyuga']]).resize());
  }
  const buttons = prices.map(p => [`✏️ ${p.service}`]);
  buttons.push(['❌ Bekor qilish']);
  setState(ctx.chat.id, { action: 'select_price_edit', prices });
  ctx.reply('Qaysi narxni tahrirlaysiz?', Markup.keyboard(buttons).resize());
});

bot.hears('🗑 Narxni o\'chir', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const prices = await getPrices();
  if (prices.length === 0) {
    return ctx.reply('💰 O\'chirish uchun narxlar yo\'q.', Markup.keyboard([['🔙 Admin menyuga']]).resize());
  }
  const buttons = prices.map(p => [`🗑 ${p.service} – ${p.price} UZS`]);
  buttons.push(['❌ Bekor qilish']);
  setState(ctx.chat.id, { action: 'delete_price', prices });
  ctx.reply('Qaysi narxni o\'chirmoqchisiz?', Markup.keyboard(buttons).resize());
});

// ─── ADMIN: ISH VAQTINI O'ZGARTIRISH ─────────────────────────────────────────
bot.hears('🕒 Ish vaqtini o\'zgartir', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const current = await getSetting('working_hours');
  setState(ctx.chat.id, 'waiting_hours');
  ctx.reply(
    `🕒 Yangi ish vaqtini yozing:\n\n` +
    `Misol:\n\`📅 *Bizning ish vaqti*\n🕒 Dushanba – Juma: 09:00 – 20:00\n🕒 Shanba: 10:00 – 18:00\n🕒 Yakshanba: Dam olish\`\n\n` +
    (current ? `📌 Hozirgi qiymat:\n${current}` : ''),
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ Bekor qilish']]).resize() }
  );
});

// ─── ADMIN: KONTAKTNI O'ZGARTIRISH ───────────────────────────────────────────
bot.hears('📞 Kontaktni o\'zgartir', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const current = await getSetting('contact');
  setState(ctx.chat.id, 'waiting_contact');
  ctx.reply(
    `📞 Yangi kontakt ma\'lumotlarini kiriting:\n\n` +
    `Misol:\n\`📞 Telefon: +998 71 123 45 67\n📧 Email: info@barbershop.uz\`\n\n` +
    (current ? `📌 Hozirgi qiymat:\n${current}` : ''),
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ Bekor qilish']]).resize() }
  );
});

// ─── BEKOR QILISH ─────────────────────────────────────────────────────────────
bot.hears('❌ Bekor qilish', (ctx) => {
  clearState(ctx.chat.id);
  if (isAdmin(ctx)) {
    ctx.reply('❌ Bekor qilindi.', adminMenu);
  } else {
    ctx.reply('❌ Bekor qilindi.', mainMenu);
  }
});

// ─── LOCATION HANDLER (Admin joylashuv yuboradi) ──────────────────────────────
bot.on('location', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const state = getState(ctx.chat.id);
  if (state !== 'waiting_location') return;

  const { latitude, longitude } = ctx.message.location;
  await setSetting('location', `${latitude},${longitude}`);
  clearState(ctx.chat.id);
  await ctx.reply(`✅ Joylashuv saqlandi!\n📍 Kenglik: ${latitude}\n📍 Uzunlik: ${longitude}`, adminMenu);
  // Confirm by sending the saved location back
  await ctx.replyWithLocation(latitude, longitude);
});

// ─── PHOTO HANDLER ────────────────────────────────────────────────────────────
bot.on('photo', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const state = getState(ctx.chat.id);
  if (state !== 'waiting_photo') return;

  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const fileId = photo.file_id;
  const caption = ctx.message.caption || '';

  const { error } = await supabase.from('gallery').insert({ url: fileId, caption, is_file_id: true });
  if (error) {
    return ctx.reply('❌ Xatolik yuz berdi. Qayta urinib ko\'ring.');
  }
  clearState(ctx.chat.id);
  ctx.reply(
    `✅ Rasm galereyaga qo\'shildi!${caption ? `\n📝 Izoh: ${caption}` : ''}`,
    adminMenu
  );
});

// ─── TEXT MESSAGE HANDLER ─────────────────────────────────────────────────────
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  const state = getState(chatId);

  if (!state) return;

  // ── Joylashuvni matn orqali kiritish ──────────────────────────────────────
  if (state === 'waiting_location') {
    const match = text.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (!match) {
      return ctx.reply('❌ Format noto\'g\'ri!\n\nMisol: `41.311151,69.279737`', { parse_mode: 'Markdown' });
    }
    await setSetting('location', `${match[1]},${match[2]}`);
    clearState(chatId);
    return ctx.reply(`✅ Joylashuv saqlandi!\n📍 Lat: ${match[1]}, Lng: ${match[2]}`, adminMenu);
  }

  // ── Ish vaqti ──────────────────────────────────────────────────────────────
  if (state === 'waiting_hours') {
    await setSetting('working_hours', text);
    clearState(chatId);
    return ctx.reply('✅ Ish vaqti yangilandi!', adminMenu);
  }

  // ── Kontakt ────────────────────────────────────────────────────────────────
  if (state === 'waiting_contact') {
    await setSetting('contact', text);
    clearState(chatId);
    return ctx.reply('✅ Kontakt ma\'lumotlari yangilandi!', adminMenu);
  }

  // ── Narx qo'shish ──────────────────────────────────────────────────────────
  if (state === 'waiting_price_add') {
    const parts = text.split('|').map(s => s.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return ctx.reply('❌ Format noto\'g\'ri!\n\nMisol: `Erkak soch kesish | 15000`', { parse_mode: 'Markdown' });
    }
    const { error } = await supabase.from('prices').insert({ service: parts[0], price: parts[1] });
    if (error) return ctx.reply('❌ Xatolik yuz berdi.');
    clearState(chatId);
    return ctx.reply(`✅ Narx qo\'shildi!\n✂️ ${parts[0]} – ${parts[1]} UZS`, adminMenu);
  }

  // ── Narxni tahrirlash: xizmat tanlash ─────────────────────────────────────
  if (state && state.action === 'select_price_edit') {
    const match = text.match(/^✏️ (.+)$/);
    if (!match) return;
    const serviceName = match[1];
    const price = state.prices.find(p => p.service === serviceName);
    if (!price) return ctx.reply('❌ Topilmadi.', adminMenu);
    setState(chatId, { action: 'waiting_price_edit', priceId: price.id, oldService: price.service });
    return ctx.reply(
      `✏️ "${price.service}" xizmatini tahrirlash\n\nYangi xizmat nomi va narxni kiriting:\nFormat: \`Xizmat nomi | Narx\`\nMisol: \`${price.service} | ${price.price}\``,
      { parse_mode: 'Markdown', ...Markup.keyboard([['❌ Bekor qilish']]).resize() }
    );
  }

  // ── Narxni tahrirlash: yangi qiymat kiritish ──────────────────────────────
  if (state && state.action === 'waiting_price_edit') {
    const parts = text.split('|').map(s => s.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return ctx.reply('❌ Format noto\'g\'ri!\n\nMisol: `Erkak soch kesish | 15000`', { parse_mode: 'Markdown' });
    }
    const { error } = await supabase.from('prices').update({ service: parts[0], price: parts[1] }).eq('id', state.priceId);
    if (error) return ctx.reply('❌ Xatolik yuz berdi.');
    clearState(chatId);
    return ctx.reply(`✅ Narx yangilandi!\n✂️ ${parts[0]} – ${parts[1]} UZS`, adminMenu);
  }

  // ── Rasm o'chirish ─────────────────────────────────────────────────────────
  if (state && state.action === 'delete_photo') {
    const match = text.match(/^🗑 (\d+)\./);
    if (!match) return;
    const idx = parseInt(match[1]) - 1;
    const img = state.images[idx];
    if (!img) return ctx.reply('❌ Topilmadi.', adminMenu);
    const { error } = await supabase.from('gallery').delete().eq('id', img.id);
    if (error) return ctx.reply('❌ Xatolik yuz berdi.');
    clearState(chatId);
    return ctx.reply('✅ Rasm galereyadan o\'chirildi!', adminMenu);
  }

  // ── Narx o'chirish ─────────────────────────────────────────────────────────
  if (state && state.action === 'delete_price') {
    const match = text.match(/^🗑 (.+) – .+ UZS$/);
    if (!match) return;
    const serviceName = match[1];
    const price = state.prices.find(p => p.service === serviceName);
    if (!price) return ctx.reply('❌ Topilmadi.', adminMenu);
    const { error } = await supabase.from('prices').delete().eq('id', price.id);
    if (error) return ctx.reply('❌ Xatolik yuz berdi.');
    clearState(chatId);
    return ctx.reply(`✅ "${serviceName}" narxi o\'chirildi!`, adminMenu);
  }
});

// ─── LAUNCH ───────────────────────────────────────────────────────────────────
bot.launch();
console.log('✅ Bot ishga tushdi (Supabase ulandi)');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
