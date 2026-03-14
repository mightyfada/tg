require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { v4: uuidv4 } = require('uuid');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ─── In-memory stores ─────────────────────────────────────────────────────────
const tickets = new Map();
const userActiveTicket = new Map();
const adminActiveTicket = new Map();

// ─── Config ───────────────────────────────────────────────────────────────────
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID;
const BOT_NAME = process.env.BOT_NAME || 'Live Ticket';

// ─── Ticket types (short labels for 2-column grid) ────────────────────────────
const TICKET_TYPES = [
  { id: 'general',       label: '❓ General Support' },
  { id: 'technical',     label: '🛠️ Technical / Bug' },
  { id: 'transaction',   label: '💸 Transaction Issue' },
  { id: 'wallet',        label: '👛 Wallet Problem' },
  { id: 'swap',          label: '🔄 Swap / Exchange' },
  { id: 'deposit',       label: '🏧 Deposit / Withdrawal' },
  { id: 'bridge',        label: '🌉 Bridge / Cross-chain' },
  { id: 'gas',           label: '⛽ Gas Fee Problem' },
  { id: 'defi',          label: '🌊 DeFi / Liquidity Pool' },
  { id: 'staking',       label: '🏦 Staking & Rewards' },
  { id: 'mining',        label: '⛏️ Mining / Validator' },
  { id: 'smartcontract', label: '📜 Smart Contract' },
  { id: 'nft',           label: '🖼️ NFT Issue' },
  { id: 'token',         label: '🪙 Token / Airdrop' },
  { id: 'lost',          label: '🔓 Lost / Stolen Funds' },
  { id: 'network',       label: '🌐 Network Congestion' },
  { id: 'account',       label: '🔐 Account Issues' },
  { id: 'kyc',           label: '✅ KYC Support' },
  { id: 'scam',          label: '🚨 Scam / Suspicious' },
  { id: 'feedback',      label: '💡 Feedback' },
  { id: 'other',         label: '📩 Other' },
];

