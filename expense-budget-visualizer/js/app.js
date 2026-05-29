/* ============================================================
   EXPENSE & BUDGET VISUALIZER — app.js
   Vanilla JS · LocalStorage · Chart.js
   ============================================================ */

'use strict';

/* ── CONSTANTS ──────────────────────────────────────────────── */
const STORAGE_KEYS = {
  transactions: 'ebv_transactions',
  budget:       'ebv_budget',
  theme:        'ebv_theme',
};

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

const CHART_PALETTE = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6',
  '#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16',
];

/* Budget warning thresholds */
const BUDGET_WARN_PCT = 75;   // amber warning
const BUDGET_OVER_PCT = 100;  // red / exceeded

/* ── STATE ──────────────────────────────────────────────────── */
let transactions  = [];
let budgetLimit   = 0;
let chartDoughnut = null;
let chartBar      = null;

/* ── DOM HELPERS ────────────────────────────────────────────── */
const getEl  = (id)  => document.getElementById(id);
const getAll = (sel) => document.querySelectorAll(sel);

/* ── DOM REFERENCES ─────────────────────────────────────────── */
const DOM = {
  // Header
  btnToggleTheme:      getEl('btnToggleTheme'),
  // Hero summary
  totalBalance:        getEl('totalBalance'),
  totalIncome:         getEl('totalIncome'),
  totalExpense:        getEl('totalExpense'),
  totalSpending:       getEl('totalSpending'),
  // Budget
  budgetLimitInput:    getEl('budgetLimit'),
  budgetProgress:      getEl('budgetProgress'),
  budgetProgressLabel: getEl('budgetProgressLabel'),
  budgetWarning:       getEl('budgetWarning'),
  btnSetBudget:        getEl('btnSetBudget'),
  // Form
  transactionForm:     getEl('transactionForm'),
  txName:              getEl('txDesc'),
  txAmount:            getEl('txAmount'),
  txType:              getEl('txType'),
  txCategory:          getEl('txCategory'),
  txDate:              getEl('txDate'),
  // List
  txList:              getEl('txList'),
  emptyState:          getEl('emptyState'),
  // Controls
  filterType:          getEl('filterType'),
  filterCategory:      getEl('filterCategory'),
  sortBy:              getEl('sortBy'),
  btnClearAll:         getEl('btnClearAll'),
  // Toast
  toast:               getEl('toast'),
};

/* ══════════════════════════════════════════════════════════════
   MODULE: STORAGE
══════════════════════════════════════════════════════════════ */
const Storage = {
  load() {
    try {
      transactions = JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions)) || [];
      budgetLimit  = parseFloat(localStorage.getItem(STORAGE_KEYS.budget)) || 0;
    } catch {
      transactions = [];
      budgetLimit  = 0;
    }
  },
  saveTransactions() {
    localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions));
  },
  saveBudget() {
    localStorage.setItem(STORAGE_KEYS.budget, String(budgetLimit));
  },
  getTheme() {
    return localStorage.getItem(STORAGE_KEYS.theme) || 'light';
  },
  saveTheme(theme) {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  },
};

/* ══════════════════════════════════════════════════════════════
   MODULE: FORMAT
══════════════════════════════════════════════════════════════ */
const Format = {
  /** 200000 → "Rp 200.000" */
  rupiah(amount) {
    return 'Rp\u00a0' + Math.abs(amount).toLocaleString('id-ID');
  },
  /** "2026-05-30" → "30 Mei 2026" */
  date(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr + 'T00:00:00')
      .toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  /** "2026-05-30" → "Mei 26" */
  monthLabel(dateStr) {
    return new Date(dateStr + 'T00:00:00')
      .toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
  },
  /** Escape HTML to prevent XSS */
  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },
  /** "200.000" → 200000 */
  parseMasked(display) {
    return parseInt(String(display).replace(/\./g, '').replace(/,/g, ''), 10) || 0;
  },
  /** "200000" → "200.000" */
  maskNumber(raw) {
    const digits = String(raw).replace(/\D/g, '');
    return digits ? parseInt(digits, 10).toLocaleString('id-ID') : '';
  },
};

