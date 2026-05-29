# Expense & Budget Visualizer — Project Steering

## Project Overview

A client-side personal finance tracker built with plain HTML, CSS, and Vanilla JavaScript. No build tools, no frameworks, no backend. Everything runs directly in the browser and persists data via `localStorage`.

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Markup     | HTML5 (single `index.html`)         |
| Styling    | CSS3 (single `css/style.css`)       |
| Logic      | Vanilla JS ES2022 (single `js/app.js`) |
| Charts     | Chart.js 4.4.0 via CDN              |
| Font       | Inter via Google Fonts CDN          |
| Persistence| `localStorage` (no server)          |

## Folder Structure

```
/
├── index.html          ← single page, all markup
├── css/
│   └── style.css       ← all styles, design tokens, responsive
├── js/
│   └── app.js          ← all logic, modular object pattern
└── assets/
    └── icons/          ← reserved for custom icons
```

## Architecture — app.js Module Pattern

The JS is organised as plain objects (not ES modules) to avoid needing a bundler:

| Module              | Responsibility                                      |
|---------------------|-----------------------------------------------------|
| `Storage`           | Read/write `localStorage` for transactions, budget, theme |
| `Format`            | Pure formatting helpers: `rupiah()`, `date()`, `maskNumber()`, `parseMasked()`, `escapeHtml()` |
| `NumberMask`        | Attach live `200.000` formatting to text inputs with cursor-position preservation |
| `Toast`             | Show/hide the bottom pill notification              |
| `Validation`        | Inline field error display and form validation      |
| `Transactions`      | Pure data ops: `create`, `add`, `remove`, `clear`, `getTotals`, `filter`, `sort`, `getCategories` |
| `SummaryUI`         | Update hero balance/income/expense/spending cards   |
| `BudgetUI`          | Update progress bar + warning banner                |
| `TransactionListUI` | Render transaction list, category filter, delete animation |
| `Charts`            | Manage Chart.js doughnut + bar instances            |
| `Theme`             | Apply/toggle dark-light theme                       |
| `renderAll()`       | Orchestrator — calls all UI update functions        |

## Transaction Object Shape

```js
{
  id:        string,   // crypto.randomUUID()
  name:      string,   // item description
  amount:    number,   // positive integer, Rupiah
  category:  string,   // one of CATEGORY_ICONS keys
  type:      string,   // 'expense' | 'income'
  date:      string,   // ISO date YYYY-MM-DD
  createdAt: number,   // Date.now() timestamp
}
```

## localStorage Keys

| Key                | Value                        |
|--------------------|------------------------------|
| `ebv_transactions` | JSON array of transaction objects |
| `ebv_budget`       | String number (budget limit in Rupiah) |
| `ebv_theme`        | `'light'` or `'dark'`        |

## CSS Design Tokens

All colours, radii, shadows, and transitions are defined as CSS custom properties on `:root` and overridden for `[data-theme='dark']`. Always use tokens — never hardcode values.

Key token prefixes:
- `--c-*` — colours (`--c-indigo`, `--c-green`, `--c-red`, `--c-text`, `--c-surface`, etc.)
- `--r-*` — border radii (`--r-sm`, `--r-md`, `--r-lg`, `--r-xl`, `--r-full`)
- `--shadow-*` — box shadows
- `--t`, `--t-slow` — transition durations

## Categories

```js
const CATEGORY_ICONS = {
  Makanan:      '🍔',
  Transportasi: '🚗',
  Belanja:      '🛍️',
  Hiburan:      '🎮',
  Kesehatan:    '💊',
  Tagihan:      '📄',
  Gaji:         '💼',
  Lainnya:      '📦',
};
```

## Key Behaviours

- **Number input masking**: Amount fields use `type="text"` + `inputmode="numeric"`. The `NumberMask` module reformats on every keystroke while preserving cursor position (digit-counting algorithm).
- **Budget warning**: Shown at ≥75% (amber) and ≥100% (red). Progress bar is capped at 100% visually but the label shows the real percentage.
- **Delete animation**: Items slide right + fade before being removed from the array.
- **Chart updates**: Both charts update in-place (`.update()`) when data changes; they are only destroyed and recreated on theme toggle.
- **Responsive breakpoints**: `≤640px` collapses hero stats to row, form rows to 1 col, charts to 1 col. `≤400px` further collapses stats to column.

## Coding Conventions

- `'use strict'` at top of JS
- DOM references centralised in the `DOM` object — never use `document.getElementById` inline
- Helper shortcuts: `getEl(id)` and `getAll(sel)` instead of raw DOM APIs
- All user-generated strings rendered to DOM must go through `Format.escapeHtml()`
- CSS class naming: BEM-style (`.tx-item__delete`, `.card__head--between`)
- No `console.log` left in production code
- No external JS dependencies beyond Chart.js

## Running the Project

Open `index.html` directly in any modern browser. No server, no install, no build step required.
