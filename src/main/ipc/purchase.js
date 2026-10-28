const { dialog } = require('electron');
const ExcelJS = require('exceljs');
const { checkPermission } = require('../session');
const { computePurchaseTotals } = require('../purchaseMath');
const { nextBarcodes } = require('../barcodes');

const TEMPLATE_HEADERS = ['Barcode', 'Product Name', 'Quantity', 'Cost', 'MRP', 'Selling Price'];

module.exports = (ipcMain, db) => {
  // A received purchase has already put its goods into stock and blended their cost into the product.
  // To edit or delete it, take the old lines back out of stock and cost and (for an edit) put the new
  // lines in. Stock moves by the difference; cost is the weighted average re-worked with the batch swapped.
  function adjustReceivedStock(purchaseId, oldItems, newItems) {
    const sum = (items) => {
      const m = new Map();
      for (const i of items) {
        const cur = m.get(i.product_id) || { qty: 0, value: 0, last: null };
        cur.qty += i.quantity;
        cur.value += i.quantity * (i.landed_unit_cost ?? i.unit_cost);
        cur.last = i;
        m.set(i.product_id, cur);
      }
      return m;
    };
    const before = sum(oldItems);
    const after = sum(newItems);
    const getProduct = db.prepare('SELECT name, current_stock, cost_price FROM products WHERE id = ?');
    const update = db.prepare('UPDATE products SET current_stock = ?, cost_price = ? WHERE id = ?');
    const setPrices = db.prepare('UPDATE products SET mrp = COALESCE(?, mrp), selling_price = COALESCE(?, selling_price) WHERE id = ?');
    const log = db.prepare(`
      INSERT INTO cost_price_history (product_id, old_cost_price, new_cost_price, unit_cost, quantity, source, purchase_id, stock_before)
      VALUES (?, ?, ?, ?, ?, 'purchase', ?, ?)
    `);
    // the old receive entries are replaced by the new ones
    db.prepare("DELETE FROM cost_price_history WHERE purchase_id = ? AND source = 'purchase'").run(purchaseId);

    for (const productId of new Set([...before.keys(), ...after.keys()])) {
      const product = getProduct.get(productId);
      if (!product) continue;
      const b = before.get(productId) || { qty: 0, value: 0 };
      const a = after.get(productId) || { qty: 0, value: 0 };
      const newStock = product.current_stock - b.qty + a.qty;
      if (newStock < 0) {
        throw new Error(`Not enough stock of "${product.name}" to change this purchase - ${b.qty - a.qty} of the units have already been sold (${product.current_stock} in stock)`);
      }
      const value = product.current_stock * product.cost_price - b.value + a.value;
      const newCost = newStock > 0 ? Math.max(0, value / newStock) : product.cost_price;
      update.run(newStock, newCost, productId);
      if (a.qty > 0) {
        setPrices.run(a.last.mrp ?? null, a.last.selling_price ?? null, productId);
        log.run(productId, product.cost_price, newCost, a.value / a.qty, a.qty, purchaseId, product.current_stock - b.qty);
      }
    }
  }

  const assertNoSupplierReturns = (purchaseId) => {
    const n = db.prepare('SELECT COUNT(*) AS n FROM purchase_returns WHERE purchase_id = ?').get(purchaseId).n;
    if (n > 0) throw new Error('This purchase has goods returned to the supplier, so it can no longer be changed');
  };

  // Validates the payload, recomputes every figure from it (the renderer's numbers are only a
  // preview) and writes the purchase header + lines. Used for both create and edit.
  function savePurchase({ purchaseId, supplierId, userId, supplierBillNo, supplierGstin, billDate, discount, gstRate, gstInCost, transportCost, items }) {
    if (!supplierId) throw new Error('Select a supplier');
    if (!items || items.length === 0) throw new Error('Cannot create a purchase order with no items');
    for (const item of items) {
      if (!(Number(item.quantity) > 0) || !Number.isInteger(Number(item.quantity))) throw new Error('Quantities must be whole numbers above zero');
      if (!(Number(item.unit_cost) >= 0)) throw new Error('Unit cost cannot be negative');
    }
    if (Number(transportCost) < 0) throw new Error('Transport cost cannot be negative');
    if (Number(discount) < 0) throw new Error('Discount cannot be negative');

    const totals = computePurchaseTotals({ items, discount, gstRate, transport: transportCost, gstInCost: !!gstInCost });

    return db.transaction(() => {
      // the supplier's GST number lives on the supplier, so it is remembered for their next purchase
      if (supplierGstin !== undefined) {
        db.prepare('UPDATE suppliers SET gstin = ? WHERE id = ?')
          .run(String(supplierGstin).trim().toUpperCase() || null, supplierId);
      }
      let id = purchaseId;
      let wasReceived = false;
      let oldItems = [];
      const header = [
        supplierId, totals.grandTotal, totals.transport, supplierBillNo || null, billDate || null,
        totals.discount, Number(gstRate) || 0, totals.gstAmount, gstInCost ? 1 : 0, totals.roundOff
      ];
      if (id) {
        const existing = db.prepare('SELECT status FROM purchases WHERE id = ?').get(id);
        if (!existing) throw new Error('Purchase not found');
        if (existing.status === 'received') assertNoSupplierReturns(id);
        wasReceived = existing.status === 'received';
        if (wasReceived) oldItems = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(id);
        db.prepare(`
          UPDATE purchases SET supplier_id = ?, total_amount = ?, transport_cost = ?, supplier_bill_no = ?, bill_date = ?,
            discount_amount = ?, gst_rate = ?, gst_amount = ?, gst_in_cost = ?, round_off = ?
          WHERE id = ?
        `).run(...header, id);
        db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(id);
      } else {
        id = db.prepare(`
          INSERT INTO purchases (supplier_id, total_amount, transport_cost, supplier_bill_no, bill_date,
            discount_amount, gst_rate, gst_amount, gst_in_cost, round_off, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(...header, userId).lastInsertRowid;
      }

      const itemInsert = db.prepare(`
        INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, subtotal, landed_unit_cost, mrp, selling_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      items.forEach((item, i) => {
        const qty = Number(item.quantity);
        const cost = Number(item.unit_cost);
        itemInsert.run(
          id, item.product_id, qty, cost, qty * cost, totals.landed[i],
          item.mrp === '' || item.mrp == null ? null : Number(item.mrp),
          item.selling_price === '' || item.selling_price == null ? null : Number(item.selling_price)
        );
      });
      if (wasReceived) {
        adjustReceivedStock(id, oldItems, db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(id));
      }
      return id;
    })();
  }

  ipcMain.handle('create-purchase', (event, payload) => {
    const denied = checkPermission(event, 'purchase');
    if (denied) return denied;
    try {
      return { success: true, purchaseId: savePurchase({ ...payload, purchaseId: null }) };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('update-purchase', (event, payload) => {
    const denied = checkPermission(event, 'purchase');
    if (denied) return denied;
    try {
      return { success: true, purchaseId: savePurchase(payload) };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Delete a purchase. If it was already received, its goods come back out of stock (and cost) first.
  ipcMain.handle('delete-purchase', (event, purchaseId) => {
    const denied = checkPermission(event, 'purchase');
    if (denied) return denied;
    try {
      db.transaction(() => {
        const purchase = db.prepare('SELECT status FROM purchases WHERE id = ?').get(purchaseId);
        if (!purchase) throw new Error('Purchase not found');
        if (purchase.status === 'received') {
          assertNoSupplierReturns(purchaseId);
          adjustReceivedStock(purchaseId, db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(purchaseId), []);
        }
        db.prepare("DELETE FROM cost_price_history WHERE purchase_id = ?").run(purchaseId);
        db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(purchaseId);
        db.prepare('DELETE FROM purchases WHERE id = ?').run(purchaseId);
      })();
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Receive purchase (update stock, blend cost, apply the line's MRP / selling price)
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
        const updatePrices = db.prepare(`
          UPDATE products SET mrp = COALESCE(?, mrp), selling_price = COALESCE(?, selling_price) WHERE id = ?
        `);
        const logCostChange = db.prepare(`
          INSERT INTO cost_price_history (product_id, old_cost_price, new_cost_price, unit_cost, quantity, source, purchase_id, stock_before)
          VALUES (?, ?, ?, ?, ?, 'purchase', ?, ?)
        `);

        for (const item of items) {
          const product = getProduct.get(item.product_id);
          const newStock = product.current_stock + item.quantity;
          const batchCost = item.landed_unit_cost ?? item.unit_cost; // includes discount / transport share
          // Weighted average cost: blend existing stock's cost with this batch's cost
          const newCost = newStock > 0
            ? ((product.current_stock * product.cost_price) + (item.quantity * batchCost)) / newStock
            : product.cost_price;
          updateStockAndCost.run(newStock, newCost, item.product_id);
          updatePrices.run(item.mrp, item.selling_price, item.product_id);
          logCostChange.run(item.product_id, product.cost_price, newCost, batchCost, item.quantity, purchaseId, product.current_stock);
        }

        db.prepare("UPDATE purchases SET status = ?, received_at = datetime('now') WHERE id = ?").run('received', purchaseId);
      });

      runReceive();

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Send received goods back to the supplier: stock goes down and the refund shows in the Ledger
  ipcMain.handle('create-purchase-return', (event, { purchaseId, items, reason, userId }) => {
    const denied = checkPermission(event, 'purchase');
    if (denied) return denied;
    try {
      const returnId = db.transaction(() => {
        const purchase = db.prepare('SELECT status FROM purchases WHERE id = ?').get(purchaseId);
        if (!purchase) throw new Error('Purchase not found');
        if (purchase.status !== 'received') throw new Error('Only a received purchase can be returned to the supplier');

        const lines = (items || []).filter(i => Number(i.quantity) > 0);
        if (lines.length === 0) throw new Error('Enter a quantity to return');

        const getLine = db.prepare('SELECT * FROM purchase_items WHERE id = ? AND purchase_id = ?');
        const getProduct = db.prepare('SELECT name, current_stock FROM products WHERE id = ?');
        let amount = 0;
        const prepared = lines.map(l => {
          const line = getLine.get(l.purchase_item_id, purchaseId);
          if (!line) throw new Error('Item is not part of this purchase');
          const qty = Number(l.quantity);
          if (!Number.isInteger(qty)) throw new Error('Quantities must be whole numbers');
          const remaining = line.quantity - (line.returned_qty || 0);
          if (qty > remaining) throw new Error(`Only ${remaining} left to return for one of the items`);
          const product = getProduct.get(line.product_id);
          if (qty > product.current_stock) throw new Error(`Not enough stock of "${product.name}" to return (have ${product.current_stock})`);
          const unitCost = line.landed_unit_cost ?? line.unit_cost;
          amount += qty * unitCost;
          return { line, qty, unitCost };
        });

        const ret = db.prepare('INSERT INTO purchase_returns (purchase_id, amount, reason, created_by) VALUES (?, ?, ?, ?)')
          .run(purchaseId, amount, reason || null, userId || null);
        const insertItem = db.prepare(`
          INSERT INTO purchase_return_items (return_id, purchase_item_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?, ?)
        `);
        for (const { line, qty, unitCost } of prepared) {
          insertItem.run(ret.lastInsertRowid, line.id, line.product_id, qty, unitCost);
          db.prepare('UPDATE purchase_items SET returned_qty = COALESCE(returned_qty, 0) + ? WHERE id = ?').run(qty, line.id);
          db.prepare('UPDATE products SET current_stock = current_stock - ? WHERE id = ?').run(qty, line.product_id);
        }
        return ret.lastInsertRowid;
      })();
      return { success: true, returnId };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get all purchases
  ipcMain.handle('get-purchases', (event, { limit = 100 }) => {
    const denied = checkPermission(event, 'purchase');
    if (denied) return denied;
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
  ipcMain.handle('get-suppliers', (event) => {
    const denied = checkPermission(event, 'purchase');
    if (denied) return denied;
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
        INSERT INTO suppliers (name, contact_person, phone, email, address, gstin)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(supplier.name, supplier.contact_person, supplier.phone, supplier.email, supplier.address,
        supplier.gstin ? String(supplier.gstin).trim().toUpperCase() : null);

      return { success: true, supplierId: result.lastInsertRowid };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get purchase details (with supplier, each line's product and what has been returned)
  ipcMain.handle('get-purchase', (event, purchaseId) => {
    const denied = checkPermission(event, 'purchase');
    if (denied) return denied;
    try {
      const purchase = db.prepare(`
        SELECT p.*, s.name AS supplier_name, s.phone AS supplier_phone, s.address AS supplier_address, s.gstin AS supplier_gstin
        FROM purchases p JOIN suppliers s ON p.supplier_id = s.id WHERE p.id = ?
      `).get(purchaseId);
      const items = db.prepare(`
        SELECT pi.*, p.name as product_name, p.sku, p.barcode
        FROM purchase_items pi
        JOIN products p ON pi.product_id = p.id
        WHERE pi.purchase_id = ?
        ORDER BY pi.id
      `).all(purchaseId);
      const returns = db.prepare('SELECT * FROM purchase_returns WHERE purchase_id = ? ORDER BY id DESC').all(purchaseId);

      return { ...purchase, items, returns };
    } catch (error) {
      return null;
    }
  });

  // Next free barcode numbers for new products
  ipcMain.handle('get-next-barcodes', (event, { count = 1 } = {}) => {
    const denied = checkPermission(event);
    if (denied) return denied;
    try {
      return { success: true, barcodes: nextBarcodes(db, Math.min(Math.max(parseInt(count) || 1, 1), 500)) };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Save a blank Excel template to fill in and import
  ipcMain.handle('download-purchase-template', async (event) => {
    const denied = checkPermission(event, 'purchase');
    if (denied) return denied;
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Purchase');
      sheet.columns = TEMPLATE_HEADERS.map(h => ({ header: h, key: h, width: 18 }));
      sheet.getRow(1).font = { bold: true };
      sheet.addRow({ Barcode: '731008', 'Product Name': '(optional if barcode is given)', Quantity: 10, Cost: 213.56, MRP: 349, 'Selling Price': 299 });

      const result = await dialog.showSaveDialog({ title: 'Save Purchase Template', defaultPath: 'purchase-import-template.xlsx', filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }] });
      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      await workbook.xlsx.writeFile(result.filePath);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Read an Excel file of items bought. Each row is matched to an existing product by barcode
  // (then SKU, then exact name); rows that can't be matched are reported, nothing is created.
  ipcMain.handle('import-purchase-excel', async (event) => {
    const denied = checkPermission(event, 'purchase');
    if (denied) return denied;
    try {
      const picked = await dialog.showOpenDialog({ title: 'Import Purchase Items', properties: ['openFile'], filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }] });
      if (picked.canceled || !picked.filePaths[0]) return { success: false, canceled: true };

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(picked.filePaths[0]);
      const sheet = workbook.worksheets[0];
      if (!sheet) return { success: false, message: 'The file has no sheets' };

      const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const cellText = (v) => (v && typeof v === 'object' && 'result' in v ? v.result : v && typeof v === 'object' && 'text' in v ? v.text : v);
      const columns = {};
      sheet.getRow(1).eachCell((cell, col) => {
        const h = norm(cellText(cell.value));
        if (['barcode', 'ean', 'code'].includes(h)) columns.barcode = col;
        else if (['productname', 'name', 'product', 'item', 'itemname'].includes(h)) columns.name = col;
        else if (['sku'].includes(h)) columns.sku = col;
        else if (['quantity', 'qty'].includes(h)) columns.qty = col;
        else if (['cost', 'costprice', 'rate', 'unitcost', 'purchaserate'].includes(h)) columns.cost = col;
        else if (['mrp'].includes(h)) columns.mrp = col;
        else if (['sellingprice', 'saleprice', 'price', 'sellingrate'].includes(h)) columns.sell = col;
      });
      if (!columns.qty || !columns.cost || !(columns.barcode || columns.name || columns.sku)) {
        return { success: false, message: 'The first row must have headers: Barcode (or Product Name), Quantity and Cost. Use "Download template" for an example.' };
      }

      const byBarcode = db.prepare('SELECT id, name, cost_price, selling_price, mrp FROM products WHERE barcode = ?');
      const bySku = db.prepare('SELECT id, name, cost_price, selling_price, mrp FROM products WHERE sku = ?');
      const byName = db.prepare('SELECT id, name, cost_price, selling_price, mrp FROM products WHERE LOWER(name) = LOWER(?) AND is_custom IS NOT 1');

      const rows = [];
      const unmatched = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const get = (col) => (col ? cellText(row.getCell(col).value) : null);
        const barcode = String(get(columns.barcode) ?? '').trim();
        const name = String(get(columns.name) ?? '').trim();
        const sku = String(get(columns.sku) ?? '').trim();
        if (!barcode && !name && !sku) return; // blank row

        const qty = Number(get(columns.qty));
        const cost = Number(get(columns.cost));
        const label = barcode || sku || name;
        if (!Number.isInteger(qty) || qty <= 0) { unmatched.push({ row: rowNumber, label, reason: 'Quantity must be a whole number above zero' }); return; }
        if (!(cost >= 0)) { unmatched.push({ row: rowNumber, label, reason: 'Cost is missing or not a number' }); return; }

        const product = (barcode && byBarcode.get(barcode)) || (sku && bySku.get(sku)) || (name && byName.get(name));
        if (!product) { unmatched.push({ row: rowNumber, label, reason: 'No matching product' }); return; }

        const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
        rows.push({
          product_id: product.id, name: product.name, quantity: qty, unit_cost: cost,
          mrp: num(get(columns.mrp)) ?? product.mrp, selling_price: num(get(columns.sell)) ?? product.selling_price
        });
      });

      return { success: true, rows, unmatched };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });
};
