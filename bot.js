require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const { v4: uuidv4 } = require('uuid');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ─── In-memory stores (replace with DB for production) ────────────────────────
// tickets: { ticketId: { userId, adminId, type, status, createdAt, chatHistory } }
const tickets = new Map();
// userActiveTicket: { userId: ticketId }
const userActiveTicket = new Map();
// adminActiveTicket: { adminId: ticketId }
const adminActiveTicket = new Map();

// ─── Config ───────────────────────────────────────────────────────────────────
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID; // Telegram group/channel ID for admins
const BOT_NAME = process.env.BOT_NAME || 'Live Ticket';

// ─── Ticket types ─────────────────────────────────────────────────────────────
const TICKET_TYPES = [
  { id: 'general',      label: 'General Support ❓' },
  { id: 'technical',    label: 'Technical/Bug Support 🛠️' },
  { id: 'transaction',  label: 'Transaction Issue 💸' },
  { id: 'wallet',       label: 'Wallet Problem 👛' },
  { id: 'swap',         label: 'Swap / Exchange Issue 🔄' },
  { id: 'deposit',      label: 'Deposit / Withdrawal Issue 🏧' },
  { id: 'bridge',       label: 'Bridge / Cross-chain Issue 🌉' },
  { id: 'gas',          label: 'Gas Fee Problem ⛽' },
  { id: 'defi',         label: 'DeFi / Liquidity Pool Issue 🌊' },
  { id: 'staking',      label: 'Staking & Rewards 🏦' },
  { id: 'mining',       label: 'Mining / Validator Support ⛏️' },
  { id: 'smartcontract',label: 'Smart Contract Issue 📜' },
  { id: 'nft',          label: 'NFT Issue 🖼️' },
  { id: 'token',        label: 'Token / Airdrop Issue 🪙' },
  { id: 'lost',         label: 'Lost / Stolen Funds 🔓' },
  { id: 'network',      label: 'Network Congestion Issue 🌐' },
  { id: 'account',      label: 'Account Issues 🔐' },
  { id: 'kyc',          label: 'KYC Support ✅' },
  { id: 'scam',         label: 'Scam / Suspicious Activity 🚨' },
  { id: 'feedback',     label: 'Feedback & Suggestions 💡' },
  { id: 'other',        label: 'Other 📩' },
];

