const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'electronics-shop-crm', 'shop.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const categories = ['Refrigerators', 'Washing Machines', 'Televisions', 'Air Conditioners', 'Kitchen Appliances'];

const products = [
  { name: 'Samsung 253L Double Door Fridge', sku: 'RF-SAM-253', barcode: '8901234500011', category: 'Refrigerators', cost: 18000, price: 23990, stock: 15, min: 5 },
  { name: 'LG 190L Single Door Fridge', sku: 'RF-LG-190', barcode: '8901234500012', category: 'Refrigerators', cost: 12000, price: 15990, stock: 3, min: 5 },
  { name: 'Whirlpool 265L Fridge', sku: 'RF-WHR-265', barcode: '8901234500013', category: 'Refrigerators', cost: 19500, price: 25990, stock: 8, min: 4 },
  { name: 'IFB 7kg Front Load Washing Machine', sku: 'WM-IFB-7', barcode: '8901234500021', category: 'Washing Machines', cost: 22000, price: 28990, stock: 6, min: 3 },
  { name: 'Samsung 6.5kg Top Load Washing Machine', sku: 'WM-SAM-65', barcode: '8901234500022', category: 'Washing Machines', cost: 14000, price: 18990, stock: 2, min: 4 },
  { name: 'LG 55" 4K Smart TV', sku: 'TV-LG-55', barcode: '8901234500031', category: 'Televisions', cost: 32000, price: 42990, stock: 5, min: 2 },
  { name: 'Sony 43" Full HD TV', sku: 'TV-SONY-43', barcode: '8901234500032', category: 'Televisions', cost: 21000, price: 27990, stock: 7, min: 3 },
  { name: 'Mi 32" HD Ready TV', sku: 'TV-MI-32', barcode: '8901234500033', category: 'Televisions', cost: 9500, price: 12990, stock: 10, min: 4 },
  { name: 'Voltas 1.5 Ton Split AC', sku: 'AC-VOL-15', barcode: '8901234500041', category: 'Air Conditioners', cost: 26000, price: 34990, stock: 4, min: 3 },
  { name: 'Daikin 1 Ton Split AC', sku: 'AC-DAI-1', barcode: '8901234500042', category: 'Air Conditioners', cost: 24000, price: 31990, stock: 1, min: 3 },
  { name: 'Philips Mixer Grinder 750W', sku: 'KA-PHI-750', barcode: '8901234500051', category: 'Kitchen Appliances', cost: 1800, price: 2799, stock: 20, min: 5 },
  { name: 'Prestige Induction Cooktop', sku: 'KA-PRE-IND', barcode: '8901234500052', category: 'Kitchen Appliances', cost: 1200, price: 1999, stock: 25, min: 5 }
];

const customers = [
  { name: 'Rajesh Kumar', phone: '9820011122', email: 'rajesh.kumar@example.com', recurring: 1 },
  { name: 'Anita Desai', phone: '9820011133', email: 'anita.desai@example.com', recurring: 1 },
  { name: 'Vikram Singh', phone: '9820011144', email: 'vikram.singh@example.com', recurring: 0 },
  { name: 'Sunita Rao', phone: '9820011155', email: 'sunita.rao@example.com', recurring: 1 },
  { name: 'Mohammed Ali', phone: '9820011166', email: 'mohammed.ali@example.com', recurring: 0 },
  { name: 'Priya Nair', phone: '9820011177', email: 'priya.nair@example.com', recurring: 1 },
  { name: 'Karan Mehta', phone: '9820011188', email: 'karan.mehta@example.com', recurring: 0 }
];

const suppliers = [
  { name: 'Sunrise Electronics Distributors', contact_person: 'Ramesh Iyer', phone: '9811122233', email: 'sales@sunriseelectro.com', address: 'Andheri MIDC, Mumbai' },
  { name: 'National Appliance Traders', contact_person: 'Deepak Shah', phone: '9822233344', email: 'orders@natapp.com', address: 'Karol Bagh, Delhi' }
];

