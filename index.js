
const { Telegraf, Markup } = require("telegraf");
const Database = require("better-sqlite3");
const http = require("http");

// ==================================
// CONFIGURATION
// ==================================

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);
const SUPPORT = (process.env.SUPPORT_USERNAME || "Adarshhh0002").replace(/^@/, "");
const PORT = Number(process.env.PORT || 4009);
const DB_PATH = process.env.DATABASE_PATH || "./wallet.sqlite";

if (!TOKEN || !ADMIN_ID) {
  console.error("ERROR: BOT_TOKEN or ADMIN_ID is missing!");
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

// ==================================
// DATABASE
// ==================================

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

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
// SESSION STORAGE
// ==================================

const sessions = new Map();

bot.use((ctx, next) => {
  const id = ctx.from?.id;

  if (id) {
    if (!sessions.has(id)) {
      sessions.set(id, {});
    }

    ctx.session = sessions.get(id);
  }

  return next();
});

// ==================================
// SETTINGS
// ==================================

function getSetting(key, fallback = "") {
  const row = db.prepare(
    "SELECT value FROM settings WHERE key = ?"
  ).get(key);

  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings(key, value)
    VALUES(?, ?)
    ON CONFLICT(key)
    DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

if (!getSetting("menu_text", "")) {
  setSetting(
    "menu_text",
    "**🎉 Welcome To Task Wallet!**\n\nChoose an option below 👇"
  );
}

if (!getSetting("payout_methods", "")) {
  setSetting("payout_methods", "UPI");
}

if (!getSetting("withdraw_min", "")) {
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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Admin writes **text** for bold
function formatAdminText(text = "") {
  const escaped = escapeHtml(text);

  return escaped.replace(
    /\*\*(.+?)\*\*/gs,
    "<b>$1</b>"
  );
}

function userName(ctx) {
  return [
    ctx.from?.first_name,
    ctx.from?.last_name
  ].filter(Boolean).join(" ") || "User";
}

function money(amount) {
  return Number(amount || 0).toFixed(2);
}

function isAdmin(ctx) {
  return ctx.from?.id === ADMIN_ID;
}

// ==================================
// USER DATABASE
// ==================================

function upsertUser(ctx) {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users(id, name, username, balance, joined_at)
    VALUES(?, ?, ?, 0, ?)
    ON CONFLICT(id)
    DO UPDATE SET
      name = excluded.name,
      username = excluded.username
  `).run(
    ctx.from.id,
    userName(ctx),
    ctx.from.username || "",
    now
  );
}

function ensureUser(userId) {
  db.prepare(`
    INSERT OR IGNORE INTO users(
      id, name, username, balance, joined_at
    )
    VALUES(?, 'User', '', 0, ?)
  `).run(userId, new Date().toISOString());
}

function balance(userId) {
  const row = db.prepare(
    "SELECT balance FROM users WHERE id = ?"
  ).get(userId);

  return Number(row?.balance || 0);
}

function record(userId, type, amount, note = "") {
  db.prepare(`
    INSERT INTO transactions(
      user_id, type, amount, note, created_at
    )
    VALUES(?, ?, ?, ?, ?)
  `).run(
    userId,
    type,
    amount,
    note,
    new Date().toISOString()
  );
}

const addBalanceTransaction = db.transaction(
  (userId, amount, note) => {
    ensureUser(userId);

    db.prepare(
      "UPDATE users SET balance = balance + ? WHERE id = ?"
    ).run(amount, userId);

    record(userId, "credit", amount, note);
  }
);

function addBalance(userId, amount, note = "Admin credit") {
  addBalanceTransaction(userId, amount, note);
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
  const bal = money(balance(ctx.from.id));

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
// MENU
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
  ctx.session.awaitingPay = true;
  ctx.session.awaitingWithdraw = false;

  await ctx.reply(
    "👥 Pay To User\n\n" +
    "Send recipient ID and amount:\n\n" +
    "<code>123456789 10</code>\n\n" +
    "Cancel: /cancel",
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
  ctx.session.awaitingWithdraw = true;
  ctx.session.awaitingPay = false;

  await ctx.reply(
    "💸 Withdrawal Request\n\n" +
    "Balance: ₹" + money(balance(ctx.from.id)) + "\n" +
    "Minimum: ₹" + getSetting("withdraw_min", "1") + "\n\n" +
    "Send amount and payment details.\n\n" +
    "Example:\n100 UPI: name@upi\n\n" +
    "Cancel: /cancel"
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
    SELECT type, amount, note, created_at
    FROM transactions
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 10
  `).all(ctx.from.id);

  if (!rows.length) {
    return ctx.reply("📊 No transactions yet.");
  }

  const output = rows.map((row) => {
    const emoji = row.type === "credit" ? "➕" : "➖";

    return (
      emoji + " ₹" + money(row.amount) +
      " — " + escapeHtml(row.note || row.type) +
      "\n<small>" + escapeHtml(row.created_at) + "</small>"
    );
  }).join("\n\n");

  await ctx.reply(
    "📊 <b>Recent Balance Records</b>\n\n" + output,
    { parse_mode: "HTML" }
  );
});

// ==================================
// WITHDRAWAL HISTORY
// ==================================

bot.action("account_withdrawals", async (ctx) => {
  await ctx.answerCbQuery();

  const rows = db.prepare(`
    SELECT amount, note, created_at
    FROM transactions
    WHERE user_id = ? AND type = 'withdraw'
    ORDER BY id DESC
    LIMIT 10
  `).all(ctx.from.id);

  if (!rows.length) {
    return ctx.reply("📩 No withdrawal records yet.");
  }

  const output = rows.map((row) => (
    "₹" + money(row.amount) +
    " — " + escapeHtml(row.note) +
    "\n<small>" + escapeHtml(row.created_at) + "</small>"
  )).join("\n\n");

  await ctx.reply(
    "📩 <b>Withdrawal History</b>\n\n" + output,
    { parse_mode: "HTML" }
  );
});

// ==================================
// ADMIN - EDIT MAIN MENU
// ==================================

bot.action("adm_menu_text", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Admin only!", {
      show_alert: true
    });
  }

  await ctx.answerCbQuery();

  ctx.session.awaitingMenuText = true;

  await ctx.reply(
    "✏️ Send new Main Menu message.\n\n" +
    "Use **text** for bold.\n\n" +
    "Example:\n" +
    "**Welcome To Task Wallet!**\n\n" +
    "Choose an option 👇\n\n" +
    "Cancel: /cancel"
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

  ctx.session.awaitingAddBalance = true;

  await ctx.reply(
    "💰 Send User ID and Amount:\n\n" +
    "<code>123456789 50</code>\n\n" +
    "Cancel: /cancel",
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
    "SELECT COALESCE(SUM(balance), 0) AS s FROM users"
  ).get().s;

  await ctx.reply(
    "📊 BOT STATISTICS\n\n" +
    "👥 Users: " + count + "\n" +
    "💰 Total Balance: ₹" + money(total)
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

  ctx.session.awaitingBroadcast = true;

  await ctx.reply(
    "📢 Send broadcast message.\n\n" +
    "Cancel: /cancel"
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

  ctx.session.awaitingWithdrawMin = true;

  await ctx.reply(
    "⚙️ Current Minimum: ₹" +
    getSetting("withdraw_min", "1") +
    "\n\nSend new minimum withdrawal amount:\n\n" +
    "Cancel: /cancel"
  );
});

// ==================================
// CANCEL
// ==================================

bot.command("cancel", async (ctx) => {
  if (ctx.session) {
    for (const key of Object.keys(ctx.session)) {
      delete ctx.session[key];
    }
  }

  await ctx.reply("❌ Cancelled.");
});

// ==================================
// TEXT HANDLER
// ==================================

bot.on("text", async (ctx) => {
  upsertUser(ctx);

  const text = ctx.message.text.trim();

  if (text.startsWith("/")) return;

  // Admin: Edit menu message
  if (ctx.session.awaitingMenuText && isAdmin(ctx)) {
    setSetting("menu_text", text);
    ctx.session.awaitingMenuText = false;

    await ctx.reply("✅ Main Menu message saved.");
    return;
  }

  // Admin: Add balance
  if (ctx.session.awaitingAddBalance && isAdmin(ctx)) {
    const [id, amountText] = text.split(/\s+/);
    const amount = Number(amountText);

    if (
      !/^\d+$/.test(id || "") ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return ctx.reply(
        "❌ Invalid format.\n\n123456789 50"
      );
    }

    const userId = Number(id);

    addBalance(userId, amount, "Admin added balance");

    ctx.session.awaitingAddBalance = false;

    await ctx.reply(
      "✅ Added ₹" + money(amount) +
      " to User " + userId
    );

    try {
      await bot.telegram.sendMessage(
        userId,
        "💰 Admin added ₹" + money(amount) +
        " to your wallet."
      );
    } catch (error) {
      console.log("Notification failed:", error.message);
    }

    return;
  }

  // Admin: Broadcast
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
      } catch (error) {
        console.log("Broadcast failed:", user.id, error.message);
      }
    }

    await ctx.reply(
      "📢 Broadcast completed.\n\n" +
      "Sent: " + sent + "/" + users.length
    );

    return;
  }

  // Admin: Minimum withdrawal
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

  // User: Transfer
  if (ctx.session.awaitingPay) {
    const [recipient, amountText] = text.split(/\s+/);
    const amount = Number(amountText);
    const recipientId = Number(recipient);

    if (
      !/^\d+$/.test(recipient || "") ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return ctx.reply(
        "❌ Invalid format.\n\n123456789 10"
      );
    }

    if (recipientId === ctx.from.id) {
      return ctx.reply("❌ You cannot send money to yourself.");
    }

    if (balance(ctx.from.id) < amount) {
      return ctx.reply("❌ Insufficient balance.");
    }

    const target = db.prepare(
      "SELECT id FROM users WHERE id = ?"
    ).get(recipientId);

    if (!target) {
      return ctx.reply(
        "❌ Recipient must start this bot first."
      );
    }

    const transfer = db.transaction(() => {
      db.prepare(
        "UPDATE users SET balance = balance - ? WHERE id = ?"
      ).run(amount, ctx.from.id);

      db.prepare(
        "UPDATE users SET balance = balance + ? WHERE id = ?"
      ).run(amount, recipientId);

      record(
        ctx.from.id,
        "debit",
        amount,
        "Transfer to " + recipientId
      );

      record(
        recipientId,
        "credit",
        amount,
        "Transfer from " + ctx.from.id
      );
    });

    transfer();

    ctx.session.awaitingPay = false;

    await ctx.reply(
      "✅ Sent ₹" + money(amount) +
      " to " + recipientId
    );

    try {
      await bot.telegram.sendMessage(
        recipientId,
        "💰 You received ₹" + money(amount) +
        " from user " + ctx.from.id
      );
    } catch (error) {
      console.log("Transfer notification failed:", error.message);
    }

    return;
  }

  // User: Withdrawal
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
        "❌ Minimum withdrawal is ₹" + money(minimum)
      );
    }

    if (balance(ctx.from.id) < amount) {
      return ctx.reply("❌ Insufficient balance.");
    }

    const details = text.slice(parts[0].length).trim()
      || "Pending request";

    const withdrawal = db.transaction(() => {
      db.prepare(
        "UPDATE users SET balance = balance - ? WHERE id = ?"
      ).run(amount, ctx.from.id);

      record(
        ctx.from.id,
        "withdraw",
        amount,
        details
      );
    });

    withdrawal();

    ctx.session.awaitingWithdraw = false;

    await ctx.reply(
      "✅ Withdrawal request received.\n\n" +
      "Admin will review your request."
    );

    try {
      await bot.telegram.sendMessage(
        ADMIN_ID,
        "💸 Withdrawal Request\n\n" +
        "User ID: " + ctx.from.id + "\n" +
        "Username: @" + (ctx.from.username || "None") + "\n" +
        "Name: " + userName(ctx) + "\n" +
        "Amount: ₹" + money(amount) + "\n" +
        "Details: " + details
      );
    } catch (error) {
      console.log("Admin notification failed:", error.message);
    }

    return;
  }
});

// ==================================
// ERROR HANDLING
// ==================================

bot.catch((error, ctx) => {
  console.error("Bot error:", error);

  if (ctx) {
    ctx.reply("⚠️ An error occurred. Please try again.")
      .catch(() => {});
  }
});

// ==================================
// HOSTING HEALTH SERVER
// ==================================

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("Task Wallet Bot is running!");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Health server listening on port " + PORT);

  bot.launch()
    .then(() => {
      console.log("Task Wallet Bot is running!");
    })
    .catch((error) => {
      console.error("Bot startup error:", error);
      process.exit(1);
    });
});

// ==================================
// SHUTDOWN
// ==================================

process.once("SIGINT", () => {
  bot.stop("SIGINT");
  server.close();
  db.close();
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  server.close();
  db.close();
});
