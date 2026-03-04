require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

// ─── Config ────────────────────────────────────────────────────────────────
const TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(",").map((id) => parseInt(id.trim()))
  : [];
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID
  ? parseInt(process.env.ADMIN_GROUP_ID)
  : null;

// ─── Storage ───────────────────────────────────────────────────────────────
const DB_PATH = "./tickets.json";
function loadDB() {
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}));
  return JSON.parse(fs.readFileSync(DB_PATH));
}
function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ─── Bot Init ──────────────────────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });

// ─── Helpers ───────────────────────────────────────────────────────────────
function generateTicketId() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

function statusEmoji(status) {
  return { open: "🟢", claimed: "🟡", closed: "🔴" }[status] ?? "⚪";
}

function getAgentName(user) {
  return user.username ? `@${user.username}` : user.first_name;
}

// ─── /start ────────────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (isAdmin(userId)) {
    return bot.sendMessage(
      chatId,
      `👋 Welcome back, *${msg.from.first_name}*!\n\nYou are logged in as a *Support Agent*.\n\n*Available Commands:*\n` +
      `/tickets — View all tickets\n` +
      `/claim <id> — Claim a ticket\n` +
      `/close <id> — Close a ticket\n` +
      `/reply <id> <message> — Reply to a user`,
      { parse_mode: "Markdown" }
    );
  }

  return bot.sendMessage(
    chatId,
    `👋 Welcome to *Support Ticket*!\n\nOur support team is here to help you.\nClick the button below to open a ticket and we'll assist you shortly.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📨 Create Ticket", callback_data: "open_ticket" }],
        ],
      },
    }
  );
});

// ─── /tickets (admin) ──────────────────────────────────────────────────────
bot.onText(/\/tickets/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  const db = loadDB();
  const tickets = Object.values(db);
  if (!tickets.length) return bot.sendMessage(msg.chat.id, "No tickets yet.");

  const list = tickets
    .slice(-20)
    .map((t) => `${statusEmoji(t.status)} *#${t.id}* — ${t.username} _(${t.status})_`)
    .join("\n");

  return bot.sendMessage(msg.chat.id, `📋 *All Tickets (last 20):*\n\n${list}`, {
    parse_mode: "Markdown",
  });
});

// ─── /claim <id> (admin) ───────────────────────────────────────────────────
bot.onText(/\/claim (.+)/, async (msg, match) => {
  if (!isAdmin(msg.from.id)) return;
  const ticketId = match[1].trim();
  const db = loadDB();
  const ticket = db[ticketId];

  if (!ticket) return bot.sendMessage(msg.chat.id, `❌ Ticket #${ticketId} not found.`);
  if (ticket.claimedBy)
    return bot.sendMessage(msg.chat.id, `❌ Already claimed by ${ticket.claimedByName}.`);

  const agentName = getAgentName(msg.from);
  ticket.claimedBy = msg.from.id;
  ticket.claimedByName = agentName;
  ticket.status = "claimed";
  saveDB(db);

  await bot.sendMessage(
    ticket.chatId,
    `✅ *Your ticket has been assigned!*\n\n*${agentName}* (Support Agent) has been assigned to your ticket and will assist you shortly.`,
    { parse_mode: "Markdown" }
  );

  return bot.sendMessage(
    msg.chat.id,
    `✅ You claimed ticket *#${ticketId}*.\n\nUse /reply ${ticketId} <message> to respond to the user.`,
    { parse_mode: "Markdown" }
  );
});

// ─── /close <id> (admin) ───────────────────────────────────────────────────
bot.onText(/\/close (.+)/, async (msg, match) => {
  if (!isAdmin(msg.from.id)) return;
  const ticketId = match[1].trim();
  const db = loadDB();
  const ticket = db[ticketId];

  if (!ticket) return bot.sendMessage(msg.chat.id, `❌ Ticket #${ticketId} not found.`);
  if (ticket.status === "closed")
    return bot.sendMessage(msg.chat.id, `❌ Ticket #${ticketId} is already closed.`);

  const agentName = getAgentName(msg.from);
  ticket.status = "closed";
  ticket.closedAt = Date.now();
  saveDB(db);

  await bot.sendMessage(
    ticket.chatId,
    `🔒 *Your ticket #${ticketId} has been closed.*\n\nThank you for reaching out! We hope your issue has been resolved 🙏\n\nIf you need further help, open a new ticket below.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📨 Open New Ticket", callback_data: "open_ticket" }],
        ],
      },
    }
  );

  return bot.sendMessage(msg.chat.id, `✅ Ticket *#${ticketId}* closed.`, {
    parse_mode: "Markdown",
  });
});

