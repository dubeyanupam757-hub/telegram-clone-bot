const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");

// ==================================
// CONFIG
// ==================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);

if (!BOT_TOKEN || !ADMIN_ID) {
  console.error("BOT_TOKEN / ADMIN_ID missing!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const DATA_FILE = "./data.json";

// ==================================
// DATABASE
// ==================================

let data = {
  users: {},
  welcome: "🟢 Welcome To Task Wallet Bot",
  menuText: "Choose an option below:",
  balances: {},
  settings: {}
};

try {
  if (fs.existsSync(DATA_FILE)) {
    data = { ...data, ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
  }
} catch (e) {
  console.log("Database loading error:", e.message);
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function formatText(text) {
  // Convert **bold** into HTML bold
  text = text.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
  return text;
}

function balanceOf(id) {
  return Number(data.balances[id] || 0);
}

function setBalance(id, amount) {
  data.balances[id] = Number(amount);
  saveData();
}

// ==================================
// MAIN MENU
// ==================================

function mainMenu() {
  return Markup.keyboard([
    ["👤 My Account", "🎁 Bonus"],
    ["👥 Pay To User", "📋 Task Section"],
    ["🎯 Payout Channel", "💳 Payout Method"],
    ["💸 Withdraw"]
  ])
    .resize()
    .persistent();
}

function accountMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💰 Add Fund", "account_fund")],
    [
      Markup.button.callback("📊 Balance Statement", "account_records"),
      Markup.button.callback("📥 Withdrawal History", "account_history")
    ],
    [Markup.button.callback("🆘 Support", "account_support")],
    [Markup.button.callback("🏠 Main Menu", "home")]
  ]);
}

// ==================================
// ADMIN PANEL
// ==================================

function adminMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📊 Stats", "admin_stats"),
      Markup.button.callback("👤 User Details", "admin_user")
    ],
    [
      Markup.button.callback("💰 Add Balance", "admin_addbalance"),
      Markup.button.callback("📢 Broadcast", "admin_broadcast")
    ],
    [
      Markup.button.callback("📝 Edit Welcome", "edit_welcome"),
      Markup.button.callback("✏️ Edit Menu Text", "edit_menutext")
    ],
    [
      Markup.button.callback("🤖 Clone Bot", "clone_create"),
      Markup.button.callback("📋 Clone List", "clone_list")
    ],
    [
      Markup.button.callback("🔄 Change Clone Token", "clone_change")
    ],
    [
      Markup.button.callback("🌐 Gateway Settings", "admin_gateway"),
      Markup.button.callback("🎯 Payout Channel", "admin_channel")
    ],
    [
      Markup.button.callback("⚙️ Settings", "admin_settings")
    ],
    [Markup.button.callback("🏠 Main Menu", "home")]
  ]);
}

// ==================================
// START
// ==================================

bot.start(async (ctx) => {
  const id = String(ctx.from.id);

  if (!data.users[id]) {
    data.users[id] = {
      id: ctx.from.id,
      name: ctx.from.first_name || "User",
      username: ctx.from.username || "",
      joined: Date.now()
    };
    saveData();
  }

  await ctx.reply(
    formatText(data.welcome),
    {
      parse_mode: "HTML",
      ...mainMenu()
    }
  );

  await ctx.reply(
    formatText(data.menuText),
    {
      parse_mode: "HTML"
    }
  );
});

// ==================================
// /ADMIN
// ==================================

bot.command("admin", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("❌ Access Denied!");
  }

  await ctx.reply("👑 ADMIN PANEL", adminMenu());
});

// ==================================
// /BUILD & /INFO
// ==================================

bot.command(["build", "info"], async (ctx) => {
  await ctx.reply(
    '🤖 Hosted By : <a href="https://t.me/Botsbyadarshhh">Bots By Adarsh ♛</a>',
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    }
  );
});

// ==================================
// HOME
// ==================================

bot.action("home", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply(
    formatText(data.menuText),
    {
      parse_mode: "HTML",
      ...mainMenu()
    }
  );
});

// ==================================
// MY ACCOUNT
// ==================================

bot.hears(/^👤 My Account$|^My Account$/i, async (ctx) => {
  const id = ctx.from.id;
  const user = ctx.from;
  const balance = balanceOf(id);

  const username = user.username
    ? "@" + user.username
    : "Not Set";

  const message =
    "╔════════════════════╗\n" +
    "     ⚡ <b>WALLET SUMMARY</b> ⚡\n" +
    "╚════════════════════╝\n\n" +
    "👤 <b>" + escapeHtml(user.first_name || "User") + "</b>\n" +
    "🔹 Username : " + escapeHtml(username) + "\n" +
    "🆔 User ID : <code>" + id + "</code>\n\n" +
    "╔════════════════════╗\n" +
    "💰 <b>BALANCE → ₹" + balance.toFixed(2) + "</b>\n" +
    "╚════════════════════╝\n\n" +
    "✨ <b>Choose what you want to do next 👇</b>";

  await ctx.reply(message, {
    parse_mode: "HTML",
    ...accountMenu()
  });
});

// ==================================
// OTHER MAIN BUTTONS
// ==================================

bot.hears(/^🎁 Bonus$|^Bonus$/i, (ctx) =>
  ctx.reply("🎁 Bonus feature is coming soon.")
);

