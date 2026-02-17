require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const path = require("path");

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN topilmadi. .env ga BOT_TOKEN yozing.");
  process.exit(1);
}

const ADMIN_ID = "5931611517"; // faqat shu admin panel ochadi

const bot = new Telegraf(BOT_TOKEN);

// =========================
// FILES
// =========================
const calendarPath = path.join(__dirname, "calendar.json");
const usersPath = path.join(__dirname, "users.json");

// =========================
// Calendar load (OBJECT)
// =========================
let calendar = {};
try {
  calendar = JSON.parse(fs.readFileSync(calendarPath, "utf-8"));
} catch (e) {
  console.error("❌ calendar.json o‘qilmadi yoki JSON xato:", e.message);
  process.exit(1);
}

// =========================
// Users load/save
// =========================
function loadUsers() {
  try {
    if (!fs.existsSync(usersPath)) fs.writeFileSync(usersPath, "[]", "utf-8");
    const data = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("❌ users.json o‘qishda xato:", e.message);
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), "utf-8");
}

let USERS = loadUsers();

// =========================
// Regions
// =========================
const REGIONS = [
  "Toshkent",
  "Andijon",
  "Farg‘ona",
  "Namangan",
  "Samarqand",
  "Buxoro",
  "Navoiy",
  "Jizzax",
  "Sirdaryo",
  "Qashqadaryo",
  "Surxondaryo",
  "Xorazm",
  "Qoraqalpog‘iston",
];

// =========================
// Utils
// =========================
function isAdmin(ctx) {
  return String(ctx.from?.id) === ADMIN_ID;
}

function isRegistered(chatId) {
  return USERS.some((u) => String(u.chat_id) === String(chatId) && u.phone);
}
function getUser(chatId) {
  return USERS.find((u) => String(u.chat_id) === String(chatId)) || null;
}


function upsertUser(data) {
  // data: { chat_id, user_id, phone, region? ... }
  const idx = USERS.findIndex((u) => String(u.chat_id) === String(data.chat_id));
  if (idx >= 0) USERS[idx] = { ...USERS[idx], ...data };
  else USERS.push(data);

  saveUsers(USERS);
}

