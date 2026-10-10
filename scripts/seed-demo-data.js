const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const { loadDemoData, clearAllData } = require('../src/main/demoData');

const db = new Database(path.join(os.homedir(), 'AppData', 'Roaming', 'electronics-shop-crm', 'shop.db'));
db.pragma('journal_mode = WAL');
clearAllData(db);
const invoiceCount = loadDemoData(db);
console.log('Seeded demo data with ' + invoiceCount + ' invoices.');
db.close();