/* ══════════════════════════════════════════════════════════════
   MODULE: NUMBER MASK
   Attaches live "200.000" formatting to a text input.
   Preserves cursor position so editing in the middle of a
   number (e.g. deleting the "3" in "230.000") works naturally.
══════════════════════════════════════════════════════════════ */
const NumberMask = {
  /**
   * Count how many digit characters appear before position `pos`
   * in the given string. Used to track "logical" cursor position
   * across reformats that add/remove thousand separators.
   */
  _digitsBeforePos(str, pos) {
    let count = 0;
    for (let i = 0; i < pos; i++) {
      if (/\d/.test(str[i])) count++;
    }
    return count;
  },

  /**
   * Find the position in `formatted` string such that exactly
   * `digitCount` digits appear before it.
   */
  _posAfterDigits(formatted, digitCount) {
    let count = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (count === digitCount) return i;
      if (/\d/.test(formatted[i])) count++;
    }
    return formatted.length;
  },

  attach(input) {
    const reformat = () => {
      const raw        = input.value;
      const cursorPos  = input.selectionStart ?? raw.length;

      // How many digits are to the LEFT of the cursor before reformat
      const digitsLeft = this._digitsBeforePos(raw, cursorPos);

      const masked  = Format.maskNumber(raw);
      const numeric = Format.parseMasked(masked);

      // Only update value if it actually changed (avoids unnecessary cursor jumps)
      if (input.value !== masked) {
        input.value = masked;

        // Restore cursor: find position in new string where same number
        // of digits appear to the left
        const newPos = this._posAfterDigits(masked, digitsLeft);
        input.setSelectionRange(newPos, newPos);
      }

      input.dataset.raw = numeric > 0 ? String(numeric) : '';
    };

    input.addEventListener('input', reformat);
    input.addEventListener('paste', () => setTimeout(reformat, 0));
  },
};

/* ══════════════════════════════════════════════════════════════
   MODULE: TOAST
══════════════════════════════════════════════════════════════ */
const Toast = (() => {
  let timer = null;
  return {
    show(msg, duration = 2800) {
      DOM.toast.textContent = msg;
      DOM.toast.classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(() => DOM.toast.classList.remove('show'), duration);
    },
  };
})();

/* ══════════════════════════════════════════════════════════════
   MODULE: VALIDATION
══════════════════════════════════════════════════════════════ */
const Validation = {
  setError(field, msg) {
    field.parentElement.querySelector('.field-error')?.remove();
    if (msg) {
      field.classList.add('input--error');
      const el = document.createElement('p');
      el.className   = 'field-error';
      el.textContent = msg;
      const anchor = field.closest('.input-wrap') || field.closest('.select-wrap') || field;
      anchor.insertAdjacentElement('afterend', el);
    } else {
      field.classList.remove('input--error');
    }
  },
  clearAll() {
    DOM.transactionForm.querySelectorAll('.field-error').forEach(el => el.remove());
    DOM.transactionForm.querySelectorAll('.input--error').forEach(el => el.classList.remove('input--error'));
  },
  /** Returns { valid, data } */
  validateForm() {
    this.clearAll();
    const name     = DOM.txName.value.trim();
    const amount   = Format.parseMasked(DOM.txAmount.value);
    const category = DOM.txCategory.value;
    const type     = DOM.txType.value;
    const date     = DOM.txDate.value;
    let valid      = true;

    if (!name)            { this.setError(DOM.txName, 'Nama item wajib diisi');        valid = false; }
    else if (name.length < 2) { this.setError(DOM.txName, 'Nama item minimal 2 karakter'); valid = false; }

    if (!DOM.txAmount.value.trim()) { this.setError(DOM.txAmount, 'Jumlah wajib diisi');          valid = false; }
    else if (amount <= 0)           { this.setError(DOM.txAmount, 'Jumlah harus lebih dari 0');    valid = false; }
    else if (amount > 999_999_999_999) { this.setError(DOM.txAmount, 'Jumlah terlalu besar');      valid = false; }

    if (!category) { this.setError(DOM.txCategory, 'Pilih kategori terlebih dahulu'); valid = false; }
    if (!date)     { this.setError(DOM.txDate,     'Tanggal wajib diisi');             valid = false; }

    return valid ? { valid: true, data: { name, amount, category, type, date } } : { valid: false, data: null };
  },
};

