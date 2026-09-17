// ============================================================
// Reports page logic — daily sales report generation
// ============================================================
let currentStaffReports = null;

(async () => {
  currentStaffReports = await requireAuth(['admin','owner']);
  if (!currentStaffReports) return;
  document.getElementById('staff-name').textContent = `${currentStaffReports.full_name} (${currentStaffReports.role})`;
  renderReportsNav(currentStaffReports.role);

  // Default the date picker to today
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('report-date').value = `${yyyy}-${mm}-${dd}`;

  await loadDailyReport();
})();

function renderReportsNav(role) {
  const tabs = [{ href: 'pos.html', label: 'POS' }];
  if (role === 'admin') tabs.push({ href: 'inventory.html', label: 'Inventory' });
  tabs.push({ href: 'dashboard.html', label: 'Dashboard' });
  if (role === 'admin') tabs.push({ href: 'staff.html', label: 'Staff' });
  tabs.push({ href: 'reports.html', label: 'Reports' });
  document.getElementById('nav-tabs').innerHTML = tabs.map(t =>
    `<a href="${t.href}" class="${t.href === 'reports.html' ? 'active' : ''}">${t.label}</a>`
  ).join('');
}

// "YYYY-MM-DD" -> "D/M/YYYY", matching the ledger's handwritten date style
function formatLedgerDate(isoDay) {
  const [y, m, d] = isoDay.split('-');
  return `${parseInt(d, 10)}/${parseInt(m, 10)}/${y}`;
}

async function loadDailyReport() {
  const dateInput = document.getElementById('report-date').value;
  if (!dateInput) { alert('Please select a date.'); return; }
  const deptFilter = document.getElementById('report-department').value;

  document.getElementById('dept-filter-note').style.display = deptFilter ? 'block' : 'none';

  const dayStart = new Date(dateInput + 'T00:00:00');
  const dayEnd = new Date(dateInput + 'T23:59:59.999');

  const { data: sales, error } = await supabaseClient
    .from('sales')
    .select('*, staff(full_name), sale_items(product_id, quantity, unit_price, products(name, cost, department))')
    .in('status', ['completed', 'refunded'])
    .gte('created_at', dayStart.toISOString())
    .lte('created_at', dayEnd.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    alert('Error loading report: ' + error.message);
    return;
  }

  let lossQuery = supabaseClient
    .from('stock_losses')
    .select('*')
    .gte('created_at', dayStart.toISOString())
    .lte('created_at', dayEnd.toISOString())
    .order('created_at', { ascending: false });
  if (deptFilter) lossQuery = lossQuery.eq('department', deptFilter);

  const { data: losses, error: lossError } = await lossQuery;
  if (lossError) console.error(lossError);

  renderReport(sales || [], deptFilter, dateInput);
  renderLosses(losses || []);
}

