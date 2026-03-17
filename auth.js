import { clearSession, setSession } from "./storage.js";

export function login(db, email, password) {
  const user = (db.users || []).find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
  if (!user) return { ok: false, error: "Invalid email or password" };
  setSession({ userId: user.id });
  return { ok: true, user };
}

export function logout() {
  clearSession();
}

