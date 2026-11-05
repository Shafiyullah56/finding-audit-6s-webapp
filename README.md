# Jejak Temuan 6S (versi Vercel)

- `public/` : tampilan yang dilayani Vercel (index.html, style.css, app.js, config.js)
- `Kode.gs` : backend Google Apps Script (tambahan `doPost` untuk API)
- `vercel.json` : mengarahkan Vercel ke folder `public`

## Pasang
1. Apps Script: ganti Kode.gs dengan file ini, Deploy > Manage deployments > New version. Akses: Execute as Me, Who has access: Anyone. Salin URL /exec.
2. Edit `public/config.js`: tempel URL /exec ke GAS_URL.
3. Push ke GitHub; Vercel akan menayangkan otomatis.
