// Таблица рекордов: топ-10 по времени сбора всей еды.
// Если заполнен src/firebase-config.js — общий онлайн-рейтинг в Firestore,
// иначе (или если сеть/база недоступна) — локальный, в localStorage этого браузера.
import * as online from './online.js';

const KEY = 'nekomachi.scores';
const NAME_KEY = 'nekomachi.name';
export const MAX_ENTRIES = 10;
const TIMEOUT = 6000;

// ---------- Локальное хранилище ----------
function loadLocal() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((e) => typeof e.time === 'number' && typeof e.name === 'string') : [];
  } catch {
    return [];
  }
}

function addLocal(entry) {
  const list = loadLocal();
  list.push(entry);
  list.sort((a, b) => a.time - b.time || a.date - b.date);
  const top = list.slice(0, MAX_ENTRIES);
  try { localStorage.setItem(KEY, JSON.stringify(top)); } catch { /* приватный режим */ }
  return { list: top, rank: top.indexOf(entry) };
}

// ---------- Онлайн с откатом на локальное ----------
async function tryOnline(fn) {
  if (!online.enabled()) return null;
  try {
    return await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT))]);
  } catch (e) {
    console.warn('[рейтинг] онлайн недоступен, использую локальный:', e.message ?? e);
    return null;
  }
}

export async function getTop(limit = MAX_ENTRIES) {
  const remote = await tryOnline(() => online.fetchTop(limit));
  if (remote) return { list: remote, online: true };
  return { list: loadLocal().slice(0, limit), online: false };
}

// Сохраняет результат; возвращает { list, rank, online }, rank = -1 если не попал в топ
export async function add(rawName, time) {
  const name = rawName.trim().slice(0, 12) || 'Котик';
  try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
  const id = await tryOnline(() => online.addScore(name, time));
  if (id) {
    const top = await getTop(MAX_ENTRIES);
    return { ...top, rank: top.list.findIndex((e) => e.id === id) };
  }
  return { ...addLocal({ name, time, date: Date.now() }), online: false };
}

export function lastName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}

export function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), d = Math.floor((s * 10) % 10);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${d}`;
}

function message(table, text) {
  table.replaceChildren();
  const td = table.insertRow().insertCell();
  td.colSpan = 3;
  td.className = 'empty';
  td.textContent = text;
}

export const renderLoading = (table) => message(table, 'Загрузка…');

// Рисует таблицу; highlight — индекс строки, которую подсветить
export function render(table, list, { highlight = -1 } = {}) {
  if (!list.length) return message(table, 'Пока пусто — стань первым!');
  table.replaceChildren();
  const medals = ['🥇', '🥈', '🥉'];
  list.forEach((e, i) => {
    const tr = table.insertRow();
    if (i === highlight) tr.className = 'me';
    tr.insertCell().textContent = medals[i] ?? `${i + 1}.`;
    tr.insertCell().textContent = e.name; // textContent — имя не может внедрить HTML
    tr.insertCell().textContent = fmtTime(e.time);
  });
}