/* ══════════════════════════════════════════════════════════════
   MODULE: TRANSACTIONS
   Pure data operations — no DOM side-effects
══════════════════════════════════════════════════════════════ */
const Transactions = {
  /** Build a new transaction object */
  create({ name, amount, category, type, date }) {
    return { id: crypto.randomUUID(), name, amount, category, type, date, createdAt: Date.now() };
  },

  /** Add and persist */
  add(tx) {
    transactions.push(tx);
    Storage.saveTransactions();
  },

  /** Remove by id and persist */
  remove(id) {
    transactions = transactions.filter(t => t.id !== id);
    Storage.saveTransactions();
  },

  /** Remove all and persist */
  clear() {
    transactions = [];
    Storage.saveTransactions();
  },

  /** Compute summary totals */
  getTotals() {
    const income   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense  = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const spending = transactions.reduce((s, t) => s + t.amount, 0);
    return { income, expense, balance: income - expense, spending };
  },

  /** Filter by type + category */
  filter(typeFilter, catFilter) {
    return transactions.filter(t => {
      const matchType = typeFilter === 'all' || t.type === typeFilter;
      const matchCat  = catFilter  === 'all' || t.category === catFilter;
      return matchType && matchCat;
    });
  },

  /** Sort an array of transactions by sortKey */
  sort(list, sortKey) {
    const sorted = [...list];
    switch (sortKey) {
      case 'date-desc':     return sorted.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
      case 'date-asc':      return sorted.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
      case 'amount-desc':   return sorted.sort((a, b) => b.amount - a.amount);
      case 'amount-asc':    return sorted.sort((a, b) => a.amount - b.amount);
      case 'category-asc':  return sorted.sort((a, b) => a.category.localeCompare(b.category));
      case 'category-desc': return sorted.sort((a, b) => b.category.localeCompare(a.category));
      default:              return sorted;
    }
  },

  /** Unique sorted categories from current transactions */
  getCategories() {
    return [...new Set(transactions.map(t => t.category))].sort();
  },
};

/* ══════════════════════════════════════════════════════════════
   MODULE: SUMMARY UI
══════════════════════════════════════════════════════════════ */
const SummaryUI = {
  update() {
    const { income, expense, balance, spending } = Transactions.getTotals();
    DOM.totalIncome.textContent   = Format.rupiah(income);
    DOM.totalExpense.textContent  = Format.rupiah(expense);
    DOM.totalBalance.textContent  = Format.rupiah(balance);
    DOM.totalSpending.textContent = Format.rupiah(spending);

    DOM.totalBalance.style.color =
      balance < 0   ? 'var(--c-red-light)'
      : balance === 0 ? 'rgba(255,255,255,0.65)'
      :                 '#fff';
  },
};

/* ══════════════════════════════════════════════════════════════
   MODULE: BUDGET UI
   Progress bar + warning banner
══════════════════════════════════════════════════════════════ */
const BudgetUI = {
  update() {
    const expense = Transactions.getTotals().expense;

    if (budgetLimit <= 0) {
      DOM.budgetProgress.style.width      = '0%';
      DOM.budgetProgress.className        = 'progress-fill';
      DOM.budgetProgressLabel.textContent = 'Belum ada batas budget';
      this._hideWarning();
      return;
    }

    // Real percentage — can exceed 100%
    const realPct  = (expense / budgetLimit) * 100;
    // Bar capped at 100% visually
    const barPct   = Math.min(realPct, 100);

    DOM.budgetProgress.style.width = barPct + '%';

    // Narasi yang benar — tampilkan persentase aktual, bukan yang di-cap
    DOM.budgetProgressLabel.textContent =
      `${realPct.toFixed(0)}% terpakai · ${Format.rupiah(expense)} dari budget yang ditentukan sebesar ${Format.rupiah(budgetLimit)}`;

    // Progress bar colour
    DOM.budgetProgress.classList.remove('warn', 'over');
    if (realPct >= BUDGET_OVER_PCT)     DOM.budgetProgress.classList.add('over');
    else if (realPct >= BUDGET_WARN_PCT) DOM.budgetProgress.classList.add('warn');

    // Warning banner
    this._updateWarning(realPct, expense);
  },

  _updateWarning(pct, expense) {
    const el = DOM.budgetWarning;
    if (pct < BUDGET_WARN_PCT) { this._hideWarning(); return; }

    const isOver = pct >= BUDGET_OVER_PCT;
    el.className = `budget-warning visible budget-warning--${isOver ? 'over' : 'warn'}`;

    const icon  = isOver ? '🚨' : '⚠️';
    const title = isOver
      ? 'Budget Terlampaui!'
      : 'Peringatan: Mendekati Batas Budget';
    const body  = isOver
      ? `Pengeluaran kamu (${Format.rupiah(expense)}) sudah melebihi budget ${Format.rupiah(budgetLimit)}. Pertimbangkan untuk mengurangi pengeluaran.`
      : `Pengeluaran kamu sudah mencapai ${pct.toFixed(0)}% dari budget ${Format.rupiah(budgetLimit)}. Sisa budget: ${Format.rupiah(budgetLimit - expense)}.`;

    el.innerHTML = `
      <span class="budget-warning__icon">${icon}</span>
      <span class="budget-warning__text">
        <strong class="budget-warning__title">${title}</strong>
        ${Format.escapeHtml(body)}
      </span>`;
  },

  _hideWarning() {
    DOM.budgetWarning.className = 'budget-warning';
    DOM.budgetWarning.innerHTML = '';
  },
};