function renderReport(sales, deptFilter, dateInput) {
  const completedSales = sales.filter(s => s.status === 'completed');

  let transactions = 0;
  let revenue = 0;
  let itemsSold = 0;
  let totalDiscounts = 0;
  let totalMarkup = 0;
  let itemLevelProfit = 0;

  // Per-product ledger-style breakdown — grouped by product NAME (trimmed,
  // case-insensitive), using the department-filtered item set so it stays
  // consistent with the stat cards. Grouping by name (rather than
  // product_id) means the same size/type entered under different product
  // records still merges into a single ledger line.
  const byProduct = {};

  completedSales.forEach(s => {
    const items = s.sale_items || [];
    const relevantItems = deptFilter ? items.filter(i => i.products?.department === deptFilter) : items;
    if (!relevantItems.length) return; // sale has nothing from this department

    transactions += 1;

    const saleSubtotal = items.reduce((sum, i) => sum + Number(i.unit_price) * (i.quantity || 1), 0);
    const relevantSubtotal = relevantItems.reduce((sum, i) => sum + Number(i.unit_price) * (i.quantity || 1), 0);
    const share = saleSubtotal > 0 ? relevantSubtotal / saleSubtotal : 0;

    revenue += relevantSubtotal;
    itemsSold += relevantItems.reduce((sum, i) => sum + (i.quantity || 1), 0);

    // Discount/markup are recorded at the sale level, so when filtering to a
    // single department we prorate them by that department's share of the sale.
    totalDiscounts += Number(s.discount_amount || 0) * share;
    totalMarkup += Number(s.markup_amount || 0) * share;

    itemLevelProfit += relevantItems.reduce((sum, i) => {
      const cost = Number(i.products?.cost || 0);
      return sum + (Number(i.unit_price) - cost) * (i.quantity || 1);
    }, 0);

    relevantItems.forEach(i => {
      // Group by product name (trimmed, case-insensitive) so the same
      // size/type entered under different product IDs merges into one line.
      const name = i.products?.name || 'Unknown product';
      const key = name.trim().toLowerCase();
      const qty = Number(i.quantity || 1);
      const unitPrice = Number(i.unit_price || 0);
      const unitCost = Number(i.products?.cost || 0);
      if (!byProduct[key]) {
        byProduct[key] = { name: name.trim(), qty: 0, revenue: 0, cost: 0 };
      }
      byProduct[key].qty += qty;
      byProduct[key].revenue += qty * unitPrice;
      byProduct[key].cost += qty * unitCost;
    });
  });

  const averageSale = transactions > 0 ? revenue / transactions : 0;
  // Gross profit = item-level margin, adjusted for the actual discount given
  // and markup added on top of listed prices for this selection.
  const grossProfit = itemLevelProfit - totalDiscounts + totalMarkup;

  document.getElementById('total-sales').textContent = transactions;
  document.getElementById('total-revenue').textContent = `KSh ${Math.round(revenue).toLocaleString()}`;
  document.getElementById('items-sold').textContent = itemsSold;
  document.getElementById('average-sale').textContent = `KSh ${Math.round(averageSale).toLocaleString()}`;
  document.getElementById('total-discounts').textContent = `KSh ${Math.round(totalDiscounts).toLocaleString()}`;
  document.getElementById('total-markup').textContent = `KSh ${Math.round(totalMarkup).toLocaleString()}`;
  document.getElementById('total-profit').textContent = `KSh ${Math.round(grossProfit).toLocaleString()}`;

  renderProductSummary(byProduct, itemsSold, revenue, dateInput);

  const tbody = document.getElementById('sales-table');
  const visibleSales = deptFilter
    ? sales.filter(s => (s.sale_items || []).some(i => i.products?.department === deptFilter))
    : sales;

  if (!visibleSales.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:20px;">No sales for this date.</td></tr>';
    return;
  }

  tbody.innerHTML = visibleSales.map(s => {
    const receipt = s.mpesa_receipt || (s.payment_method === 'cash' ? 'CASH' : '—');
    const cashier = s.staff?.full_name || '—';
    const time = new Date(s.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    const isRefunded = s.status === 'refunded';
    return `
      <tr style="${isRefunded ? 'opacity:0.6;' : ''}">
        <td>${escapeHtmlReports(receipt)}</td>
        <td>${escapeHtmlReports(cashier)}</td>
        <td>KSh ${Number(s.total_amount).toLocaleString()}</td>
        <td>${escapeHtmlReports(s.payment_method)}</td>
        <td>${time}</td>
        <td>
          ${isRefunded
            ? '<span class="badge low">refunded</span>'
            : `<button class="danger" style="padding:4px 8px; font-size:0.75rem;" onclick='processRefund(${JSON.stringify(s.id)})'>Refund</button>`}
        </td>
      </tr>`;
  }).join('');
}

// Ledger-style per-product breakdown: "qty x sell → revenue" and
// "qty x cost → cost" side by side, matching the handwritten summary format.
function renderProductSummary(byProduct, itemsSold, revenue, dateInput) {
  const el = document.getElementById('product-summary');
  const products = Object.values(byProduct);

  if (!products.length) {
    el.innerHTML = '<div class="empty-state">No sales for this date.</div>';
    return;
  }

  const totalCost = products.reduce((sum, d) => sum + d.cost, 0);
  const totalRevenue = products.reduce((sum, d) => sum + d.revenue, 0);
  const profit = totalRevenue - totalCost;

  el.innerHTML = `
    <div class="ledger-summary">
      <div class="ledger-title">Summary ${formatLedgerDate(dateInput)}</div>
      ${products.map(d => {
        // Unit prices can vary sale-to-sale (discounts, price changes); the
        // line shows the average for readability, totals stay exact.
        const sellUnit = d.qty ? Math.round(d.revenue / d.qty) : 0;
        const costUnit = d.qty ? Math.round(d.cost / d.qty) : 0;
        return `
          <div class="ledger-line">
            <span class="ledger-label">- ${escapeHtmlReports(d.name)}</span>
            <span class="ledger-calc">${d.qty} x ${sellUnit.toLocaleString()}<span class="arrow">→</span>${Math.round(d.revenue).toLocaleString()}</span>
            <span class="ledger-calc">${d.qty} x ${costUnit.toLocaleString()}<span class="arrow">→</span>${Math.round(d.cost).toLocaleString()}</span>
          </div>`;
      }).join('')}
      <div class="ledger-totals">
        <span class="ledger-qty-total">${itemsSold} total</span>
        <span class="ledger-totals-num">${Math.round(totalRevenue).toLocaleString()}</span>
        <span class="ledger-totals-num">${Math.round(totalCost).toLocaleString()}</span>
      </div>
      <div class="ledger-profit-row">
        <span></span>
        <span class="ledger-profit-num" style="color:${profit >= 0 ? '#1a7f37' : '#c0392b'};">${Math.round(profit).toLocaleString()}</span>
        <span></span>
      </div>
    </div>
  `;
}

function renderLosses(losses) {
  const totalLossValue = losses.reduce((sum, l) => sum + Number(l.cost_value || 0), 0);
  document.getElementById('total-losses').textContent = `KSh ${Math.round(totalLossValue).toLocaleString()}`;

  const tbody = document.getElementById('losses-table');
  if (!losses.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:20px;">No losses recorded for this date.</td></tr>';
    return;
  }

  tbody.innerHTML = losses.map(l => {
    const time = new Date(l.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    return `
      <tr>
        <td>${escapeHtmlReports(l.product_name)}</td>
        <td style="font-size:0.8rem;">${escapeHtmlReports(l.department || '—')}</td>
        <td>${l.quantity}</td>
        <td>KSh ${Number(l.cost_value || 0).toLocaleString()}</td>
        <td>${escapeHtmlReports(l.reason || '—')}</td>
        <td>${time}</td>
      </tr>`;
  }).join('');
}

async function processRefund(saleId) {
  const reason = prompt('Reason for refund (optional):', '');
  if (reason === null) return;
  if (!confirm('Refund this sale and restock the items? This cannot be undone.')) return;

  const { data: sale, error: fetchError } = await supabaseClient
    .from('sales').select('*, sale_items(product_id, quantity)').eq('id', saleId).single();
  if (fetchError || !sale) { alert('Error loading sale: ' + (fetchError?.message || 'not found')); return; }

  // Restock each item
  for (const item of sale.sale_items || []) {
    const { data: product } = await supabaseClient
      .from('products').select('stock_quantity').eq('id', item.product_id).single();
    if (product) {
      await supabaseClient.from('products')
        .update({ stock_quantity: product.stock_quantity + item.quantity })
        .eq('id', item.product_id);
    }
  }

  const { error: updateError } = await supabaseClient
    .from('sales')
    .update({ status: 'refunded', refunded_at: new Date().toISOString(), refund_reason: reason || null })
    .eq('id', saleId);

  if (updateError) { alert('Error processing refund: ' + updateError.message); return; }

  alert('Refund processed and stock restored.');
  await loadDailyReport();
}

function escapeHtmlReports(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
