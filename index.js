const { Telegraf, Markup } = require("telegraf");

// ==================================
// CONFIGURATION
// ==================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);

if (!BOT_TOKEN || !ADMIN_ID) {
  console.error("BOT_TOKEN or ADMIN_ID is missing!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Temporary balance storage (database will be added later)
const balances = new Map();

// ==================================
// MAIN MENU
// ==================================

function mainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("👤 My Account", "account"),
      Markup.button.callback("🎁 Bonus", "bonus")
    ],
    [
      Markup.button.callback("👥 Pay To User", "pay_user"),
      Markup.button.callback("📋 Task Section", "tasks")
    ],
    [
      Markup.button.callback("🎯 Payout Channel", "payout_channel"),
      Markup.button.callback("💳 Payout Method", "payout_method")
    ],
    [
      Markup.button.callback("💸 Withdraw", "withdraw")
    ]
  ]);
}

// ==================================
// ADMIN MENU
// ==================================

function adminMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📊 Stats", "admin_stats"),
      Markup.button.callback("✅ Verify User", "admin_verify")
    ],
    [
      Markup.button.callback("🔍 User Details", "admin_user")
    ],
    [
      Markup.button.callback("📝 Task Manager", "admin_tasks"),
      Markup.button.callback("🎟️ Redeem Codes", "admin_codes")
    ],
    [
      Markup.button.callback("💰 Add Balance", "admin_addbalance"),
      Markup.button.callback("📄 Balance Records", "admin_records")
    ],
    [
      Markup.button.callback("🌐 Add Gateway", "admin_gateway"),
      Markup.button.callback("🎯 Payout Channel", "admin_channel")
    ],
    [
      Markup.button.callback("🤖 Clone Bot", "clone_create"),
      Markup.button.callback("📋 Clone List", "clone_list")
    ],
    [
      Markup.button.callback("🔄 Change Clone Token", "clone_change")
    ],
    [
      Markup.button.callback("📢 Broadcast", "admin_broadcast")
    ],
    [
      Markup.button.callback("⚙️ Settings", "admin_settings")
    ],
    [
      Markup.button.callback("🏠 Main Menu", "home")
    ]
  ]);
}

// ==================================
// START
// ==================================

bot.start(async (ctx) => {
  const userId = ctx.from.id;

  if (!balances.has(userId)) {
    balances.set(userId, 0);
  }

  await ctx.reply(
    "🎉 Welcome to AS Wallet!\n\nChoose an option below:",
    mainMenu()
  );
});

// ==================================
// MAIN MENU BUTTONS
// ==================================

bot.action("home", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("🏠 Main Menu", mainMenu());
});

bot.action("account", async (ctx) => {
  await ctx.answerCbQuery();

  const balance = balances.get(ctx.from.id) || 0;

  await ctx.reply(
    "👤 MY ACCOUNT\n\n" +
    "🆔 User ID: " + ctx.from.id + "\n" +
    "💰 Balance: ₹" + balance.toFixed(2),
    mainMenu()
  );
});

bot.action("bonus", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("🎁 Bonus feature will be added soon.");
});

bot.action("pay_user", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("👥 Pay To User feature will be added soon.");
});

bot.action("tasks", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("📋 Task Section will be added soon.");
});

bot.action("payout_channel", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("🎯 Payout Channel will be added soon.");
});

bot.action("payout_method", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("💳 Payout Method will be added soon.");
});

bot.action("withdraw", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("💸 Withdraw feature will be added soon.");
});

// ==================================
// ADMIN COMMAND
// ==================================

bot.command("admin", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("❌ Access Denied!");
  }

  await ctx.reply("👑 ADMIN PANEL", adminMenu());
});

// ==================================
// ADMIN BUTTONS
// ==================================

bot.action(/^admin_/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.answerCbQuery("Access Denied!", { show_alert: true });
  }

  await ctx.answerCbQuery();
  await ctx.reply("⚙️ Admin feature selected. Setup will be added next.");
});

// ==================================
// CLONE BUTTONS (BASE ONLY)
// ==================================

bot.action("clone_create", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.answerCbQuery("Admin only!", { show_alert: true });
  }

  await ctx.answerCbQuery();
  await ctx.reply(
    "🤖 Clone Bot Setup\n\n" +
    "Clone management will be added in the next step."
  );
});

bot.action("clone_list", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.answerCbQuery("Admin only!", { show_alert: true });
  }

  await ctx.answerCbQuery();
  await ctx.reply("📋 Clone Bot List\n\nNo clones added yet.");
});

bot.action("clone_change", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.answerCbQuery("Admin only!", { show_alert: true });
  }

  await ctx.answerCbQuery();
  await ctx.reply("🔄 Change Clone Token feature will be added.");
});

// ==================================
// ERROR HANDLING
// ==================================

bot.catch((err, ctx) => {
  console.error("Bot error:", err);
});

// ==================================
// START BOT
// ==================================

bot.launch()
  .then(() => console.log("Bot is running!"))
  .catch((err) => console.error("Startup error:", err));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));