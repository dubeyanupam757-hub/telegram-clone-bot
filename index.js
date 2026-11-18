const { Telegraf, Markup, session } = require("telegraf");
const Database = require("better-sqlite3");

// ==================================
// CONFIGURATION
// ==================================

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);
const SUPPORT = (process.env.SUPPORT_USERNAME || "Adarshhh0002").replace(/^@/, "");

if (!TOKEN || !ADMIN_ID) {
  console.error("BOT_TOKEN or ADMIN_ID is missing!");
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

// ==================================
// DATABASE
// ==================================

const db = new Database("wallet.sqlite");

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT,
  username TEXT,
  balance REAL DEFAULT 0,
  joined_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type TEXT,
  amount REAL,
  note TEXT,
  created_at TEXT
);
`);

// ==================================
// SETTINGS
// ==================================

function getSetting(key, fallback) {
  const row = db.prepare(
    "SELECT value FROM settings WHERE key=?"
  ).get(key);

  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings(key,value)
    VALUES(?,?)
    ON CONFLICT(key)
    DO UPDATE SET value=excluded.value
  `).run(key, String(value));
}

if (!getSetting("menu_text", null)) {
  setSetting(
    "menu_text",
    "**🎉 Welcome To Task Wallet!**\n\nChoose an option below 👇"
  );
}

if (!getSetting("payout_methods", null)) {
  setSetting("payout_methods", "UPI");
}

if (!getSetting("withdraw_min", null)) {
  setSetting("withdraw_min", "1");
}

// ==================================
// TEXT FORMATTING
// ==================================

function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Admin can write **text** for bold.
function formatAdminText(text = "") {
  return escapeHtml(text).replace(
    /\*\*(.+?)\*\*/gs,
    "<b>$1</b>"
  );
}

function userName(ctx) {
  return [
    ctx.from.first_name,
    ctx.from.last_name
  ].filter(Boolean).join(" ") || "User";
}

// ==================================
// USER DATABASE
// ==================================

function upsertUser(ctx) {
  db.prepare(`
    INSERT INTO users(id,name,username,balance,joined_at)
    VALUES(?,?,?,?,?)
    ON CONFLICT(id)
    DO UPDATE SET
      name=excluded.name,
      username=excluded.username
  `).run(
    ctx.from.id,
    userName(ctx),
    ctx.from.username || "",
    0,
    new Date().toISOString()
  );
}

function balance(userId) {
  const row = db.prepare(
    "SELECT balance FROM users WHERE id=?"
  ).get(userId);

  return Number(row?.balance || 0);
}

function record(userId, type, amount, note = "") {
  db.prepare(`
    INSERT INTO transactions(
      user_id,type,amount,note,created_at
    )
    VALUES(?,?,?,?,?)
  `).run(
    userId,
    type,
    amount,
    note,
    new Date().toISOString()
  );
}

function addBalance(userId, amount, note = "Admin credit") {
  db.prepare(
    "UPDATE users SET balance=balance+? WHERE id=?"
  ).run(amount, userId);

  record(userId, "credit", amount, note);
}

function isAdmin(ctx) {
  return ctx.from && ctx.from.id === ADMIN_ID;
}

// ==================================
// MAIN MENU KEYBOARD
// ==================================

function mainKeyboard() {
  return Markup.keyboard([
    ["👤 My Account", "🎁 Bonus"],
    ["👥 Pay To User", "📋 Task Section"],
    ["🎯 Payout Channel", "💳 Payout Method"],
    ["💸 Withdraw"]
  ]).resize();
}

// ==================================
// ACCOUNT KEYBOARD
// ==================================

function accountKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "💰 Add Fund",
        "account_addfund"
      )
    ],
    [
      Markup.button.callback(
        "📊 Balance Statement",
        "account_statement"
      ),
      Markup.button.callback(
        "📩 Withdrawal History",
        "account_withdrawals"
      )
    ],
    [
      Markup.button.url(
        "🆘 Support",
        `https://t.me/${SUPPORT}`
      )
    ]
  ]);
}

// ==================================
// ADMIN PANEL
// ==================================

function adminKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "✏️ Edit Main Menu",
        "adm_menu_text"
      )
    ],
    [
      Markup.button.callback(
        "💰 Add Balance",
        "adm_add_balance"
      ),
      Markup.button.callback(
        "📊 Stats",
        "adm_stats"
      )
    ],
    [
      Markup.button.callback(
        "📢 Broadcast",
        "adm_broadcast"
      )
    ],
    [
      Markup.button.callback(
        "⚙️ Withdrawal Settings",
        "adm_withdraw_settings"
      )
    ]
  ]);
}

// ==================================
// ACCOUNT MESSAGE
// ==================================

