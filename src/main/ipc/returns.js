const { checkPermission } = require('../session');

module.exports = (ipcMain, db) => {
  // Get next return number
  function getNextReturnNumber() {
    const result = db.prepare('SELECT MAX(return_number) as maxRet FROM returns').get();
    const maxRet = result.maxRet ? parseInt(result.maxRet.split('-')[1]) : 0;
    return `RET-${String(maxRet + 1).padStart(5, '0')}`;
  }

  // Find an invoice to start a return against, by exact or partial bill number
  ipcMain.handle('find-invoice-for-return', (event, billNumberQuery) => {
    const denied = checkPermission(event, 'returns');
    if (denied) return denied;
    try {
      const invoices = db.prepare(`
        SELECT i.*, c.name as customer_name
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        WHERE i.bill_number LIKE ?
        ORDER BY i.invoice_date DESC
        LIMIT 10
      `).all(`%${billNumberQuery}%`);
      return invoices;
    } catch (error) {
      return [];
    }
  });

  // Get an invoice's line items with how much of each has already been returned
  ipcMain.handle('get-invoice-return-details', (event, invoiceId) => {
    const denied = checkPermission(event, 'returns');
    if (denied) return denied;
    try {
      const invoice = db.prepare(`
        SELECT i.*, c.name as customer_name
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        WHERE i.id = ?
      `).get(invoiceId);
      if (!invoice) return null;

      const items = db.prepare(`
        SELECT ii.*, p.name as product_name, p.barcode, p.is_custom,
          COALESCE((SELECT SUM(ri.quantity) FROM return_items ri WHERE ri.invoice_item_id = ii.id), 0) as already_returned
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.invoice_id = ?
      `).all(invoiceId);

      return { ...invoice, items };
    } catch (error) {
      return null;
    }
  });

  // Process a return: validates quantities, refunds, optionally restocks, and adjusts customer due
  ipcMain.handle('create-return', (event, { invoiceId, items, reason, refundMode, userId }) => {
    const denied = checkPermission(event, 'returns');
    if (denied) return denied;
    try {
      if (!items || items.length === 0) {
        return { success: false, message: 'Select at least one item to return' };
      }

      const runReturn = db.transaction(() => {
        const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
        if (!invoice) throw new Error('Invoice not found');

        if (refundMode === 'credit_adjust') {
          if (invoice.payment_mode !== 'credit') {
            throw new Error('Adjust-against-due is only available for credit invoices');
          }
          if (!invoice.customer_id) throw new Error('This invoice has no linked customer');
        }

        const getInvoiceItem = db.prepare('SELECT * FROM invoice_items WHERE id = ? AND invoice_id = ?');
        const getAlreadyReturned = db.prepare(`SELECT COALESCE(SUM(quantity), 0) as qty FROM return_items WHERE invoice_item_id = ?`);
        const getProduct = db.prepare('SELECT current_stock, is_custom FROM products WHERE id = ?');

        let refundAmount = 0;
        const lines = [];
        for (const line of items) {
          const invItem = getInvoiceItem.get(line.invoiceItemId, invoiceId);
          if (!invItem) throw new Error('Invalid invoice item');
          const alreadyReturned = getAlreadyReturned.get(line.invoiceItemId).qty;
          const returnable = invItem.quantity - alreadyReturned;
          if (line.quantity <= 0 || line.quantity > returnable) {
            throw new Error(`Invalid return quantity for an item (max returnable: ${returnable})`);
          }
          if (!line.restock && !line.disposition) {
            throw new Error('Select a reason (Damaged/Defective/Other) for any item that is not being restocked');
          }
          const effectiveUnitPrice = invItem.subtotal / invItem.quantity;
          const subtotal = Math.round(effectiveUnitPrice * line.quantity * 100) / 100;
          refundAmount += subtotal;
          lines.push({
            invItem, quantity: line.quantity, unitPrice: effectiveUnitPrice, subtotal,
            restock: !!line.restock, disposition: line.restock ? null : line.disposition
          });
        }

        const returnNumber = getNextReturnNumber();
        const returnResult = db.prepare(`
          INSERT INTO returns (return_number, invoice_id, customer_id, reason, refund_amount, refund_mode, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(returnNumber, invoiceId, invoice.customer_id, reason || null, refundAmount, refundMode, userId);

        const insertReturnItem = db.prepare(`
          INSERT INTO return_items (return_id, invoice_item_id, product_id, quantity, unit_price, subtotal, restocked, disposition)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const restockProduct = db.prepare('UPDATE products SET current_stock = current_stock + ? WHERE id = ?');

        for (const line of lines) {
          insertReturnItem.run(
            returnResult.lastInsertRowid, line.invItem.id, line.invItem.product_id,
            line.quantity, line.unitPrice, line.subtotal, line.restock ? 1 : 0, line.disposition
          );
          if (line.restock) {
            const product = getProduct.get(line.invItem.product_id);
            if (product && !product.is_custom) {
              restockProduct.run(line.quantity, line.invItem.product_id);
            }
          }
        }

        db.prepare('UPDATE invoices SET refunded_amount = refunded_amount + ? WHERE id = ?').run(refundAmount, invoiceId);

        if (refundMode === 'credit_adjust') {
          db.prepare('UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?').run(refundAmount, invoice.customer_id);
        }

        return returnResult.lastInsertRowid;
      });

      const returnId = runReturn();
      return { success: true, returnId };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // List returns, newest first
  ipcMain.handle('get-returns', (event) => {
    const denied = checkPermission(event, 'returns');
    if (denied) return denied;
    try {
      const returns = db.prepare(`
        SELECT r.*, i.bill_number, c.name as customer_name
        FROM returns r
        LEFT JOIN invoices i ON r.invoice_id = i.id
        LEFT JOIN customers c ON r.customer_id = c.id
        ORDER BY r.return_date DESC
      `).all();
      return returns;
    } catch (error) {
      return [];
    }
  });

  // Get one return's full detail
  ipcMain.handle('get-return', (event, returnId) => {
    const denied = checkPermission(event, 'returns');
    if (denied) return denied;
    try {
      const ret = db.prepare(`
        SELECT r.*, i.bill_number, c.name as customer_name
        FROM returns r
        LEFT JOIN invoices i ON r.invoice_id = i.id
        LEFT JOIN customers c ON r.customer_id = c.id
        WHERE r.id = ?
      `).get(returnId);
      if (!ret) return null;

      const items = db.prepare(`
        SELECT ri.*, p.name as product_name
        FROM return_items ri
        JOIN products p ON ri.product_id = p.id
        WHERE ri.return_id = ?
      `).all(returnId);

      return { ...ret, items };
    } catch (error) {
      return null;
    }
  });

  // Log of returned items that were NOT restocked (damaged/defective/other), newest first
  ipcMain.handle('get-damage-log', (event) => {
    const denied = checkPermission(event, 'returns');
    if (denied) return denied;
    try {
      const log = db.prepare(`
        SELECT ri.id, ri.quantity, ri.subtotal, ri.disposition,
          p.name as product_name,
          r.return_number, r.return_date, r.reason as return_reason,
          i.bill_number
        FROM return_items ri
        JOIN products p ON ri.product_id = p.id
        JOIN returns r ON ri.return_id = r.id
        LEFT JOIN invoices i ON r.invoice_id = i.id
        WHERE ri.restocked = 0
        ORDER BY r.return_date DESC
      `).all();
      return log;
    } catch (error) {
      return [];
    }
  });
};
