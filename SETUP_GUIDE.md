# Electronics Shop CRM - Setup Guide

## Installation & Running

### Prerequisites
- Node.js 16+ installed
- npm or yarn package manager

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Development Mode
```bash
npm run dev
```

This will start both the React dev server (http://localhost:5173) and Electron app in dev mode.

### Step 3: First Time Setup
1. App opens with activation screen
2. Copy your Machine ID
3. Contact support with your Machine ID to get License Key
4. Enter License Key to activate
5. On next launch, create admin account
6. Login with admin credentials

### Step 4: Build for Distribution
```bash
npm run build
```

This creates:
- `dist/` folder (React bundle)
- `out/` folder (packaged Electron app .exe for Windows)

### Production Release
```bash
npm run release
```

This builds and creates a GitHub release (requires GITHUB_TOKEN env var).

## Project Structure

```
src/
├── main/                    # Electron backend
│   ├── index.js            # Entry point
│   ├── preload.js          # Security bridge
│   ├── database/           # SQLite
│   │   └── db.js          
│   └── ipc/               # IPC handlers
│       ├── auth.js
│       ├── invoice.js
│       ├── inventory.js
│       └── ... others
├── renderer/              # React frontend
│   ├── index.html
│   ├── main.jsx
│   ├── App.jsx
│   ├── pages/            # Page components
│   ├── components/       # Reusable components
│   ├── store/            # Redux
│   └── utils/            # Utilities
```

## Features Included

✓ Billing (POS) - Invoice creation with barcode scanning
✓ Inventory - Product and stock management
✓ Purchase - Receiving and supplier management
✓ Customers - Credit sales tracking
✓ Dashboard - Overview and quick stats
✓ Analytics - Sales and profit reports
✓ Settings - User and role management

## Database

SQLite database is stored at:
- Windows: `%APPDATA%/ElectronicsShopCRM/shop.db`
- Mac: `~/Library/Application Support/ElectronicsShopCRM/shop.db`
- Linux: `~/.config/ElectronicsShopCRM/shop.db`

## License Activation

### For Users:
1. Install and launch app
2. Copy Machine ID from activation screen
3. Email Machine ID to support
4. Receive License Key
5. Enter License Key in app

### For Developers (Generating Keys):
```bash
node tools/generateLicense.js --machineId <machine-id>
```

## IPC Channels

All communication between React frontend and Electron backend is via IPC:

- `check-license` - Check if app is licensed
- `activate-license` - Activate with license key
- `user-login` - User authentication
- `create-invoice` - Create new invoice
- `get-products` - Fetch products
- `get-customers` - Fetch customers
- ... and many more

## Troubleshooting

### App won't start
- Delete `shop.db` from userData folder to reset
- Check Node.js version (require 16+)

### Database errors
- Ensure write permissions to userData folder
- Try backing up and deleting shop.db, app will recreate it

### IPC errors
- Check browser console (F12) for errors
- Verify IPC handler is registered in src/main/index.js

## Development

### Adding a New Feature

1. Create IPC handler in `src/main/ipc/<feature>.js`
2. Register it in `src/main/index.js`
3. Create React component in `src/renderer/pages/<feature>/`
4. Add route in `src/renderer/App.jsx`
5. Use `window.ipcRenderer.invoke()` to call backend

Example:
```javascript
// Backend (src/main/ipc/feature.js)
ipcMain.handle('my-feature', (event, data) => {
  return { result: 'success' };
});

// Frontend (React component)
const result = await window.ipcRenderer.invoke('my-feature', { data });
```

## Support

For issues, feature requests, or license activation support, contact the developer.