/* ══════════════════════════════════════════════════════════════
   MODULE: TRANSACTION LIST UI
══════════════════════════════════════════════════════════════ */
const TransactionListUI = {
  /** Build a single <li> element for a transaction */
  _buildItem(tx) {
    const li          = document.createElement('li');
    li.className      = 'tx-item';
    li.dataset.id     = tx.id;

    const icon        = CATEGORY_ICONS[tx.category] || '📦';
    const sign        = tx.type === 'income' ? '+' : '−';
    const amtClass    = `tx-item__amount--${tx.type}`;
    const avatarClass = `tx-item__avatar--${tx.type}`;
    const name        = Format.escapeHtml(tx.name || tx.desc || '—');

    li.innerHTML = `
      <div class="tx-item__avatar ${avatarClass}" aria-hidden="true">${icon}</div>
      <div class="tx-item__info">
        <div class="tx-item__desc">${name}</div>
        <div class="tx-item__meta">
          <span>${Format.escapeHtml(tx.category)}</span>
          <span class="tx-item__meta-dot"></span>
          <span>${Format.date(tx.date)}</span>
        </div>
      </div>
      <div class="tx-item__right">
        <span class="tx-item__amount ${amtClass}">${sign}${Format.rupiah(tx.amount)}</span>
        <button class="tx-item__delete" data-id="${tx.id}"
          title="Hapus transaksi" aria-label="Hapus ${name}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>`;
    return li;
  },

  render() {
    const filtered = Transactions.filter(DOM.filterType.value, DOM.filterCategory.value);
    const sorted   = Transactions.sort(filtered, DOM.sortBy.value);
    DOM.txList.innerHTML = '';

    if (sorted.length === 0) {
      DOM.emptyState.classList.add('visible');
      return;
    }
    DOM.emptyState.classList.remove('visible');
    sorted.forEach(tx => DOM.txList.appendChild(this._buildItem(tx)));
  },

  updateCategoryFilter() {
    const categories = Transactions.getCategories();
    const current    = DOM.filterCategory.value;
    DOM.filterCategory.innerHTML = '<option value="all">Semua Kategori</option>';
    categories.forEach(cat => {
      const opt       = document.createElement('option');
      opt.value       = cat;
      opt.textContent = (CATEGORY_ICONS[cat] || '📦') + ' ' + cat;
      DOM.filterCategory.appendChild(opt);
    });
    if (categories.includes(current)) DOM.filterCategory.value = current;
  },

  /** Animate item out, then remove from data + re-render */
  removeWithAnimation(id) {
    const li = DOM.txList.querySelector(`[data-id="${id}"]`);
    if (li) {
      li.classList.add('tx-item--removing');
      setTimeout(() => {
        Transactions.remove(id);
        renderAll();
        Toast.show('🗑️ Transaksi dihapus');
      }, 220);
    } else {
      Transactions.remove(id);
      renderAll();
      Toast.show('🗑️ Transaksi dihapus');
    }
  },
};

