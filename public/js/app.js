// ─── State ───────────────────────────────────────────────────────────────────
let products = [];
let customers = [];

// ─── Navigation ──────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const page = link.dataset.page;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    link.classList.add('active');
    document.getElementById(`page-${page}`).classList.add('active');
    if (page === 'dashboard') loadDashboard();
    if (page === 'customers') loadCustomers();
    if (page === 'orders') loadOrders();
    if (page === 'products') loadProducts();
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = n => `$${Number(n).toFixed(2)}`;
const fmtDate = d => new Date(d).toLocaleDateString();
const statusBadge = s => `<span class="badge badge-${s}">${s}</span>`;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
async function loadDashboard() {
  const d = await api('/api/dashboard');
  document.getElementById('stat-customers').textContent = d.totalCustomers;
  document.getElementById('stat-orders').textContent = d.totalOrders;
  document.getElementById('stat-revenue').textContent = fmt(d.totalRevenue);
  document.getElementById('stat-pending').textContent = d.pendingOrders;

  document.getElementById('recent-orders-body').innerHTML = d.recentOrders.length
    ? d.recentOrders.map(o => `
        <tr>
          <td>#${o.id}</td>
          <td>${esc(o.customer_name)}</td>
          <td>${fmt(o.total)}</td>
          <td>${statusBadge(o.status)}</td>
          <td>${fmtDate(o.created_at)}</td>
        </tr>`).join('')
    : `<tr><td colspan="5" class="empty-state">No orders yet</td></tr>`;

  document.getElementById('top-customers-body').innerHTML = d.topCustomers.length
    ? d.topCustomers.map(c => `
        <tr>
          <td>${esc(c.name)}</td>
          <td>${c.order_count}</td>
          <td>${fmt(c.total_spent)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" class="empty-state">No customers yet</td></tr>`;
}

// ─── Customers ───────────────────────────────────────────────────────────────
async function loadCustomers(q = '') {
  const url = q ? `/api/customers?q=${encodeURIComponent(q)}` : '/api/customers';
  customers = await api(url);
  renderCustomers(customers);
}

function renderCustomers(list) {
  document.getElementById('customers-body').innerHTML = list.length
    ? list.map(c => `
        <tr>
          <td><a href="#" onclick="viewCustomer(${c.id})">${esc(c.name)}</a></td>
          <td>${esc(c.email || '—')}</td>
          <td>${esc(c.phone || '—')}</td>
          <td>${fmtDate(c.created_at)}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="openCustomerModal(${c.id})">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCustomer(${c.id})">Delete</button>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="5" class="empty-state">No customers found</td></tr>`;
}

let searchTimeout;
function searchCustomers(val) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadCustomers(val), 300);
}

function openCustomerModal(id) {
  document.getElementById('customer-id').value = id || '';
  document.getElementById('customer-modal-title').textContent = id ? 'Edit Customer' : 'Add Customer';
  ['name','email','phone','address','notes'].forEach(f => {
    document.getElementById(`customer-${f}`).value = '';
  });
  if (id) {
    const c = customers.find(x => x.id === id);
    if (c) {
      document.getElementById('customer-name').value = c.name || '';
      document.getElementById('customer-email').value = c.email || '';
      document.getElementById('customer-phone').value = c.phone || '';
      document.getElementById('customer-address').value = c.address || '';
      document.getElementById('customer-notes').value = c.notes || '';
    }
  }
  openModal('customer-modal');
}

