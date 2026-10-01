// ============================================================
// Shop Profit Report — Thuku Enterprise
// Style: Lorry Profit Report (KPIs, ledger summary, expenses, sales list)
// ============================================================
let currentStaff = null;
let period = 'daily';
let isAdmin = false;

const $ = (id) => document.getElementById(id);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (v) => 'Ksh ' + Math.round(num(v)).toLocaleString('en-KE');
const plain = (v) => Math.round(num(v)).toLocaleString('en-KE');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ymd(d) {
  const x = new Date(d);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}

// ---------- date range for the chosen period (local time) ----------
function getRange() {
  const v = $('report-date').value || ymd(new Date());
  const [y, m, d] = v.split('-').map(Number);
  let start = new Date(y, m - 1, d, 0, 0, 0, 0);
  let end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);

  if (period === 'weekly') {
    const dow = (start.getDay() + 6) % 7;            // Monday = 0
    start = new Date(y, m - 1, d - dow);
    end = new Date(y, m - 1, d - dow + 7);
  } else if (period === 'monthly') {
    start = new Date(y, m - 1, 1);
    end = new Date(y, m, 1);
  }
  const last = new Date(end.getTime() - 1);
  return { start, end, startDay: ymd(start), endDay: ymd(last) };
}

function updateRangeLabel() {
  const r = getRange();
  $('report-date-label').textContent =
    period === 'daily' ? 'Date' : period === 'weekly' ? 'Any date in the week' : 'Any date in the month';
  $('range-label').textContent = period === 'daily'
    ? '' : 'Showing ' + r.startDay + ' to ' + r.endDay;
}

// ============================================================
// LOAD REPORT
// ============================================================
async function loadReport() {
  updateRangeLabel();
  const { start, end, startDay, endDay } = getRange();
  const dept = $('report-department').value;

  $('ledger').innerHTML = '<div class="empty">Loading…</div>';

  // sale lines + their sale + product cost
  const { data: lines, error } = await supabaseClient
    .from('sale_items')
    .select(`
      id, sale_id, product_id, unit_price, quantity,
      products ( name, cost, department ),
      sales!inner ( id, created_at, status, payment_method, customer_name, total_amount, discount_amount, markup_amount )
    `)
    .gte('sales.created_at', start.toISOString())
    .lt('sales.created_at', end.toISOString())
    .eq('sales.status', 'completed')
    .limit(5000);

  if (error) {
    $('ledger').innerHTML = '<div class="empty">Could not load report: ' + esc(error.message) + '</div>';
    return;
  }

  const rows = (lines || []).filter(l => !dept || (l.products?.department || '') === dept);

  // ----- group by product + selling price -----
  const groups = new Map();
  let revenueLines = 0, cost = 0, items = 0;
  const saleIds = new Set();

  for (const l of rows) {
    const q = num(l.quantity), price = num(l.unit_price), unitCost = num(l.products?.cost);
    const name = l.products?.name || 'Unknown product';
    const key = l.product_id + '|' + price + '|' + unitCost;
    const g = groups.get(key) || { name, qty: 0, price, unitCost };
    g.qty += q;
    groups.set(key, g);
    revenueLines += q * price;
    cost += q * unitCost;
    items += q;
    saleIds.add(l.sale_id);
  }

  // Revenue = what customers actually paid (includes discounts/markup).
  // With a department filter we can only use the item lines.
  let revenue = revenueLines, adj = 0;
  if (!dept) {
    const seen = new Map();
    for (const l of rows) seen.set(l.sale_id, l.sales);
    revenue = 0; let disc = 0, mark = 0;
    seen.forEach(s => { revenue += num(s.total_amount); disc += num(s.discount_amount); mark += num(s.markup_amount); });
    adj = revenue - revenueLines;
    groups.discount = disc; groups.markup = mark;
  }
  $('dept-note').style.display = dept ? 'block' : 'none';

  const profit = revenue - cost;

  // ----- expenses -----
  const expenses = await loadExpenses(startDay, endDay);
  const expTotal = expenses.reduce((a, e) => a + num(e.amount), 0);
  const net = profit - expTotal;

  // ----- KPIs -----
  $('k-revenue').textContent = money(revenue);
  $('k-cost').textContent = money(cost);
  $('k-items').textContent = plain(items);
  $('k-profit').textContent = money(profit);
  $('k-expenses').textContent = money(expTotal);
  $('k-net').textContent = money(net);
  $('k-profit').className = 'k-value ' + (profit >= 0 ? 'good' : 'bad');
  $('k-net').className = 'k-value ' + (net >= 0 ? 'good' : 'bad');

  renderLedger([...groups.values()], { revenue, cost, items, profit, adj, startDay, endDay });
  renderSales(rows);
  renderExpenses(expenses);
}

