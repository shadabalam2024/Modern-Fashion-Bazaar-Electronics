const { dialog } = require('electron');
const { checkPermission } = require('../session');
const { buildInventoryWorkbook } = require('../excelExport');
const { nextBarcodes } = require('../barcodes');

const { up } = require('../caps');
const CAPS_PRODUCT_COLUMNS = ['brand', 'item_name', 'color', 'season', 'size', 'style_name'];
const EXTRA_COLUMNS = ['brand', 'season', 'hsn_code', 'mrp', 'size', 'color', 'style_name', 'item_name'];

module.exports = (ipcMain, db) => {
  const insertProduct = db.prepare(`
    INSERT INTO products (name, sku, barcode, category_id, cost_price, selling_price, current_stock, min_stock_level,
      ${EXTRA_COLUMNS.join(', ')})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${EXTRA_COLUMNS.map(() => '?').join(', ')})
  `);
  // Optional descriptive fields, empty string -> null; mrp must be a number
  const extraFields = (p) => EXTRA_COLUMNS.map(c => {
    const v = p[c];
    if (v === undefined || v === null || v === '') return null;
    if (c === 'mrp') return Number(v);
    if (CAPS_PRODUCT_COLUMNS.includes(c)) return up(v) || null;
    return String(v).trim();
  });

  // Get all products. Login-only: used across Billing, Purchase, and Inventory, each
  // with a different permission - the common requirement is just being logged in.
  ipcMain.handle('get-products', (event) => {
    const denied = checkPermission(event);
    if (denied) return denied;
    try {
      const products = db.prepare(`
        SELECT p.*, c.name as category_name,
          (SELECT pi.unit_cost FROM purchase_items pi
             JOIN purchases pu ON pu.id = pi.purchase_id
            WHERE pi.product_id = p.id AND pu.status = 'received'
            ORDER BY pu.id DESC, pi.id DESC LIMIT 1) AS last_unit_cost,
          (SELECT pi.landed_unit_cost FROM purchase_items pi
             JOIN purchases pu ON pu.id = pi.purchase_id
            WHERE pi.product_id = p.id AND pu.status = 'received' AND pi.landed_unit_cost IS NOT NULL
            ORDER BY pu.id DESC, pi.id DESC LIMIT 1) AS landed_cost,
          -- when this product last came into stock: its newest received purchase, or when it was created
          MAX(p.created_at, COALESCE((SELECT MAX(COALESCE(pu.received_at, pu.purchase_date)) FROM purchase_items pi
             JOIN purchases pu ON pu.id = pi.purchase_id
            WHERE pi.product_id = p.id AND pu.status = 'received'), p.created_at)) AS stocked_at
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.is_custom IS NOT 1
        ORDER BY p.name
      `).all();
      return products;
    } catch (error) {
      return [];
    }
  });

  // Add a one-off item for a sale (not part of the regular catalog, doesn't track stock)
  ipcMain.handle('add-custom-item', (event, { name, price }) => {
    const denied = checkPermission(event, 'billing');
    if (denied) return denied;
    try {
      const result = db.prepare(`
        INSERT INTO products (name, cost_price, selling_price, current_stock, min_stock_level, is_custom)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(up(name), price, price, 999999, 0);

      return { success: true, productId: result.lastInsertRowid };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Add product
  ipcMain.handle('add-product', (event, product) => {
    const denied = checkPermission(event, 'inventory');
    if (denied) return denied;
    try {
      product.name = up(product.name);
      product.sku = up(product.sku) || null;
      const barcode = product.barcode || (product.autoBarcode ? nextBarcodes(db, 1)[0] : null);
      const result = insertProduct.run(
        product.name,
        product.sku || null,
        barcode,
        product.category_id || null,
        product.cost_price,
        product.selling_price,
        product.current_stock || 0,
        product.min_stock_level || 5,
        ...extraFields(product)
      );

      return { success: true, productId: result.lastInsertRowid, barcode };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // One product per size (and colour) of the same style, each with its own barcode and stock.
  // Names become "Style - Item - Colour - Size" so Billing, receipts and reports show them as-is.
  ipcMain.handle('add-product-variants', (event, { style, color, sizes, ...product }) => {
    const denied = checkPermission(event, 'inventory');
    if (denied) return denied;
    try {
      style = up(style);
      const sizeList = [...new Set((sizes || []).map(s => up(s)).filter(Boolean))];
      color = up(color);
      product.item_name = up(product.item_name);
      if (!String(style || '').trim()) return { success: false, message: 'Enter a product name' };
      if (sizeList.length === 0) return { success: false, message: 'Enter at least one size' };

      const created = db.transaction(() => {
        const barcodes = nextBarcodes(db, sizeList.length);
        return sizeList.map((size, i) => {
          const name = [String(style).trim(), String(product.item_name || '').trim(), String(color || '').trim(), size].filter(Boolean).join(' - ');
          const result = insertProduct.run(
            name, null, barcodes[i], product.category_id || null, product.cost_price, product.selling_price,
            0, product.min_stock_level || 5,
            ...extraFields({ ...product, size, color: color || null, style_name: String(style).trim() })
          );
          return { id: result.lastInsertRowid, name, barcode: barcodes[i], size, cost_price: product.cost_price, selling_price: product.selling_price, mrp: product.mrp ?? null };
        });
      })();
      return { success: true, products: created };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Update product
  ipcMain.handle('update-product', (event, { id, ...product }) => {
    const denied = checkPermission(event, 'inventory');
    if (denied) return denied;
    try {
      const runUpdate = db.transaction(() => {
        const existing = db.prepare('SELECT cost_price FROM products WHERE id = ?').get(id);
        product.name = up(product.name);
        product.sku = up(product.sku) || null;

        db.prepare(`
          UPDATE products SET
          name = ?, sku = ?, barcode = ?, category_id = ?,
          cost_price = ?, selling_price = ?, min_stock_level = ?,
          ${EXTRA_COLUMNS.map(c => `${c} = ?`).join(', ')}
          WHERE id = ?
        `).run(
          product.name,
          product.sku,
          product.barcode,
          product.category_id,
          product.cost_price,
          product.selling_price,
          product.min_stock_level,
          ...extraFields(product),
          id
        );

        if (existing && existing.cost_price !== product.cost_price) {
          db.prepare(`
            INSERT INTO cost_price_history (product_id, old_cost_price, new_cost_price, source)
            VALUES (?, ?, ?, 'manual')
          `).run(id, existing.cost_price, product.cost_price);
        }
      });

      runUpdate();

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get a product's cost price history (purchases + manual edits), newest first
  ipcMain.handle('get-cost-price-history', (event, productId) => {
    const denied = checkPermission(event, 'inventory');
    if (denied) return denied;
    try {
      const history = db.prepare(`
        SELECT cph.*, s.name as supplier_name,
          (SELECT pi.unit_cost FROM purchase_items pi
            WHERE pi.purchase_id = cph.purchase_id AND pi.product_id = cph.product_id LIMIT 1) AS plain_unit_cost,
          -- first purchase: nothing in stock before it (older rows without stock_before: no earlier purchase logged)
          CASE WHEN cph.source = 'purchase' AND COALESCE(cph.stock_before = 0,
            NOT EXISTS (SELECT 1 FROM cost_price_history e WHERE e.product_id = cph.product_id AND e.source = 'purchase' AND e.id < cph.id))
            THEN 1 ELSE 0 END AS is_first_purchase
        FROM cost_price_history cph
        LEFT JOIN purchases p ON cph.purchase_id = p.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE cph.product_id = ?
        ORDER BY cph.changed_at DESC
      `).all(productId);

      return history;
    } catch (error) {
      return [];
    }
  });

  // Everything that has happened to one item: purchases, supplier returns, sales and customer returns,
  // newest first, with totals. Profit uses the item's current cost (average landed cost), as the reports do.
  ipcMain.handle('get-item-history', (event, productId) => {
    const denied = checkPermission(event, 'inventory');
    if (denied) return denied;
    try {
      const product = db.prepare('SELECT id, name, current_stock, cost_price, selling_price FROM products WHERE id = ?').get(productId);
      if (!product) return { success: false, message: 'Product not found' };
      const cost = product.cost_price || 0;

      const purchases = db.prepare(`
        SELECT 'purchase' AS type, COALESCE(pu.received_at, pu.purchase_date) AS date, 'Purchase #' || pu.id AS ref,
               s.name AS party, pi.quantity AS qty, pi.unit_cost AS unit_cost,
               COALESCE(pi.landed_unit_cost, pi.unit_cost) AS landed_cost, pi.selling_price AS price
        FROM purchase_items pi
        JOIN purchases pu ON pu.id = pi.purchase_id
        JOIN suppliers s ON s.id = pu.supplier_id
        WHERE pi.product_id = ? AND pu.status = 'received'
      `).all(productId);

      const supplierReturns = db.prepare(`
        SELECT 'supplier_return' AS type, pr.return_date AS date, 'Purchase #' || pr.purchase_id AS ref,
               s.name AS party, -pri.quantity AS qty, pi.unit_cost AS unit_cost, pri.unit_cost AS landed_cost, NULL AS price
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pr.id = pri.return_id
        JOIN purchase_items pi ON pi.id = pri.purchase_item_id
        JOIN purchases pu ON pu.id = pr.purchase_id
        JOIN suppliers s ON s.id = pu.supplier_id
        WHERE pri.product_id = ?
      `).all(productId);

      const sales = db.prepare(`
        SELECT 'sale' AS type, i.invoice_date AS date, 'Bill ' || i.bill_number AS ref,
               COALESCE(c.name, 'Walk-in customer') AS party, ii.quantity AS qty, ii.unit_price AS price, ii.subtotal AS total
        FROM invoice_items ii
        JOIN invoices i ON i.id = ii.invoice_id
        LEFT JOIN customers c ON c.id = i.customer_id
        WHERE ii.product_id = ?
      `).all(productId).map(r => ({ ...r, unit_cost: null, landed_cost: cost, profit: r.total - r.qty * cost }));

      const saleReturns = db.prepare(`
        SELECT 'sale_return' AS type, r.return_date AS date, 'Return ' || r.return_number AS ref,
               COALESCE(c.name, 'Walk-in customer') AS party, -ri.quantity AS qty, ri.unit_price AS price, -ri.subtotal AS total
        FROM return_items ri
        JOIN returns r ON r.id = ri.return_id
        LEFT JOIN customers c ON c.id = r.customer_id
        WHERE ri.product_id = ?
      `).all(productId).map(r => ({ ...r, unit_cost: null, landed_cost: cost, profit: r.total - r.qty * cost }));

      const rows = [
        ...purchases.map(r => ({ ...r, total: r.qty * r.landed_cost, profit: null })),
        ...supplierReturns.map(r => ({ ...r, total: r.qty * r.landed_cost, profit: null })),
        ...sales,
        ...saleReturns
      ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

      const sum = (list, f) => list.reduce((t, r) => t + f(r), 0);
      const summary = {
        bought_qty: sum(purchases, r => r.qty) + sum(supplierReturns, r => r.qty),
        bought_total: sum(purchases, r => r.qty * r.landed_cost) + sum(supplierReturns, r => r.qty * r.landed_cost),
        sold_qty: sum(sales, r => r.qty) + sum(saleReturns, r => r.qty),
        sold_total: sum(sales, r => r.total) + sum(saleReturns, r => r.total),
        profit: sum(sales, r => r.profit) + sum(saleReturns, r => r.profit),
        stock: product.current_stock,
        cost_price: cost,
        selling_price: product.selling_price
      };
      return { success: true, product, rows, summary };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Delete product
  ipcMain.handle('delete-product', (event, productId) => {
    const denied = checkPermission(event, 'inventory');
    if (denied) return denied;
    try {
      db.prepare('DELETE FROM products WHERE id = ?').run(productId);
      return { success: true };
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return {
          success: false,
          message: "This product can't be deleted because it has purchase, sale, or return history - deleting it would break those past records. Set its stock to 0 or edit it instead of deleting it."
        };
      }
      return { success: false, message: error.message };
    }
  });

  // Get low stock products. Login-only: feeds the Dashboard (see analytics.js's
  // get-today-sales for the same reasoning), which every logged-in role can see.
  ipcMain.handle('get-low-stock-products', (event) => {
    const denied = checkPermission(event);
    if (denied) return denied;
    try {
      const products = db.prepare(`
        SELECT * FROM products
        WHERE current_stock <= min_stock_level AND is_custom IS NOT 1
        ORDER BY current_stock ASC
      `).all();
      return products;
    } catch (error) {
      return [];
    }
  });

  // Adjust stock
  ipcMain.handle('adjust-stock', (event, { productId, newStock, reason }) => {
    const denied = checkPermission(event, 'inventory');
    if (denied) return denied;
    try {
      db.prepare('UPDATE products SET current_stock = ? WHERE id = ?')
        .run(newStock, productId);

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get categories. Login-only: used by both Inventory and Purchase (new-product forms).
  ipcMain.handle('get-categories', (event) => {
    const denied = checkPermission(event);
    if (denied) return denied;
    try {
      const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
      return categories;
    } catch (error) {
      return [];
    }
  });

  // Add category
  ipcMain.handle('add-category', (event, name) => {
    const denied = checkPermission(event, 'inventory');
    if (denied) return denied;
    try {
      const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(up(name));
      return { success: true, categoryId: result.lastInsertRowid };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Import products from CSV
  ipcMain.handle('import-products', (event, products) => {
    const denied = checkPermission(event, 'inventory');
    if (denied) return denied;
    try {
      const insert = db.prepare(`
        INSERT INTO products (name, sku, barcode, category_id, cost_price, selling_price, current_stock, min_stock_level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let imported = 0;
      for (const p of products) {
        try {
          insert.run(
            up(p.name),
            up(p.sku) || null,
            p.barcode,
            p.category_id || null,
            p.cost_price,
            p.selling_price,
            p.current_stock || 0,
            p.min_stock_level || 5
          );
          imported++;
        } catch (e) {
          // Skip duplicate or invalid records
        }
      }

      return { success: true, imported };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Export inventory + full sales + full purchase history to a 3-sheet Excel workbook -
  // a save dialog lets the user pick where to put it.
  ipcMain.handle('export-inventory-excel', async (event) => {
    const denied = checkPermission(event, 'inventory');
    if (denied) return denied;
    try {
      const workbook = buildInventoryWorkbook(db);

      const result = await dialog.showSaveDialog({
        title: 'Export Inventory, Sales & Purchases',
        defaultPath: `inventory-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
      });
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      await workbook.xlsx.writeFile(result.filePath);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });
};