// ─── Type-specific prompts ────────────────────────────────────────────────────
const TYPE_PROMPTS = {
  general:       `📋 *General Support*\n\nPlease describe your issue in as much detail as possible. Include any relevant screenshots or files.`,
  technical:     `🛠️ *Technical/Bug Support*\n\nPlease provide:\n1. A clear description of the issue\n2. Steps to reproduce the problem\n3. Screenshots or error messages\n4. Your device/browser information`,
  transaction:   `💸 *Transaction Issue*\n\nPlease provide:\n1. Transaction hash / TX ID\n2. Wallet address involved\n3. Amount and token/coin sent\n4. Source and destination network\n5. Date and time\n6. What went wrong (stuck, failed, missing funds, etc.)`,
  wallet:        `👛 *Wallet Problem*\n\nPlease provide:\n1. Your wallet address ⚠️ *never share your private key or seed phrase*\n2. Wallet app/extension you use\n3. Network affected (e.g. Ethereum, BSC, Solana)\n4. Description of the problem\n5. Any error messages`,
  swap:          `🔄 *Swap / Exchange Issue*\n\nPlease provide:\n1. Transaction hash / TX ID\n2. Token pair (e.g. ETH → USDT)\n3. Amount sent and expected to receive\n4. Platform or DEX used\n5. Network and date\n6. Description of the issue`,
  deposit:       `🏧 *Deposit / Withdrawal Issue*\n\nPlease provide:\n1. Transaction hash / TX ID\n2. Your wallet address\n3. Amount and token involved\n4. Platform used\n5. Network (e.g. Ethereum, BSC, Tron)\n6. Date and time\n7. What went wrong (not credited, stuck, wrong network, etc.)`,
  bridge:        `🌉 *Bridge / Cross-chain Issue*\n\nPlease provide:\n1. Transaction hash / TX ID\n2. Source → Destination network\n3. Token and amount bridged\n4. Bridge platform used\n5. Date and time\n6. What went wrong`,
  gas:           `⛽ *Gas Fee Problem*\n\nPlease provide:\n1. Transaction hash / TX ID (if applicable)\n2. Network affected\n3. Wallet app you are using\n4. Description (stuck tx, high gas, estimation failed, etc.)\n5. Screenshots of any error messages`,
  defi:          `🌊 *DeFi / Liquidity Pool Issue*\n\nPlease provide:\n1. Your wallet address\n2. Protocol or platform name\n3. Token pair or pool involved\n4. Amount affected\n5. Transaction hash if applicable\n6. Description of the issue`,
  staking:       `🏦 *Staking & Rewards*\n\nPlease provide:\n1. Your wallet address\n2. Token/coin you are staking\n3. Platform or protocol used\n4. Amount staked\n5. Description (missing rewards, can't unstake, wrong APY, etc.)\n6. Transaction hash if applicable`,
  mining:        `⛏️ *Mining / Validator Support*\n\nPlease provide:\n1. Your validator/miner wallet address\n2. Network (e.g. Ethereum, Solana, Cosmos)\n3. Amount of funds or stake involved\n4. Description (missed rewards, slashing, node not syncing, etc.)\n5. Transaction hash or epoch number if applicable`,
  smartcontract: `📜 *Smart Contract Issue*\n\nPlease provide:\n1. Smart contract address\n2. Network the contract is deployed on\n3. Transaction hash of the failed interaction\n4. Function or action you tried to execute\n5. Error message or revert reason`,
  nft:           `🖼️ *NFT Issue*\n\nPlease provide:\n1. Your wallet address\n2. NFT collection name and token ID\n3. Marketplace involved (e.g. OpenSea, Blur)\n4. Transaction hash if applicable\n5. Description (not appearing, transfer failed, wrong metadata, etc.)`,
  token:         `🪙 *Token / Airdrop Issue*\n\nPlease provide:\n1. Token name and contract address\n2. Your wallet address\n3. Network (e.g. Ethereum, BSC, Solana)\n4. Description (token not received, wrong amount, can't claim, etc.)\n5. Transaction hash if applicable`,
  lost:          `🔓 *Lost / Stolen Funds*\n\n⚠️ *Never share your private key or seed phrase with anyone.*\n\nPlease provide:\n1. Your wallet address\n2. Amount and token/coin lost\n3. Transaction hash(es) if available\n4. Network involved\n5. How it happened (wrong address, hacked, phishing, etc.)\n6. Date and time\n7. Any suspicious addresses or links`,
  network:       `🌐 *Network Congestion Issue*\n\nPlease provide:\n1. Network affected\n2. Transaction hash if you have a pending tx\n3. Wallet app you are using\n4. Description (pending too long, failed due to congestion, etc.)\n5. Date and time the issue started`,
  account:       `🔐 *Account Issues*\n\nPlease describe your account problem. *Do not share your password or private key.*\n\nInclude your registered email or username so we can look up your account.`,
  kyc:           `✅ *KYC Support*\n\nPlease provide:\n1. Email address used during KYC\n2. Description of the issue\n3. Any error messages you received`,
  scam:          `🚨 *Scam / Suspicious Activity*\n\n⚠️ *Never share your private key or seed phrase with anyone, including support agents.*\n\nPlease provide:\n1. Description of what happened\n2. Any wallet addresses or links involved\n3. Transaction hashes if funds were moved\n4. Screenshots of suspicious messages\n5. Date and time of the incident`,
  feedback:      `💡 *Feedback & Suggestions*\n\nWe'd love to hear from you! Please share:\n1. What feature or area your feedback relates to\n2. Your suggestion or observation\n3. How this would improve your experience`,
  other:         `📩 *Other*\n\nPlease describe your inquiry in detail so we can route it to the right team.`,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateTicketId() {
  return 'TKT-' + uuidv4().split('-')[0].toUpperCase();
}

function getTicketByUser(userId) {
  const ticketId = userActiveTicket.get(userId);
  return ticketId ? tickets.get(ticketId) : null;
}

function getTicketByAdmin(adminId) {
  const ticketId = adminActiveTicket.get(adminId);
  return ticketId ? tickets.get(ticketId) : null;
}

function closeTicketSession(ticketId) {
  const ticket = tickets.get(ticketId);
  if (!ticket) return;
  ticket.status = 'closed';
  ticket.closedAt = new Date();
  userActiveTicket.delete(ticket.userId);
  if (ticket.adminId) adminActiveTicket.delete(ticket.adminId);
}

function formatTicketInfo(ticket) {
  const typeLabel = TICKET_TYPES.find(t => t.id === ticket.type)?.label || ticket.type;
  const adminStatus = ticket.adminId ? '✅ Admin assigned' : '⏳ Waiting for admin';
  return `🎫 *Ticket ID:* \`${ticket.ticketId}\`\n📂 *Type:* ${typeLabel}\n${adminStatus}`;
}

// Build 2-column grid keyboard
function buildTypeKeyboard() {
  const rows = [];
  for (let i = 0; i < TICKET_TYPES.length; i += 2) {
    const row = [Markup.button.callback(TICKET_TYPES[i].label, `type_${TICKET_TYPES[i].id}`)];
    if (TICKET_TYPES[i + 1]) {
      row.push(Markup.button.callback(TICKET_TYPES[i + 1].label, `type_${TICKET_TYPES[i + 1].id}`));
    }
    rows.push(row);
  }
  return Markup.inlineKeyboard(rows);
}

// Notify admin group of a new ticket
async function notifyAdminGroup(ticket, extraText = '') {
  if (!ADMIN_GROUP_ID) {
    console.warn('⚠️  ADMIN_GROUP_ID not set — skipping admin notification');
    return;
  }
  const typeLabel = TICKET_TYPES.find(t => t.id === ticket.type)?.label || ticket.type;
  const msg =
    `🎫 *New Support Ticket*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🆔 \`${ticket.ticketId}\`\n` +
    `📂 ${typeLabel}\n` +
    `👤 ${ticket.userInfo.name} (@${ticket.userInfo.username})\n` +
    `🕐 ${new Date(ticket.createdAt).toLocaleString()}\n` +
    (extraText ? `\n💬 *Message:*\n${extraText}` : '');

  try {
    await bot.telegram.sendMessage(ADMIN_GROUP_ID, msg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✋ Claim Ticket', `claim_${ticket.ticketId}`)],
      ]),
    });
    console.log(`✅ Admin group notified for ticket ${ticket.ticketId}`);
  } catch (err) {
    console.error(`❌ Could not notify admin group: ${err.message}`);
  }
}