function accountText(ctx) {
  const bal = balance(ctx.from.id).toFixed(2);

  const username = ctx.from.username
    ? "@" + ctx.from.username
    : "Not Set";

  return (
    "╔════════════════════╗\n" +
    "⚡ <b>WALLET SUMMARY</b> ⚡\n" +
    "╚════════════════════╝\n\n" +

    "👤 <b>" + escapeHtml(userName(ctx)) + "</b>\n" +
    "Username : " + escapeHtml(username) + "\n" +
    "User ID : <code>" + ctx.from.id + "</code>\n\n" +

    "╔════════════════════╗\n" +
    "💰 <b>BALANCE → Rs. " + bal + "</b>\n" +
    "╚════════════════════╝\n\n" +

    "✨ <b>Choose What You Want To Do Next From The Options Below 👇</b>"
  );
}

// ==================================
// SHOW MAIN MENU
// ==================================

async function showMenu(ctx) {
  const menuText = formatAdminText(
    getSetting("menu_text", "🎉 Welcome to Task Wallet!")
  );

  await ctx.reply(menuText, {
    parse_mode: "HTML",
    ...mainKeyboard()
  });
}

// ==================================
// SHOW ACCOUNT
// ==================================

async function showAccount(ctx) {
  await ctx.reply(accountText(ctx), {
    parse_mode: "HTML",
    ...accountKeyboard()
  });
}

// ==================================
// START
// ==================================

bot.start(async (ctx) => {
  upsertUser(ctx);

  await ctx.reply(
    "<b>🟢 Welcome To Task Wallet Bot</b>",
    { parse_mode: "HTML" }
  );

  await showMenu(ctx);
});

// ==================================
// MENU COMMAND
// ==================================

bot.command("menu", async (ctx) => {
  upsertUser(ctx);
  await showMenu(ctx);
});

// ==================================
// ADMIN COMMAND
// ==================================

bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply("⛔ Access Denied!");
  }

  await ctx.reply(
    "<b>👑 ADMIN PANEL</b>\n\nChoose an option:",
    {
      parse_mode: "HTML",
      ...adminKeyboard()
    }
  );
});

// ==================================
// BUILD / INFO
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
// MAIN MENU BUTTONS
// ==================================

bot.hears("👤 My Account", async (ctx) => {
  upsertUser(ctx);
  await showAccount(ctx);
});

bot.hears("🎁 Bonus", async (ctx) => {
  await ctx.reply("🎁 Bonus feature will be added soon.");
});

bot.hears("👥 Pay To User", async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.awaitingPay = true;

  await ctx.reply(
    "👥 Pay To User\n\n" +
    "Send recipient ID and amount:\n\n" +
    "<code>123456789 10</code>",
    { parse_mode: "HTML" }
  );
});

bot.hears("📋 Task Section", async (ctx) => {
  await ctx.reply(
    "📋 <b>Task Section</b>\n\n" +
    "Tasks will appear here once admin adds them.",
    { parse_mode: "HTML" }
  );
});

bot.hears("🎯 Payout Channel", async (ctx) => {
  await ctx.reply(
    "🎯 Payout Channel\n\nNo payout channel has been set."
  );
});

bot.hears("💳 Payout Method", async (ctx) => {
  await ctx.reply(
    "💳 <b>Payout Method</b>\n\n" +
    "Available methods: " +
    escapeHtml(getSetting("payout_methods", "UPI")),
    { parse_mode: "HTML" }
  );
});

// ==================================
// WITHDRAW
// ==================================

bot.hears("💸 Withdraw", async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.awaitingWithdraw = true;

  await ctx.reply(
    "💸 Withdrawal Request\n\n" +
    "Balance: ₹" + balance(ctx.from.id).toFixed(2) + "\n" +
    "Minimum: ₹" + getSetting("withdraw_min", "1") + "\n\n" +
    "Send amount and payment details.\n\n" +
    "Example:\n100 UPI: name@upi"
  );
});

// ==================================
// ADD FUND
// ==================================

bot.action("account_addfund", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply(
    "➕ Add Fund\n\nPlease contact admin/support to add funds."
  );
});

// ==================================
// BALANCE STATEMENT
// ==================================

bot.action("account_statement", async (ctx) => {
  await ctx.answerCbQuery();

  const rows = db.prepare(`
    SELECT type,amount,note,created_at
    FROM transactions
    WHERE user_id=?
    ORDER BY id DESC
    LIMIT 10
  `).all(ctx.from.id);

  if (!rows.length) {
    return ctx.reply("📊 No transactions yet.");
  }

  const text = rows.map((row) => {
    const emoji = row.type === "credit" ? "➕" : "➖";

    return (
      emoji + " ₹" + Number(row.amount).toFixed(2) +
      " — " + escapeHtml(row.note || row.type) +
      "\n<small>" + escapeHtml(row.created_at) + "</small>"
    );
  }).join("\n\n");

  await ctx.reply(
    "📊 <b>Recent Balance Records</b>\n\n" + text,
    { parse_mode: "HTML" }
  );
});

