import { loadDemoSeed } from "./seed.js";
import { readDB, writeDB, clearDB, getSession, tx, uid } from "./storage.js";
import { login, logout } from "./auth.js";
import {
  BLOOD_GROUPS,
  todayISO,
  formatISO,
  normalizeDB,
  computeStockTotals,
  availableUnitsForGroup,
  calcNextEligible,
  daysUntil,
  takeUnitsFromStock,
} from "./logic.js";
import { qs, qsa, escapeHtml, toast, confirmDialog, promptForm } from "./ui.js";

const appRoot = document.getElementById("app");

function setHash(path) {
  window.location.hash = path;
}

function getHashPath() {
  return (window.location.hash || "#/login").replace(/^#/, "");
}

async function ensureDB() {
  const existing = readDB();
  if (existing) {
    const normalized = normalizeDB(existing);
    writeDB(normalized);
    return normalized;
  }
  const seed = await loadDemoSeed();
  const normalized = normalizeDB(seed);
  writeDB(normalized);
  return normalized;
}

function currentUser(db) {
  const session = getSession();
  if (!session?.userId) return null;
  return (db.users || []).find((u) => u.id === session.userId) || null;
}

function layout({ user, active, title, contentHtml }) {
  const nav = navItemsForRole(user.role);
  return `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">Blood Bank Demo</div>
        <div class="muted">Signed in as</div>
        <div style="margin:6px 0 12px 0; font-weight:700;">
          ${escapeHtml(user.name)} <span class="muted">(${escapeHtml(user.role)})</span>
        </div>

        <nav class="nav">
          ${nav
            .map(
              (i) => `
                <a href="#${i.href}" class="${active === i.key ? "active" : ""}">
                  <span>${escapeHtml(i.label)}</span>
                  <span class="muted">›</span>
                </a>
              `
            )
            .join("")}
          <button data-action="reset-demo" class="btn danger" type="button">Reset demo data</button>
          <button data-action="logout" type="button">Logout</button>
        </nav>
      </aside>

      <main class="content">
        <div class="topbar">
          <h1>${escapeHtml(title)}</h1>
          <div class="actions">
            <span class="pill">${escapeHtml(todayISO())}</span>
          </div>
        </div>
        ${contentHtml}
      </main>
    </div>
  `;
}

function navItemsForRole(role) {
  if (role === "admin") {
    return [
      { key: "admin-summary", label: "Dashboard", href: "/admin/summary" },
      { key: "admin-stock", label: "Blood Stock", href: "/admin/stock" },
      { key: "admin-requests", label: "Requests", href: "/admin/requests" },
      { key: "admin-donors", label: "Donors", href: "/admin/donors" },
    ];
  }
  if (role === "donor") {
    return [
      { key: "donor-profile", label: "My Profile", href: "/donor/profile" },
      { key: "donor-donations", label: "Donation History", href: "/donor/donations" },
    ];
  }
  return [
    { key: "hospital-stock", label: "Search Stock", href: "/hospital/stock" },
    { key: "hospital-new", label: "New Request", href: "/hospital/new-request" },
    { key: "hospital-requests", label: "My Requests", href: "/hospital/requests" },
  ];
}

function renderLogin() {
  appRoot.innerHTML = `
    <div class="auth">
      <div class="panel">
        <h1>Blood Bank Management (Local Demo)</h1>
        <p>Client-side only. Data persists in <code>localStorage</code>. Use one of the demo accounts below.</p>

        <div class="demo-creds">
          <div><strong>Admin</strong>: <code>admin@example.com</code> / <code>admin123</code></div>
          <div><strong>Donor</strong>: <code>donor@example.com</code> / <code>donor123</code></div>
          <div><strong>Hospital</strong>: <code>hospital@example.com</code> / <code>hospital123</code></div>
        </div>

        <form id="loginForm">
          <div class="field">
            <label>Email</label>
            <input name="email" type="email" autocomplete="username" required placeholder="name@example.com" />
          </div>
          <div class="field">
            <label>Password</label>
            <input name="password" type="password" autocomplete="current-password" required placeholder="••••••••" />
          </div>
          <div class="actions">
            <button class="btn primary" type="submit">Login</button>
            <button class="btn" type="button" data-action="reset-demo">Reset demo data</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function card(k, v, cls = "") {
  return `
    <div class="card ${cls}">
      <div class="k">${escapeHtml(k)}</div>
      <div class="v">${escapeHtml(String(v))}</div>
    </div>
  `;
}

function statusPill(label, kind) {
  return `<span class="pill ${kind}">${escapeHtml(label)}</span>`;
}

function adminSummaryView(db) {
  const totals = computeStockTotals(db.blood_stock || []);
  const totalAll = Object.values(totals).reduce((a, b) => a + b, 0);
  const expiringSoon = (db.blood_stock || []).filter(
    (s) => s.status !== "expired" && typeof s.expiryDate === "string" && daysUntil(s.expiryDate) <= 7
  ).length;
  const pendingRequests = (db.requests || []).filter((r) => r.status === "pending").length;

  const totalsList = BLOOD_GROUPS.map((g) => `<tr><td>${g}</td><td>${totals[g] || 0}</td></tr>`).join("");

  return `
    <div class="grid cards">
      ${card("Total available units (all groups)", totalAll)}
      ${card("Expiring soon (< 7 days)", expiringSoon)}
      ${card("Pending requests", pendingRequests)}
    </div>

    <div class="section">
      <h2>Units by blood group (available, non-expired)</h2>
      <table class="table">
        <thead><tr><th>Group</th><th>Units</th></tr></thead>
        <tbody>${totalsList}</tbody>
      </table>
    </div>
  `;
}

function adminStockView(db) {
  const rows = (db.blood_stock || [])
    .map((s) => {
      const kind = s.status === "expired" ? "bad" : "ok";
      const status = s.status === "expired" ? "expired" : "available";
      return `
        <tr>
          <td>${escapeHtml(s.bloodGroup)}</td>
          <td>${escapeHtml(String(s.quantity))}</td>
          <td>${escapeHtml(formatISO(s.collectionDate))}</td>
          <td>${escapeHtml(formatISO(s.expiryDate))}</td>
          <td>${statusPill(status, kind)}</td>
          <td style="white-space:nowrap;">
            <button class="btn" data-action="edit-stock" data-id="${escapeHtml(s.id)}">Edit</button>
            <button class="btn danger" data-action="delete-stock" data-id="${escapeHtml(s.id)}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="section" style="margin-top:0;">
      <div class="actions" style="margin-bottom:10px;">
        <button class="btn primary" data-action="add-stock">Add stock</button>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Group</th>
            <th>Qty</th>
            <th>Collection</th>
            <th>Expiry</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="6">No stock yet.</td></tr>`}
        </tbody>
      </table>
      <div class="muted" style="margin-top:8px;">
        Note: status auto-switches to <strong>expired</strong> when expiry date is before today.
      </div>
    </div>
  `;
}

function adminRequestsView(db) {
  const usersById = Object.fromEntries((db.users || []).map((u) => [u.id, u]));
  const rows = (db.requests || [])
    .slice()
    .sort((a, b) => (a.requestDate < b.requestDate ? 1 : -1))
    .map((r) => {
      const hosp = usersById[r.hospitalId];
      const status = r.status || "pending";
      const kind =
        status === "pending" ? "warn" : status.startsWith("approved") ? "ok" : status === "rejected" ? "bad" : "";
      const approvedInfo =
        status === "approved_partial" ? ` (approved ${r.unitsApproved || 0}/${r.unitsRequested})` : "";
      return `
        <tr>
          <td>${escapeHtml(r.id)}</td>
          <td>${escapeHtml(hosp?.name || r.hospitalId)}</td>
          <td>${escapeHtml(r.patientName)}</td>
          <td>${escapeHtml(r.bloodGroup)}</td>
          <td>${escapeHtml(String(r.unitsRequested))}</td>
          <td>${escapeHtml(r.urgency)}</td>
          <td>${escapeHtml(formatISO(r.requestDate))}</td>
          <td>${statusPill(`${status}${approvedInfo}`, kind)}</td>
          <td style="white-space:nowrap;">
            <button class="btn primary" data-action="approve-request" data-id="${escapeHtml(r.id)}" ${
              status !== "pending" ? "disabled" : ""
            }>Approve</button>
            <button class="btn danger" data-action="reject-request" data-id="${escapeHtml(r.id)}" ${
              status !== "pending" ? "disabled" : ""
            }>Reject</button>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Hospital</th>
          <th>Patient</th>
          <th>Group</th>
          <th>Units</th>
          <th>Urgency</th>
          <th>Date</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="9">No requests.</td></tr>`}</tbody>
    </table>
  `;
}

function adminDonorsView(db) {
  const usersById = Object.fromEntries((db.users || []).map((u) => [u.id, u]));
  const rows = (db.donors || [])
    .map((d) => {
      const u = usersById[d.userId];
      const eligible = d.status === "eligible";
      return `
        <tr>
          <td>${escapeHtml(u?.name || d.userId)}</td>
          <td>${escapeHtml(d.bloodGroup)}</td>
          <td>${escapeHtml(formatISO(d.lastDonationDate))}</td>
          <td>${escapeHtml(formatISO(d.nextEligibleDate))}</td>
          <td>${eligible ? statusPill("eligible", "ok") : statusPill("ineligible", "bad")}</td>
          <td style="white-space:nowrap;">
            <button class="btn" data-action="toggle-donor" data-id="${escapeHtml(d.id)}">
              ${eligible ? "Mark ineligible" : "Mark eligible"}
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="table">
      <thead>
        <tr>
          <th>Donor</th>
          <th>Group</th>
          <th>Last donation</th>
          <th>Next eligible</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="6">No donors.</td></tr>`}</tbody>
    </table>
  `;
}

function donorProfileView(db, user) {
  const donor = (db.donors || []).find((d) => d.userId === user.id);
  const donations = (db.donations || []).filter((x) => x.donorId === donor?.id);
  const lastDonationDate = donor?.lastDonationDate || null;
  const nextEligibleDate = donor?.nextEligibleDate || (lastDonationDate ? calcNextEligible(lastDonationDate) : null);

  const eligibleNow = donor?.status === "eligible" && (!nextEligibleDate || todayISO() >= nextEligibleDate);
  const badge = eligibleNow ? statusPill("eligible now", "ok") : statusPill("not eligible", "warn");

  return `
    <div class="grid cards">
      ${card("Name", user.name)}
      ${card("Blood group", donor?.bloodGroup || "—")}
      ${card("Status", eligibleNow ? "Eligible" : "Not eligible")}
    </div>

    <div class="section">
      <h2>Eligibility</h2>
      <div class="card">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div>
            <div class="muted">Last donation</div>
            <div style="font-weight:700; margin-top:4px;">${escapeHtml(formatISO(lastDonationDate))}</div>
          </div>
          <div>
            <div class="muted">Next eligible (56-day rule)</div>
            <div style="font-weight:700; margin-top:4px;">${escapeHtml(formatISO(nextEligibleDate))}</div>
          </div>
          <div>${badge}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Quick actions</h2>
      <div class="actions">
        <button class="btn primary" data-action="donor-add-donation" ${donor ? "" : "disabled"}>Add donation</button>
      </div>
      <div class="muted" style="margin-top:8px;">Adding a donation increments stock for your blood group (1 unit by default).</div>
    </div>

    <div class="section">
      <h2>Donation history (latest first)</h2>
      ${donorDonationsTable(donations)}
    </div>
  `;
}

function donorDonationsTable(donations) {
  const rows = donations
    .slice()
    .sort((a, b) => (a.donationDate < b.donationDate ? 1 : -1))
    .map(
      (d) => `
        <tr>
          <td>${escapeHtml(d.id)}</td>
          <td>${escapeHtml(d.bloodGroup)}</td>
          <td>${escapeHtml(formatISO(d.donationDate))}</td>
          <td>${escapeHtml(String(d.quantity || 0))}</td>
        </tr>
      `
    )
    .join("");
  return `
    <table class="table">
      <thead><tr><th>ID</th><th>Group</th><th>Date</th><th>Qty</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4">No donations yet.</td></tr>`}</tbody>
    </table>
  `;
}

function donorDonationsView(db, user) {
  const donor = (db.donors || []).find((d) => d.userId === user.id);
  const donations = (db.donations || []).filter((x) => x.donorId === donor?.id);
  return `
    <div class="actions" style="margin-bottom:10px;">
      <button class="btn primary" data-action="donor-add-donation" ${donor ? "" : "disabled"}>Add donation</button>
    </div>
    ${donorDonationsTable(donations)}
  `;
}

function hospitalStockView(db) {
  const opts = BLOOD_GROUPS.map((g) => `<option value="${g}">${g}</option>`).join("");
  const totals = computeStockTotals(db.blood_stock || []);
  const rows = BLOOD_GROUPS.map((g) => `<tr><td>${g}</td><td>${totals[g] || 0}</td></tr>`).join("");

  return `
    <div class="card">
      <div class="field">
        <label>Search by blood group</label>
        <select id="hospitalStockGroup">${opts}</select>
      </div>
      <div class="actions">
        <button class="btn primary" data-action="hospital-check-availability">Check availability</button>
      </div>
      <div id="availabilityResult" class="muted" style="margin-top:10px;"></div>
    </div>

    <div class="section">
      <h2>All groups (available, non-expired)</h2>
      <table class="table">
        <thead><tr><th>Group</th><th>Units</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function hospitalNewRequestView() {
  const opts = BLOOD_GROUPS.map((g) => `<option value="${g}">${g}</option>`).join("");
  return `
    <div class="card">
      <form id="newRequestForm">
        <div class="field">
          <label>Patient name</label>
          <input name="patientName" required placeholder="e.g., John Doe" />
        </div>
        <div class="field">
          <label>Blood group</label>
          <select name="bloodGroup" required>${opts}</select>
        </div>
        <div class="field">
          <label>Units requested</label>
          <input name="unitsRequested" type="number" min="1" step="1" required value="1" />
        </div>
        <div class="field">
          <label>Urgency</label>
          <select name="urgency" required>
            <option value="normal">normal</option>
            <option value="urgent">urgent</option>
          </select>
        </div>
        <div class="actions">
          <button class="btn primary" type="submit">Submit request</button>
        </div>
      </form>
    </div>
  `;
}

function hospitalRequestsView(db, user) {
  const rows = (db.requests || [])
    .filter((r) => r.hospitalId === user.id)
    .slice()
    .sort((a, b) => (a.requestDate < b.requestDate ? 1 : -1))
    .map((r) => {
      const status = r.status || "pending";
      const kind =
        status === "pending" ? "warn" : status.startsWith("approved") ? "ok" : status === "rejected" ? "bad" : "";
      const approvedInfo =
        status === "approved_partial" ? ` (approved ${r.unitsApproved || 0}/${r.unitsRequested})` : "";
      return `
        <tr>
          <td>${escapeHtml(r.id)}</td>
          <td>${escapeHtml(r.patientName)}</td>
          <td>${escapeHtml(r.bloodGroup)}</td>
          <td>${escapeHtml(String(r.unitsRequested))}</td>
          <td>${escapeHtml(r.urgency)}</td>
          <td>${escapeHtml(formatISO(r.requestDate))}</td>
          <td>${statusPill(`${status}${approvedInfo}`, kind)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="table">
      <thead><tr><th>ID</th><th>Patient</th><th>Group</th><th>Units</th><th>Urgency</th><th>Date</th><th>Status</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7">No requests yet.</td></tr>`}</tbody>
    </table>
  `;
}

function renderRoleRoute(db, user, path) {
  const seg = path.split("/").filter(Boolean);
  const role = seg[0];
  const page = seg[1] || "";

  if (role !== user.role) {
    // prevent cross-role navigation
    return { title: "Unauthorized", html: `<div class="card">This route is not allowed for your role.</div>` };
  }

  if (user.role === "admin") {
    if (page === "summary") return { title: "Admin Dashboard", html: adminSummaryView(db), active: "admin-summary" };
    if (page === "stock") return { title: "Blood Stock", html: adminStockView(db), active: "admin-stock" };
    if (page === "requests") return { title: "Requests", html: adminRequestsView(db), active: "admin-requests" };
    if (page === "donors") return { title: "Donors", html: adminDonorsView(db), active: "admin-donors" };
    return { title: "Admin", html: adminSummaryView(db), active: "admin-summary" };
  }

  if (user.role === "donor") {
    if (page === "profile") return { title: "Donor Portal", html: donorProfileView(db, user), active: "donor-profile" };
    if (page === "donations") return { title: "Donation History", html: donorDonationsView(db, user), active: "donor-donations" };
    return { title: "Donor Portal", html: donorProfileView(db, user), active: "donor-profile" };
  }

  // hospital
  if (page === "stock") return { title: "Hospital Portal", html: hospitalStockView(db), active: "hospital-stock" };
  if (page === "new-request") return { title: "New Request", html: hospitalNewRequestView(), active: "hospital-new" };
  if (page === "requests") return { title: "My Requests", html: hospitalRequestsView(db, user), active: "hospital-requests" };
  return { title: "Hospital Portal", html: hospitalStockView(db), active: "hospital-stock" };
}

function defaultRouteForRole(role) {
  if (role === "admin") return "/admin/summary";
  if (role === "donor") return "/donor/profile";
  return "/hospital/stock";
}

async function render() {
  const db = await ensureDB();
  const user = currentUser(db);
  const path = getHashPath();

  if (!user) {
    renderLogin();
    if (path !== "/login") setHash("/login");
    return;
  }

  if (path === "/login" || path === "/") {
    setHash(defaultRouteForRole(user.role));
    return;
  }

  const { title, html, active } = renderRoleRoute(db, user, path);
  appRoot.innerHTML = layout({ user, active, title, contentHtml: html });
}

// ---- Actions (event delegation) ----
document.addEventListener("submit", async (e) => {
  if (e.target?.id === "loginForm") {
    e.preventDefault();
    const db = await ensureDB();
    const fd = new FormData(e.target);
    const email = String(fd.get("email") || "");
    const password = String(fd.get("password") || "");
    const res = login(db, email, password);
    if (!res.ok) {
      toast("error", "Login failed", res.error);
      return;
    }
    toast("success", "Welcome", `Signed in as ${res.user.name}`);
    setHash(defaultRouteForRole(res.user.role));
    await render();
  }

  if (e.target?.id === "newRequestForm") {
    e.preventDefault();
    const fd = new FormData(e.target);
    const patientName = String(fd.get("patientName") || "").trim();
    const bloodGroup = String(fd.get("bloodGroup") || "");
    const unitsRequested = Number(fd.get("unitsRequested") || 0);
    const urgency = String(fd.get("urgency") || "normal");

    if (!patientName || !BLOOD_GROUPS.includes(bloodGroup) || !Number.isFinite(unitsRequested) || unitsRequested <= 0) {
      toast("error", "Invalid request", "Please fill all fields correctly.");
      return;
    }

    const db = await ensureDB();
    const user = currentUser(db);
    if (!user || user.role !== "hospital") return;

    tx((d) => {
      d.requests = d.requests || [];
      d.requests.push({
        id: uid("r"),
        hospitalId: user.id,
        patientName,
        bloodGroup,
        unitsRequested,
        urgency,
        status: "pending",
        requestDate: todayISO(),
      });
      return normalizeDB(d);
    });

    toast("success", "Request submitted", "Your request is now pending admin approval.");
    setHash("/hospital/requests");
    await render();
  }
});

document.addEventListener("click", async (e) => {
  const btn = e.target?.closest("[data-action]");
  if (!btn) return;
  const action = btn.getAttribute("data-action");
  const id = btn.getAttribute("data-id");

  if (action === "logout") {
    logout();
    toast("success", "Signed out", "You have been logged out.");
    setHash("/login");
    await render();
    return;
  }

  if (action === "reset-demo") {
    const ok = confirmDialog("Reset demo data? This will clear localStorage for this app and reload the seed data.");
    if (!ok) return;
    clearDB();
    await ensureDB();
    toast("success", "Reset complete", "Demo data has been restored.");
    setHash("/login");
    await render();
    return;
  }

  // Admin actions
  if (action === "add-stock") {
    const data = promptForm(
      "Add stock",
      [
        { key: "bloodGroup", label: "Blood group", type: "select", options: BLOOD_GROUPS },
        { key: "quantity", label: "Quantity (units)", type: "number" },
        { key: "collectionDate", label: "Collection date (YYYY-MM-DD)", type: "date" },
        { key: "expiryDate", label: "Expiry date (YYYY-MM-DD)", type: "date" },
      ],
      { bloodGroup: "A+", quantity: 1, collectionDate: todayISO(), expiryDate: todayISO() }
    );
    if (!data) return;
    if (!BLOOD_GROUPS.includes(data.bloodGroup) || !data.expiryDate || !data.collectionDate) {
      toast("error", "Invalid input", "Please use a valid blood group and dates.");
      return;
    }
    tx((d) => {
      d.blood_stock = d.blood_stock || [];
      d.blood_stock.push({
        id: uid("b"),
        bloodGroup: data.bloodGroup,
        quantity: Number(data.quantity || 0),
        collectionDate: data.collectionDate,
        expiryDate: data.expiryDate,
        status: "available",
      });
      return normalizeDB(d);
    });
    toast("success", "Stock added", "Blood stock record created.");
    await render();
    return;
  }

  if (action === "edit-stock") {
    const db = await ensureDB();
    const item = (db.blood_stock || []).find((x) => x.id === id);
    if (!item) return;
    const data = promptForm(
      "Edit stock",
      [
        { key: "bloodGroup", label: "Blood group", type: "select", options: BLOOD_GROUPS },
        { key: "quantity", label: "Quantity (units)", type: "number" },
        { key: "collectionDate", label: "Collection date (YYYY-MM-DD)", type: "date" },
        { key: "expiryDate", label: "Expiry date (YYYY-MM-DD)", type: "date" },
      ],
      item
    );
    if (!data) return;
    tx((d) => {
      const idx = (d.blood_stock || []).findIndex((x) => x.id === id);
      if (idx >= 0) {
        d.blood_stock[idx] = {
          ...d.blood_stock[idx],
          bloodGroup: data.bloodGroup,
          quantity: Number(data.quantity || 0),
          collectionDate: data.collectionDate,
          expiryDate: data.expiryDate,
          status: "available",
        };
      }
      return normalizeDB(d);
    });
    toast("success", "Saved", "Stock updated.");
    await render();
    return;
  }

  if (action === "delete-stock") {
    const ok = confirmDialog("Delete this stock record?");
    if (!ok) return;
    tx((d) => {
      d.blood_stock = (d.blood_stock || []).filter((x) => x.id !== id);
      return normalizeDB(d);
    });
    toast("success", "Deleted", "Stock record removed.");
    await render();
    return;
  }

  if (action === "approve-request") {
    const db = await ensureDB();
    const req = (db.requests || []).find((r) => r.id === id);
    if (!req || req.status !== "pending") return;

    const available = availableUnitsForGroup(db.blood_stock || [], req.bloodGroup);
    if (available <= 0) {
      toast("error", "Insufficient stock", `No available units for ${req.bloodGroup}.`);
      return;
    }

    let allowPartial = false;
    if (available < req.unitsRequested) {
      allowPartial = confirmDialog(
        `Only ${available} unit(s) available for ${req.bloodGroup}, but request needs ${req.unitsRequested}.\n\nOK = Approve partially (${available})\nCancel = Do not approve`
      );
      if (!allowPartial) return;
    }

    tx((d) => {
      const r = (d.requests || []).find((x) => x.id === id);
      if (!r || r.status !== "pending") return d;

      const result = takeUnitsFromStock(d, r.bloodGroup, r.unitsRequested, { allowPartial });
      if (!result.ok) return d;

      if (result.taken < r.unitsRequested) {
        r.status = "approved_partial";
        r.unitsApproved = result.taken;
      } else {
        r.status = "approved";
        r.unitsApproved = r.unitsRequested;
      }
      r.decisionDate = todayISO();
      return normalizeDB(d);
    });

    toast("success", "Request approved", "Stock was decremented accordingly.");
    await render();
    return;
  }

  if (action === "reject-request") {
    const ok = confirmDialog("Reject this request?");
    if (!ok) return;
    tx((d) => {
      const r = (d.requests || []).find((x) => x.id === id);
      if (r && r.status === "pending") {
        r.status = "rejected";
        r.decisionDate = todayISO();
      }
      return normalizeDB(d);
    });
    toast("success", "Rejected", "Request was rejected.");
    await render();
    return;
  }

  if (action === "toggle-donor") {
    tx((d) => {
      const donor = (d.donors || []).find((x) => x.id === id);
      if (!donor) return d;
      donor.status = donor.status === "eligible" ? "ineligible" : "eligible";
      return normalizeDB(d);
    });
    toast("success", "Updated", "Donor eligibility updated.");
    await render();
    return;
  }

  // Donor actions
  if (action === "donor-add-donation") {
    const db = await ensureDB();
    const user = currentUser(db);
    if (!user || user.role !== "donor") return;
    const donor = (db.donors || []).find((d) => d.userId === user.id);
    if (!donor) return;

    const nextEligible = donor.lastDonationDate ? calcNextEligible(donor.lastDonationDate) : null;
    const eligibleNow = donor.status === "eligible" && (!nextEligible || todayISO() >= nextEligible);

    if (!eligibleNow) {
      toast("warn", "Not eligible", `Next eligible date is ${formatISO(donor.nextEligibleDate || nextEligible)}.`);
      return;
    }

    const data = promptForm(
      "Add donation",
      [
        { key: "donationDate", label: "Donation date (YYYY-MM-DD)", type: "date" },
        { key: "quantity", label: "Quantity (units)", type: "number" },
      ],
      { donationDate: todayISO(), quantity: 1 }
    );
    if (!data) return;

    tx((d) => {
      const dn = (d.donors || []).find((x) => x.id === donor.id);
      if (!dn) return d;

      const donationDate = data.donationDate || todayISO();
      const quantity = Number(data.quantity || 1);

      d.donations = d.donations || [];
      d.donations.push({
        id: uid("don"),
        donorId: dn.id,
        bloodGroup: dn.bloodGroup,
        donationDate,
        quantity,
      });

      dn.lastDonationDate = donationDate;
      dn.nextEligibleDate = calcNextEligible(donationDate);

      d.blood_stock = d.blood_stock || [];
      d.blood_stock.push({
        id: uid("b"),
        bloodGroup: dn.bloodGroup,
        quantity,
        collectionDate: donationDate,
        // Simple assumption: 60-day shelf life for demo purposes
        expiryDate: (() => {
          const dt = new Date(donationDate + "T00:00:00");
          dt.setDate(dt.getDate() + 60);
          return dt.toISOString().slice(0, 10);
        })(),
        status: "available",
      });

      return normalizeDB(d);
    });

    toast("success", "Donation added", "Thank you! Stock updated.");
    await render();
    return;
  }

  // Hospital actions
  if (action === "hospital-check-availability") {
    const db = await ensureDB();
    const groupSel = qs("#hospitalStockGroup");
    const group = groupSel?.value || "A+";
    const units = availableUnitsForGroup(db.blood_stock || [], group);
    const target = qs("#availabilityResult");
    if (target) target.textContent = `${group}: ${units} unit(s) available (non-expired)`;
    return;
  }
});

window.addEventListener("hashchange", () => render());
render();

