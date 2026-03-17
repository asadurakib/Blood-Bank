const DB_KEY = "bb_demo_db_v1";
const SESSION_KEY = "bb_demo_session_v1";

export function readDB() {
  const raw = localStorage.getItem(DB_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function writeDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function clearDB() {
  localStorage.removeItem(DB_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function tx(mutator) {
  const db = readDB();
  if (!db) throw new Error("Database not initialized");
  const next = mutator(structuredClone(db)) ?? db;
  writeDB(next);
  return next;
}

export function uid(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

