const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// ─── Customers ───────────────────────────────────────────────────────────────

app.get('/api/customers', (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  const rows = q
    ? db.prepare(`SELECT * FROM customers WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? ORDER BY created_at DESC`).all(q, q, q)
    : db.prepare(`SELECT * FROM customers ORDER BY created_at DESC`).all();
  res.json(rows);
});

app.get('/api/customers/:id', (req, res) => {
  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const orders = db.prepare(`SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC`).all(req.params.id);
  res.json({ ...customer, orders });
});

app.post('/api/customers', (req, res) => {
  const { name, email, phone, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = db.prepare(
      `INSERT INTO customers (name, email, phone, address, notes) VALUES (?, ?, ?, ?, ?)`
    ).run(name, email || null, phone || null, address || null, notes || null);
    res.status(201).json({ id: result.lastInsertRowid, name, email, phone, address, notes });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
});

app.put('/api/customers/:id', (req, res) => {
  const { name, email, phone, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = db.prepare(
      `UPDATE customers SET name=?, email=?, phone=?, address=?, notes=? WHERE id=?`
    ).run(name, email || null, phone || null, address || null, notes || null, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json({ id: Number(req.params.id), name, email, phone, address, notes });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
});

app.delete('/api/customers/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM customers WHERE id=?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Customer not found' });
  res.json({ success: true });
});

// ─── Products ────────────────────────────────────────────────────────────────

app.get('/api/products', (req, res) => {
  const rows = db.prepare(`SELECT * FROM products ORDER BY name`).all();
  res.json(rows);
});

app.post('/api/products', (req, res) => {
  const { name, category, price, stock } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'Name and price are required' });
  const result = db.prepare(
    `INSERT INTO products (name, category, price, stock) VALUES (?, ?, ?, ?)`
  ).run(name, category || null, price, stock || 0);
  res.status(201).json({ id: result.lastInsertRowid, name, category, price, stock: stock || 0 });
});

app.put('/api/products/:id', (req, res) => {
  const { name, category, price, stock } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'Name and price are required' });
  const result = db.prepare(
    `UPDATE products SET name=?, category=?, price=?, stock=? WHERE id=?`
  ).run(name, category || null, price, stock || 0, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Product not found' });
  res.json({ id: Number(req.params.id), name, category, price, stock: stock || 0 });
});

app.delete('/api/products/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM products WHERE id=?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Product not found' });
  res.json({ success: true });
});

// ─── Orders ──────────────────────────────────────────────────────────────────

app.get('/api/orders', (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, c.name AS customer_name
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    ORDER BY o.created_at DESC
  `).all();
  res.json(rows);
});

app.get('/api/orders/:id', (req, res) => {
  const order = db.prepare(`
    SELECT o.*, c.name AS customer_name
    FROM orders o JOIN customers c ON o.customer_id = c.id
    WHERE o.id=?
  `).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = db.prepare(`
    SELECT oi.*, p.name AS product_name
    FROM order_items oi JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id=?
  `).all(req.params.id);
  res.json({ ...order, items });
});

app.post('/api/orders', (req, res) => {
  const { customer_id, items, notes, status } = req.body;
  if (!customer_id || !items || items.length === 0)
    return res.status(400).json({ error: 'customer_id and items are required' });

  const customer = db.prepare(`SELECT id FROM customers WHERE id=?`).get(customer_id);
  if (!customer) return res.status(400).json({ error: 'Customer not found' });

  const insertOrder = db.transaction(() => {
    let total = 0;
    const itemRows = items.map(item => {
      const product = db.prepare(`SELECT * FROM products WHERE id=?`).get(item.product_id);
      if (!product) throw new Error(`Product ${item.product_id} not found`);
      if (product.stock < item.quantity) throw new Error(`Insufficient stock for "${product.name}" (available: ${product.stock})`);
      total += product.price * item.quantity;
      return { product, quantity: item.quantity };
    });

    const result = db.prepare(
      `INSERT INTO orders (customer_id, status, total, notes) VALUES (?, ?, ?, ?)`
    ).run(customer_id, status || 'pending', total, notes || null);
    const orderId = result.lastInsertRowid;

    for (const { product, quantity } of itemRows) {
      db.prepare(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)`
      ).run(orderId, product.id, quantity, product.price);
      db.prepare(`UPDATE products SET stock = stock - ? WHERE id=?`).run(quantity, product.id);
    }
    return { orderId, total };
  });

  try {
    const { orderId, total } = insertOrder();
    res.status(201).json({ id: orderId, customer_id, total, status: status || 'pending' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const result = db.prepare(`UPDATE orders SET status=? WHERE id=?`).run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Order not found' });
  res.json({ id: Number(req.params.id), status });
});

// ─── Dashboard ───────────────────────────────────────────────────────────────

app.get('/api/dashboard', (req, res) => {
  const totalCustomers = db.prepare(`SELECT COUNT(*) AS n FROM customers`).get().n;
  const totalOrders = db.prepare(`SELECT COUNT(*) AS n FROM orders`).get().n;
  const totalRevenue = db.prepare(`SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE status != 'cancelled'`).get().n;
  const pendingOrders = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE status='pending'`).get().n;
  const recentOrders = db.prepare(`
    SELECT o.id, o.total, o.status, o.created_at, c.name AS customer_name
    FROM orders o JOIN customers c ON o.customer_id=c.id
    ORDER BY o.created_at DESC LIMIT 5
  `).all();
  const topCustomers = db.prepare(`
    SELECT c.id, c.name, COUNT(o.id) AS order_count, COALESCE(SUM(o.total),0) AS total_spent
    FROM customers c LEFT JOIN orders o ON c.id=o.customer_id
    GROUP BY c.id ORDER BY total_spent DESC LIMIT 5
  `).all();
  res.json({ totalCustomers, totalOrders, totalRevenue, pendingOrders, recentOrders, topCustomers });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CRM running on http://localhost:${PORT}`));

module.exports = app;
