/* =========================================================================
   Kapitel 10 · Live-Tages-Rangliste (Netlify Function + Netlify Blobs)

   GET  /.netlify/functions/leaderboard  → Einträge von heute (Europe/Zurich)
   POST /.netlify/functions/leaderboard  → { name, score, maxScore, accuracy, player? }
                                           speichert/verbessert den Eintrag und
                                           gibt die aktualisierte Rangliste zurück

   Speicher: Netlify Blobs, Store «kapitel10-leaderboard», ein Blob pro Tag
   (Schlüssel YYYY-MM-DD). Schreibzugriffe sind mit ETag abgesichert, damit
   gleichzeitige Einträge aus der ganzen Klasse sich nicht gegenseitig löschen.
   ========================================================================= */
import { getStore } from '@netlify/blobs';

const STORE_NAME = 'kapitel10-leaderboard';
const TIME_ZONE = 'Europe/Zurich';

// Muss zum Quiz in script.js passen: 10 Fragen, 100 Punkte Basis + bis 50 Tempo-Bonus, Serien-Multiplikator
const QUESTIONS = 10;
const BASE_POINTS = 100;
const MAX_BONUS = 50;
const multiplierFor = (streak) => (streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1);
// Höchstmögliche Punkte bei k richtigen Antworten (alle k am Stück richtig, immer voller Tempo-Bonus)
const MAX_FOR_CORRECT = Array.from({ length: QUESTIONS + 1 }, (_, k) => {
  let sum = 0;
  for (let i = 1; i <= k; i++) sum += Math.round((BASE_POINTS + MAX_BONUS) * multiplierFor(i));
  return sum;
});
const MAX_SCORE = MAX_FOR_CORRECT[QUESTIONS]; // 2550

const NAME_MAX = 20;
const MAX_BODY_BYTES = 2048;
const MAX_ENTRIES_PER_DAY = 500;
const MAX_POSTS_PER_NETWORK = 120;   // ganze Schulklasse teilt sich oft eine IP-Adresse
const MIN_REPOST_MS = 4000;          // gleiches Gerät: höchstens alle 4 Sekunden
const WRITE_RETRIES = 6;

/* ---------- Hilfsfunktionen ---------- */
const json = (status, data, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });

const fail = (status, error, extra) => json(status, { ok: false, error }, extra);

function dayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
}

function secretSalt() {
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env) return Netlify.env.get('K10_SALT') || 'k10-default-salt';
  } catch { /* lokal ohne Netlify-Laufzeit */ }
  return 'k10-default-salt';
}

/* ---------- Validierung ---------- */
// Namen: max. 20 Zeichen, nur Buchstaben/Zahlen/Leerzeichen/. - _ ' – damit ist HTML-Injection ausgeschlossen
function cleanName(raw) {
  if (typeof raw !== 'string') return { error: 'Bitte gib einen Namen ein.' };
  const name = raw
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return { error: 'Bitte gib einen Namen ein.' };
  if ([...name].length > NAME_MAX) return { error: `Dein Name darf höchstens ${NAME_MAX} Zeichen lang sein.` };
  if (!/^[\p{L}\p{M}\p{N} .'’_-]+$/u.test(name)) return { error: 'Bitte nur Buchstaben, Zahlen, Leerzeichen und . - _ \' verwenden.' };
  if (!/[\p{L}\p{N}]/u.test(name)) return { error: 'Dein Name braucht mindestens einen Buchstaben oder eine Zahl.' };
  if (/(https?|www\.|\.(ch|com|net|org|de|io|app)\b)/i.test(name)) return { error: 'Bitte keine Web-Adressen als Namen.' };
  return { name };
}

// Punkte müssen zum Quiz passen: 0–2550 und plausibel zur Trefferquote
function checkScore({ score, maxScore, accuracy }) {
  if (![score, maxScore, accuracy].every(Number.isInteger)) return 'Ungültige Punktzahl.';
  if (maxScore !== MAX_SCORE) return 'Diese Punktzahl gehört nicht zum Kapitel-10-Quiz.';
  if (score < 0 || score > maxScore) return `Die Punkte müssen zwischen 0 und ${maxScore} liegen.`;
  if (accuracy < 0 || accuracy > 100 || accuracy % (100 / QUESTIONS) !== 0) return 'Ungültige Trefferquote.';
  const correct = accuracy / (100 / QUESTIONS);
  if (score < BASE_POINTS * correct || score > MAX_FOR_CORRECT[correct]) {
    return 'Punkte und Trefferquote passen nicht zusammen.';
  }
  return null;
}

/* ---------- Speicher ---------- */
const emptyDoc = (day) => ({ day, entries: [], networks: {} });

function normalizeDoc(raw, day) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) return emptyDoc(day);
  return {
    day,
    entries: raw.entries.filter((e) => e && typeof e.id === 'string' && typeof e.name === 'string' && Number.isInteger(e.score)),
    networks: raw.networks && typeof raw.networks === 'object' ? raw.networks : {},
  };
}