function formatDateUZ(dateObj) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dateObj);

  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${d}`;
}

function addDays(dateObj, days) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + days);
  return d;
}

function prettyDate(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split("-");
  return `${d}.${m}.${y}`;
}

function findByDate(region, yyyyMmDd) {
  const arr = calendar?.[region];
  if (!Array.isArray(arr)) return null;
  return arr.find((x) => x.date === yyyyMmDd) || null;
}

// =========================
// Keyboards
// =========================
const MAIN_KB = Markup.keyboard(
  [
    ["Bugun🗓️", "Ertaga🗓️"],
    ["Taroveh vaqti⌛️", "Taroveh duosi🤲🏻"],
    ["Iftorlik duosi🍽️", "Saharlik duosi🌅"],
    ["Manba📚", "Admin"],
  ]
).resize();
  const TAROVEH_DUO =
  "🕌 *Taroveh (Taravih) namozi duosi*\n" +
  "Niyat: Alloh rizoligi uchun Ramazon oyining taroveh namozini o‘qishga niyat qildim.\n\n" +
  "_Eslatma: Taroveh namozida odatda Qur’on tilovati va tasbehlar bo‘ladi. Duoni o‘zingiz bilgan zikr va salovatlar bilan ham to‘ldirishingiz mumkin._";

  const SOURCE_TEXT =
  "📌 *Manba*\n" +
  "Ramazon taqvimi va vaqtlar viloyatlar kesimida mahalliy taqvim asosida kiritiladi.\n" +
  "Fatvo uz\n\n" +
  "⚠️ Eslatma: Vaqtlar joylashuvga qarab farq qiladi.";


const CONTACT_KB = Markup.keyboard([
  [Markup.button.contactRequest("📞 Kontaktni ulashish (Contact)")],
]).resize();

function regionInlineKeyboard(action) {
  const rows = [];
  for (let i = 0; i < REGIONS.length; i += 2) {
    const chunk = REGIONS.slice(i, i + 2);
    rows.push(chunk.map((r) => Markup.button.callback(r, `ramazon:${action}:${r}`)));
  }
  rows.push([Markup.button.callback("❌ Bekor qilish", `ramazon:cancel:${action}`)]);
  return Markup.inlineKeyboard(rows);
}

// =========================
// Duolar
// =========================
const SAHAR_DUO =
  "🌙 *Saharlik duosi (niyat)*\n" +
  "Allohumma inniy nawaitu sovma g‘odin min shahri ramazona minal-fajri ilal-mag‘ribi, xolisan lillahi ta’ala.\n" +
  "_(Mazmuni: Ramazon oyida ertangi ro‘zani Alloh rizoligi uchun tutishga niyat qildim.)_";

const IFTOR_DUO =
  "🌇 *Iftorlik duosi🍽️*\n" +
  "Allohumma laka sumtu wa bika amantu wa ‘alayka tavakkaltu wa ‘ala rizqika aftartu.\n" +
  "_(Mazmuni: Allohim, Sen uchun ro‘za tutdim, Senga iymon keltirdim, Senga tavakkal qildim va bergan rizqing bilan iftor qildim.)_";

// =========================
// Registration flow
// =========================
async function askContact(ctx) {
  await ctx.reply(
    "✅ Botdan foydalanish uchun *kontaktingizni ulashing* 👇",
    { parse_mode: "Markdown", ...CONTACT_KB }
  );
}

async function showWelcome(ctx) {
  await ctx.reply(
    "Assalomu alaykum 😊\nXush kelibsiz!\nPastdagi tugmalardan foydalaning:",
    MAIN_KB
  );
}

bot.start(async (ctx) => {
  USERS = loadUsers(); // yangilab olamiz
  if (!isRegistered(ctx.chat.id)) return askContact(ctx);
  return showWelcome(ctx);
});

// contact kelganda ro‘yxatdan o‘tkazamiz
bot.on("contact", async (ctx) => {
  const c = ctx.message.contact;

  // faqat o‘zining contacti bo‘lsin
  if (String(c.user_id) !== String(ctx.from.id)) {
    await ctx.reply("❗️Iltimos, o‘zingizning kontaktingizni yuboring.", CONTACT_KB);
    return;
  }

  const now = new Date().toISOString();
  upsertUser({
    chat_id: String(ctx.chat.id),
    user_id: String(ctx.from.id),
    first_name: ctx.from.first_name || "",
    last_name: ctx.from.last_name || "",
    username: ctx.from.username || "",
    phone: c.phone_number || "",
    registered_at: now,
  });

  await ctx.reply("✅ Rahmat! Ro‘yxatdan o‘tdingiz.");
  return showWelcome(ctx);
});

// ro‘yxatdan o‘tmagan bo‘lsa — hamma joyda contact so‘raymiz (admin bundan mustasno)
bot.use(async (ctx, next) => {
  USERS = loadUsers();
  if (!ctx.chat || !ctx.from) return next();
  if (ctx.updateType === "message" && ctx.message?.contact) return next();

  if (!isAdmin(ctx) && !isRegistered(ctx.chat.id)) {
    await askContact(ctx);
    return;
  }
  return next();
});

// =========================
// Bugun / Ertaga -> inline region choose
// =========================
bot.hears("Manba📚", (ctx) => ctx.replyWithMarkdown(SOURCE_TEXT, MAIN_KB));
bot.hears("Admin", async (ctx) => {
  await ctx.reply(
    "📩 Taklif va murojaat uchun: @yuldashev_frontend",
    MAIN_KB
  );
});

bot.hears("Bugun🗓️", async (ctx) => {
  USERS = loadUsers();
  const u = getUser(ctx.chat.id);

  // Agar userda region saqlangan bo‘lsa — darrov vaqt chiqaramiz
  if (u?.region) {
    const region = u.region;
    const targetDate = formatDateUZ(new Date());
    const row = findByDate(region, targetDate);

    if (!row) {
      return ctx.replyWithMarkdown(
        `❗️Taqvim topilmadi\n📍 Viloyat: *${region}*\n📅 Sana: *${prettyDate(
          targetDate
        )}*\n\ncalendar.json ga shu sanani qo‘shing.`,
        MAIN_KB
      );
    }

    const msg =
      `📍 *${region}*\n` +
      `📅 *Bugun: ${prettyDate(targetDate)}*\n` +
      `🍽 *Saharlik:* ${row.saharlik}\n` +
      `🌇 *Iftorlik:* ${row.iftorlik}`;

    return ctx.replyWithMarkdown(msg, MAIN_KB);
  }

  // Region yo‘q bo‘lsa — tanlash chiqaramiz
  await ctx.reply("📍 Viloyatni tanlang (Bugun🗓️):", regionInlineKeyboard("today"));
});


bot.hears("Ertaga🗓️", async (ctx) => {
  USERS = loadUsers();
  const u = getUser(ctx.chat.id);

  if (u?.region) {
    const region = u.region;
    const targetDate = formatDateUZ(addDays(new Date(), 1));
    const row = findByDate(region, targetDate);

    if (!row) {
      return ctx.replyWithMarkdown(
        `❗️Taqvim topilmadi\n📍 Viloyat: *${region}*\n📅 Sana: *${prettyDate(
          targetDate
        )}*\n\ncalendar.json ga shu sanani qo‘shing.`,
        MAIN_KB
      );
    }

    const msg =
      `📍 *${region}*\n` +
      `📅 *Ertaga: ${prettyDate(targetDate)}*\n` +
      `🍽 *Saharlik:* ${row.saharlik}\n` +
      `🌇 *Iftorlik:* ${row.iftorlik}`;

    return ctx.replyWithMarkdown(msg, MAIN_KB);
  }

  await ctx.reply("📍 Viloyatni tanlang (Ertaga🗓️):", regionInlineKeyboard("tomorrow"));
});


// =========================
// callback_query
// =========================
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery?.data || "";
  if (!data.startsWith("ramazon:")) return;

  const parts = data.split(":");
  const action = parts[1];

  if (action === "cancel") {
    await ctx.answerCbQuery("Bekor qilindi");
    try {
      await ctx.editMessageText("✅ Bekor qilindi. Pastdagi tugmalardan foydalaning 👇");
    } catch (_) {}
    return;
  }

  const region = parts.slice(2).join(":");
  const now = new Date();

  const targetDate =
    action === "today" ? formatDateUZ(now) : formatDateUZ(addDays(now, 1));

  const row = findByDate(region, targetDate);

  await ctx.answerCbQuery(`${region} tanlandi`);

  // user profiliga regionni saqlab qo‘yamiz
  upsertUser({
    chat_id: String(ctx.chat.id),
    region,
    last_region_selected_at: new Date().toISOString(),
  });

  if (!row) {
    const txt =
      `❗️Taqvim topilmadi\n` +
      `📍 Viloyat: *${region}*\n` +
      `📅 Sana: *${prettyDate(targetDate)}*\n\n` +
      `calendar.json ga shu sanani qo‘shing.`;

    try {
      await ctx.editMessageText(txt, { parse_mode: "Markdown" });
    } catch (_) {
      await ctx.replyWithMarkdown(txt, MAIN_KB);
    }
    return;
  }

  const title = action === "today" ? "Bugun🗓️" : "Ertaga🗓️";
  const msg =
    `📍 *${region}*\n` +
    `📅 *${title}: ${prettyDate(targetDate)}*\n` +
    `🍽 *Saharlik:* ${row.saharlik}\n` +
    `🌇 *Iftorlik:* ${row.iftorlik}`;

  try {
    await ctx.editMessageText(msg, { parse_mode: "Markdown" });
  } catch (_) {
    await ctx.replyWithMarkdown(msg, MAIN_KB);
  }
});

// =========================
// Duolar
// =========================
bot.hears("Saharlik duosi🌅", (ctx) => ctx.replyWithMarkdown(SAHAR_DUO, MAIN_KB));
bot.hears("Iftorlik duosi🍽️", (ctx) => ctx.replyWithMarkdown(IFTOR_DUO, MAIN_KB));

// =========================
// ADMIN PANEL
// /adminman -> faqat ADMIN_ID
// =========================
bot.command("adminman", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("❌ Siz admin emassiz.");

  USERS = loadUsers();
  const total = USERS.length;

  // viloyat bo‘yicha count
  const map = {};
  for (const u of USERS) {
    const r = u.region || "Tanlamagan";
    map[r] = (map[r] || 0) + 1;
  }

  // chiroyli chiqarish
  const lines = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([region, count]) => `• ${region}: ${count}`)
    .join("\n");

  const msg =
    `🔐 *Admin panel*\n\n` +
    `👥 *Jami userlar:* ${total}\n\n` +
    `📍 *Viloyatlar bo‘yicha:*\n${lines || "—"}`;

  await ctx.replyWithMarkdown(msg, MAIN_KB);
});

// =========================
// Fallback
// =========================
bot.on("text", (ctx) => {
  ctx.reply("Pastdagi tugmalardan birini bosing 👇", MAIN_KB);
});

// =========================
// Run
// =========================
bot.launch().then(() => console.log("✅ Ramazon bot ishga tushdi"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
