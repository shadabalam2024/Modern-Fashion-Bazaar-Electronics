const { checkPermission } = require('../session');

module.exports = (ipcMain, db) => {
  // Get all products. Login-only: used across Billing, Purchase, and Inventory, each
  // with a different permission - the common requirement is just being logged in.
  ipcMain.handle('get-products', (event) => {
    const denied = checkPermission(event);
    if (denied) return denied;
    try {
      const products = db.prepare(`
        SELECT p.*, c.name as category_name
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
      `).run(name, price, price, 999999, 0);

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
      const result = db.prepare(`
        INSERT INTO products (name, sku, barcode, category_id, cost_price, selling_price, current_stock, min_stock_level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        product.name,
        product.sku,
        product.barcode,
        product.category_id,
        product.cost_price,
        product.selling_price,
        product.current_stock || 0,
        product.min_stock_level || 5
      );

      return { success: true, productId: result.lastInsertRowid };
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

        db.prepare(`
          UPDATE products SET
          name = ?, sku = ?, barcode = ?, category_id = ?,
          cost_price = ?, selling_price = ?, min_stock_level = ?
          WHERE id = ?
        `).run(
          product.name,
          product.sku,
          product.barcode,
          product.category_id,
          product.cost_price,
          product.selling_price,
          product.min_stock_level,
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
        SELECT cph.*, s.name as supplier_name
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

  // Delete product
  ipcMain.handle('delete-product', (event, productId) => {
    const denied = checkPermission(event, 'inventory');
    if (denied) return denied;
    try {
      db.prepare('DELETE FROM products WHERE id = ?').run(productId);
      return { success: true };
    } catch (error) {
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
      const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
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
            p.name,
            p.sku,
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
};