function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// ─── /start ───────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const existing = getTicketByUser(userId);

  if (existing && existing.status === 'open') {
    return ctx.reply(
      `⚠️ You already have an open ticket.\n\n${formatTicketInfo(existing)}\n\nPlease close your current ticket before opening a new one.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔴 Close Current Ticket', `close_${existing.ticketId}`)],
        ]),
      }
    );
  }

  await ctx.reply(
    `👋 Welcome to *${BOT_NAME}*!\n\nPlease select the ticket type below based on your inquiry:`,
    { parse_mode: 'Markdown', ...buildTypeKeyboard() }
  );
});

// ─── Ticket type selection ────────────────────────────────────────────────────
TICKET_TYPES.forEach(({ id }) => {
  bot.action(`type_${id}`, async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;

    const existing = getTicketByUser(userId);
    if (existing && existing.status === 'open') {
      return ctx.reply('⚠️ You already have an open ticket. Please close it first.');
    }

    const ticketId = generateTicketId();
    const ticket = {
      ticketId,
      userId,
      adminId: null,
      type: id,
      status: 'open',
      createdAt: new Date(),
      closedAt: null,
      userInfo: {
        name: ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : ''),
        username: ctx.from.username || 'N/A',
      },
    };

    tickets.set(ticketId, ticket);
    userActiveTicket.set(userId, ticketId);

    // Remove buttons from original message
    try {
      await ctx.editMessageText(
        `✅ *Ticket type selected:* ${TICKET_TYPES.find(t => t.id === id)?.label}`,
        { parse_mode: 'Markdown' }
      );
    } catch (_) {}

    // Send ticket ID + prompt to user
    await ctx.reply(
      `🎫 *Your Ticket ID:* \`${ticketId}\`\n\nKeep this ID for reference.\n\n${TYPE_PROMPTS[id]}\n\n⏳ Please send your message below and an agent will join shortly.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔴 Cancel Ticket', `close_${ticketId}`)],
        ]),
      }
    );

    // ✅ Notify admin group immediately when ticket is created
    await notifyAdminGroup(ticket);
  });
});

// ─── User / Admin messages ────────────────────────────────────────────────────
bot.on('message', async (ctx) => {
  const userId = ctx.from.id;

  // ── Admin side: relay to user ──
  const adminTicket = getTicketByAdmin(userId);
  if (adminTicket && adminTicket.status === 'open') {
    try {
      if (ctx.message.text) {
        await bot.telegram.sendMessage(
          adminTicket.userId,
          `💬 *Support Agent:* ${escapeMarkdown(ctx.message.text)}`,
          { parse_mode: 'Markdown' }
        );
      } else if (ctx.message.photo) {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        await bot.telegram.sendPhoto(adminTicket.userId, photo.file_id, {
          caption: ctx.message.caption ? `💬 *Support Agent:* ${ctx.message.caption}` : '📷 Image from support agent',
          parse_mode: 'Markdown',
        });
      } else if (ctx.message.document) {
        await bot.telegram.sendDocument(adminTicket.userId, ctx.message.document.file_id, {
          caption: `📎 File from support agent`,
        });
      }
      await ctx.react('👍').catch(() => {});
    } catch (err) {
      console.error('Error relaying admin→user:', err.message);
      await ctx.reply('⚠️ Could not deliver your message to the user.');
    }
    return;
  }

  // ── User side ──
  const userTicket = getTicketByUser(userId);
  if (!userTicket || userTicket.status !== 'open') {
    return ctx.reply(
      '👋 No active ticket found. Use /start to open a new ticket.',
      Markup.inlineKeyboard([[Markup.button.callback('🎫 Open New Ticket', 'new_ticket')]])
    );
  }

  // No admin yet — acknowledge and notify group with message preview
  if (!userTicket.adminId) {
    await ctx.reply(
      `⏳ *Message received!*\n\nA support agent will join your ticket shortly. Please be patient.\n\n_Ticket ID: \`${userTicket.ticketId}\`_`,
      { parse_mode: 'Markdown' }
    );

    const preview = ctx.message.text ? escapeMarkdown(ctx.message.text.substring(0, 200)) : '📎 User sent a file/photo';
    await notifyAdminGroup(userTicket, preview);
    return;
  }

  // Admin assigned — relay to admin
  try {
    if (ctx.message.text) {
      await bot.telegram.sendMessage(
        userTicket.adminId,
        `👤 *User:* ${escapeMarkdown(ctx.message.text)}`,
        { parse_mode: 'Markdown' }
      );
    } else if (ctx.message.photo) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      await bot.telegram.sendPhoto(userTicket.adminId, photo.file_id, {
        caption: ctx.message.caption ? `👤 *User:* ${ctx.message.caption}` : '📷 Photo from user',
        parse_mode: 'Markdown',
      });
    } else if (ctx.message.document) {
      await bot.telegram.sendDocument(userTicket.adminId, ctx.message.document.file_id, {
        caption: `📎 File from user`,
      });
    }
  } catch (err) {
    console.error('Error relaying user→admin:', err.message);
  }
});

