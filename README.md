# Stock Manager

A responsive, SaaS-style stock & inventory management app. Track everything you own, issue
items to people, and watch availability drop automatically while the issued units stay
pending until they come back.

- **Frontend:** React 18 + Vite + React Router + lucide-react (custom CSS design system)
- **Backend:** FastAPI + SQLAlchemy + SQLite (no external database required)
- **Auth:** JWT bearer tokens, PBKDF2-SHA256 password hashing (stdlib only)

---

## Features

| Area | What it does |
| --- | --- |
| Dashboard | Total items, units on hand, stock value, pending units, 7-day movement trend, recent activity, low-stock alerts |
| Stock items | Create / edit / delete items, auto-generated SKUs, receive stock, per-item movement history, CSV export, search + filter + sort |
| Inventory | Live availability per item, issue items to people, partial returns, cancel issues, pending list with overdue highlighting, full issue history |
| Stock In / Stock Out | Stationery register split into Stock In (received) and Stock Out (taken). Balances are linked: taking stock out reduces Stock In automatically and Stock Out shows taken + remaining. Admin-defined extra columns; bulk add from Excel, CSV or pasted cells. |
| Settings | Company name, currency, profile details, password change |
| Responsive | Desktop sidebar layout, tablet reflow, mobile drawer + bottom navigation, card lists instead of wide tables, bottom-sheet modals |

### How stock math works

- `Item.quantity` is the **available** stock.
- Issuing an item decrements `quantity` and creates an `out` movement; the issue stays
  **pending** until it is returned or cancelled.
- Returning stock increments `quantity`, records a `return` movement, and updates
  `Issue.returned_quantity` (partial returns supported). Once everything is returned the
  issue becomes **returned**.
- Cancelling a pending issue puts the units back and marks the issue **cancelled**.
- Every change is written to the movement ledger, so each item keeps a full audit trail.

---

## Quick start (single server, production build)

This runs the API **and** the built React app from one process on port `8000`.

### 1. Backend

```powershell
cd stock_manager\backend

# one-time setup
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# start (serves the API + frontend/dist if it exists)
python run.py
```

Then open <http://localhost:8000>.

### 2. Frontend build (only needed after frontend changes)

```powershell
cd stock_manager\frontend
npm install      # one-time
npm run build    # writes frontend/dist
```

The backend automatically serves `frontend/dist` when it exists, with SPA fallback so
client-side routes like `/inventory` work on refresh.

---

## Development mode (hot reload)

Run the two servers side by side:

```powershell
# terminal 1 – API on :8000
cd stock_manager\backend
.venv\Scripts\python.exe run.py

# terminal 2 – Vite dev server on :5173
cd stock_manager\frontend
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to `http://127.0.0.1:8000`, so no CORS or
env configuration is needed.

---

## Default login

| Field | Value |
| --- | --- |
| Email | `admin@stockmanager.app` |
| Password | `admin123` |

A new account can also be created from the **Register** page. On first run the database is
seeded with this admin user, company settings, 8 demo stock items, 5 pending issues, 1
returned issue, 8 stationery rows and one example custom column (**Shelf**).

> Change the password from **Settings → Password** before using this anywhere real.

---

## Stock In / Stock Out (stationery register)

Stationery is a sub-section of **Inventory** - it sits nested under Inventory in the sidebar
and is linked from the Inventory page header (two hub cards: **Stock In** and **Stock Out**).
Each row tracks:

| Column | Notes |
| --- | --- |
| Item name | Required |
| Date of entry | Defaults to today |
| Category | Free text, with suggestions from existing categories |
| Total stock | Number; `0` renders as **Out of stock** (this is the *available* balance) |
| Status | Derived from total stock (In stock / Out of stock) |
| Order | `Purchased`, `Donation`, or `Other` |
| Order detail | Shown when the source is **Other** ("what was it?") |
| Referer | Vendor, donor or person who referred the stock |
| Taken out | (Stock In only) units taken out via Stock Out |

**Balance linkage.** Stock In and Stock Out share the same item rows. Taking stock out
reduces the matching Stock In balance automatically; the Stock Out record shows how much
was taken and how much is remaining. Undoing a stock-out restores the balance. An item
with stock-out records cannot be deleted until those records are undone.

**Stock Out** records: item, quantity, taken by, department, purpose, date/time, remaining
stock. Only items present in Stock In can be taken out, and only up to the available
balance.