// ============================================================
// LEDGER SUMMARY (monospace)
// ============================================================
function renderLedger(list, t) {
  if (!list.length) {
    $('ledger').innerHTML = '<div class="empty">No sales for this period.</div>';
    return;
  }
  list.sort((a, b) => a.name.localeCompare(b.name));

  const title = t.startDay === t.endDay ? t.startDay : t.startDay + ' to ' + t.endDay;
  const row = (g) =>
    '<div class="l-row"><span>– ' + esc(g.name) + '</span>' +
    '<span>' + plain(g.qty) + ' x ' + plain(g.price) + '<span class="arrow">→</span>' + plain(g.qty * g.price) + '</span>' +
    '<span>' + plain(g.qty) + ' x ' + plain(g.unitCost) + '<span class="arrow">→</span>' + plain(g.qty * g.unitCost) + '</span></div>';

  let html = '<div class="ledger-title">Summary ' + esc(title) + '</div>' +
    '<div class="l-row head"><span>Product</span><span>Sold (qty x price)</span><span>Cost (qty x cost)</span></div>' +
    list.map(row).join('');

  if (Math.abs(t.adj) >= 1) {
    html += '<div class="l-row adj"><span>– Discounts / markup</span><span>' +
      (t.adj > 0 ? '+' : '−') + plain(Math.abs(t.adj)) + '</span><span></span></div>';
  }

  html += '<div class="l-totals"><div class="l-row"><span>' + plain(t.items) + ' total</span>' +
    '<span class="num">' + plain(t.revenue) + '</span><span class="num">' + plain(t.cost) + '</span></div>' +
    '<div class="l-row l-profit"><span></span><span>' + plain(t.profit) + '</span><span></span></div></div>';

  $('ledger').innerHTML = html;
}

// ============================================================
// SALES LIST (one delete per sale)
// ============================================================
function renderSales(rows) {
  const body = $('sales-table');
  if (!rows.length) { body.innerHTML = '<tr><td colspan="8" class="empty">No sales for this period.</td></tr>'; return; }

  rows.sort((a, b) => new Date(b.sales.created_at) - new Date(a.sales.created_at));
  const shown = new Set();

  body.innerHTML = rows.map(l => {
    const s = l.sales, first = !shown.has(l.sale_id);
    shown.add(l.sale_id);
    const t = new Date(s.created_at);
    const time = period === 'daily'
      ? t.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false })
      : t.toLocaleDateString('en-KE', { day: '2-digit', month: 'short' }) + ' ' +
        t.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false });
    return '<tr>' +
      '<td>' + time + '</td>' +
      '<td>' + esc(l.products?.name || 'Unknown product') + '</td>' +
      '<td class="num">' + plain(l.quantity) + '</td>' +
      '<td class="num">' + money(l.unit_price) + '</td>' +
      '<td class="num">' + money(num(l.unit_price) * num(l.quantity)) + '</td>' +
      '<td>' + esc(s.customer_name || 'Walk-in') + '</td>' +
      '<td>' + esc(s.payment_method || '') + '</td>' +
      '<td>' + (first && isAdmin
        ? '<button type="button" class="secondary" onclick="deleteSale(\'' + s.id + '\')">Delete</button>' : '') + '</td>' +
      '</tr>';
  }).join('');
}

// Delete = void the sale and put the stock back.
async function deleteSale(saleId) {
  const ok = await confirmDialog('Delete this whole sale? The stock will be put back and it will be removed from the report.');
  if (!ok) return;

  const { data: items, error: e1 } = await supabaseClient
    .from('sale_items').select('product_id, quantity').eq('sale_id', saleId);
  if (e1) { alert('Could not read the sale: ' + e1.message); return; }

  const { error: e2 } = await supabaseClient.from('sales').update({ status: 'void' }).eq('id', saleId);
  if (e2) { alert('Could not delete the sale: ' + e2.message); return; }

  for (const it of items || []) {
    const { data: p } = await supabaseClient.from('products').select('stock_quantity').eq('id', it.product_id).single();
    if (p) {
      await supabaseClient.from('products')
        .update({ stock_quantity: num(p.stock_quantity) + num(it.quantity) }).eq('id', it.product_id);
    }
  }
  loadReport();
}