// ─── Admin claims ticket ──────────────────────────────────────────────────────
bot.action(/^claim_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Claiming ticket...');
  const ticketId = ctx.match[1];
  const adminId = ctx.from.id;
  const ticket = tickets.get(ticketId);

  if (!ticket) return ctx.reply('❌ Ticket not found.');
  if (ticket.status !== 'open') return ctx.reply('❌ This ticket is already closed.');
  if (ticket.adminId) return ctx.reply('⚠️ This ticket has already been claimed by another agent.');
  if (adminActiveTicket.has(adminId)) {
    return ctx.reply('⚠️ You already have an active ticket. Close it first with /endticket.');
  }

  ticket.adminId = adminId;
  ticket.claimedAt = new Date();
  adminActiveTicket.set(adminId, ticketId);

  const adminName = ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : '');
  const typeLabel = TICKET_TYPES.find(t => t.id === ticket.type)?.label || ticket.type;

  // Update the claim message in admin group
  try {
    await ctx.editMessageText(
      `✅ *Ticket Claimed*\n━━━━━━━━━━━━━━━━━━\n🆔 \`${ticketId}\`\n📂 ${typeLabel}\n👤 ${ticket.userInfo.name} (@${ticket.userInfo.username})\n🧑‍💼 Agent: ${adminName}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔴 Close Ticket', `close_${ticketId}`)],
        ]),
      }
    );
  } catch (_) {}

  // DM the admin
  try {
    await bot.telegram.sendMessage(
      adminId,
      `🎫 *You've claimed Ticket \`${ticketId}\`*\n📂 ${typeLabel}\n👤 User: ${ticket.userInfo.name} (@${ticket.userInfo.username})\n\nYou are now connected. All messages you send here will be forwarded to the user.\n\nUse /endticket to close this session.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    await ctx.reply(`⚠️ Could not DM the agent. @${ctx.from.username || adminId} please start a private chat with the bot first by messaging it directly.`);
    ticket.adminId = null;
    adminActiveTicket.delete(adminId);
    return;
  }

  // Notify user that agent has joined
  try {
    await bot.telegram.sendMessage(
      ticket.userId,
      `✅ *A support agent has joined your ticket!*\n\n🧑‍💼 You are now connected to a live support agent. Please go ahead and describe your issue.\n\n_Ticket ID: \`${ticketId}\`_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔴 Close Ticket', `close_${ticketId}`)],
        ]),
      }
    );
  } catch (err) {
    console.error('Could not notify user of agent join:', err.message);
  }
});

// ─── Close ticket ─────────────────────────────────────────────────────────────
bot.action(/^close_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await handleCloseTicket(ctx, ctx.match[1], ctx.from.id);
});

bot.command('endticket', async (ctx) => {
  const ticket = getTicketByAdmin(ctx.from.id);
  if (!ticket) return ctx.reply('⚠️ You have no active ticket session.');
  await handleCloseTicket(ctx, ticket.ticketId, ctx.from.id);
});

async function handleCloseTicket(ctx, ticketId, closedBy) {
  const ticket = tickets.get(ticketId);
  if (!ticket) return ctx.reply('❌ Ticket not found.');
  if (ticket.status === 'closed') return ctx.reply('ℹ️ This ticket is already closed.');

  const typeLabel = TICKET_TYPES.find(t => t.id === ticket.type)?.label || ticket.type;
  const closedAt = new Date().toLocaleString();

  closeTicketSession(ticketId);

  const summaryMsg =
    `🔴 *Ticket Closed*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🆔 \`${ticketId}\`\n` +
    `📂 ${typeLabel}\n` +
    `🕐 ${closedAt}\n\n` +
    `Thank you for contacting support. Use /start to open a new ticket anytime.`;

  // Notify user
  try {
    await bot.telegram.sendMessage(ticket.userId, summaryMsg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🎫 Open New Ticket', 'new_ticket')],
        [Markup.button.callback('⭐ Rate Support', `rate_${ticketId}`)],
      ]),
    });
  } catch (err) {
    console.error('Could not notify user of close:', err.message);
  }

  // Notify admin if user closed it
  if (ticket.adminId && ticket.adminId !== closedBy) {
    try {
      await bot.telegram.sendMessage(
        ticket.adminId,
        `🔴 *Ticket \`${ticketId}\` was closed by the user.*\n\nYour session has ended.`,
        { parse_mode: 'Markdown' }
      );
    } catch (_) {}
  } else if (ticket.adminId && ticket.adminId === closedBy) {
    await ctx.reply(`✅ Ticket \`${ticketId}\` closed. Session ended.`, { parse_mode: 'Markdown' });
  }

  // Log in admin group
  if (ADMIN_GROUP_ID) {
    try {
      await bot.telegram.sendMessage(
        ADMIN_GROUP_ID,
        `🔴 *Ticket Closed* — \`${ticketId}\`\n📂 ${typeLabel}\n👤 ${ticket.userInfo.name}\n🕐 ${closedAt}`,
        { parse_mode: 'Markdown' }
      );
    } catch (_) {}
  }
}

