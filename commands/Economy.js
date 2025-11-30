/**
 * Economy command module (updated with owner .give)
 * Path: commands/Economy.js
 *
 * Commands:
 *   .balance
 *   .dig
 *   .fish
 *   .work
 *   .daily
 *   .weekly
 *   .spin <bet>
 *   .slots <bet>
 *   .roulette <bet> <color|number>
 *   .casino <bet>
 *   .give <userId> <amount>      // OWNER ONLY - grant gold to a user
 *
 * Notes:
 *  - This module expects utils/economy-db.js next to it (../utils/economy-db.js).
 *  - It tries to read owner(s) from ../config.js (owner or owners) or process.env.OWNER.
 *  - Adapt the run() wrapper as needed to integrate with your bot's message object.
 */

const db = require('../utils/economy-db');
const config = (() => {
  try { return require('../config.js'); } catch (e) { return {}; }
})();

const MS = {
  HOUR: 3600 * 1000,
  DAY: 24 * 3600 * 1000,
  WEEK: 7 * 24 * 3600 * 1000
};

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fmt(n) {
  return Number(n).toLocaleString();
}

function normalizeOwners(cfg) {
  const res = [];
  if (!cfg) return res;
  if (cfg.owner) {
    if (Array.isArray(cfg.owner)) res.push(...cfg.owner);
    else res.push(cfg.owner);
  }
  if (cfg.owners) {
    if (Array.isArray(cfg.owners)) res.push(...cfg.owners);
    else res.push(cfg.owners);
  }
  if (process.env.OWNER) {
    try {
      const envVal = JSON.parse(process.env.OWNER);
      if (Array.isArray(envVal)) res.push(...envVal);
      else res.push(envVal);
    } catch (e) {
      res.push(process.env.OWNER);
    }
  }
  return res.map(String).map(s => s.replace(/\s+/g, ''));
}

const OWNER_LIST = normalizeOwners(config);

function isOwnerId(userId) {
  if (!userId) return false;
  const uid = String(userId).replace(/@.*$/, '');
  return OWNER_LIST.some(o => {
    if (!o) return false;
    const ownerId = String(o).replace(/@.*$/, '');
    return ownerId === uid || ownerId === String(userId);
  });
}

function parseUserArg(arg) {
  if (!arg) return null;
  // Accept forms: 1234567890 or 1234567890@s.whatsapp.net
  const a = String(arg).trim();
  if (/\d+@/.test(a)) return a;
  const digits = a.replace(/\D/g, '');
  if (!digits) return null;
  // default domain for WhatsApp JID style; adapt if your bot uses different IDs
  return `${digits}@s.whatsapp.net`;
}

function parseBet(a) {
  if (!a) return 0;
  const num = parseInt(a.toString().replace(/[^\d-]/g, ''), 10);
  return isNaN(num) ? 0 : Math.max(1, num);
}