// ==================================
// WITHDRAWAL HISTORY
// ==================================

bot.action("account_withdrawals", async (ctx) => {
  await ctx.answerCbQuery();

  const rows = db.prepare(`
    SELECT amount,note,created_at
    FROM transactions
    WHERE user_id=? AND type='withdraw'
    ORDER BY id DESC
    LIMIT 10
  `).all(ctx.from.id);

  if (!rows.length) {
    return ctx.reply("📩 No withdrawal records yet.");
  }

  const text = rows.map((row) => (
    "₹" + Number(row.amount).toFixed(2) +
    " — " + escapeHtml(row.note) +
    "\n<small>" + escapeHtml(row.created_at) + "</small>"
  )).join("\n\n");

  await ctx.reply(
    "📩 <b>Withdrawal History</b>\n\n" + text,
    { parse_mode: "HTML" }
  );
});

// ==================================
// ADMIN - EDIT MAIN MENU MESSAGE
// ==================================

bot.action("adm_menu_text", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Admin only!", {
      show_alert: true
    });
  }

  await ctx.answerCbQuery();

  ctx.session = ctx.session || {};
  ctx.session.awaitingMenuText = true;

  await ctx.reply(
    "✏️ Send new Main Menu message.\n\n" +
    "Bold ke liye **text** use karein.\n\n" +
    "Example:\n" +
    "**Welcome To Task Wallet!**\n\n" +
    "Choose an option 👇\n\n" +
    "Cancel karne ke liye /cancel bhejein."
  );
});

// ==================================
// ADMIN - ADD BALANCE
// ==================================

bot.action("adm_add_balance", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Admin only!", {
      show_alert: true
    });
  }

  await ctx.answerCbQuery();

  ctx.session = ctx.session || {};
  ctx.session.awaitingAddBalance = true;

  await ctx.reply(
    "💰 Send User ID and Amount:\n\n" +
    "<code>123456789 50</code>",
    { parse_mode: "HTML" }
  );
});

// ==================================
// ADMIN - STATS
// ==================================

bot.action("adm_stats", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Admin only!", {
      show_alert: true
    });
  }

  await ctx.answerCbQuery();

  const count = db.prepare(
    "SELECT COUNT(*) AS c FROM users"
  ).get().c;

  const total = db.prepare(
    "SELECT COALESCE(SUM(balance),0) AS s FROM users"
  ).get().s;

  await ctx.reply(
    "📊 BOT STATISTICS\n\n" +
    "👥 Users: " + count + "\n" +
    "💰 Total Balance: ₹" + Number(total).toFixed(2)
  );
});

// ==================================
// ADMIN - BROADCAST
// ==================================

bot.action("adm_broadcast", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Admin only!", {
      show_alert: true
    });
  }

  await ctx.answerCbQuery();

  ctx.session = ctx.session || {};
  ctx.session.awaitingBroadcast = true;

  await ctx.reply(
    "📢 Send broadcast message.\n\n" +
    "Cancel ke liye /cancel."
  );
});

// ==================================
// ADMIN - WITHDRAW SETTINGS
// ==================================

bot.action("adm_withdraw_settings", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Admin only!", {
      show_alert: true
    });
  }

  await ctx.answerCbQuery();

  ctx.session = ctx.session || {};
  ctx.session.awaitingWithdrawMin = true;

  await ctx.reply(
    "⚙️ Current Minimum: ₹" +
    getSetting("withdraw_min", "1") +
    "\n\nSend new minimum withdrawal amount:"
  );
});

// ==================================
// CANCEL
// ==================================

bot.command("cancel", async (ctx) => {
  ctx.session = {};
  await ctx.reply("❌ Cancelled.");
});

// ==================================
// TEXT HANDLER
// ==================================