async function saveCustomer(e) {
  e.preventDefault();
  const id = document.getElementById('customer-id').value;
  const body = {
    name: document.getElementById('customer-name').value,
    email: document.getElementById('customer-email').value,
    phone: document.getElementById('customer-phone').value,
    address: document.getElementById('customer-address').value,
    notes: document.getElementById('customer-notes').value,
  };
  try {
    if (id) {
      await api(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/customers', { method: 'POST', body: JSON.stringify(body) });
    }
    closeModal('customer-modal');
    loadCustomers();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteCustomer(id) {
  if (!confirm('Delete this customer? This cannot be undone.')) return;
  await api(`/api/customers/${id}`, { method: 'DELETE' });
  loadCustomers();
}

async function viewCustomer(id) {
  const c = await api(`/api/customers/${id}`);
  document.getElementById('customer-detail-title').textContent = c.name;
  document.getElementById('customer-detail-content').innerHTML = `
    <div class="detail-section">
      <div class="detail-grid">
        <div class="detail-field"><div class="label">Email</div><div class="value">${esc(c.email || '—')}</div></div>
        <div class="detail-field"><div class="label">Phone</div><div class="value">${esc(c.phone || '—')}</div></div>
        <div class="detail-field"><div class="label">Address</div><div class="value">${esc(c.address || '—')}</div></div>
        <div class="detail-field"><div class="label">Joined</div><div class="value">${fmtDate(c.created_at)}</div></div>
        ${c.notes ? `<div class="detail-field" style="grid-column:1/-1"><div class="label">Notes</div><div class="value">${esc(c.notes)}</div></div>` : ''}
      </div>
      <h3>Order History</h3>
      ${c.orders.length
        ? `<table class="table"><thead><tr><th>ID</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>
           ${c.orders.map(o => `<tr><td>#${o.id}</td><td>${fmt(o.total)}</td><td>${statusBadge(o.status)}</td><td>${fmtDate(o.created_at)}</td></tr>`).join('')}
           </tbody></table>`
        : `<p class="empty-state">No orders yet</p>`
      }
    </div>`;
  openModal('customer-detail-modal');
  return false;
}

// ─── Products ────────────────────────────────────────────────────────────────
async function loadProducts() {
  products = await api('/api/products');
  document.getElementById('products-body').innerHTML = products.length
    ? products.map(p => `
        <tr>
          <td>${esc(p.name)}</td>
          <td>${esc(p.category || '—')}</td>
          <td>${fmt(p.price)}</td>
          <td>${p.stock}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="openProductModal(${p.id})">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">Delete</button>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="5" class="empty-state">No products yet</td></tr>`;
}

function openProductModal(id) {
  document.getElementById('product-id').value = id || '';
  document.getElementById('product-modal-title').textContent = id ? 'Edit Product' : 'Add Product';
  ['name','category','price','stock'].forEach(f => document.getElementById(`product-${f}`).value = f === 'stock' ? '0' : '');
  if (id) {
    const p = products.find(x => x.id === id);
    if (p) {
      document.getElementById('product-name').value = p.name || '';
      document.getElementById('product-category').value = p.category || '';
      document.getElementById('product-price').value = p.price;
      document.getElementById('product-stock').value = p.stock;
    }
  }
  openModal('product-modal');
}

async function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('product-id').value;
  const body = {
    name: document.getElementById('product-name').value,
    category: document.getElementById('product-category').value,
    price: parseFloat(document.getElementById('product-price').value),
    stock: parseInt(document.getElementById('product-stock').value, 10),
  };
  try {
    if (id) {
      await api(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/products', { method: 'POST', body: JSON.stringify(body) });
    }
    closeModal('product-modal');
    loadProducts();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  await api(`/api/products/${id}`, { method: 'DELETE' });
  loadProducts();
}

// ─── Orders ──────────────────────────────────────────────────────────────────
async function loadOrders() {
  const orders = await api('/api/orders');
  document.getElementById('orders-body').innerHTML = orders.length
    ? orders.map(o => `
        <tr>
          <td>#${o.id}</td>
          <td>${esc(o.customer_name)}</td>
          <td>${fmt(o.total)}</td>
          <td>${statusBadge(o.status)}</td>
          <td>${fmtDate(o.created_at)}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="viewOrder(${o.id})">View</button></td>
        </tr>`).join('')
    : `<tr><td colspan="6" class="empty-state">No orders yet</td></tr>`;
}

async function openOrderModal() {
  if (!customers.length) await loadCustomers();
  if (!products.length) await loadProducts();

  const custSel = document.getElementById('order-customer');
  custSel.innerHTML = customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  document.getElementById('order-items-container').innerHTML = '';
  addOrderItemRow();
  document.getElementById('order-notes').value = '';
  openModal('order-modal');
}

function addOrderItemRow() {
  const row = document.createElement('div');
  row.className = 'order-item-row';
  row.innerHTML = `
    <select class="order-item-product">
      ${products.map(p => `<option value="${p.id}">${esc(p.name)} (${fmt(p.price)})</option>`).join('')}
    </select>
    <input type="number" class="order-item-qty" value="1" min="1" />
    <button type="button" class="btn btn-danger btn-sm" onclick="removeOrderItem(this)">✕</button>`;
  document.getElementById('order-items-container').appendChild(row);
}

function removeOrderItem(btn) {
  const container = document.getElementById('order-items-container');
  if (container.children.length > 1) btn.closest('.order-item-row').remove();
}

async function saveOrder(e) {
  e.preventDefault();
  const customer_id = parseInt(document.getElementById('order-customer').value, 10);
  const rows = document.querySelectorAll('#order-items-container .order-item-row');
  const items = Array.from(rows).map(row => ({
    product_id: parseInt(row.querySelector('.order-item-product').value, 10),
    quantity: parseInt(row.querySelector('.order-item-qty').value, 10),
  }));
  const notes = document.getElementById('order-notes').value;
  try {
    await api('/api/orders', { method: 'POST', body: JSON.stringify({ customer_id, items, notes }) });
    closeModal('order-modal');
    loadOrders();
    loadProducts();
  } catch (err) {
    alert(err.message);
  }
}

async function viewOrder(id) {
  const o = await api(`/api/orders/${id}`);
  document.getElementById('order-detail-title').textContent = `Order #${o.id}`;
  document.getElementById('order-detail-content').innerHTML = `
    <div class="detail-section">
      <div class="detail-grid">
        <div class="detail-field"><div class="label">Customer</div><div class="value">${esc(o.customer_name)}</div></div>
        <div class="detail-field"><div class="label">Total</div><div class="value">${fmt(o.total)}</div></div>
        <div class="detail-field"><div class="label">Status</div><div class="value">${statusBadge(o.status)}</div></div>
        <div class="detail-field"><div class="label">Date</div><div class="value">${fmtDate(o.created_at)}</div></div>
        ${o.notes ? `<div class="detail-field" style="grid-column:1/-1"><div class="label">Notes</div><div class="value">${esc(o.notes)}</div></div>` : ''}
      </div>
      <h3>Items</h3>
      <table class="table">
        <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>
        <tbody>
          ${o.items.map(i => `
            <tr>
              <td>${esc(i.product_name)}</td>
              <td>${i.quantity}</td>
              <td>${fmt(i.unit_price)}</td>
              <td>${fmt(i.unit_price * i.quantity)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="status-form" style="margin-top:20px">
        <label style="margin:0;text-transform:none;font-size:.9rem;">Update status:</label>
        <select id="status-select-${o.id}" style="width:auto;flex:1">
          ${['pending','confirmed','shipped','delivered','cancelled'].map(s =>
            `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="updateOrderStatus(${o.id})">Save</button>
      </div>
    </div>`;
  openModal('order-detail-modal');
}

async function updateOrderStatus(id) {
  const status = document.getElementById(`status-select-${id}`).value;
  try {
    await api(`/api/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
    closeModal('order-detail-modal');
    loadOrders();
    loadDashboard();
  } catch (err) {
    alert(err.message);
  }
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ─── XSS protection ──────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Init ────────────────────────────────────────────────────────────────────
loadDashboard();