async function handler({ messageText, userId, reply }) {
  // messageText: full message string, e.g. ".dig" or ".spin 100"
  // userId: unique ID for the user (jid or number)
  // reply: async function(text) to send message back
  if (!messageText || !userId) return;

  const parts = messageText.trim().split(/\s+/);
  const cmd = parts[0].replace(/^\.+/, '').toLowerCase();
  const args = parts.slice(1);

  await db.ensureUser(userId);

  const send = async (txt) => {
    if (typeof reply === 'function') return reply(txt);
  };

  if (cmd === 'balance' || cmd === 'bal') {
    const u = db.getUser(userId);
    return send(`💰 Balance: ${fmt(u.gold || 0)} gold`);
  }

  // Owner-only: give
  if (cmd === 'give' || cmd === 'grant') {
    if (!isOwnerId(userId)) {
      return send('❌ Only the bot owner can use this command.');
    }
    const targetArg = args[0];
    const amountArg = args[1];
    if (!targetArg || !amountArg) {
      return send('Usage: .give <userId> <amount>  (e.g. .give 1234567890 500)');
    }
    const recipient = parseUserArg(targetArg);
    if (!recipient) return send('Invalid recipient ID.');
    const amount = parseInt(amountArg, 10);
    if (!amount || amount <= 0) return send('Amount must be a positive integer.');
    await db.ensureUser(recipient);
    db.add(recipient, amount);
    return send(`✅ Gave ${fmt(amount)} gold to ${recipient}`);
  }

  // Earning actions with light cooldowns
  if (cmd === 'dig' || cmd === 'fish') {
    const cooldownKey = cmd;
    const cooldownMs = 30 * 60 * 1000; // 30 minutes
    if (!db.canClaim(userId, cooldownKey, cooldownMs)) {
      const last = db.getCooldown(userId, cooldownKey);
      const wait = Math.ceil((cooldownMs - (Date.now() - last)) / 60000);
      return send(`⏳ Try again in ${wait} minute(s).`);
    }
    const reward = cmd === 'dig' ? rand(10, 60) : rand(8, 50);
    db.add(userId, reward);
    db.setCooldown(userId, cooldownKey, Date.now());
    return send(`+${fmt(reward)} gold from ${cmd}!`);
  }

  if (cmd === 'work') {
    const cooldownKey = 'work';
    const cooldownMs = 60 * 60 * 1000; // 1 hour
    if (!db.canClaim(userId, cooldownKey, cooldownMs)) {
      const last = db.getCooldown(userId, cooldownKey);
      const wait = Math.ceil((cooldownMs - (Date.now() - last)) / 60000);
      return send(`⏳ You can work again in ${wait} minute(s).`);
    }
    const jobs = ['miner', 'developer', 'chef', 'driver', 'artist'];
    const job = args[0] || jobs[rand(0, jobs.length - 1)];
    let reward = 0;
    switch (job.toLowerCase()) {
      case 'developer': reward = rand(150, 350); break;
      case 'miner': reward = rand(100, 300); break;
      case 'chef': reward = rand(60, 200); break;
      case 'driver': reward = rand(50, 180); break;
      case 'artist': reward = rand(40, 150); break;
      default: reward = rand(50, 200);
    }
    db.add(userId, reward);
    db.setCooldown(userId, cooldownKey, Date.now());
    return send(`🛠️ You worked as a ${job} and earned +${fmt(reward)} gold`);
  }

  // Bonuses
  if (cmd === 'daily') {
    const key = 'daily';
    if (!db.canClaim(userId, key, MS.DAY)) {
      const last = db.getCooldown(userId, key);
      const waitH = Math.ceil((MS.DAY - (Date.now() - last)) / (3600 * 1000));
      return send(`⏳ Daily bonus already claimed. Try again in ${waitH} hour(s).`);
    }
    const reward = rand(150, 400);
    db.add(userId, reward);
    db.setCooldown(userId, key, Date.now());
    return send(`🎁 Daily bonus: +${fmt(reward)} gold`);
  }

  if (cmd === 'weekly') {
    const key = 'weekly';
    if (!db.canClaim(userId, key, MS.WEEK)) {
      const last = db.getCooldown(userId, key);
      const waitDays = Math.ceil((MS.WEEK - (Date.now() - last)) / MS.DAY);
      return send(`⏳ Weekly bonus already claimed. Try again in ${waitDays} day(s).`);
    }
    const reward = rand(1000, 3000);
    db.add(userId, reward);
    db.setCooldown(userId, key, Date.now());
    return send(`🏆 Weekly bonus: +${fmt(reward)} gold`);
  }

  // Gambling helpers
  async function stakeAndCheck(bet) {
    const u = db.getUser(userId);
    const bal = (u && u.gold) || 0;
    if (bet <= 0) return { ok: false, msg: 'Specify a bet > 0' };
    if (bet > bal) return { ok: false, msg: `Insufficient funds. You have ${fmt(bal)} gold.` };
    return { ok: true, bal };
  }

  // Spin
  if (cmd === 'spin') {
    const bet = parseBet(args[0]);
    const chk = await stakeAndCheck(bet);
    if (!chk.ok) return send(chk.msg);
    const r = Math.random() * 100;
    let mult = 0;
    if (r < 50) mult = 0;
    else if (r < 85) mult = 2;
    else if (r < 97) mult = 5;
    else mult = 10;
    if (mult === 0) {
      db.remove(userId, bet);
      return send(`😞 Spin lost. -${fmt(bet)} gold`);
    } else {
      const win = bet * mult;
      db.add(userId, win);
      return send(`🎉 Spin win! Multiplier x${mult} -> +${fmt(win)} gold`);
    }
  }

  // Slots
  if (cmd === 'slots') {
    const bet = parseBet(args[0]);
    const chk = await stakeAndCheck(bet);
    if (!chk.ok) return send(chk.msg);
    const symbols = ['🍒','🍋','🔔','⭐','7️⃣'];
    const a = symbols[rand(0, symbols.length - 1)];
    const b = symbols[rand(0, symbols.length - 1)];
    const c = symbols[rand(0, symbols.length - 1)];
    let result = `🎰 [ ${a} | ${b} | ${c} ]\n`;
    if (a === b && b === c) {
      const mult = (a === '7️⃣') ? 10 : 5;
      const win = bet * mult;
      db.add(userId, win);
      result += `JACKPOT! x${mult} -> +${fmt(win)} gold`;
    } else if (a === b || b === c || a === c) {
      const win = bet * 2;
      db.add(userId, win);
      result += `Nice! Pair -> +${fmt(win)} gold`;
    } else {
      db.remove(userId, bet);
      result += `No win. -${fmt(bet)} gold`;
    }
    return send(result);
  }

  // Roulette
  if (cmd === 'roulette') {
    const bet = parseBet(args[0]);
    const pick = (args[1] || '').toLowerCase();
    const chk = await stakeAndCheck(bet);
    if (!chk.ok) return send(chk.msg);
    const wheelNum = rand(0, 36);
    const color = wheelNum === 0 ? 'green' : (wheelNum % 2 === 0 ? 'black' : 'red');
    if (!pick) {
      db.remove(userId, bet);
      return send(`🎡 Rolled ${wheelNum} ${color}. You must pick a color or number. -${fmt(bet)} gold`);
    }
    if (/^\d+$/.test(pick)) {
      const pickNum = parseInt(pick, 10);
      if (pickNum === wheelNum) {
        const win = bet * 36;
        db.add(userId, win);
        return send(`🎯 Rolled ${wheelNum} ${color}. Exact hit! +${fmt(win)} gold`);
      } else {
        db.remove(userId, bet);
        return send(`🎯 Rolled ${wheelNum} ${color}. Missed. -${fmt(bet)} gold`);
      }
    } else {
      if (pick === color) {
        const mult = (color === 'green') ? 14 : 2;
        const win = bet * mult;
        db.add(userId, win);
        return send(`🎯 Rolled ${wheelNum} ${color}. You won x${mult}! +${fmt(win)} gold`);
      } else {
        db.remove(userId, bet);
        return send(`🎯 Rolled ${wheelNum} ${color}. You lost. -${fmt(bet)} gold`);
      }
    }
  }

  // Casino
  if (cmd === 'casino') {
    const bet = parseBet(args[0]);
    const chk = await stakeAndCheck(bet);
    if (!chk.ok) return send(chk.msg);
    const r = Math.random() * 100;
    if (r < 45) {
      db.remove(userId, bet);
      return send(`🏚️ House wins. -${fmt(bet)} gold`);
    } else if (r < 85) {
      const win = bet * 2;
      db.add(userId, win);
      return send(`🃏 You beat the house! +${fmt(win)} gold`);
    } else {
      const win = bet * 5;
      db.add(userId, win);
      return send(`💎 Big win! +${fmt(win)} gold`);
    }
  }

  return send('Unknown economy command. Available: balance,dig,fish,work,daily,weekly,spin,slots,roulette,casino,give');
}

/**
 * Wrapper export: adapt this to your bot's command loader.
 * Example run wrapper tries to handle common shapes of `m` and `conn`.
 */
module.exports = {
  name: 'Economy',
  description: 'Earning, bonuses and gambling commands (includes owner give)',
  handler,
  async run(m, conn, args) {
    const messageText = (m && (m.text || m.body || m.message || (m.content && m.content.text))) || '';
    const userId = (m && (m.sender || m.from || (m.key && m.key.participant))) || 'unknown';
    const replyFn = async (txt) => {
      try {
        if (m && typeof m.reply === 'function') return m.reply(txt);
        if (conn && typeof conn.sendMessage === 'function') {
          const to = (m && (m.key ? m.key.remoteJid : (m.from || 'status@broadcast'))) || 'status@broadcast';
          await conn.sendMessage(to, { text: txt });
        }
      } catch (e) { /* ignore */ }
    };
    await handler({ messageText, userId, reply: replyFn });
  }
};
