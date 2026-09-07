module.exports = (ipcMain, db) => {
  // Get sales report
  ipcMain.handle('get-sales-report', (event, { startDate, endDate }) => {
    try {
      const sales = db.prepare(`
        SELECT 
          DATE(invoice_date) as date,
          COUNT(*) as invoice_count,
          SUM(total_amount) as total_sales
        FROM invoices
        WHERE DATE(invoice_date) BETWEEN ? AND ?
        GROUP BY DATE(invoice_date)
        ORDER BY date DESC
      `).all(startDate, endDate);

      return sales;
    } catch (error) {
      return [];
    }
  });

  // Get profit analysis
  ipcMain.handle('get-profit-analysis', (event, { startDate, endDate }) => {
    try {
      const analysis = db.prepare(`
        SELECT 
          p.id,
          p.name,
          SUM(ii.quantity) as quantity_sold,
          SUM(ii.subtotal) as revenue,
          SUM(ii.quantity * p.cost_price) as cost,
          SUM(ii.subtotal) - SUM(ii.quantity * p.cost_price) as profit,
          ROUND((SUM(ii.subtotal) - SUM(ii.quantity * p.cost_price)) / SUM(ii.subtotal) * 100, 2) as margin
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE DATE(i.invoice_date) BETWEEN ? AND ?
        GROUP BY p.id
        ORDER BY profit DESC
      `).all(startDate, endDate);

      return analysis;
    } catch (error) {
      return [];
    }
  });

  // Get today's sales
  ipcMain.handle('get-today-sales', () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const summary = db.prepare(`
        SELECT 
          COUNT(*) as invoice_count,
          SUM(total_amount) as total_revenue,
          SUM(CASE WHEN payment_mode = 'cash' THEN total_amount ELSE 0 END) as cash_received,
          SUM(CASE WHEN payment_mode = 'card' THEN total_amount ELSE 0 END) as card_received,
          SUM(CASE WHEN payment_mode = 'credit' THEN total_amount ELSE 0 END) as credit_sales
        FROM invoices
        WHERE DATE(invoice_date) = ?
      `).get(today);

      // Calculate profit
      const profit = db.prepare(`
        SELECT 
          SUM(ii.subtotal) - SUM(ii.quantity * p.cost_price) as total_profit
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE DATE(i.invoice_date) = ?
      `).get(today);

      return { ...summary, total_profit: profit.total_profit || 0 };
    } catch (error) {
      return {};
    }
  });

  // Get top products
  ipcMain.handle('get-top-products', (event, limit = 5) => {
    try {
      const products = db.prepare(`
        SELECT 
          p.id,
          p.name,
          SUM(ii.quantity) as quantity_sold,
          SUM(ii.subtotal) as revenue
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        GROUP BY p.id
        ORDER BY quantity_sold DESC
        LIMIT ?
      `).all(limit);

      return products;
    } catch (error) {
      return [];
    }
  });

  // Get sales trend (last 30 days)
  ipcMain.handle('get-sales-trend', () => {
    try {
      const trend = db.prepare(`
        SELECT 
          DATE(invoice_date) as date,
          SUM(total_amount) as sales
        FROM invoices
        WHERE invoice_date >= datetime('now', '-30 days')
        GROUP BY DATE(invoice_date)
        ORDER BY date
      `).all();

      return trend;
    } catch (error) {
      return [];
    }
  });

  // Get category performance
  ipcMain.handle('get-category-performance', (event, { startDate, endDate }) => {
    try {
      const performance = db.prepare(`
        SELECT 
          c.name as category,
          COUNT(ii.id) as items_sold,
          SUM(ii.subtotal) as revenue,
          ROUND(AVG(ii.subtotal), 2) as avg_price
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE DATE(i.invoice_date) BETWEEN ? AND ?
        GROUP BY c.id
        ORDER BY revenue DESC
      `).all(startDate, endDate);

      return performance;
    } catch (error) {
      return [];
    }
  });

  // Get sales trend grouped by day, week, or month over a custom range
  ipcMain.handle('get-sales-trend-by-period', (event, { period, startDate, endDate }) => {
    try {
      const groupExpr = period === 'weekly'
        ? "strftime('%Y-W%W', invoice_date)"
        : period === 'monthly'
        ? "strftime('%Y-%m', invoice_date)"
        : 'DATE(invoice_date)';

      const trend = db.prepare(`
        SELECT
          ${groupExpr} as label,
          SUM(total_amount) as sales,
          COUNT(*) as invoice_count
        FROM invoices
        WHERE DATE(invoice_date) BETWEEN ? AND ?
        GROUP BY label
        ORDER BY label
      `).all(startDate, endDate);

      return trend;
    } catch (error) {
      return [];
    }
  });

  // Get a single product's sales performance over a date range
  ipcMain.handle('get-product-performance', (event, { productId, startDate, endDate }) => {
    try {
      const daily = db.prepare(`
        SELECT
          DATE(i.invoice_date) as date,
          SUM(ii.quantity) as quantity_sold,
          SUM(ii.subtotal) as revenue,
          SUM(ii.subtotal) - SUM(ii.quantity * p.cost_price) as profit
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE ii.product_id = ? AND DATE(i.invoice_date) BETWEEN ? AND ?
        GROUP BY DATE(i.invoice_date)
        ORDER BY date
      `).all(productId, startDate, endDate);

      const totals = db.prepare(`
        SELECT
          SUM(ii.quantity) as quantity_sold,
          SUM(ii.subtotal) as revenue,
          SUM(ii.subtotal) - SUM(ii.quantity * p.cost_price) as profit
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE ii.product_id = ? AND DATE(i.invoice_date) BETWEEN ? AND ?
      `).get(productId, startDate, endDate);

      return {
        daily,
        quantity_sold: totals.quantity_sold || 0,
        revenue: totals.revenue || 0,
        profit: totals.profit || 0
      };
    } catch (error) {
      return { daily: [], quantity_sold: 0, revenue: 0, profit: 0 };
    }
  });
};
