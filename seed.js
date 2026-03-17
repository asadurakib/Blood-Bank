// Seed loader with file:// fallback.
// Tries to fetch /data/demo-seed.json (works on GitHub Pages / HTTP),
// and falls back to the embedded JSON so opening index.html directly works.

export const EMBEDDED_DEMO_SEED = {
  "users": [
    { "id": "u-admin", "name": "Admin User", "email": "admin@example.com", "password": "admin123", "role": "admin", "phone": "01234567890" },
    { "id": "u-donor", "name": "Donor One", "email": "donor@example.com", "password": "donor123", "role": "donor", "phone": "01234567891" },
    { "id": "u-hospital", "name": "City Hospital", "email": "hospital@example.com", "password": "hospital123", "role": "hospital", "phone": "01234567892" }
  ],
  "donors": [
    { "id": "d1", "userId": "u-donor", "bloodGroup": "A+", "lastDonationDate": "2026-01-15", "nextEligibleDate": "2026-03-12", "status": "eligible" }
  ],
  "blood_stock": [
    { "id": "b1", "bloodGroup": "A+", "quantity": 5, "collectionDate": "2026-02-01", "expiryDate": "2026-04-01", "status": "available" },
    { "id": "b2", "bloodGroup": "O-", "quantity": 2, "collectionDate": "2026-02-10", "expiryDate": "2026-03-25", "status": "available" },
    { "id": "b3", "bloodGroup": "B+", "quantity": 3, "collectionDate": "2026-02-20", "expiryDate": "2026-04-20", "status": "available" }
  ],
  "requests": [
    { "id": "r1", "hospitalId": "u-hospital", "patientName": "Patient A", "bloodGroup": "A+", "unitsRequested": 2, "urgency": "urgent", "status": "pending", "requestDate": "2026-03-05" }
  ],
  "donations": [
    { "id": "don1", "donorId": "d1", "bloodGroup": "A+", "donationDate": "2026-01-15", "quantity": 1 }
  ]
};

export async function loadDemoSeed() {
  try {
    const res = await fetch("./data/demo-seed.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Seed fetch failed: ${res.status}`);
    const json = await res.json();
    return json;
  } catch {
    return structuredClone(EMBEDDED_DEMO_SEED);
  }
}

