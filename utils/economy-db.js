/**
 * Simple JSON file-backed economy DB helper.
 * Path: utils/economy-db.js
 *
 * Usage:
 * const db = require('../utils/economy-db');
 * await db.ensureUser(userId);
 * const user = db.getUser(userId);
 * db.add(userId, amount);
 * db.setCooldown(userId, 'daily', Date.now());
 * db.canClaim(userId, 'daily', 24*60*60*1000) -> boolean
 *
 * NOTE: This is intentionally minimal. For production, swap to a real DB.
 */

const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'database');
const DB_FILE = path.join(DB_DIR, 'economy.json');

function ensureDbFile() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
}

function load() {
  ensureDbFile();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { users: {} };
  }
}

function save(data) {
  ensureDbFile();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getUser(userId) {
  const db = load();
  return db.users[userId] || null;
}

function ensureUser(userId) {
  const db = load();
  if (!db.users[userId]) {
    db.users[userId] = {
      gold: 0,
      cooldowns: {}, // { daily: timestamp, weekly: timestamp, dig: timestamp, ... }
      history: [] // optional activity history
    };
    save(db);
  }
  return db.users[userId];
}

function set(userId, obj) {
  const db = load();
  db.users[userId] = obj;
  save(db);
}

function add(userId, amount) {
  const u = ensureUser(userId);
  u.gold = (u.gold || 0) + Number(amount || 0);
  u.history = u.history || [];
  u.history.push({ time: Date.now(), change: Number(amount || 0) });
  set(userId, u);
  return u.gold;
}

function remove(userId, amount) {
  const u = ensureUser(userId);
  u.gold = Math.max(0, (u.gold || 0) - Number(amount || 0));
  u.history = u.history || [];
  u.history.push({ time: Date.now(), change: -Number(amount || 0) });
  set(userId, u);
  return u.gold;
}

function setCooldown(userId, key, timestamp) {
  const u = ensureUser(userId);
  u.cooldowns = u.cooldowns || {};
  u.cooldowns[key] = timestamp;
  set(userId, u);
}

function getCooldown(userId, key) {
  const u = ensureUser(userId);
  return (u.cooldowns && u.cooldowns[key]) || 0;
}

function canClaim(userId, key, ms) {
  const last = getCooldown(userId, key);
  if (!last) return true;
  return (Date.now() - last) >= ms;
}

module.exports = {
  getUser,
  ensureUser,
  add,
  remove,
  setCooldown,
  getCooldown,
  canClaim
};