// ─── /reply <id> <message> (admin) ────────────────────────────────────────
bot.onText(/\/reply (\d+) (.+)/s, async (msg, match) => {
  if (!isAdmin(msg.from.id)) return;
  const ticketId = match[1];
  const replyText = match[2].trim();
  const db = loadDB();
  const ticket = db[ticketId];

  if (!ticket) return bot.sendMessage(msg.chat.id, `❌ Ticket #${ticketId} not found.`);
  if (ticket.status === "closed")
    return bot.sendMessage(msg.chat.id, `❌ Ticket #${ticketId} is already closed.`);

  const agentName = getAgentName(msg.from);

  await bot.sendMessage(
    ticket.chatId,
    `💬 *${agentName}* (Support Agent):\n\n${replyText}`,
    { parse_mode: "Markdown" }
  );

  ticket.replies.push({
    author: agentName,
    message: replyText.slice(0, 300),
    timestamp: Date.now(),
  });
  saveDB(db);

  return bot.sendMessage(msg.chat.id, `✅ Reply sent to ticket *#${ticketId}*.`, {
    parse_mode: "Markdown",
  });
});

// ─── Button Callbacks ──────────────────────────────────────────────────────
bot.on("callback_query", async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const data = query.data;

  // ── Open Ticket ──────────────────────────────────────────────────────────
  if (data === "open_ticket") {
    const db = loadDB();
    const existing = Object.values(db).find(
      (t) => t.userId === userId && t.status !== "closed"
    );

    if (existing) {
      return bot.answerCallbackQuery(query.id, {
        text: `You already have open ticket #${existing.id}. Please wait for an agent.`,
        show_alert: true,
      });
    }

    const ticketId = generateTicketId();
    const username = query.from.username
      ? `@${query.from.username}`
      : query.from.first_name;

    db[ticketId] = {
      id: ticketId,
      userId,
      username,
      firstName: query.from.first_name,
      chatId,
      status: "open",
      openedAt: Date.now(),
      claimedBy: null,
      claimedByName: null,
      replies: [],
      messageCount: 0,
    };
    saveDB(db);

    // Confirm to user
    await bot.editMessageText(
      `✅ *Ticket #${ticketId} Created!*\n\nHello ${query.from.first_name}, how may I assist you today?\n\nPlease describe your issue below 👇`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "Markdown",
      }
    );

    // Notify all admins
    const adminMsg =
      `🔔 *New Ticket #${ticketId}*\n\n` +
      `👤 User: ${username}\n` +
      `🆔 User ID: \`${userId}\`\n` +
      `🕐 Time: ${new Date().toUTCString()}\n\n` +
      `Tap *Claim* to assign this ticket to yourself.`;

    const adminKeyboard = {
      inline_keyboard: [
        [
          { text: "✅ Claim", callback_data: `claim_${ticketId}` },
          { text: "🔒 Close", callback_data: `close_${ticketId}` },
        ],
      ],
    };

    for (const adminId of ADMIN_IDS) {
      try {
        await bot.sendMessage(adminId, adminMsg, {
          parse_mode: "Markdown",
          reply_markup: adminKeyboard,
        });
      } catch (e) {
        console.log(`Could not notify admin ${adminId}:`, e.message);
      }
    }

    if (ADMIN_GROUP_ID) {
      try {
        await bot.sendMessage(ADMIN_GROUP_ID, adminMsg, {
          parse_mode: "Markdown",
          reply_markup: adminKeyboard,
        });
      } catch (e) {
        console.log("Could not notify admin group:", e.message);
      }
    }

    await bot.answerCallbackQuery(query.id);
    return;
  }

  // ── Claim Button ─────────────────────────────────────────────────────────
  if (data.startsWith("claim_")) {
    if (!isAdmin(userId)) {
      return bot.answerCallbackQuery(query.id, {
        text: "❌ You are not authorized to claim tickets.",
        show_alert: true,
      });
    }

    const ticketId = data.split("_")[1];
    const db = loadDB();
    const ticket = db[ticketId];

    if (!ticket)
      return bot.answerCallbackQuery(query.id, { text: "❌ Ticket not found.", show_alert: true });
    if (ticket.claimedBy)
      return bot.answerCallbackQuery(query.id, {
        text: `❌ Already claimed by ${ticket.claimedByName}.`,
        show_alert: true,
      });

    const agentName = getAgentName(query.from);
    ticket.claimedBy = userId;
    ticket.claimedByName = agentName;
    ticket.status = "claimed";
    saveDB(db);

    await bot.editMessageText(
      `✅ *Ticket #${ticketId} — CLAIMED*\n\n` +
      `👤 User: ${ticket.username}\n` +
      `🛡️ Agent: ${agentName}\n\n` +
      `Use /reply ${ticketId} <message> to respond to the user.`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔒 Close Ticket", callback_data: `close_${ticketId}` }],
          ],
        },
      }
    );

    await bot.sendMessage(
      ticket.chatId,
      `✅ *Your ticket has been assigned!*\n\n*${agentName}* (Support Agent) has been assigned to your ticket and will assist you shortly.`,
      { parse_mode: "Markdown" }
    );

    await bot.answerCallbackQuery(query.id, {
      text: `✅ You claimed ticket #${ticketId}`,
    });
    return;
  }

  // ── Close Button ─────────────────────────────────────────────────────────
  if (data.startsWith("close_")) {
    if (!isAdmin(userId)) {
      return bot.answerCallbackQuery(query.id, {
        text: "❌ You are not authorized to close tickets.",
        show_alert: true,
      });
    }

    const ticketId = data.split("_")[1];
    const db = loadDB();
    const ticket = db[ticketId];

    if (!ticket)
      return bot.answerCallbackQuery(query.id, { text: "❌ Ticket not found.", show_alert: true });

    const agentName = getAgentName(query.from);
    ticket.status = "closed";
    ticket.closedAt = Date.now();
    saveDB(db);

    await bot.editMessageText(
      `🔒 *Ticket #${ticketId} — CLOSED*\n\n` +
      `👤 User: ${ticket.username}\n` +
      `🛡️ Closed by: ${agentName}\n` +
      `🕐 ${new Date().toUTCString()}`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "Markdown",
      }
    );

    await bot.sendMessage(
      ticket.chatId,
      `🔒 *Your ticket #${ticketId} has been closed.*\n\nThank you for reaching out! We hope your issue has been resolved 🙏\n\nIf you need further help, open a new ticket below.`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📨 Open New Ticket", callback_data: "open_ticket" }],
          ],
        },
      }
    );

    await bot.answerCallbackQuery(query.id, {
      text: `✅ Ticket #${ticketId} closed.`,
    });
    return;
  }
});