/* ══════════════════════════════════════════════════════════════
   MODULE: CHARTS
══════════════════════════════════════════════════════════════ */
const Charts = {
  _colors(count) {
    return Array.from({ length: count }, (_, i) => CHART_PALETTE[i % CHART_PALETTE.length]);
  },

  _theme() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    return {
      isDark,
      text:    isDark ? '#f1f3fb' : '#111827',
      grid:    isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
      surface: isDark ? '#1e2235' : '#ffffff',
    };
  },

  _toggleEmpty(id, isEmpty) {
    getEl(id)?.classList.toggle('visible', isEmpty);
  },

  updateDoughnut() {
    const catMap = {};
    transactions
      .filter(t => t.type === 'expense')
      .forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + t.amount; });

    const labels = Object.keys(catMap);
    const data   = Object.values(catMap);
    const colors = this._colors(labels.length);
    const { isDark, text, surface } = this._theme();

    this._toggleEmpty('chartDoughnutEmpty', labels.length === 0);

    if (chartDoughnut) {
      chartDoughnut.data.labels                         = labels;
      chartDoughnut.data.datasets[0].data               = data;
      chartDoughnut.data.datasets[0].backgroundColor    = colors;
      chartDoughnut.data.datasets[0].borderColor        = surface;
      chartDoughnut.options.plugins.legend.labels.color = text;
      chartDoughnut.update();
      return;
    }

    chartDoughnut = new Chart(getEl('chartDoughnut'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 3, borderColor: surface, hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { color: text, font: { size: 11 }, padding: 10, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
          tooltip: { callbacks: { label: ctx => `  ${ctx.label}: ${Format.rupiah(ctx.raw)}` } },
        },
      },
    });
  },

  updateBar() {
    const monthMap = {};
    transactions.forEach(t => {
      const label = Format.monthLabel(t.date);
      if (!monthMap[label]) monthMap[label] = { income: 0, expense: 0, _date: t.date };
      monthMap[label][t.type] += t.amount;
    });

    const keys     = Object.keys(monthMap).sort((a, b) => new Date(monthMap[a]._date) - new Date(monthMap[b]._date)).slice(-6);
    const incomes  = keys.map(k => monthMap[k].income);
    const expenses = keys.map(k => monthMap[k].expense);
    const { text, grid } = this._theme();

    this._toggleEmpty('chartBarEmpty', keys.length === 0);

    if (chartBar) {
      chartBar.data.labels                         = keys;
      chartBar.data.datasets[0].data               = incomes;
      chartBar.data.datasets[1].data               = expenses;
      chartBar.options.scales.x.ticks.color        = text;
      chartBar.options.scales.y.ticks.color        = text;
      chartBar.options.scales.x.grid.color         = grid;
      chartBar.options.scales.y.grid.color         = grid;
      chartBar.options.plugins.legend.labels.color = text;
      chartBar.update();
      return;
    }

    chartBar = new Chart(getEl('chartBar'), {
      type: 'bar',
      data: {
        labels: keys,
        datasets: [
          { label: 'Pemasukan',   data: incomes,  backgroundColor: 'rgba(16,185,129,0.82)', borderRadius: 5, borderSkipped: false },
          { label: 'Pengeluaran', data: expenses, backgroundColor: 'rgba(239,68,68,0.82)',  borderRadius: 5, borderSkipped: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: text, font: { size: 11 }, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
          tooltip: { callbacks: { label: ctx => `  ${ctx.dataset.label}: ${Format.rupiah(ctx.raw)}` } },
        },
        scales: {
          x: { ticks: { color: text, font: { size: 10 }, maxRotation: 0 }, grid: { color: grid } },
          y: {
            ticks: {
              color: text, font: { size: 10 }, maxTicksLimit: 5,
              callback: v => v === 0 ? '0' : v >= 1_000_000 ? (v/1_000_000).toFixed(1)+'jt' : (v/1_000).toFixed(0)+'rb',
            },
            grid: { color: grid },
          },
        },
      },
    });
  },

  destroyAll() {
    if (chartDoughnut) { chartDoughnut.destroy(); chartDoughnut = null; }
    if (chartBar)      { chartBar.destroy();      chartBar      = null; }
  },
};

/* ══════════════════════════════════════════════════════════════
   MODULE: THEME
══════════════════════════════════════════════════════════════ */
const Theme = {
  apply(theme) {
    document.documentElement.dataset.theme = theme;
    const iconEl = DOM.btnToggleTheme.querySelector('.theme-toggle__icon') || DOM.btnToggleTheme;
    iconEl.textContent = theme === 'dark' ? '☀️' : '🌙';
    Storage.saveTheme(theme);
    Charts.destroyAll();
    Charts.updateDoughnut();
    Charts.updateBar();
  },
  toggle() {
    const current = document.documentElement.dataset.theme || 'light';
    this.apply(current === 'dark' ? 'light' : 'dark');
  },
  init() {
    this.apply(Storage.getTheme());
  },
};

