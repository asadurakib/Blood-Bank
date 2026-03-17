# Blood Bank Management (Local-Only Demo)

A simple **single-page** Blood Bank Management web app built with **plain HTML, CSS, and vanilla JavaScript**.

- **No backend**
- **No server-side code**
- **No build tools**
- **All data persisted in `localStorage`**
- Works by **opening `index.html` directly** or hosting on **GitHub Pages**

## Demo credentials

- Admin: `admin@example.com` / `admin123`
- Donor: `donor@example.com` / `donor123`
- Hospital: `hospital@example.com` / `hospital123`

## Run locally

1. Download / clone the project.
2. Open `index.html` in any modern browser.
3. Log in using one of the demo credentials above.

> Note: this app seeds demo data on first load. If you previously used it, use **Reset demo data** to restore the seed.

## Reset demo data

Use any **Reset demo data** button in the UI:

- Login screen → **Reset demo data**
- Sidebar (after login) → **Reset demo data**

This clears this app’s `localStorage` keys and reloads the seed.

## Deploy to GitHub Pages (no build required)

1. Create a new GitHub repository and push these files.
2. In GitHub: **Settings → Pages**
3. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: `main` (or `master`)
   - Folder: `/ (root)`
4. Save. After a minute, your site will be live.

## Folder structure

```
/
  index.html
  README.md
  /css
    styles.css
  /data
    demo-seed.json
  /js
    app.js
    auth.js
    logic.js
    seed.js
    storage.js
    ui.js
```

## Data model (localStorage)

The app stores one JSON object in `localStorage` under `bb_demo_db_v1` with these collections:

- `users`
- `donors`
- `blood_stock`
- `requests`
- `donations`