// ─── Type-specific prompts ────────────────────────────────────────────────────
const TYPE_PROMPTS = {
  general:     `📋 *General Support*\n\nPlease describe your issue in as much detail as possible. Include any relevant screenshots or files.`,
  technical:   `🛠️ *Technical/Bug Support*\n\nPlease provide:\n1. A clear description of the issue\n2. Steps to reproduce the problem\n3. Screenshots or error messages\n4. Your device/browser information`,
  transaction: `💸 *Transaction Issue*\n\nPlease provide:\n1. Transaction hash / TX ID\n2. The wallet address involved\n3. Amount and token/coin sent\n4. Source and destination network\n5. Date and time of the transaction\n6. Description of what went wrong (stuck, failed, missing funds, etc.)`,
  wallet:      `👛 *Wallet Problem*\n\nPlease provide:\n1. Your wallet address (⚠️ never share your private key or seed phrase)\n2. The wallet app/extension you are using\n3. The network affected (e.g. Ethereum, BSC, Solana)\n4. A clear description of the problem\n5. Any error messages you see`,
  swap:        `🔄 *Swap / Exchange Issue*\n\nPlease provide:\n1. Transaction hash / TX ID of the swap\n2. Token pair (e.g. ETH → USDT)\n3. Amount sent and amount expected to receive\n4. Platform or DEX used (e.g. Uniswap, PancakeSwap)\n5. Network and date of the swap\n6. Description of the issue`,
  deposit:     `🏧 *Deposit / Withdrawal Issue*\n\nPlease provide:\n1. Transaction hash / TX ID\n2. Your wallet address\n3. Amount and token/coin involved\n4. Platform (exchange or app) used\n5. Network (e.g. Ethereum, BSC, Tron)\n6. Date and time of the deposit or withdrawal\n7. Description of the issue (not credited, stuck, wrong network, etc.)`,
  bridge:      `🌉 *Bridge / Cross-chain Issue*\n\nPlease provide:\n1. Transaction hash / TX ID\n2. Source network and destination network (e.g. Ethereum → BSC)\n3. Token and amount bridged\n4. Bridge platform used (e.g. Stargate, Multichain, LayerZero)\n5. Date and time of the bridge transaction\n6. Description of what went wrong (funds not arrived, stuck in bridge, etc.)`,
  gas:         `⛽ *Gas Fee Problem*\n\nPlease provide:\n1. Transaction hash / TX ID (if applicable)\n2. Network affected (e.g. Ethereum, Polygon)\n3. Wallet app you are using\n4. Description of the issue (transaction stuck, unusually high gas, gas estimation failed, etc.)\n5. Screenshots of any error messages`,
  defi:        `🌊 *DeFi / Liquidity Pool Issue*\n\nPlease provide:\n1. Your wallet address\n2. Protocol or platform name (e.g. Aave, Curve, Uniswap V3)\n3. Token pair or pool involved\n4. Amount of liquidity or funds affected\n5. Transaction hash if applicable\n6. Description of the issue (impermanent loss concern, can't remove liquidity, wrong pool share, etc.)`,
  mining:      `⛏️ *Mining / Validator Support*\n\nPlease provide:\n1. Your validator or miner wallet address\n2. Network you are mining/validating (e.g. Ethereum, Solana, Cosmos)\n3. Amount of funds or stake involved\n4. Description of the issue (missed rewards, slashing, node not syncing, payout not received, etc.)\n5. Transaction hash or epoch number if applicable`,
  smartcontract:`📜 *Smart Contract Issue*\n\nPlease provide:\n1. Smart contract address\n2. Network the contract is deployed on\n3. Transaction hash of the failed or problematic interaction\n4. Function or action you were trying to execute\n5. Error message or revert reason\n6. Description of what went wrong`,
  lost:        `🔓 *Lost / Stolen Funds*\n\n⚠️ *Important: Do not share your private key or seed phrase with anyone.*\n\nPlease provide:\n1. Your wallet address\n2. Approximate amount and token/coin lost\n3. Transaction hash(es) if available\n4. Network involved\n5. How the loss occurred (wrong address, hacked, phishing, etc.)\n6. Date and time of the incident\n7. Any suspicious addresses or links involved`,
  network:     `🌐 *Network Congestion Issue*\n\nPlease provide:\n1. Network affected (e.g. Ethereum, Solana, BSC)\n2. Transaction hash if you have a pending transaction\n3. Wallet app you are using\n4. Description of the issue (transaction pending too long, failed due to congestion, can't send, etc.)\n5. Date and time the issue started`,
  staking:     `🏦 *Staking & Rewards*\n\nPlease provide:\n1. Your wallet address\n2. Token/coin you are staking\n3. Platform or protocol used\n4. Amount staked\n5. Description of the issue (missing rewards, unable to unstake, wrong APY, etc.)\n6. Transaction hash if applicable`,
  nft:         `🖼️ *NFT Issue*\n\nPlease provide:\n1. Your wallet address\n2. NFT collection name and token ID\n3. Marketplace involved (e.g. OpenSea, Blur)\n4. Transaction hash if applicable\n5. Description of the issue (not appearing, transfer failed, wrong metadata, etc.)`,
  token:       `🪙 *Token / Airdrop Issue*\n\nPlease provide:\n1. Token name and contract address\n2. Your wallet address\n3. Network (e.g. Ethereum, BSC, Solana)\n4. Description of the issue (token not received, wrong amount, can't claim airdrop, etc.)\n5. Transaction hash if applicable`,
  account:     `🔐 *Account Issues*\n\nPlease describe your account problem. *Do not share your password or private key.*\n\nInclude your registered email or username so we can look up your account.`,
  kyc:         `✅ *KYC Support*\n\nPlease provide:\n1. The email address used during KYC\n2. A description of the issue you're facing\n3. Any error messages you received`,
  scam:        `🚨 *Scam / Suspicious Activity*\n\n⚠️ *Important: Never share your private key or seed phrase with anyone, including support agents.*\n\nPlease provide:\n1. Description of what happened\n2. Any wallet addresses or links involved\n3. Transaction hashes if funds were moved\n4. Screenshots of suspicious messages or activity\n5. Date and time of the incident`,
  feedback:    `💡 *Feedback & Suggestions*\n\nWe'd love to hear from you! Please share:\n1. What feature or area your feedback relates to\n2. Your suggestion or observation\n3. How this would improve your experience`,
  other:       `📩 *Other*\n\nPlease describe your inquiry in detail so we can route it to the right team.`,
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

  const buttons = TICKET_TYPES.map(t =>
    [Markup.button.callback(t.label, `type_${t.id}`)]
  );

  await ctx.reply(
    `👋 Welcome to *${BOT_NAME}*!\n\nPlease select the ticket type below based on your inquiry:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons),
    }
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

    // Edit the original message to remove buttons
    try {
      await ctx.editMessageText(
        `✅ *Ticket type selected:* ${TICKET_TYPES.find(t => t.id === id)?.label}`,
        { parse_mode: 'Markdown' }
      );
    } catch (_) {}

    // Send ticket ID and prompt
    await ctx.reply(
      `🎫 *Your Ticket ID:* \`${ticketId}\`\n\nKeep this ID for reference.\n\n${TYPE_PROMPTS[id]}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔴 Cancel Ticket', `close_${ticketId}`)],
        ]),
      }
    );
  });
});

// ─── User sends a message (bridges to admin or awaits admin) ──────────────────
bot.on('message', async (ctx) => {
  const userId = ctx.from.id;

  // ── Admin side: relay message to user ──
  const adminTicket = getTicketByAdmin(userId);
  if (adminTicket && adminTicket.status === 'open') {
    // Forward admin message to the user
    const adminName = ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : '');
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
          caption: `📎 *File from support agent*`,
          parse_mode: 'Markdown',
        });
      }
      await ctx.react('👍').catch(() => {});
    } catch (err) {
      console.error('Error relaying admin message to user:', err.message);
      await ctx.reply('⚠️ Could not deliver your message to the user.');
    }
    return;
  }

  // ── User side: relay message to assigned admin ──
  const userTicket = getTicketByUser(userId);
  if (!userTicket || userTicket.status !== 'open') {
    return ctx.reply(
      '👋 No active ticket found. Send /start to open a new ticket.',
      Markup.inlineKeyboard([[Markup.button.callback('🎫 Open New Ticket', 'new_ticket')]])
    );
  }

  // Ticket exists but no admin yet — message is queued/logged
  if (!userTicket.adminId) {
    await ctx.reply(
      `⏳ *Your message has been received.*\n\nAn available support agent will join your ticket shortly. Please be patient!\n\n_Ticket ID: \`${userTicket.ticketId}\`_`,
      { parse_mode: 'Markdown' }
    );

    // Notify admin group about new message
    if (ADMIN_GROUP_ID) {
      try {
        const typeLabel = TICKET_TYPES.find(t => t.id === userTicket.type)?.label || userTicket.type;
        const notifText = ctx.message.text
          ? `💬 *New message from user:*\n${escapeMarkdown(ctx.message.text)}`
          : '📎 User sent a file/photo';

        await bot.telegram.sendMessage(
          ADMIN_GROUP_ID,
          `🔔 *Ticket Update* — \`${userTicket.ticketId}\`\n📂 ${typeLabel}\n👤 ${userTicket.userInfo.name} (@${userTicket.userInfo.username})\n\n${notifText}`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback(`✋ Claim Ticket`, `claim_${userTicket.ticketId}`)],
            ]),
          }
        );
      } catch (err) {
        console.error('Could not notify admin group:', err.message);
      }
    }
    return;
  }

  // Admin is assigned — relay message
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
        caption: `📎 *File from user*`,
        parse_mode: 'Markdown',
      });
    }
  } catch (err) {
    console.error('Error relaying user message to admin:', err.message);
  }
});