// ─── User Message Handler (auto-responses) ─────────────────────────────────
bot.on("message", async (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith("/")) return;
  if (isAdmin(msg.from.id)) return;

  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const db = loadDB();

  const ticket = Object.values(db).find(
    (t) => t.userId === userId && t.status !== "closed"
  );

  if (!ticket) {
    return bot.sendMessage(
      chatId,
      `You don't have an open ticket. Click below to create one:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📨 Create Ticket", callback_data: "open_ticket" }],
          ],
        },
      }
    );
  }

  // Save message
  ticket.replies.push({
    author: msg.from.username || msg.from.first_name,
    message: msg.text.slice(0, 300),
    timestamp: Date.now(),
  });
  ticket.messageCount = (ticket.messageCount || 0) + 1;
  saveDB(db);

  // Forward every user message to all admins in real time
  const forwardMsg =
    `📨 *${ticket.username}* (Ticket #${ticket.id}):\n\n${msg.text}`;

  for (const adminId of ADMIN_IDS) {
    try {
      await bot.sendMessage(adminId, forwardMsg, { parse_mode: "Markdown" });
    } catch (e) {
      console.log(`Could not forward to admin ${adminId}:`, e.message);
    }
  }
  if (ADMIN_GROUP_ID) {
    try {
      await bot.sendMessage(ADMIN_GROUP_ID, forwardMsg, { parse_mode: "Markdown" });
    } catch (e) {
      console.log("Could not forward to admin group:", e.message);
    }
  }

  // Stop auto-responses once claimed — admin takes over
  if (ticket.claimedBy) return;

  // Show typing indicator then auto-respond
  await bot.sendChatAction(chatId, "typing");
  await new Promise((r) => setTimeout(r, 2500));

  const count = ticket.messageCount;

  if (count === 1) {
    // Q1: Describe the issue
    await bot.sendMessage(chatId,
      `Hello *${msg.from.first_name}*! 👋\n\nThank you for reaching out. To help you as quickly as possible, I'll need to ask you a few questions.\n\n*Question 1:* Please describe your crypto issue in detail. What exactly is happening? 🔍`,
      { parse_mode: "Markdown" }
    );
  } else if (count === 2) {
    // Q2: Wallet type
    await bot.sendMessage(chatId,
      `Thank you for that information! ✅\n\n*Question 2:* What type of wallet are you using?\n\nExamples: MetaMask, Trust Wallet, Coinbase Wallet, Phantom, Ledger, Binance, etc. 💼`,
      { parse_mode: "Markdown" }
    );
  } else if (count === 3) {
    // Q3: Wallet address
    await bot.sendMessage(chatId,
      `Got it! 📝\n\n*Question 3:* Please provide your *wallet address*.\n\nThis will allow us to investigate your issue on the blockchain. 🔗`,
      { parse_mode: "Markdown" }
    );
  } else if (count === 4) {
    // Q4: How long has the issue been occurring
    await bot.sendMessage(chatId,
      `Thank you! 🙏\n\n*Question 4:* How long have you been experiencing this issue?\n\nExamples:\n• Just started today\n• A few hours ago\n• Since yesterday\n• Over a week\n• More than a month 🕐`,
      { parse_mode: "Markdown" }
    );
  } else if (count === 5) {
    // Q5: Transaction ID if applicable
    await bot.sendMessage(chatId,
      `Noted! 📋\n\n*Question 5:* Do you have a *transaction ID / hash* related to this issue?\n\nIf yes, please paste it below. If not, type *"No transaction ID"*. 🔎`,
      { parse_mode: "Markdown" }
    );
  } else if (count === 6) {
    // Q6: Amount involved
    await bot.sendMessage(chatId,
      `Thank you! 💰\n\n*Question 6:* What is the *amount* involved in this issue?\n\nPlease include the coin/token name and amount (e.g. *0.5 ETH*, *200 USDT*, *0.002 BTC*). 📊`,
      { parse_mode: "Markdown" }
    );
  } else {
    // All questions answered — notify agent
    await bot.sendMessage(chatId,
      `✅ *Thank you ${msg.from.first_name}!*\n\nWe have collected all the information needed to investigate your issue.\n\n⏳ A support agent has been notified and will be with you shortly.\n\n*Please remain in this chat and do not close it.* 🙏`,
      { parse_mode: "Markdown" }
    );

    // Send summary to all admins
    const summary =
      `📋 *Ticket #${ticket.id} — Full Summary*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 User: ${ticket.username}\n\n` +
      ticket.replies.slice(0, 6).map((r, i) =>
        `*Q${i + 1}:* ${r.message}`
      ).join("\n\n");

    for (const adminId of ADMIN_IDS) {
      try {
        await bot.sendMessage(adminId, summary, { parse_mode: "Markdown" });
      } catch (e) {}
    }
    if (ADMIN_GROUP_ID) {
      try {
        await bot.sendMessage(ADMIN_GROUP_ID, summary, { parse_mode: "Markdown" });
      } catch (e) {}
    }
  }
});

console.log("✅ Telegram Support Ticket Bot is running...");