**Custom columns.** Press **Columns** (Stock In) to add your own columns (text, number,
date or dropdown). They appear for every entry, in the add/edit form, in CSV exports and in
bulk imports. Removing a column also removes the values stored in it.

**Bulk add.** Press **Bulk add**, then either:

- **Upload file** - a `.xlsx` (Excel) or `.csv` file whose first row contains headers.
- **Paste table** - copy cells straight from Excel / Google Sheets and paste them in.

Next, map spreadsheet columns to register fields (mapping is guessed automatically from the
header names), preview the first rows, then import. Accepted values:

- Dates: `2026-11-17`, `17/11/2026`, `17 Nov 2026`, real Excel date cells, or blank (today).
- Order: `purchased` / `bought`, `donation` / `donated`, `other` (anything unrecognised becomes
  **Other** with the raw value kept as the detail).
- Total stock: numbers with or without commas (`1,200` works); blank becomes `0`.

A CSV template with your current columns can be downloaded from the import dialog.

---

## Database

By default the app uses **SQLite** (a local file: `backend/data/stockmanager.db`, or `/tmp/stockmanager.db` on Vercel).
No setup is required for local development.

To use **MySQL** (or any other SQLAlchemy-supported database), set the `DATABASE_URL` environment
variable before starting the server:

```
# MySQL (install pymysql: pip install pymysql)
DATABASE_URL=mysql+pymysql://USER:PASSWORD@HOST:3306/DBNAME

# PostgreSQL
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
```

Tables are created automatically on startup (`Base.metadata.create_all`), so just point the URL at an
empty database and restart. On Vercel, set `DATABASE_URL` in Project Settings -> Environment Variables,
then redeploy.

The database must already exist (the app does not create the database itself, only the tables).

---

## Using it from your phone

1. Start the server (or Vite dev server) — both bind to `0.0.0.0`.
2. Find your computer's LAN IP:
   ```powershell
   ipconfig
   ```
   Look for `IPv4 Address` on your active Wi-Fi/Ethernet adapter, e.g. `192.168.1.42`.
3. On the phone (same Wi-Fi), open:
   - Production: `http://192.168.1.42:8000`
   - Dev server: `http://192.168.1.42:5173`
4. If it doesn't load, allow Python/Node through Windows Defender Firewall for private
   networks (or add an inbound rule for the port).

Layout switches to a mobile drawer + bottom tab bar below 760px, tables become cards, and
modals slide up as bottom sheets.

---

## Project structure

```
stock_manager/
├─ backend/
│  ├─ app/
│  │  ├─ main.py            # FastAPI app, CORS, routers, SPA static serving
│  │  ├─ db.py              # SQLite engine + session factory
│  │  ├─ models.py          # User, Setting, Item, Issue, Movement, StationeryItem, StationeryField
│  │  ├─ schemas.py         # Pydantic request/response models
│  │  ├─ serializers.py     # ORM -> API payload helpers
│  │  ├─ security.py        # password hashing + JWT helpers
│  │  ├─ seed.py            # default admin, settings, demo data
│  │  └─ routers/
│  │     ├─ auth.py         # login, register, me, profile, password
│  │     ├─ items.py        # CRUD, restock, categories, history, CSV data
│  │     ├─ issues.py       # issue, return (partial), cancel, history
│  │     ├─ stationery.py   # register CRUD, custom columns, CSV/XLSX import
│  │     ├─ dashboard.py    # stats, trend, activity, low stock
│  │     └─ settings.py     # company + currency settings
│  ├─ data/
│  │  ├─ stockmanager.db    # SQLite database (created on first run)
│  │  └─ .secret            # auto-generated JWT signing secret
│  ├─ requirements.txt
│  └─ run.py                # uvicorn launcher (0.0.0.0:8000)
└─ frontend/
   ├─ src/
   │  ├─ pages/             # Login, Register, Dashboard, Inventory, StockIn, StockOut, Stock, Settings
   │  ├─ components/        # Layout, UI kit (Modal, ConfirmDialog, badges…)
   │  ├─ context/           # Auth, Toast, Workspace (settings) providers
   │  ├─ lib/               # api client, useFetch, formatters
   │  ├─ App.jsx            # routes + guards
   │  └─ styles.css         # design system + responsive breakpoints
   ├─ vite.config.js        # dev proxy /api -> :8000
   └─ package.json
```

