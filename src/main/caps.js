// Names are stored in capital letters so "samsung", "Samsung" and "SAMSUNG" can never be different records.
// Empty values stay empty (null stays null).
const up = (value) => {
  if (value === undefined || value === null) return value;
  return String(value).trim().replace(/\s+/g, ' ').toUpperCase();
};

// What to capitalise, as table -> columns (used by the one-off conversion of existing data)
const CAPS_COLUMNS = {
  products: ['name', 'sku', 'brand', 'season', 'color', 'size', 'item_name', 'style_name'],
  customers: ['name', 'address'],
  suppliers: ['name', 'contact_person', 'address']
};

// One-off: back the database up, upper-case existing names, merge categories that only differ by case.
// Runs once (tracked with PRAGMA user_version).
function convertExistingToCapitals(db, backupDir) {
  if (db.pragma('user_version', { simple: true }) >= 1) return;
  const fs = require('fs');
  const path = require('path');
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    const file = path.join(backupDir, `shop-before-capitals-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  } catch (e) {
    return; // no backup, no conversion - it will be tried again next start
  }

  db.transaction(() => {
    // categories: names that differ only by case become one category
    const first = new Map();
    for (const c of db.prepare('SELECT id, name FROM categories ORDER BY id').all()) {
      const key = up(c.name);
      if (!first.has(key)) { first.set(key, c.id); continue; }
      db.prepare('UPDATE products SET category_id = ? WHERE category_id = ?').run(first.get(key), c.id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(c.id);
    }
    for (const c of db.prepare('SELECT id, name FROM categories').all()) {
      if (c.name !== up(c.name)) db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(up(c.name), c.id);
    }

    for (const [table, columns] of Object.entries(CAPS_COLUMNS)) {
      for (const col of columns) {
        for (const row of db.prepare(`SELECT id, ${col} AS v FROM ${table} WHERE ${col} IS NOT NULL`).all()) {
          const next = up(row.v);
          if (next === row.v) continue;
          try { db.prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ?`).run(next, row.id); } catch (e) { /* e.g. a SKU that would now clash: keep as it was */ }
        }
      }
    }
    db.pragma('user_version = 1');
  })();
}

module.exports = { up, convertExistingToCapitals };
