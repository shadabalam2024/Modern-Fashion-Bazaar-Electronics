const { checkPermission, requireLoginOrTrusted } = require('../session');

module.exports = (ipcMain, db) => {
  // Get next bill number. Login-only: Billing-only in practice, but not sensitive.
  ipcMain.handle('get-next-bill-number', (event) => {
    const denied = checkPermission(event);
    if (denied) return denied;
    try {
      const result = db.prepare('SELECT MAX(bill_number) as maxBill FROM invoices').get();
      const maxBill = result.maxBill ? parseInt(result.maxBill.split('-')[1]) : 0;
      return `INV-${String(maxBill + 1).padStart(5, '0')}`;
    } catch (error) {
      return 'INV-00001';
    }
  });

  // Create invoice
  ipcMain.handle('create-invoice', (event, { billNumber, customerId, items, discount, paymentMode, userId }) => {
    const denied = checkPermission(event, 'billing');
    if (denied) return denied;
    try {
      if (!items || items.length === 0) {
        return { success: false, message: 'Cannot create an invoice with no items' };
      }

      const runInvoice = db.transaction(() => {
        // Lock in current stock and validate before writing anything (custom/one-off items skip stock tracking entirely)
        const stockCheck = db.prepare('SELECT current_stock, is_custom FROM products WHERE id = ?');
        for (const item of items) {
          const product = stockCheck.get(item.product_id);
          if (!product) {
            throw new Error(`Product ${item.product_id} not found`);
          }
          if (!product.is_custom && product.current_stock < item.quantity) {
            throw new Error(`Insufficient stock for product ${item.product_id} (have ${product.current_stock}, need ${item.quantity})`);
          }
        }

        let totalAmount = 0;
        const reduceStock = db.prepare('UPDATE products SET current_stock = current_stock - ? WHERE id = ?');
        for (const item of items) {
          totalAmount += item.subtotal;
          if (!item.isCustom) {
            reduceStock.run(item.quantity, item.product_id);
          }
        }

        totalAmount -= discount;

        const shopSettings = db.prepare('SELECT gst_rate FROM shop_settings WHERE id = 1').get();
        const gstRate = shopSettings?.gst_rate || 0;
        const gstAmount = Math.round(totalAmount * (gstRate / 100) * 100) / 100;
        totalAmount += gstAmount;

        if (paymentMode === 'credit' && customerId) {
          db.prepare('UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?')
            .run(totalAmount, customerId);
        }

        const amountPaid = paymentMode === 'credit' ? 0 : totalAmount;

        const invoice = db.prepare(`
          INSERT INTO invoices (bill_number, customer_id, total_amount, discount_amount, gst_amount, amount_paid, payment_mode, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(billNumber, customerId || null, totalAmount, discount, gstAmount, amountPaid, paymentMode, userId);

        const itemInsert = db.prepare(`
          INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, discount, subtotal)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const item of items) {
          itemInsert.run(invoice.lastInsertRowid, item.product_id, item.quantity, item.unit_price, item.itemDiscount || 0, item.subtotal);
        }

        return invoice.lastInsertRowid;
      });

      const invoiceId = runInvoice();

      return { success: true, invoiceId, billNumber };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get invoice details. Login-or-trusted: used by Billing (logged-in) and the
  // standalone invoice-print window, which has no login session of its own.
  ipcMain.handle('get-invoice', (event, invoiceId) => {
    const denied = requireLoginOrTrusted(event);
    if (denied) return denied;
    try {
      const invoice = db.prepare(`
        SELECT i.*, c.name as customer_name, c.phone as customer_phone, u.username as created_by_username
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        LEFT JOIN users u ON i.created_by = u.id
        WHERE i.id = ?
      `).get(invoiceId);
      const items = db.prepare(`
        SELECT ii.*, p.name as product_name, p.barcode
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.invoice_id = ?
      `).all(invoiceId);

      return { ...invoice, items };
    } catch (error) {
      return null;
    }
  });

  // Get all invoices
  ipcMain.handle('get-invoices', (event, { startDate, endDate, limit = 100 }) => {
    const denied = checkPermission(event, 'billing');
    if (denied) return denied;
    try {
      let query = `
        SELECT i.*, c.name as customer_name, u.username
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        LEFT JOIN users u ON i.created_by = u.id
      `;

      const params = [];

      if (startDate && endDate) {
        query += ` WHERE DATE(i.invoice_date) BETWEEN ? AND ?`;
        params.push(startDate, endDate);
      }

      query += ` ORDER BY i.invoice_date DESC LIMIT ?`;
      params.push(limit);

      const invoices = db.prepare(query).all(...params);
      return invoices;
    } catch (error) {
      return [];
    }
  });

  // Search products by barcode or name. Login-only: used by both Billing and Purchase.
  ipcMain.handle('search-product', (event, query) => {
    const denied = checkPermission(event);
    if (denied) return denied;
    try {
      const products = db.prepare(`
        SELECT * FROM products
        WHERE (barcode LIKE ? OR name LIKE ? OR sku LIKE ?) AND is_custom IS NOT 1
        LIMIT 10
      `).all(`%${query}%`, `%${query}%`, `%${query}%`);

      return products;
    } catch (error) {
      return [];
    }
  });

  // Get product by barcode. Login-only: used by both Billing and Purchase (duplicate-barcode check).
  ipcMain.handle('get-product-by-barcode', (event, barcode) => {
    const denied = checkPermission(event);
    if (denied) return denied;
    try {
      const product = db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode);
      return product || null;
    } catch (error) {
      return null;
    }
  });
};
