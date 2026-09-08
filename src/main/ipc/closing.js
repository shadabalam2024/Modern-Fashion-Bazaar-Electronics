const { checkPermission } = require('../session');

module.exports = (ipcMain, db) => {
  // Live-computed figures for a given date, from sales/payments/refunds - does not read/write daily_closings
  function computeFigures(date) {
    const sales = db.prepare(`
      SELECT payment_mode, COALESCE(SUM(total_amount), 0) as total
      FROM invoices
      WHERE DATE(invoice_date) = ?
      GROUP BY payment_mode
    `).all(date);
    const salesByMode = Object.fromEntries(sales.map(s => [s.payment_mode, s.total]));

    const payments = db.prepare(`
      SELECT payment_mode, COALESCE(SUM(amount), 0) as total
      FROM customer_payments
      WHERE DATE(payment_date) = ?
      GROUP BY payment_mode
    `).all(date);
    const paymentsByMode = Object.fromEntries(payments.map(p => [p.payment_mode, p.total]));

    const refundsCash = db.prepare(`
      SELECT COALESCE(SUM(refund_amount), 0) as total
      FROM returns
      WHERE DATE(return_date) = ? AND refund_mode = 'cash'
    `).get(date).total;

    return {
      cashSales: salesByMode.cash || 0,
      cardSales: salesByMode.card || 0,
      creditSales: salesByMode.credit || 0,
      paymentsReceivedCash: paymentsByMode.cash || 0,
      paymentsReceivedCard: paymentsByMode.card || 0,
      refundsCash
    };
  }

  // Preview a date before closing: live figures + suggested opening cash (previous day's actual) + whether already closed
  ipcMain.handle('get-closing-preview', (event, date) => {
    const denied = checkPermission(event, 'daily_closing');
    if (denied) return denied;
    try {
      const existing = db.prepare('SELECT * FROM daily_closings WHERE closing_date = ?').get(date);
      const previous = db.prepare(`
        SELECT actual_cash FROM daily_closings WHERE closing_date < ? ORDER BY closing_date DESC LIMIT 1
      `).get(date);

      return {
        figures: computeFigures(date),
        existing: existing || null,
        suggestedOpeningCash: existing ? existing.opening_cash : (previous ? previous.actual_cash : 0)
      };
    } catch (error) {
      return { figures: { cashSales: 0, cardSales: 0, creditSales: 0, paymentsReceivedCash: 0, paymentsReceivedCard: 0, refundsCash: 0 }, existing: null, suggestedOpeningCash: 0 };
    }
  });

  // Save (or overwrite) a day's closing. Server recomputes figures itself - never trusts client-sent totals.
  ipcMain.handle('save-daily-closing', (event, { date, openingCash, actualCash, notes, userId }) => {
    const denied = checkPermission(event, 'daily_closing');
    if (denied) return denied;
    try {
      const figures = computeFigures(date);
      const expectedCash = (openingCash || 0) + figures.cashSales + figures.paymentsReceivedCash - figures.refundsCash;
      const variance = (actualCash || 0) - expectedCash;

      db.prepare(`
        INSERT INTO daily_closings (
          closing_date, opening_cash, cash_sales, card_sales, credit_sales,
          payments_received_cash, payments_received_card, refunds_cash,
          expected_cash, actual_cash, variance, notes, closed_by, closed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(closing_date) DO UPDATE SET
          opening_cash = excluded.opening_cash,
          cash_sales = excluded.cash_sales,
          card_sales = excluded.card_sales,
          credit_sales = excluded.credit_sales,
          payments_received_cash = excluded.payments_received_cash,
          payments_received_card = excluded.payments_received_card,
          refunds_cash = excluded.refunds_cash,
          expected_cash = excluded.expected_cash,
          actual_cash = excluded.actual_cash,
          variance = excluded.variance,
          notes = excluded.notes,
          closed_by = excluded.closed_by,
          closed_at = CURRENT_TIMESTAMP
      `).run(
        date, openingCash || 0, figures.cashSales, figures.cardSales, figures.creditSales,
        figures.paymentsReceivedCash, figures.paymentsReceivedCard, figures.refundsCash,
        expectedCash, actualCash || 0, variance, notes || null, userId
      );

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Closing history, newest first
  ipcMain.handle('get-closing-history', (event, { limit = 60 } = {}) => {
    const denied = checkPermission(event, 'daily_closing');
    if (denied) return denied;
    try {
      const rows = db.prepare(`
        SELECT dc.*, u.username as closed_by_username
        FROM daily_closings dc
        LEFT JOIN users u ON dc.closed_by = u.id
        ORDER BY dc.closing_date DESC
        LIMIT ?
      `).all(limit);
      return rows;
    } catch (error) {
      return [];
    }
  });
};