function pad2(n) { return String(n).padStart(2, '0'); }
function fmt(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const seed = db.transaction(() => {
  db.exec(`
    DELETE FROM invoice_items;
    DELETE FROM invoices;
    DELETE FROM purchase_items;
    DELETE FROM purchases;
    DELETE FROM products;
    DELETE FROM customers;
    DELETE FROM categories;
    DELETE FROM suppliers;
    DELETE FROM sqlite_sequence WHERE name IN ('products','customers','categories','invoices','invoice_items','purchases','purchase_items','suppliers');
  `);

  const catInsert = db.prepare('INSERT INTO categories (name) VALUES (?)');
  const catIds = {};
  for (const name of categories) {
    catIds[name] = catInsert.run(name).lastInsertRowid;
  }

  const prodInsert = db.prepare(`
    INSERT INTO products (name, sku, barcode, category_id, cost_price, selling_price, current_stock, min_stock_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const productRows = products.map(p => {
    const id = prodInsert.run(p.name, p.sku, p.barcode, catIds[p.category], p.cost, p.price, p.stock, p.min).lastInsertRowid;
    return { id, ...p };
  });

  const custInsert = db.prepare('INSERT INTO customers (name, phone, email, is_recurring) VALUES (?, ?, ?, ?)');
  const customerRows = customers.map(c => ({ id: custInsert.run(c.name, c.phone, c.email, c.recurring).lastInsertRowid, ...c }));

  const supInsert = db.prepare('INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)');
  for (const s of suppliers) supInsert.run(s.name, s.contact_person, s.phone, s.email, s.address);

  const invoiceInsert = db.prepare(`
    INSERT INTO invoices (bill_number, customer_id, invoice_date, total_amount, discount_amount, payment_mode, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'completed', 1)
  `);
  const itemInsert = db.prepare(`
    INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, discount, subtotal)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const addCredit = db.prepare('UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?');

  const today = new Date();
  let billCounter = 1;
  const paymentModes = ['cash', 'cash', 'cash', 'card', 'card', 'credit'];

  for (let daysAgo = 20; daysAgo >= 0; daysAgo--) {
    const invoicesToday = daysAgo === 0 ? 3 : Math.floor(Math.random() * 3) + (daysAgo % 5 === 0 ? 2 : 0);

    for (let i = 0; i < invoicesToday; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - daysAgo);
      date.setHours(10 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);

      const itemCount = Math.floor(Math.random() * 2) + 1;
      const chosenProducts = new Set();
      while (chosenProducts.size < itemCount) chosenProducts.add(pick(productRows));

      let totalAmount = 0;
      const items = [];
      for (const p of chosenProducts) {
        const qty = Math.floor(Math.random() * 2) + 1;
        const subtotal = qty * p.price;
        totalAmount += subtotal;
        items.push({ productId: p.id, qty, price: p.price, subtotal });
      }

      const discount = Math.random() < 0.3 ? Math.round(totalAmount * 0.05) : 0;
      totalAmount -= discount;

      const useCustomer = Math.random() < 0.65;
      const customer = useCustomer ? pick(customerRows) : null;
      const paymentMode = customer ? pick(paymentModes) : pick(['cash', 'card']);

      const billNumber = `INV-${String(billCounter++).padStart(5, '0')}`;
      const invoiceId = invoiceInsert.run(
        billNumber, customer ? customer.id : null, fmt(date), totalAmount, discount, paymentMode
      ).lastInsertRowid;

      for (const it of items) {
        itemInsert.run(invoiceId, it.productId, it.qty, it.price, 0, it.subtotal);
      }

      if (paymentMode === 'credit' && customer) {
        addCredit.run(totalAmount, customer.id);
      }
    }
  }

  const purchaseInsert = db.prepare(`
    INSERT INTO purchases (supplier_id, purchase_date, total_amount, status, created_by)
    VALUES (?, ?, ?, 'received', 1)
  `);
  const purchaseItemInsert = db.prepare(`
    INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, subtotal)
    VALUES (?, ?, ?, ?, ?)
  `);
  const supplierIds = db.prepare('SELECT id FROM suppliers').all().map(s => s.id);
  for (let i = 0; i < 3; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - (25 + i * 3));
    const p = pick(productRows);
    const qty = 5 + Math.floor(Math.random() * 10);
    const subtotal = qty * p.cost;
    const purchaseId = purchaseInsert.run(pick(supplierIds), fmt(date), subtotal).lastInsertRowid;
    purchaseItemInsert.run(purchaseId, p.id, qty, p.cost, subtotal);
  }

  return billCounter - 1;
});

const invoiceCount = seed();
console.log(`Seeded ${categories.length} categories, ${products.length} products, ${customers.length} customers, ${suppliers.length} suppliers, ${invoiceCount} invoices, 3 purchases.`);
db.close();