// ============================================================
// EXPENSES  (table: shop_expenses — see migration_shop_expenses.sql)
// ============================================================
let expensesAvailable = true;

async function loadExpenses(startDay, endDay) {
  const { data, error } = await supabaseClient
    .from('shop_expenses').select('*')
    .gte('expense_date', startDay).lte('expense_date', endDay)
    .order('created_at', { ascending: false });

  if (error) {
    expensesAvailable = false;
    $('exp-error').style.display = 'block';
    $('exp-error').textContent =
      'Expenses are not set up yet. Run migration_shop_expenses.sql in the Supabase SQL Editor, then refresh.';
    return [];
  }
  expensesAvailable = true;
  $('exp-error').style.display = 'none';
  return data || [];
}

function renderExpenses(list) {
  if (!list.length) { $('exp-list').innerHTML = '<div class="empty">No expenses recorded for this period.</div>'; return; }
  $('exp-list').innerHTML = '<table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="num">Amount</th><th></th></tr></thead><tbody>' +
    list.map(e =>
      '<tr><td>' + esc(e.expense_date) + '</td><td>' + esc(e.category || '') + '</td><td>' + esc(e.description || '') +
      '</td><td class="num">' + money(e.amount) + '</td><td>' +
      (isAdmin ? '<button type="button" class="secondary" onclick="deleteExpense(\'' + e.id + '\')">Delete</button>' : '') +
      '</td></tr>').join('') + '</tbody></table>';
}

async function addExpense() {
  const amount = num($('exp-amount').value);
  if (!expensesAvailable) { alert('Expenses are not set up yet. Run migration_shop_expenses.sql first.'); return; }
  if (amount <= 0) { alert('Enter an amount greater than 0.'); return; }

  const { error } = await supabaseClient.from('shop_expenses').insert({
    expense_date: $('report-date').value || ymd(new Date()),
    category: $('exp-category').value,
    description: $('exp-desc').value.trim() || null,
    amount,
    created_by: currentStaff.id
  });
  if (error) { alert('Could not save expense: ' + error.message); return; }

  $('exp-desc').value = ''; $('exp-amount').value = '';
  loadReport();
}

async function deleteExpense(id) {
  const ok = await confirmDialog('Delete this expense?');
  if (!ok) return;
  const { error } = await supabaseClient.from('shop_expenses').delete().eq('id', id);
  if (error) { alert('Could not delete: ' + error.message); return; }
  loadReport();
}

// ============================================================
// NAV + INIT
// ============================================================
function renderNav(role) {
  const tabs = [{ href: 'pos.html', label: 'POS' }];
  if (role === 'admin') tabs.push(
    { href: 'inventory.html', label: 'Inventory' }, { href: 'dashboard.html', label: 'Dashboard' },
    { href: 'staff.html', label: 'Staff' }, { href: 'reports.html', label: 'Reports' });
  if (role === 'owner') tabs.push(
    { href: 'dashboard.html', label: 'Dashboard' }, { href: 'reports.html', label: 'Reports' });
  const nav = $('nav-tabs'); if (!nav) return;
  const cur = (location.pathname.split('/').pop() || 'pos.html').toLowerCase();
  nav.innerHTML = tabs.map(t => '<a href="' + t.href + '" class="' + (t.href === cur ? 'active' : '') + '">' + t.label + '</a>').join('');
}

(async function init() {
  try {
    currentStaff = await requireAuth(['admin', 'owner']);
    if (!currentStaff) return;
    isAdmin = currentStaff.role === 'admin';
    renderNav(currentStaff.role);
    $('staff-name').textContent = (currentStaff.full_name || 'Staff') + ' (' + currentStaff.role + ')';

    $('report-date').value = ymd(new Date());
    $('report-date').addEventListener('change', loadReport);
    $('report-department').addEventListener('change', loadReport);
    $('exp-add').addEventListener('click', addExpense);
    document.querySelectorAll('.period-tabs button').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('.period-tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); period = b.dataset.period; loadReport();
    }));
    loadReport();
  } catch (e) { console.error('Reports init failed:', e); }
})();
