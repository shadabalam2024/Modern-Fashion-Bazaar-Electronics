const { checkPermission } = require('../session');

module.exports = (ipcMain, db) => {
  // Create purchase order
  ipcMain.handle('create-purchase', (event, { supplierId, items, userId }) => {
    const denied = checkPermission(event, 'purchase');
    if (denied) return denied;
    try {
      if (!items || items.length === 0) {
        return { success: false, message: 'Cannot create a purchase order with no items' };
      }

      const runPurchase = db.transaction(() => {
        let totalAmount = 0;
        for (const item of items) {
          totalAmount += item.subtotal;
        }

        const purchase = db.prepare(`
          INSERT INTO purchases (supplier_id, total_amount, created_by)
          VALUES (?, ?, ?)
        `).run(supplierId, totalAmount, userId);

        const itemInsert = db.prepare(`
          INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, subtotal)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const item of items) {
          itemInsert.run(purchase.lastInsertRowid, item.product_id, item.quantity, item.unit_cost, item.subtotal);
        }

        return purchase.lastInsertRowid;
      });

      const purchaseId = runPurchase();

      return { success: true, purchaseId };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Receive purchase (update stock)
  ipcMain.handle('receive-purchase', (event, purchaseId) => {
    const denied = checkPermission(event, 'purchase');
    if (denied) return denied;
    try {
      const runReceive = db.transaction(() => {
        const purchase = db.prepare('SELECT status FROM purchases WHERE id = ?').get(purchaseId);
        if (!purchase) {
          throw new Error('Purchase not found');
        }
        if (purchase.status === 'received') {
          throw new Error('Purchase has already been received');
        }

        const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(purchaseId);
        const getProduct = db.prepare('SELECT current_stock, cost_price FROM products WHERE id = ?');
        const updateStockAndCost = db.prepare('UPDATE products SET current_stock = ?, cost_price = ? WHERE id = ?');
        const logCostChange = db.prepare(`
          INSERT INTO cost_price_history (product_id, old_cost_price, new_cost_price, unit_cost, quantity, source, purchase_id)
          VALUES (?, ?, ?, ?, ?, 'purchase', ?)
        `);

        for (const item of items) {
          const product = getProduct.get(item.product_id);
          const newStock = product.current_stock + item.quantity;
          // Weighted average cost: blend existing stock's cost with this batch's cost
          const newCost = newStock > 0
            ? ((product.current_stock * product.cost_price) + (item.quantity * item.unit_cost)) / newStock
            : product.cost_price;
          updateStockAndCost.run(newStock, newCost, item.product_id);
          logCostChange.run(item.product_id, product.cost_price, newCost, item.unit_cost, item.quantity, purchaseId);
        }

        db.prepare('UPDATE purchases SET status = ? WHERE id = ?').run('received', purchaseId);
      });

      runReceive();

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get all purchases
  ipcMain.handle('get-purchases', (event, { limit = 100 }) => {
    try {
      const purchases = db.prepare(`
        SELECT p.*, s.name as supplier_name
        FROM purchases p
        JOIN suppliers s ON p.supplier_id = s.id
        ORDER BY p.purchase_date DESC
        LIMIT ?
      `).all(limit);

      return purchases;
    } catch (error) {
      return [];
    }
  });

  // Get suppliers
  ipcMain.handle('get-suppliers', () => {
    try {
      const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY name').all();
      return suppliers;
    } catch (error) {
      return [];
    }
  });

  // Add supplier
  ipcMain.handle('add-supplier', (event, supplier) => {
    const denied = checkPermission(event, 'purchase');
    if (denied) return denied;
    try {
      const result = db.prepare(`
        INSERT INTO suppliers (name, contact_person, phone, email, address)
        VALUES (?, ?, ?, ?, ?)
      `).run(supplier.name, supplier.contact_person, supplier.phone, supplier.email, supplier.address);

      return { success: true, supplierId: result.lastInsertRowid };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get purchase details
  ipcMain.handle('get-purchase', (event, purchaseId) => {
    try {
      const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
      const items = db.prepare(`
        SELECT pi.*, p.name as product_name, p.sku
        FROM purchase_items pi
        JOIN products p ON pi.product_id = p.id
        WHERE pi.purchase_id = ?
      `).all(purchaseId);

      return { ...purchase, items };
    } catch (error) {
      return null;
    }
  });
};
