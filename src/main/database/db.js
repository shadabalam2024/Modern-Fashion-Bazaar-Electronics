const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

class ShopDatabase {
  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'shop.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  initialize() {
    // Create tables
    this.db.exec(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (role_id) REFERENCES roles(id)
      );

      -- Roles table
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_name TEXT UNIQUE NOT NULL,
        permissions TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Categories table
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Products table
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sku TEXT UNIQUE,
        barcode TEXT UNIQUE,
        category_id INTEGER,
        cost_price REAL NOT NULL,
        selling_price REAL NOT NULL,
        current_stock INTEGER DEFAULT 0,
        min_stock_level INTEGER DEFAULT 5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id)
      );

      -- Customers table
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        credit_balance REAL DEFAULT 0,
        is_recurring BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Customer Payments table (credit balance payment history)
      CREATE TABLE IF NOT EXISTS customer_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        invoice_id INTEGER,
        amount REAL NOT NULL,
        payment_mode TEXT NOT NULL DEFAULT 'cash',
        payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      );

      -- Daily Closing table (one row per closed business day, cash-drawer reconciliation)
      CREATE TABLE IF NOT EXISTS daily_closings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        closing_date TEXT UNIQUE NOT NULL,
        opening_cash REAL NOT NULL DEFAULT 0,
        cash_sales REAL NOT NULL DEFAULT 0,
        card_sales REAL NOT NULL DEFAULT 0,
        credit_sales REAL NOT NULL DEFAULT 0,
        payments_received_cash REAL NOT NULL DEFAULT 0,
        payments_received_card REAL NOT NULL DEFAULT 0,
        refunds_cash REAL NOT NULL DEFAULT 0,
        expected_cash REAL NOT NULL DEFAULT 0,
        actual_cash REAL NOT NULL DEFAULT 0,
        variance REAL NOT NULL DEFAULT 0,
        notes TEXT,
        closed_by INTEGER,
        closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (closed_by) REFERENCES users(id)
      );

      -- Invoices table
      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_number TEXT UNIQUE NOT NULL,
        customer_id INTEGER,
        invoice_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_amount REAL NOT NULL,
        discount_amount REAL DEFAULT 0,
        payment_mode TEXT,
        status TEXT DEFAULT 'completed',
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      -- Invoice Items table
      CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        discount REAL DEFAULT 0,
        subtotal REAL NOT NULL,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      );

      -- Returns table (a return event against one invoice; may cover several line items)
      CREATE TABLE IF NOT EXISTS returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        return_number TEXT UNIQUE NOT NULL,
        invoice_id INTEGER NOT NULL,
        customer_id INTEGER,
        return_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        reason TEXT,
        refund_amount REAL NOT NULL,
        refund_mode TEXT NOT NULL,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      -- Return Items table
      CREATE TABLE IF NOT EXISTS return_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        return_id INTEGER NOT NULL,
        invoice_item_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        subtotal REAL NOT NULL,
        restocked BOOLEAN DEFAULT 0,
        disposition TEXT,
        FOREIGN KEY (return_id) REFERENCES returns(id),
        FOREIGN KEY (invoice_item_id) REFERENCES invoice_items(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      );

      -- Cost Price History table (every time a product's cost changes, from a purchase or a manual edit)
      CREATE TABLE IF NOT EXISTS cost_price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        old_cost_price REAL,
        new_cost_price REAL NOT NULL,
        unit_cost REAL,
        quantity INTEGER,
        source TEXT NOT NULL,
        purchase_id INTEGER,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (purchase_id) REFERENCES purchases(id)
      );

      -- Suppliers table
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Purchases table
      CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      -- Purchase Items table
      CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_cost REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      );

      -- Shop Settings table
      CREATE TABLE IF NOT EXISTS shop_settings (
        id INTEGER PRIMARY KEY,
        shop_name TEXT,
        shop_address TEXT,
        shop_phone TEXT,
        shop_email TEXT,
        gst_number TEXT,
        gst_rate REAL DEFAULT 0,
        logo_path TEXT,
        payment_terms TEXT,
        return_policy TEXT
      );
    `);

    this.migrate();
  }

  // Add columns to tables that already existed before this version, without touching existing data
  migrate() {
    const addColumnIfMissing = (table, column, definition) => {
      const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
      if (!columns.some(c => c.name === column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    };

    addColumnIfMissing('shop_settings', 'gst_rate', 'REAL DEFAULT 0');
    addColumnIfMissing('invoices', 'gst_amount', 'REAL DEFAULT 0');
    addColumnIfMissing('invoices', 'amount_paid', 'REAL DEFAULT 0');
    addColumnIfMissing('products', 'is_custom', 'BOOLEAN DEFAULT 0');
    addColumnIfMissing('invoices', 'refunded_amount', 'REAL DEFAULT 0');
    addColumnIfMissing('return_items', 'disposition', 'TEXT');
    addColumnIfMissing('customer_payments', 'payment_mode', "TEXT NOT NULL DEFAULT 'cash'");
    addColumnIfMissing('shop_settings', 'thermal_printing_enabled', 'BOOLEAN DEFAULT 0');
    addColumnIfMissing('shop_settings', 'thermal_printer_name', 'TEXT');
    addColumnIfMissing('shop_settings', 'thermal_paper_width', 'INTEGER DEFAULT 80');

    // Backfill: non-credit invoices are paid in full at sale time
    this.db.exec(`UPDATE invoices SET amount_paid = total_amount WHERE payment_mode != 'credit' AND amount_paid = 0`);

    // Insert default roles if they don't exist
    const roleExists = this.db.prepare('SELECT COUNT(*) FROM roles').get();
    if (roleExists['COUNT(*)'] === 0) {
      const defaultRoles = [
        ['Admin', JSON.stringify({ billing: true, inventory: true, purchase: true, customers: true, dashboard: true, analytics: true, settings: true, returns: true, daily_closing: true })],
        ['Cashier', JSON.stringify({ billing: true, inventory: false, customers: true, returns: true, daily_closing: true })],
        ['Warehouse', JSON.stringify({ inventory: true, purchase: true })],
        ['Manager', JSON.stringify({ billing: true, inventory: true, customers: true, dashboard: true, analytics: true, returns: true, daily_closing: true })]
      ];

      const insert = this.db.prepare('INSERT INTO roles (role_name, permissions) VALUES (?, ?)');
      for (const role of defaultRoles) {
        insert.run(...role);
      }
    } else {
      // Existing installs: grant new permissions to roles that already handle billing
      const roles = this.db.prepare('SELECT id, permissions FROM roles').all();
      const updatePerms = this.db.prepare('UPDATE roles SET permissions = ? WHERE id = ?');
      for (const role of roles) {
        const perms = JSON.parse(role.permissions || '{}');
        let changed = false;
        if (perms.billing && !('returns' in perms)) { perms.returns = true; changed = true; }
        if (perms.billing && !('daily_closing' in perms)) { perms.daily_closing = true; changed = true; }
        if (changed) updatePerms.run(JSON.stringify(perms), role.id);
      }
    }
  }

  prepare(sql) {
    return this.db.prepare(sql);
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  transaction(fn) {
    return this.db.transaction(fn);
  }

  close() {
    this.db.close();
  }
}

module.exports = ShopDatabase;
