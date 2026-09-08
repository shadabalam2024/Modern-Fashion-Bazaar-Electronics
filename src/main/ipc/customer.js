const { checkPermission } = require('../session');

module.exports = (ipcMain, db) => {
  // Get all customers. Login-only: used by both Customers (customers permission)
  // and Billing (billing permission) for customer lookup.
  ipcMain.handle('get-customers', (event) => {
    const denied = checkPermission(event);
    if (denied) return denied;
    try {
      const customers = db.prepare('SELECT * FROM customers ORDER BY name').all();
      return customers;
    } catch (error) {
      return [];
    }
  });

  // Add customer
  ipcMain.handle('add-customer', (event, customer) => {
    const denied = checkPermission(event, 'customers');
    if (denied) return denied;
    try {
      const result = db.prepare(`
        INSERT INTO customers (name, phone, email, address, is_recurring)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        customer.name,
        customer.phone,
        customer.email,
        customer.address,
        customer.is_recurring ? 1 : 0
      );

      return { success: true, customerId: result.lastInsertRowid };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get customer details
  ipcMain.handle('get-customer', (event, customerId) => {
    const denied = checkPermission(event, 'customers');
    if (denied) return denied;
    try {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
      
      // Get customer invoices
      const invoices = db.prepare(`
        SELECT * FROM invoices
        WHERE customer_id = ?
        ORDER BY invoice_date DESC
      `).all(customerId);

      return { ...customer, invoices };
    } catch (error) {
      return null;
    }
  });

  // Update customer
  ipcMain.handle('update-customer', (event, { id, ...customer }) => {
    const denied = checkPermission(event, 'customers');
    if (denied) return denied;
    try {
      db.prepare(`
        UPDATE customers SET
        name = ?, phone = ?, email = ?, address = ?, is_recurring = ?
        WHERE id = ?
      `).run(
        customer.name,
        customer.phone,
        customer.email,
        customer.address,
        customer.is_recurring ? 1 : 0,
        id
      );

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Record customer payment - applied against their oldest unpaid credit invoices first (FIFO)
  ipcMain.handle('record-customer-payment', (event, { customerId, amount, paymentMode }) => {
    const denied = checkPermission(event, 'customers');
    if (denied) return denied;
    try {
      const mode = paymentMode || 'cash';
      const runPayment = db.transaction(() => {
        db.prepare('UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?')
          .run(amount, customerId);

        const outstanding = db.prepare(`
          SELECT id, total_amount, amount_paid FROM invoices
          WHERE customer_id = ? AND payment_mode = 'credit' AND amount_paid < total_amount
          ORDER BY invoice_date ASC
        `).all(customerId);

        const applyToInvoice = db.prepare('UPDATE invoices SET amount_paid = amount_paid + ? WHERE id = ?');
        const insertPayment = db.prepare('INSERT INTO customer_payments (customer_id, invoice_id, amount, payment_mode) VALUES (?, ?, ?, ?)');

        let remaining = amount;
        for (const inv of outstanding) {
          if (remaining <= 0) break;
          const due = inv.total_amount - inv.amount_paid;
          const applied = Math.min(due, remaining);
          applyToInvoice.run(applied, inv.id);
          insertPayment.run(customerId, inv.id, applied, mode);
          remaining -= applied;
        }

        // Any leftover beyond all outstanding invoices is recorded as a general/advance payment
        if (remaining > 0) {
          insertPayment.run(customerId, null, remaining, mode);
        }
      });

      runPayment();

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get a customer's payment history, with which bill (if any) each payment was applied to
  ipcMain.handle('get-customer-payments', (event, customerId) => {
    const denied = checkPermission(event, 'customers');
    if (denied) return denied;
    try {
      const payments = db.prepare(`
        SELECT cp.*, i.bill_number
        FROM customer_payments cp
        LEFT JOIN invoices i ON cp.invoice_id = i.id
        WHERE cp.customer_id = ?
        ORDER BY cp.payment_date DESC
      `).all(customerId);

      return payments;
    } catch (error) {
      return [];
    }
  });

  // Get customers with credit balance
  ipcMain.handle('get-credit-customers', (event) => {
    const denied = checkPermission(event, 'customers');
    if (denied) return denied;
    try {
      const customers = db.prepare(`
        SELECT * FROM customers
        WHERE credit_balance > 0
        ORDER BY credit_balance DESC
      `).all();

      return customers;
    } catch (error) {
      return [];
    }
  });
};