---

## API overview

All routes are prefixed with `/api`. Authenticated routes expect
`Authorization: Bearer <token>`. Interactive docs: <http://localhost:8000/docs>.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Get JWT |
| `GET` | `/auth/me` | Current user |
| `PUT` | `/auth/me` | Update display name |
| `POST` | `/auth/change-password` | Change password |
| `GET` | `/auth/stats` | Account/workspace counts |
| `GET` | `/items` | List items (`search`, `category`, `status`, `sort`) |
| `POST` | `/items` | Create item |
| `GET` | `/items/{id}` | Single item |
| `PUT` | `/items/{id}` | Update item |
| `DELETE` | `/items/{id}` | Delete item (blocked while issues are pending) |
| `POST` | `/items/{id}/restock` | Receive stock |
| `GET` | `/items/{id}/history` | Movement ledger for one item |
| `GET` | `/items/categories` | Categories with counts |
| `GET` | `/issues` | List issues (`status`, `search`) |
| `POST` | `/issues` | Issue item (reduces available stock) |
| `POST` | `/issues/{id}/return` | Return full/partial quantity |
| `DELETE` | `/issues/{id}` | Cancel a pending issue |
| `GET` | `/stationery` | Register rows + custom columns + summary (`search`, `category`, `status`, `source`, `sort`) |
| `POST` | `/stationery` | Add a stationery row |
| `PUT` / `DELETE` | `/stationery/{id}` | Update / delete a row |
| `POST` | `/stationery/bulk` | Add many rows from JSON (used by paste import) |
| `GET` / `POST` | `/stationery/columns` | List / add custom columns (admin only) |
| `DELETE` | `/stationery/columns/{id}` | Remove a custom column (admin only) |
| `POST` | `/stationery/import/preview` | Parse an uploaded `.csv` / `.xlsx` and return headers + sample rows |
| `POST` | `/stationery/import` | Import an uploaded file using a column mapping |
| `GET` | `/stationery/out` | Stock-out records + summary + available items |
| `POST` | `/stationery/out` | Take stock out (reduces Stock In balance) |
| `DELETE` | `/stationery/out/{id}` | Undo a stock-out (restores balance) |
| `GET` | `/stationery/overview` | Combined Stock In + Stock Out summary (used by Inventory hub cards) |
| `GET` | `/dashboard` | Aggregated stats, trend, activity, low stock |
| `GET` / `PUT` | `/settings` | Company name, currency |
| `GET` | `/health` | Health check |

---

## Configuration & data

- **Database:** `backend/data/stockmanager.db` (SQLite, created automatically).
- **JWT secret:** auto-generated into `backend/data/.secret` on first run.
- **CORS:** open in development; tighten `allow_origins` in `app/main.py` for production.
- **Currency:** set in **Settings** (defaults to INR / ₹). Used across dashboard, stock,
  inventory and CSV export labels.

### Reset to clean demo data

```powershell
# stop the server first, then:
Remove-Item stock_manager\backend\data\stockmanager.db
# restart: python run.py   (re-seeds admin + demo data)
```

Delete `backend/data/.secret` too if you also want to invalidate all existing sessions.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `python` not found | Install Python 3.10+ and tick "Add to PATH", or use `py -3` |
| `ModuleNotFoundError: No module named 'app'` | Start the server from inside `stock_manager\backend` (or use the full path to `run.py`) |
| `ImportError: email-validator is not installed` | Not needed any more — email checks use a built-in regex. If you still see it, you're on an older copy of `schemas.py`, or a different Python is being used: run `stock_manager\backend\.venv\Scripts\python.exe run.py` |
| `ModuleNotFoundError: fastapi` / `sqlalchemy` | That interpreter doesn't have the deps: `pip install -r requirements.txt`, or use the bundled `.venv` |
| Excel import says it needs `openpyxl` | Run `pip install -r requirements.txt` in the same interpreter that runs the backend (openpyxl and python-multipart are required for `.xlsx` uploads) |
| Port 8000 busy | Stop the other process or run `python run.py` on a different port |
| Frontend shows 404 on refresh in production | Rebuild (`npm run build`) so `frontend/dist` exists |
| Phone can't connect | Same Wi-Fi? Firewall rule? Use the LAN IP, not `localhost` |
| Changes to UI not visible | Rebuild the frontend; the backend serves the last build |
