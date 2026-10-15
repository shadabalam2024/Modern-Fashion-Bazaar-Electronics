const { BrowserWindow, app } = require('electron');
const fs = require('fs');
const path = require('path');

// Electron has no built-in print preview, so we render the HTML to a PDF and show it in a
// window using Chromium's PDF viewer, which has its own Print and Save buttons.
// Resolves { success, message? }.
async function openPdfPreview(html, title) {
  const renderWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await renderWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await renderWin.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:9px;width:100%;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margins: { top: 0.5, bottom: 0.6, left: 0.4, right: 0.4 }
    });

    const filePath = path.join(app.getPath('temp'), `mfb-preview-${Date.now()}.pdf`);
    fs.writeFileSync(filePath, pdf);

    const previewWin = new BrowserWindow({
      width: 1000,
      height: 800,
      title,
      icon: path.join(__dirname, '../../public/icon.png'),
      webPreferences: { sandbox: true, plugins: true }
    });
    previewWin.setMenu(null);
    previewWin.on('closed', () => fs.unlink(filePath, () => {}));
    previewWin.loadFile(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    renderWin.destroy();
  }
}

module.exports = { openPdfPreview };