const ranked = (doc) =>
  [...doc.entries]
    .sort((a, b) => b.score - a.score || a.ts - b.ts || a.id.localeCompare(b.id))
    .map(({ id, name, score, accuracy, ts }) => ({ id, name, score, accuracy, ts }));

async function readDay(store, day) {
  const res = await store.getWithMetadata(day, { type: 'json' });
  if (!res || res.data == null) return { doc: emptyDoc(day), etag: null };
  return { doc: normalizeDoc(res.data, day), etag: res.etag || null };
}

// Schreibt nur, wenn seit dem Lesen niemand sonst geschrieben hat (sonst neuer Versuch)
async function writeDay(store, day, doc, etag) {
  const result = await store.setJSON(day, doc, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
  return !result || result.modified !== false;
}

const payload = (doc, extra = {}) => ({
  ok: true,
  day: doc.day,
  timeZone: TIME_ZONE,
  serverTime: Date.now(),
  maxScore: MAX_SCORE,
  entries: ranked(doc),
  ...extra,
});

/* ---------- Handler ---------- */
export default async (req, context) => {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });
  const day = dayKey();

  if (req.method === 'GET' || req.method === 'HEAD') {
    try {
      const { doc } = await readDay(store, day);
      return json(200, payload(doc));
    } catch (err) {
      console.error('leaderboard GET failed', err);
      return fail(503, 'Die Klassen-Rangliste ist gerade nicht erreichbar.');
    }
  }

  if (req.method !== 'POST') return fail(405, 'Methode nicht erlaubt.', { allow: 'GET, POST' });

  // Nur Anfragen von der eigenen Seite annehmen
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(req.url).host) return fail(403, 'Anfrage von einer fremden Seite abgelehnt.');
    } catch { return fail(403, 'Anfrage von einer fremden Seite abgelehnt.'); }
  }
  if (!(req.headers.get('content-type') || '').includes('application/json')) return fail(415, 'Bitte sende die Daten als JSON.');

  let body;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return fail(413, 'Die Anfrage ist zu gross.');
    body = JSON.parse(text);
  } catch { return fail(400, 'Die Daten konnten nicht gelesen werden.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'Die Daten konnten nicht gelesen werden.');

  const { name, error: nameError } = cleanName(body.name);
  if (nameError) return fail(400, nameError);
  const scoreError = checkScore(body);
  if (scoreError) return fail(400, scoreError);

  const player = typeof body.player === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(body.player) ? body.player : null;
  const salt = secretSalt();
  const playerKey = player ? await sha256(`player:${player}:${salt}`) : null;
  const networkKey = await sha256(`net:${day}:${context?.ip || 'unknown'}:${salt}`);

  for (let attempt = 0; attempt < WRITE_RETRIES; attempt++) {
    let doc, etag;
    try { ({ doc, etag } = await readDay(store, day)); } catch (err) {
      console.error('leaderboard read failed', err);
      return fail(503, 'Die Klassen-Rangliste ist gerade nicht erreichbar.');
    }

    const now = Date.now();
    const posts = Number(doc.networks[networkKey]) || 0;
    if (posts >= MAX_POSTS_PER_NETWORK) return fail(429, 'Von diesem Netzwerk kamen heute schon sehr viele Einträge. Versuch es morgen wieder.');

    let entry = playerKey ? doc.entries.find((e) => e.player === playerKey) : null;
    let improved = false;
    if (entry) {
      if (now - (entry.lastPost || 0) < MIN_REPOST_MS) return fail(429, 'Nicht so schnell – warte kurz und versuch es nochmals.');
      entry.name = name;
      entry.lastPost = now;
      if (body.score > entry.score) {
        Object.assign(entry, { score: body.score, accuracy: body.accuracy, ts: now });
        improved = true;
      }
    } else {
      if (doc.entries.length >= MAX_ENTRIES_PER_DAY) return fail(429, 'Die Rangliste ist für heute voll. Morgen geht es weiter!');
      entry = { id: randomId(), player: playerKey, name, score: body.score, accuracy: body.accuracy, ts: now, lastPost: now };
      doc.entries.push(entry);
      improved = true;
    }
    doc.networks[networkKey] = posts + 1;

    try {
      if (await writeDay(store, day, doc, etag)) {
        const list = ranked(doc);
        return json(200, payload(doc, { you: entry.id, rank: list.findIndex((e) => e.id === entry.id) + 1, improved }));
      }
    } catch (err) {
      console.error('leaderboard write failed', err);
      return fail(503, 'Dein Eintrag konnte gerade nicht gespeichert werden.');
    }
    // Jemand anderes hat gleichzeitig geschrieben → kurz warten und mit frischen Daten wiederholen
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120 * (attempt + 1)));
  }
  return fail(503, 'Gerade tragen sich sehr viele gleichzeitig ein. Versuch es gleich nochmals.');
};