bot.hears(/^👥 Pay To User$|^Pay To User$/i, (ctx) =>
  ctx.reply("👥 Send the recipient's Telegram ID to continue.")
);

bot.hears(/^📋 Task Section$|^Task Section$/i, (ctx) =>
  ctx.reply("📋 Task Section will be available soon.")
);

bot.hears(/^🎯 Payout Channel$|^Payout Channel$/i, (ctx) =>
  ctx.reply("🎯 Payout Channel information will be available soon.")
);

bot.hears(/^💳 Payout Method$|^Payout Method$/i, (ctx) =>
  ctx.reply("💳 Payout Method will be available soon.")
);

bot.hears(/^💸 Withdraw$|^Withdraw$/i, (ctx) =>
  ctx.reply("💸 Withdrawal feature will be available soon.")
);

// ==================================
// ACCOUNT CALLBACKS
// ==================================

bot.action("account_fund", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("💰 Add Fund feature will be configured soon.");
});

bot.action("account_records", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("📊 Your balance records will appear here.");
});

bot.action("account_history", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("📥 Your withdrawal history will appear here.");
});

bot.action("account_support", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("🆘 Contact support for help.");
});

// ==================================
// ADMIN ACCESS CHECK
// ==================================

function isAdmin(ctx) {
  return ctx.from && ctx.from.id === ADMIN_ID;
}

// ==================================
// ADMIN CALLBACKS
// ==================================

bot.action(/^admin_/, async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Admin Only!", { show_alert: true });
  }

  await ctx.answerCbQuery();

  const action = ctx.callbackQuery.data;

  if (action === "admin_stats") {
    return ctx.reply(
      "📊 BOT STATS\n\n" +
      "👥 Users: " + Object.keys(data.users).length + "\n" +
      "💰 Balance entries: " + Object.keys(data.balances).length
    );
  }

  if (action === "admin_user") {
    return ctx.reply("Send the user's Telegram ID.");
  }

  if (action === "admin_addbalance") {
    return ctx.reply("Send: USER_ID AMOUNT\nExample: 123456789 50");
  }

  if (action === "admin_broadcast") {
    return ctx.reply("Send the broadcast message.");
  }

  if (action === "admin_gateway") {
    return ctx.reply("🌐 Gateway settings will be configured here.");
  }

  if (action === "admin_channel") {
    return ctx.reply("🎯 Send the payout channel username or link.");
  }

  if (action === "admin_settings") {
    return ctx.reply("⚙️ Settings menu.");
  }
});

// ==================================
// EDIT WELCOME MESSAGE
// ==================================

bot.action("edit_welcome", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Admin Only!", { show_alert: true });
  }

  await ctx.answerCbQuery();

  data.waiting = {
    type: "welcome",
    user: ADMIN_ID
  };

  await ctx.reply(
    "✏️ Send the new Welcome Message.\n\n" +
    "Use **text** for bold.\n\n" +
    "Example:\n**🟢 Welcome To Task Wallet Bot**"
  );
});

// ==================================
// EDIT MAIN MENU TEXT
// ==================================

bot.action("edit_menutext", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Admin Only!", { show_alert: true });
  }

  await ctx.answerCbQuery();

  data.waiting = {
    type: "menuText",
    user: ADMIN_ID
  };

  await ctx.reply(
    "✏️ Send the new Main Menu message.\n\n" +
    "Use **text** to make bold.\n" +
    "Example: **Choose an option below 👇**"
  );
});

// ==================================
// CLONE MENU
// ==================================

bot.action("clone_create", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Admin Only!", { show_alert: true });
  }

  await ctx.answerCbQuery();

  await ctx.reply(
    "🤖 Clone Bot Setup\n\n" +
    "Clone bot management requires a secure token setup."
  );
});

bot.action("clone_list", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Admin Only!", { show_alert: true });
  }

  await ctx.answerCbQuery();

  await ctx.reply("📋 Clone List\n\nNo clone bots registered.");
});

bot.action("clone_change", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Admin Only!", { show_alert: true });
  }

  await ctx.answerCbQuery();

  await ctx.reply(
    "🔄 Clone token changing will be added after secure clone setup."
  );
});

// ==================================
// ADMIN TEXT INPUTS
// ==================================

bot.on("text", async (ctx, next) => {
  if (!isAdmin(ctx)) return next();

  const waiting = data.waiting;

  if (!waiting || waiting.user !== ADMIN_ID) return next();

  const text = ctx.message.text;

  if (waiting.type === "welcome") {
    data.welcome = text;
    delete data.waiting;
    saveData();

    return ctx.reply("✅ Welcome message updated!");
  }

  if (waiting.type === "menuText") {
    data.menuText = text;
    delete data.waiting;
    saveData();

    return ctx.reply("✅ Main Menu message updated!");
  }
});

// ==================================
// HELPERS
// ==================================

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ==================================
// ERROR HANDLING
// ==================================

bot.catch((err, ctx) => {
  console.error("Bot error:", err);
});

// ==================================
// LAUNCH
// ==================================

bot.launch()
  .then(() => console.log("Task Wallet Bot is running!"))
  .catch((err) => console.error("Startup error:", err));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));