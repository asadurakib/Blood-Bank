export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function parseISO(dateStr) {
  // dateStr: YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatISO(dateStr) {
  if (!dateStr) return "—";
  return dateStr;
}

export function addDaysISO(dateStr, days) {
  const dt = parseISO(dateStr);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function calcNextEligible(lastDonationDate) {
  if (!lastDonationDate) return null;
  return addDaysISO(lastDonationDate, 56);
}

export function isExpired(expiryDate, nowISO = todayISO()) {
  return parseISO(expiryDate) < parseISO(nowISO);
}

export function daysUntil(dateStr, nowISO = todayISO()) {
  const ms = parseISO(dateStr) - parseISO(nowISO);
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function normalizeDB(db) {
  // Keep the demo simple: derive stock status from expiry date on each load.
  const now = todayISO();
  db.blood_stock = (db.blood_stock ?? []).map((s) => {
    const expired = s.expiryDate ? isExpired(s.expiryDate, now) : false;
    return {
      ...s,
      status: expired ? "expired" : (s.status || "available"),
    };
  });
  return db;
}

export function computeStockTotals(stock) {
  const totals = {};
  for (const g of BLOOD_GROUPS) totals[g] = 0;
  for (const s of stock) {
    if (s.status === "expired") continue;
    totals[s.bloodGroup] = (totals[s.bloodGroup] || 0) + Number(s.quantity || 0);
  }
  return totals;
}

export function availableUnitsForGroup(stock, bloodGroup) {
  return stock
    .filter((s) => s.bloodGroup === bloodGroup && s.status !== "expired")
    .reduce((sum, s) => sum + Number(s.quantity || 0), 0);
}

export function takeUnitsFromStock(db, bloodGroup, unitsNeeded, { allowPartial = false } = {}) {
  // Decrement oldest-expiring first.
  const items = db.blood_stock
    .map((x, idx) => ({ ...x, _idx: idx }))
    .filter((s) => s.bloodGroup === bloodGroup && s.status !== "expired" && Number(s.quantity || 0) > 0)
    .sort((a, b) => parseISO(a.expiryDate) - parseISO(b.expiryDate));

  const available = items.reduce((sum, s) => sum + Number(s.quantity || 0), 0);
  if (available <= 0) return { ok: false, taken: 0, available: 0 };
  if (!allowPartial && available < unitsNeeded) return { ok: false, taken: 0, available };

  let remaining = Math.min(unitsNeeded, available);
  let taken = 0;

  for (const item of items) {
    if (remaining <= 0) break;
    const q = Number(item.quantity || 0);
    const dec = Math.min(q, remaining);
    remaining -= dec;
    taken += dec;
    db.blood_stock[item._idx].quantity = q - dec;
  }

  return { ok: true, taken, available };
}