bot.on("text", async (ctx) => {
  upsertUser(ctx);

  ctx.session = ctx.session || {};

  const text = ctx.message.text.trim();

  if (text.startsWith("/")) return;

  // Admin edits main-menu message
  if (ctx.session.awaitingMenuText && isAdmin(ctx)) {
    setSetting("menu_text", text);
    ctx.session.awaitingMenuText = false;

    await ctx.reply("✅ Main Menu message saved.");
    return;
  }

  // Admin adds balance
  if (ctx.session.awaitingAddBalance && isAdmin(ctx)) {
    const [id, amountText] = text.split(/\s+/);
    const amount = Number(amountText);

    if (!/^\d+$/.test(id || "") ||
        !Number.isFinite(amount) ||
        amount <= 0) {
      return ctx.reply(
        "❌ Invalid format.\n\n123456789 50"
      );
    }

    db.prepare(`
      INSERT OR IGNORE INTO users(id,name,username,balance,joined_at)
      VALUES(?,?,?,?,?)
    `).run(
      Number(id),
      "User",
      "",
      0,
      new Date().toISOString()
    );

    addBalance(Number(id), amount, "Admin added balance");

    ctx.session.awaitingAddBalance = false;

    await ctx.reply(
      "✅ Added ₹" + amount.toFixed(2) +
      " to User " + id
    );

    try {
      await bot.telegram.sendMessage(
        Number(id),
        "💰 Admin added ₹" +
        amount.toFixed(2) +
        " to your wallet."
      );
    } catch (error) {}

    return;
  }

  // Admin broadcast
  if (ctx.session.awaitingBroadcast && isAdmin(ctx)) {
    ctx.session.awaitingBroadcast = false;

    const users = db.prepare(
      "SELECT id FROM users"
    ).all();

    let sent = 0;

    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.id, text);
        sent++;
      } catch (error) {}
    }

    await ctx.reply(
      "📢 Broadcast completed.\n\n" +
      "Sent: " + sent + "/" + users.length
    );

    return;
  }

  // Admin minimum withdrawal
  if (ctx.session.awaitingWithdrawMin && isAdmin(ctx)) {
    const amount = Number(text);

    if (!Number.isFinite(amount) || amount < 0) {
      return ctx.reply("❌ Enter a valid amount.");
    }

    setSetting("withdraw_min", amount);

    ctx.session.awaitingWithdrawMin = false;

    await ctx.reply("✅ Minimum withdrawal updated.");
    return;
  }

  // User transfers
  if (ctx.session.awaitingPay) {
    const [recipient, amountText] = text.split(/\s+/);
    const amount = Number(amountText);

    if (!/^\d+$/.test(recipient || "") ||
        !Number.isFinite(amount) ||
        amount <= 0) {
      return ctx.reply(
        "❌ Invalid format.\n\n123456789 10"
      );
    }

    if (balance(ctx.from.id) < amount) {
      return ctx.reply("❌ Insufficient balance.");
    }

    const target = db.prepare(
      "SELECT id FROM users WHERE id=?"
    ).get(Number(recipient));

    if (!target) {
      return ctx.reply(
        "❌ Recipient must start this bot first."
      );
    }

    db.prepare(
      "UPDATE users SET balance=balance-? WHERE id=?"
    ).run(amount, ctx.from.id);

    db.prepare(
      "UPDATE users SET balance=balance+? WHERE id=?"
    ).run(amount, Number(recipient));

    record(
      ctx.from.id,
      "debit",
      amount,
      "Transfer to " + recipient
    );

    record(
      Number(recipient),
      "credit",
      amount,
      "Transfer from " + ctx.from.id
    );

    ctx.session.awaitingPay = false;

    await ctx.reply(
      "✅ Sent ₹" + amount.toFixed(2) +
      " to " + recipient
    );

    try {
      await bot.telegram.sendMessage(
        Number(recipient),
        "💰 You received ₹" +
        amount.toFixed(2) +
        " from user " + ctx.from.id
      );
    } catch (error) {}

    return;
  }

  // Withdrawal request
  if (ctx.session.awaitingWithdraw) {
    const parts = text.split(/\s+/);
    const amount = Number(parts[0]);

    if (!Number.isFinite(amount) || amount <= 0) {
      return ctx.reply("❌ Enter a valid amount.");
    }

    const minimum = Number(
      getSetting("withdraw_min", "1")
    );

    if (amount < minimum) {
      return ctx.reply(
        "❌ Minimum withdrawal is ₹" + minimum
      );
    }

    if (balance(ctx.from.id) < amount) {
      return ctx.reply("❌ Insufficient balance.");
    }

    ctx.session.awaitingWithdraw = false;

    db.prepare(
      "UPDATE users SET balance=balance-? WHERE id=?"
    ).run(amount, ctx.from.id);

    record(
      ctx.from.id,
      "withdraw",
      amount,
      text.slice(parts[0].length).trim() || "Pending request"
    );

    await ctx.reply(
      "✅ Withdrawal request received.\n\n" +
      "Admin will review your request."
    );

    await bot.telegram.sendMessage(
      ADMIN_ID,
      "💸 Withdrawal Request\n\n" +
      "User ID: " + ctx.from.id + "\n" +
      "Username: @" + (ctx.from.username || "None") + "\n" +
      "Amount: ₹" + amount + "\n" +
      "Details: " + text
    );

    return;
  }
});

// ==================================
// ERROR HANDLING
// ==================================

bot.catch((error, ctx) => {
  console.error("Bot error:", error);
});

// ==================================
// START BOT
// ==================================

bot.launch()
  .then(() => console.log("Task Wallet Bot is running!"))
  .catch((error) => console.error("Startup error:", error));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));