/* ══════════════════════════════════════════════════════════════
   ORCHESTRATOR: renderAll
   Single entry point that refreshes every UI section
══════════════════════════════════════════════════════════════ */
function renderAll() {
  SummaryUI.update();
  BudgetUI.update();
  TransactionListUI.updateCategoryFilter();
  TransactionListUI.render();
  Charts.updateDoughnut();
  Charts.updateBar();
}

/* ══════════════════════════════════════════════════════════════
   EVENT HANDLERS
══════════════════════════════════════════════════════════════ */

/* ── Form submit ── */
DOM.transactionForm.addEventListener('submit', e => {
  e.preventDefault();
  const { valid, data } = Validation.validateForm();
  if (!valid) {
    DOM.transactionForm.querySelector('.input--error')?.focus();
    return;
  }
  const tx = Transactions.create(data);
  Transactions.add(tx);
  renderAll();
  resetForm();
  Toast.show(`✅ "${Format.escapeHtml(tx.name)}" ditambahkan`);
  DOM.txList.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

function resetForm() {
  DOM.txName.value          = '';
  DOM.txAmount.value        = '';
  DOM.txAmount.dataset.raw  = '';
  DOM.txCategory.value      = 'Makanan';
  getAll('input[name="txTypeRadio"]').forEach(r => { r.checked = r.value === 'expense'; });
  DOM.txType.value = 'expense';
  Validation.clearAll();
}

/* ── Live validation clear ── */
DOM.txName.addEventListener('input',     () => Validation.setError(DOM.txName, ''));
DOM.txAmount.addEventListener('input',   () => Validation.setError(DOM.txAmount, ''));
DOM.txDate.addEventListener('input',     () => Validation.setError(DOM.txDate, ''));
DOM.txCategory.addEventListener('change',() => Validation.setError(DOM.txCategory, ''));

/* ── Type radio sync ── */
getAll('input[name="txTypeRadio"]').forEach(radio => {
  radio.addEventListener('change', () => { DOM.txType.value = radio.value; });
});

/* ── Delete single ── */
DOM.txList.addEventListener('click', e => {
  const btn = e.target.closest('.tx-item__delete');
  if (!btn) return;
  const tx = transactions.find(t => t.id === btn.dataset.id);
  if (!tx) return;
  if (!confirm(`Hapus "${tx.name || tx.desc}"?`)) return;
  TransactionListUI.removeWithAnimation(tx.id);
});

/* ── Clear all ── */
DOM.btnClearAll.addEventListener('click', () => {
  if (transactions.length === 0) { Toast.show('Tidak ada transaksi untuk dihapus'); return; }
  if (!confirm('Hapus SEMUA transaksi? Tindakan ini tidak bisa dibatalkan.')) return;
  Transactions.clear();
  renderAll();
  Toast.show('🗑️ Semua transaksi dihapus');
});

/* ── Set budget ── */
DOM.btnSetBudget.addEventListener('click', () => {
  const val = Format.parseMasked(DOM.budgetLimitInput.value);
  if (!DOM.budgetLimitInput.value.trim() || val < 0) {
    Toast.show('⚠️ Masukkan nilai budget yang valid');
    DOM.budgetLimitInput.focus();
    return;
  }
  budgetLimit = val;
  Storage.saveBudget();
  BudgetUI.update();
  Toast.show(`🎯 Budget diset ke ${Format.rupiah(val)}`);
});

/* ── Filters + Sort ── */
DOM.filterType.addEventListener('change',     () => TransactionListUI.render());
DOM.filterCategory.addEventListener('change', () => TransactionListUI.render());
DOM.sortBy.addEventListener('change',         () => TransactionListUI.render());

/* ── Theme toggle ── */
DOM.btnToggleTheme.addEventListener('click', () => Theme.toggle());

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
function init() {
  Storage.load();

  // Theme (must come before charts)
  const savedTheme = Storage.getTheme();
  document.documentElement.dataset.theme = savedTheme;
  const iconEl = DOM.btnToggleTheme.querySelector('.theme-toggle__icon') || DOM.btnToggleTheme;
  iconEl.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

  // Restore budget input with mask
  if (budgetLimit > 0) {
    DOM.budgetLimitInput.value       = budgetLimit.toLocaleString('id-ID');
    DOM.budgetLimitInput.dataset.raw = String(budgetLimit);
  }

  // Attach number masks
  NumberMask.attach(DOM.txAmount);
  NumberMask.attach(DOM.budgetLimitInput);

  // Default date to today
  DOM.txDate.value = new Date().toISOString().split('T')[0];

  renderAll();
}

init();