// ─── Admin claims a ticket ────────────────────────────────────────────────────
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

  // Edit the claim message in admin group
  try {
    await ctx.editMessageText(
      `✅ *Ticket Claimed* — \`${ticketId}\`\n📂 ${typeLabel}\n👤 User: ${ticket.userInfo.name} (@${ticket.userInfo.username})\n🧑‍💼 Agent: ${adminName}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔴 Close Ticket', `close_${ticketId}`)],
        ]),
      }
    );
  } catch (_) {}

  // Notify admin (in DM)
  try {
    await bot.telegram.sendMessage(
      adminId,
      `🎫 *You've claimed Ticket \`${ticketId}\`*\n📂 ${typeLabel}\n👤 User: ${ticket.userInfo.name} (@${ticket.userInfo.username})\n\nYou are now connected to the user. All messages you send here will be forwarded to them.\n\nUse /endticket to close this session.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    // Admin hasn't started bot yet
    await ctx.reply(`⚠️ Could not DM the agent. @${ctx.from.username || adminId} please start a chat with the bot first.`);
    ticket.adminId = null;
    adminActiveTicket.delete(adminId);
    return;
  }

  // Notify user that admin has joined
  try {
    await bot.telegram.sendMessage(
      ticket.userId,
      `✅ *A support agent has joined your ticket!*\n\n🧑‍💼 You are now connected to a live support agent. Please describe your issue and they will assist you.\n\n_Ticket ID: \`${ticketId}\`_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔴 Close Ticket', `close_${ticketId}`)],
        ]),
      }
    );
  } catch (err) {
    console.error('Could not notify user:', err.message);
  }
});

// ─── Close ticket (button handler) ───────────────────────────────────────────
bot.action(/^close_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const ticketId = ctx.match[1];
  await handleCloseTicket(ctx, ticketId, ctx.from.id);
});

// ─── /endticket command (admin shortcut) ─────────────────────────────────────
bot.command('endticket', async (ctx) => {
  const adminId = ctx.from.id;
  const ticket = getTicketByAdmin(adminId);
  if (!ticket) {
    return ctx.reply('⚠️ You have no active ticket session.');
  }
  await handleCloseTicket(ctx, ticket.ticketId, adminId);
});

// ─── Close ticket logic ───────────────────────────────────────────────────────
async function handleCloseTicket(ctx, ticketId, closedBy) {
  const ticket = tickets.get(ticketId);
  if (!ticket) return ctx.reply('❌ Ticket not found.');
  if (ticket.status === 'closed') return ctx.reply('ℹ️ This ticket is already closed.');

  const typeLabel = TICKET_TYPES.find(t => t.id === ticket.type)?.label || ticket.type;
  const closedAt = new Date().toLocaleString();

  closeTicketSession(ticketId);

  const summaryMsg =
    `🔴 *Ticket Closed*\n\n` +
    `🎫 *Ticket ID:* \`${ticketId}\`\n` +
    `📂 *Type:* ${typeLabel}\n` +
    `🕐 *Closed at:* ${closedAt}\n\n` +
    `Thank you for contacting support. Send /start to open a new ticket anytime.`;

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

  // Notify admin (if assigned and close not triggered by admin themselves)
  if (ticket.adminId && ticket.adminId !== closedBy) {
    try {
      await bot.telegram.sendMessage(
        ticket.adminId,
        `🔴 *Ticket \`${ticketId}\` has been closed by the user.*\n\nYour session has ended.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('Could not notify admin of close:', err.message);
    }
  } else if (ticket.adminId && ticket.adminId === closedBy) {
    // Tell admin their session ended
    await ctx.reply(`✅ Ticket \`${ticketId}\` closed. Session ended.`, { parse_mode: 'Markdown' });
  }

  // Update admin group notification
  if (ADMIN_GROUP_ID) {
    try {
      await bot.telegram.sendMessage(
        ADMIN_GROUP_ID,
        `🔴 *Ticket Closed* — \`${ticketId}\`\n📂 ${typeLabel}\n👤 ${ticket.userInfo.name} (@${ticket.userInfo.username})\n🕐 ${closedAt}`,
        { parse_mode: 'Markdown' }
      );
    } catch (_) {}
  }
}

// ─── Open new ticket (button) ─────────────────────────────────────────────────
bot.action('new_ticket', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const existing = getTicketByUser(userId);
  if (existing && existing.status === 'open') {
    return ctx.reply('⚠️ You already have an open ticket.');
  }

  const buttons = TICKET_TYPES.map(t =>
    [Markup.button.callback(t.label, `type_${t.id}`)]
  );

  await ctx.reply(
    `👋 *Open a New Ticket*\n\nPlease select the ticket type:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons),
    }
  );
});

// ─── Rating handler ───────────────────────────────────────────────────────────
bot.action(/^rate_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const ticketId = ctx.match[1];
  await ctx.reply(
    `⭐ *Rate your support experience for ticket \`${ticketId}\`*\n\nHow would you rate the support you received?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('⭐', `rating_1_${ticketId}`),
          Markup.button.callback('⭐⭐', `rating_2_${ticketId}`),
          Markup.button.callback('⭐⭐⭐', `rating_3_${ticketId}`),
          Markup.button.callback('⭐⭐⭐⭐', `rating_4_${ticketId}`),
          Markup.button.callback('⭐⭐⭐⭐⭐', `rating_5_${ticketId}`),
        ],
      ]),
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
      const typeLabel = TICKET_TYPES.find(t => t.id === ticket?.type)?.label || '';
      await bot.telegram.sendMessage(
        ADMIN_GROUP_ID,
        `⭐ *Support Rating Received*\n🎫 Ticket: \`${ticketId}\` ${typeLabel}\n👤 ${ticket?.userInfo?.name || 'User'}\n\nRating: ${starStr} (${stars}/5)`,
        { parse_mode: 'Markdown' }
      );
    } catch (_) {}
  }
});

// ─── Admin commands ───────────────────────────────────────────────────────────
bot.command('mystatus', async (ctx) => {
  const adminId = ctx.from.id;
  const ticket = getTicketByAdmin(adminId);
  if (!ticket) {
    return ctx.reply('ℹ️ You have no active ticket session.');
  }
  const typeLabel = TICKET_TYPES.find(t => t.id === ticket.type)?.label || ticket.type;
  ctx.reply(
    `🧑‍💼 *Your Active Session*\n\n${formatTicketInfo(ticket)}\n📂 ${typeLabel}\n👤 User: ${ticket.userInfo.name} (@${ticket.userInfo.username})\n\nUse /endticket to close.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('help', (ctx) => {
  ctx.reply(
    `*${BOT_NAME} — Help*\n\n` +
    `*User Commands:*\n` +
    `/start — Open a new support ticket\n\n` +
    `*Admin Commands:*\n` +
    `/endticket — Close your current active ticket\n` +
    `/mystatus — View your current active ticket\n\n` +
    `_For support, open a ticket using /start_`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Escape markdown helper ───────────────────────────────────────────────────
function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// ─── Launch ───────────────────────────────────────────────────────────────────
bot.launch();
console.log(`🤖 ${BOT_NAME} bot is running...`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