// ─── Open new ticket button ───────────────────────────────────────────────────
bot.action('new_ticket', async (ctx) => {
  await ctx.answerCbQuery();
  const existing = getTicketByUser(ctx.from.id);
  if (existing && existing.status === 'open') {
    return ctx.reply('⚠️ You already have an open ticket. Please close it first.');
  }
  await ctx.reply(
    `👋 *Open a New Ticket*\n\nPlease select the ticket type:`,
    { parse_mode: 'Markdown', ...buildTypeKeyboard() }
  );
});

// ─── Rating ───────────────────────────────────────────────────────────────────
bot.action(/^rate_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `⭐ *Rate your support experience*\n\nTicket: \`${ctx.match[1]}\`\nHow would you rate the support you received?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[
        Markup.button.callback('⭐ 1', `rating_1_${ctx.match[1]}`),
        Markup.button.callback('⭐ 2', `rating_2_${ctx.match[1]}`),
        Markup.button.callback('⭐ 3', `rating_3_${ctx.match[1]}`),
        Markup.button.callback('⭐ 4', `rating_4_${ctx.match[1]}`),
        Markup.button.callback('⭐ 5', `rating_5_${ctx.match[1]}`),
      ]]),
    }
  );
});

bot.action(/^rating_(\d)_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Thanks for rating!');
  const stars = parseInt(ctx.match[1]);
  const ticketId = ctx.match[2];
  const ticket = tickets.get(ticketId);
  if (ticket) ticket.rating = stars;

  const starStr = '⭐'.repeat(stars);
  await ctx.editMessageText(
    `${starStr} *Thank you for your feedback!*\n\nYour rating has been recorded. We appreciate your time!`,
    { parse_mode: 'Markdown' }
  );

  if (ADMIN_GROUP_ID) {
    try {
      await bot.telegram.sendMessage(
        ADMIN_GROUP_ID,
        `⭐ *Rating Received* — \`${ticketId}\`\n👤 ${ticket?.userInfo?.name || 'User'}\nRating: ${starStr} (${stars}/5)`,
        { parse_mode: 'Markdown' }
      );
    } catch (_) {}
  }
});

// ─── Admin status & help ──────────────────────────────────────────────────────
bot.command('mystatus', async (ctx) => {
  const ticket = getTicketByAdmin(ctx.from.id);
  if (!ticket) return ctx.reply('ℹ️ You have no active ticket session.');
  const typeLabel = TICKET_TYPES.find(t => t.id === ticket.type)?.label || ticket.type;
  ctx.reply(
    `🧑‍💼 *Your Active Session*\n\n${formatTicketInfo(ticket)}\n📂 ${typeLabel}\n👤 ${ticket.userInfo.name} (@${ticket.userInfo.username})\n\nUse /endticket to close.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('help', (ctx) => {
  ctx.reply(
    `*${BOT_NAME} — Help*\n\n` +
    `*User Commands:*\n/start — Open a new support ticket\n\n` +
    `*Admin Commands:*\n/endticket — Close your active ticket session\n/mystatus — View your current active ticket`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Launch ───────────────────────────────────────────────────────────────────
bot.launch();
console.log(`🤖 ${BOT_NAME} bot is running...`);
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
