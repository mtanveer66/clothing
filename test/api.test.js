// Simple integration tests for the CRM API
// Runs against a temporary in-memory-like test database

const assert = require('assert');
const http = require('http');

// Override DB path before loading app modules
const origEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'test';

// Use a temp DB for tests
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const testDbPath = path.join(os.tmpdir(), `crm_test_${Date.now()}.db`);

// Monkey-patch db.js to use the test DB
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === './db' || (parent && parent.filename && request.endsWith('/db'))) {
    if (!Module._cache_testdb) {
      const db = new Database(testDbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT, address TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT, price REAL NOT NULL, stock INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', total REAL NOT NULL DEFAULT 0, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (customer_id) REFERENCES customers(id));
        CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, unit_price REAL NOT NULL, FOREIGN KEY (order_id) REFERENCES orders(id), FOREIGN KEY (product_id) REFERENCES products(id));
      `);
      Module._cache_testdb = db;
    }
    return Module._cache_testdb;
  }
  return originalLoad.apply(this, arguments);
};

const app = require('../server');
const PORT = 3099;
const server = http.createServer(app);

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: PORT, path, method,
      headers: { 'Content-Type': 'application/json' },
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

let customerId, productId, orderId;

const tests = [
  async function test_dashboard_empty() {
    const { status, body } = await req('GET', '/api/dashboard');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.totalCustomers, 0);
    console.log('✓ dashboard returns empty stats');
  },

  async function test_create_customer() {
    const { status, body } = await req('POST', '/api/customers', { name: 'Alice Smith', email: 'alice@example.com', phone: '555-1234' });
    assert.strictEqual(status, 201);
    assert.ok(body.id);
    customerId = body.id;
    console.log('✓ create customer');
  },

  async function test_list_customers() {
    const { status, body } = await req('GET', '/api/customers');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body));
    assert.ok(body.some(c => c.email === 'alice@example.com'));
    console.log('✓ list customers');
  },

  async function test_update_customer() {
    const { status, body } = await req('PUT', `/api/customers/${customerId}`, { name: 'Alice J. Smith', email: 'alice@example.com' });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.name, 'Alice J. Smith');
    console.log('✓ update customer');
  },

  async function test_duplicate_email() {
    await req('POST', '/api/customers', { name: 'Bob', email: 'bob@example.com' });
    const { status } = await req('POST', '/api/customers', { name: 'Bob2', email: 'bob@example.com' });
    assert.strictEqual(status, 409);
    console.log('✓ duplicate email returns 409');
  },

  async function test_create_product() {
    const { status, body } = await req('POST', '/api/products', { name: 'Blue T-Shirt', category: 'Tops', price: 29.99, stock: 50 });
    assert.strictEqual(status, 201);
    assert.ok(body.id);
    productId = body.id;
    console.log('✓ create product');
  },

  async function test_list_products() {
    const { status, body } = await req('GET', '/api/products');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body));
    assert.ok(body.some(p => p.name === 'Blue T-Shirt'));
    console.log('✓ list products');
  },

  async function test_create_order() {
    const { status, body } = await req('POST', '/api/orders', {
      customer_id: customerId,
      items: [{ product_id: productId, quantity: 2 }],
    });
    assert.strictEqual(status, 201);
    assert.ok(body.id);
    assert.strictEqual(body.total, 59.98);
    orderId = body.id;
    console.log('✓ create order');
  },

  async function test_order_reduces_stock() {
    const { body } = await req('GET', '/api/products');
    const p = body.find(p => p.id === productId);
    assert.strictEqual(p.stock, 48);
    console.log('✓ order reduces product stock');
  },

  async function test_get_order_detail() {
    const { status, body } = await req('GET', `/api/orders/${orderId}`);
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body.items));
    assert.strictEqual(body.items.length, 1);
    console.log('✓ get order detail with items');
  },

  async function test_update_order_status() {
    const { status, body } = await req('PUT', `/api/orders/${orderId}/status`, { status: 'shipped' });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.status, 'shipped');
    console.log('✓ update order status');
  },

  async function test_dashboard_stats() {
    const { body } = await req('GET', '/api/dashboard');
    assert.ok(body.totalCustomers >= 1);
    assert.ok(body.totalOrders >= 1);
    assert.ok(body.totalRevenue > 0);
    console.log('✓ dashboard returns populated stats');
  },

  async function test_customer_detail_with_orders() {
    const { status, body } = await req('GET', `/api/customers/${customerId}`);
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body.orders));
    assert.ok(body.orders.length >= 1);
    console.log('✓ customer detail includes order history');
  },

  async function test_search_customers() {
    const { status, body } = await req('GET', '/api/customers?q=Alice');
    assert.strictEqual(status, 200);
    assert.ok(body.some(c => c.name.includes('Alice')));
    console.log('✓ customer search works');
  },

  async function test_delete_product() {
    const { status, body } = await req('POST', '/api/products', { name: 'Temp', price: 5 });
    const id = body.id;
    const del = await req('DELETE', `/api/products/${id}`);
    assert.strictEqual(del.status, 200);
    console.log('✓ delete product');
  },

  async function test_delete_customer() {
    const { body } = await req('POST', '/api/customers', { name: 'Temp Customer' });
    const id = body.id;
    const del = await req('DELETE', `/api/customers/${id}`);
    assert.strictEqual(del.status, 200);
    console.log('✓ delete customer');
  },
];

server.listen(PORT, async () => {
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t();
      passed++;
    } catch (e) {
      console.error(`✗ ${t.name}: ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  server.close(() => {
    try { fs.unlinkSync(testDbPath); } catch (_) {}
    process.exit(failed > 0 ? 1 : 0);
  });
});
