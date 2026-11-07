// ═ Penghubung ke Google Apps Script (menggantikan google.script.run) ═
function api(fn, args) {
  if (!GAS_URL || GAS_URL.indexOf('script.google.com') < 0) return Promise.reject(new Error('Isi GAS_URL di public/config.js dengan URL /exec Anda.'));
  return fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: fn, args: args }) })
    .then(r => r.text()).then(t => { try { return JSON.parse(t); } catch (e) { throw new Error('Server tidak membalas JSON. Pastikan deployment GAS: Execute as Me, akses Anyone, dan URL /exec benar.'); } });
}
const google = { script: { get run() {
  let ok = () => {}, fail = () => {};
  const p = new Proxy({}, { get: (_, name) => {
    if (name === 'withSuccessHandler') return f => { ok = f; return p; };
    if (name === 'withFailureHandler') return f => { fail = f; return p; };
    return (...args) => { api(name, args).then(ok).catch(fail); };
  } });
  return p;
} } };

// ═ STATE (semua data dimuat sekali; navigasi 0ms; fitur sama di semua perangkat) ═
const S = { areas: [], temuan: [], cfg: {}, pin: null, editId: null, kat: [], zone: 'b', next: 'admin' };
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const thumb = (id, w) => id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (w || 400) : '';
const areaName = id => (S.areas.find(a => a.ID === id) || {}).Nama || '-';
const byNo = (x, y) => (Number(x.No) || 0) - (Number(y.No) || 0);
const isImg = f => f && /^image\//.test(f.type);
let photos = { b: null, a: null }, tmr;

function toast(m, ok) { const t = $('toast'); t.textContent = m; t.style.background = ok === false ? '#B91C1C' : '#166534'; t.style.display = 'block'; clearTimeout(t._t); t._t = setTimeout(() => t.style.display = 'none', 3400); }
function closeM(id) { $(id).classList.remove('on'); }
function applyAdmin() {
  const on = !!S.pin;
  ['U', 'A'].forEach(k => { $('g' + k).style.display = on ? 'none' : 'block'; $('c' + k).style.display = on ? 'block' : 'none'; });
  $('btnAdm').textContent = on ? 'Admin ✓' : 'Admin';
}
function navigateTo(s) {
  document.querySelectorAll('.sec').forEach(e => e.classList.toggle('on', e.id === 'sec-' + s));
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.s === s));
  applyAdmin(); if (s === 'daftar') renderList(); window.scrollTo(0, 0);
}

// ═ INIT: 1 panggilan server ═
function fillAreas() {
  const opt = S.areas.map(a => '<option value="' + esc(a.ID) + '">' + esc(a.Nama) + '</option>').join('');
  $('area').innerHTML = '<option value="">Pilih area</option>' + opt; $('eA').innerHTML = opt;
  $('xAreas').innerHTML = S.areas.map(a => '<label><input type="checkbox" value="' + esc(a.ID) + '" checked> ' + esc(a.Nama) + '</label>').join('');
}
function init() {
  navigateTo('input');
  google.script.run.withSuccessHandler(r => {
    if (!r.success) return toast(r.message, false);
    Object.assign(S, r.data); fillAreas(); $('lg').src = S.cfg.logo6s;
    $('eK').innerHTML = '<option value="">-</option>' + S.kat.map(k => '<option>' + k + '</option>').join('');
    $('xAuditee').value = S.cfg.Auditee || ''; $('xAuditor').value = S.cfg.Auditor || '';
    const d = new Date(), p = n => String(n).padStart(2, '0');
    $('xT1').value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-01'; $('xT2').value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    renderList();
  }).withFailureHandler(e => toast('Gagal memuat: ' + e.message, false)).getInit();
}

// ═ FOTO: pilih file, seret & lepas, tempel (Ctrl+V / tombol Tempel) ═
function compress(file) {
  return new Promise((ok, no) => {
    const fr = new FileReader(); fr.onerror = no;
    fr.onload = () => { const im = new Image(); im.onerror = no; im.onload = () => {
      const k = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', .72)); }; im.src = fr.result; };
    fr.readAsDataURL(file);
  });
}
function setPhoto(k, f) {
  if (!isImg(f)) return toast('File harus berupa gambar.', false);
  openCrop(k, f);
}
function pilih(inp) { setPhoto(inp.dataset.k, inp.files[0]); inp.value = ''; }
function hapusFoto(k) { photos[k] = null; $('pv-' + k).removeAttribute('src'); $('dz-' + k).classList.remove('has'); }
async function tempel(k) {
  try {
    for (const it of await navigator.clipboard.read()) {
      const t = it.types.find(x => x.indexOf('image/') === 0);
      if (t) return setPhoto(k, new File([await it.getType(t)], 'tempel.png', { type: t }));
    }
    toast('Tidak ada gambar di clipboard.', false);
  } catch (e) { toast('Tombol Tempel diblokir browser. Klik kotak foto lalu tekan Ctrl+V.', false); }
}
document.querySelectorAll('.drop').forEach(z => {
  z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('over'); });
  z.addEventListener('dragleave', () => z.classList.remove('over'));
  z.addEventListener('drop', e => { e.preventDefault(); z.classList.remove('over'); const f = [...e.dataTransfer.files].find(isImg); f ? setPhoto(z.dataset.k, f) : toast('Seret file gambar, atau salin gambar lalu tekan Ctrl+V.', false); });
  z.addEventListener('focus', () => S.zone = z.dataset.k);
});
window.addEventListener('dragover', e => e.preventDefault()); window.addEventListener('drop', e => e.preventDefault());
document.addEventListener('paste', e => {
  const f = [...((e.clipboardData && e.clipboardData.files) || [])].find(isImg);
  if (!f) return;
  if ($('sec-daftar').classList.contains('on')) {
    e.preventDefault(); const za = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.add') : null, ta = za ? { id: za.dataset.id, k: za.dataset.k } : S.addTarget;
    return ta ? bukaCropTambah(ta.id, ta.k, f) : toast('Arahkan kursor atau klik kotak foto yang kosong, lalu tempel.', false);
  }
  if (!$('sec-input').classList.contains('on')) return;
  e.preventDefault(); const z = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.drop') : null;
  setPhoto(z ? z.dataset.k : (!photos.b ? 'b' : !photos.a ? 'a' : S.zone), f);
});
function resetForm() { $('area').value = ''; $('remark').value = ''; $('cnt').textContent = '0/250'; hapusFoto('b'); hapusFoto('a'); }

// ═ SIMPAN: minimal satu foto ═
function simpan() {
  const o = { areaId: $('area').value, remark: $('remark').value.trim(), before: photos.b, after: photos.a };
  if (!o.areaId) return toast('Pilih area dulu.', false);
  if (o.remark.length < 5) return toast('Remark minimal 5 karakter.', false);
  if (!o.before && !o.after) return toast('Upload minimal satu foto (Before atau After).', false);
  const b = $('btnSave'); b.disabled = true; b.textContent = 'Mengunggah foto…';
  google.script.run.withSuccessHandler(r => {
    b.disabled = false; b.textContent = 'Simpan Temuan';
    if (!r.success) return toast(r.message, false);
    S.temuan.push(r.data); resetForm(); toast('Temuan #' + r.data.No + ' tersimpan di ' + areaName(r.data.AreaID));
  }).withFailureHandler(e => { b.disabled = false; b.textContent = 'Simpan Temuan'; toast('Unggah gagal, coba lagi: ' + e.message, false); }).saveTemuan(o);
}

// ═ DAFTAR ═
function debounceRender() { clearTimeout(tmr); tmr = setTimeout(renderList, 250); }
function zoom(id) { $('zImg').src = thumb(id, 1200); $('mZoom').classList.add('on'); }
function slot(t, k) {
  const id = k === 'b' ? t.FotoBefore : t.FotoAfter, lb = k === 'b' ? 'Before' : 'After', ik = 'ad' + t.ID + k;
  return id ? '<img loading="lazy" src="' + thumb(id) + '" alt="' + lb + '" onclick="zoom(\'' + id + '\')">'
    : '<div class="add" tabindex="0" data-id="' + t.ID + '" data-k="' + k + '"><b>+ Foto ' + lb + '</b><small>Seret &amp; lepas, atau klik lalu Ctrl+V</small><span class="ab"><label for="' + ik + '">Pilih File</label><button type="button" onclick="tempelAdd(\'' + t.ID + '\',\'' + k + '\')">Tempel</button></span></div>'
    + '<input type="file" id="' + ik + '" data-id="' + t.ID + '" data-k="' + k + '" accept="image/*" hidden onchange="pilihTambah(this)">';
}
function renderList() {
  const qr = $('q').value.trim(), q = qr.toLowerCase(), fs = $('fs').value, hl = s => hlText(s, qr);
  $('sT').textContent = S.temuan.length; $('sO').textContent = S.temuan.filter(t => t.Status !== 'Close').length; $('sC').textContent = S.temuan.filter(t => t.Status === 'Close').length;
  const open = new Set([...document.querySelectorAll('.grp.open')].map(g => g.dataset.a));
  const html = S.areas.map(a => {
    const its = S.temuan.filter(t => t.AreaID === a.ID && (!fs || t.Status === fs) && (!q || (t.Remark + ' ' + a.Nama + ' ' + t.PIC + ' ' + t.Kategori).toLowerCase().includes(q))).sort(byNo);
    if (!its.length) return '';
    return '<div class="grp ' + (open.has(a.ID) || q ? 'open' : '') + '" data-a="' + esc(a.ID) + '"><div class="gh" onclick="this.parentNode.classList.toggle(\'open\')"><span>' + hl(a.Nama) + '</span><span class="pill">' + its.length + ' temuan</span></div><div class="gb">' +
      its.map(t => '<div class="it ' + (t.Status === 'Close' ? 'cl' : '') + '"><b>#' + esc(t.No) + '</b> <span class="st ' + (t.Status === 'Close' ? 'c' : '') + '">' + esc(t.Status) + '</span> <span class="meta">' + esc(String(t.Tanggal).slice(0, 10)) + '</span><p>' + hl(t.Remark) + '</p><div class="ph">' + slot(t, 'b') + slot(t, 'a') + '</div><div class="meta">Kategori: ' + (t.Kategori ? hl(t.Kategori) : '—') + ' • PIC: ' + (t.PIC ? hl(t.PIC) : '—') + '</div>' +
        (S.pin ? '<button onclick="bukaEdit(\'' + t.ID + '\')">Lengkapi / Edit</button>' : '') + '</div>').join('') + '</div></div>';
  }).join('');
  $('list').innerHTML = html || '<div class="card">Belum ada temuan.</div>';
}
function bukaCropTambah(id, k, f) {
  if (!isImg(f)) return toast('File harus berupa gambar.', false);
  openCrop(k, f, { id: id, k: k });
}
function pilihTambah(inp) { const f = inp.files[0]; inp.value = ''; if (f) bukaCropTambah(inp.dataset.id, inp.dataset.k, f); }
async function tempelAdd(id, k) {
  try {
    for (const it of await navigator.clipboard.read()) {
      const ty = it.types.find(x => x.indexOf('image/') === 0);
      if (ty) return bukaCropTambah(id, k, new File([await it.getType(ty)], 'tempel.png', { type: ty }));
    }
    toast('Tidak ada gambar di clipboard.', false);
  } catch (e) { toast('Tombol Tempel diblokir browser. Klik kotak foto lalu tekan Ctrl+V.', false); }
}
function kirimTambah(id, k, d) {
  toast('Mengunggah foto…');
  google.script.run.withSuccessHandler(r => {
    if (!r.success) return toast(r.message, false);
    const t = S.temuan.find(x => x.ID === id); if (t) { if (k === 'b') t.FotoBefore = r.data.id; else t.FotoAfter = r.data.id; }
    renderList(); toast('Foto ditambahkan');
  }).withFailureHandler(e => toast(e.message, false)).tambahFoto(id, k === 'b' ? 'before' : 'after', d.split(',')[1]);
}
const lst = $('list'), tgtAdd = e => { const z = e.target.closest ? e.target.closest('.add') : null; return z ? { z: z, id: z.dataset.id, k: z.dataset.k } : null; };
lst.addEventListener('dragover', e => { const t = tgtAdd(e); if (t) { e.preventDefault(); t.z.classList.add('over'); } });
lst.addEventListener('dragleave', e => { const t = tgtAdd(e); if (t) t.z.classList.remove('over'); });
lst.addEventListener('drop', e => {
  const t = tgtAdd(e); if (!t) return; e.preventDefault(); t.z.classList.remove('over');
  const f = [...e.dataTransfer.files].find(isImg); f ? bukaCropTambah(t.id, t.k, f) : toast('Seret file gambar, atau salin gambar lalu tekan Ctrl+V.', false);
});
['focusin', 'pointerover'].forEach(ev => lst.addEventListener(ev, e => { const t = tgtAdd(e); if (t) S.addTarget = { id: t.id, k: t.k }; }));

// ═ ADMIN (PIN) ═
function openPin(next) { S.next = next || 'admin'; if (S.pin) return navigateTo(S.next); $('pin').value = ''; $('mPin').classList.add('on'); $('pin').focus(); }
function loginAdmin() {
  const p = $('pin').value; google.script.run.withSuccessHandler(r => {
    if (!r.success) return toast('PIN salah.', false);
    S.pin = p; closeM('mPin'); toast('Mode admin aktif'); renderList(); navigateTo(S.next);
  }).withFailureHandler(e => toast(e.message, false)).cekPin(p);
}
function keluarAdmin() { S.pin = null; renderList(); navigateTo('daftar'); }
function gantiPin() {
  google.script.run.withSuccessHandler(r => { toast(r.message, r.success); if (r.success) { S.pin = $('pNew').value; $('pOld').value = $('pNew').value = ''; } })
    .withFailureHandler(e => toast(e.message, false)).ubahPin($('pOld').value, $('pNew').value);
}
function tambahArea() {
  google.script.run.withSuccessHandler(r => { if (!r.success) return toast(r.message, false); S.areas.push(r.data); fillAreas(); $('aN').value = $('aM').value = ''; toast('Area ditambahkan'); })
    .withFailureHandler(e => toast(e.message, false)).tambahArea(S.pin, $('aN').value, $('aM').value);
}
function bukaEdit(id) {
  const t = S.temuan.find(x => x.ID === id); if (!t) return; S.editId = id;
  const m = /^([A-Z]+\d?)-?(\d*)$/.exec(t.Kategori || '') || [];
  $('eA').value = t.AreaID; $('eR').value = t.Remark || ''; renderEditFoto(t); $('eK').value = m[1] || ''; $('eN').value = m[2] || ''; $('eP').value = t.PIC || ''; $('eS').value = t.Status || 'Open'; $('mEdit').classList.add('on');
}
function simpanEdit() {
  const t = S.temuan.find(x => x.ID === S.editId), k = $('eK').value, n = $('eN').value;
  if ($('eR').value.trim().length < 5) return toast('Remark minimal 5 karakter.', false);
  const f = { Remark: $('eR').value.trim(), AreaID: $('eA').value, Kategori: k ? k + (n ? '-' + n : '') : '', PIC: $('eP').value.trim(), Status: $('eS').value }, old = Object.assign({}, t);
  Object.assign(t, f); closeM('mEdit'); renderList();
  google.script.run.withSuccessHandler(r => {
    if (!r.success) { Object.assign(t, old); renderList(); return toast(r.message, false); }
    t.AreaID = r.data.AreaID; t.No = r.data.No; renderList(); toast('Tersimpan');
  }).withFailureHandler(e => { Object.assign(t, old); renderList(); toast(e.message, false); }).updateTemuan(S.pin, S.editId, f);
}
function hapus() {
  if (!confirm('Hapus temuan ini? Foto juga ikut terhapus.')) return;
  google.script.run.withSuccessHandler(r => { if (r.success) { S.temuan = S.temuan.filter(x => x.ID !== S.editId); closeM('mEdit'); renderList(); toast('Dihapus'); } else toast(r.message, false); })
    .withFailureHandler(e => toast(e.message, false)).hapusTemuan(S.pin, S.editId);
}

// ═ UNDUH (hanya admin; dicek ulang di server) ═
function readX() {
  return { format: document.querySelector('input[name=fmt]:checked').value, mill: $('xMill').value, auditee: $('xAuditee').value, auditor: $('xAuditor').value, tgl1: $('xT1').value, tgl2: $('xT2').value, areaIds: [...document.querySelectorAll('#xAreas input:checked')].map(i => i.value) };
}
function preview() {
  if (!S.pin) return toast('Hanya admin yang dapat membuka menu ini.', false);
  const o = readX(); if (!o.areaIds.length) return toast('Pilih minimal satu area.', false);
  const tabel = S.areas.filter(a => o.areaIds.includes(a.ID)).map(a => {
    const its = S.temuan.filter(t => t.AreaID === a.ID && String(t.Tanggal).slice(0, 10) >= o.tgl1 && String(t.Tanggal).slice(0, 10) <= o.tgl2).sort(byNo);
    if (!its.length) return '';
    const im = id => id ? '<img src="' + thumb(id, 360) + '" alt="">' : '';
    return '<div class="pa">AREA / SUB-AREA: ' + esc(a.Nama.toUpperCase()) + '</div><table class="pt"><colgroup><col width="4%"><col width="17%"><col width="10%"><col width="9%"><col width="23%"><col width="23%"><col width="8%"><col width="6%"></colgroup><thead><tr><th>No</th><th>Remark of finding</th><th>Location</th><th>Finding Category<br><small>(FP, R1-5+W, Z)</small></th><th>Foto Before</th><th>Foto After</th><th>PIC</th><th>Status</th></tr></thead><tbody>' +
      its.map(t => '<tr><td class="no">' + esc(t.No) + '</td><td class="l">' + esc(t.Remark) + '</td><td>' + esc(a.Nama) + '</td><td>' + esc(t.Kategori) + '</td><td>' + im(t.FotoBefore) + '</td><td>' + im(t.FotoAfter) + '</td><td>' + esc(t.PIC) + '</td><td>' + esc(t.Status) + '</td></tr>').join('') + '</tbody></table>';
  }).join('');
  if (!tabel) return toast('Tidak ada temuan pada area dan tanggal tersebut.', false);
  $('prevBody').innerHTML = '<div class="paper"><div class="ph2"><img src="' + S.cfg.logoApp + '" alt="APP"><div class="tt">FORM FINDING AUDIT 6S/6K &amp; IMPROVEMENT <small>(' + esc(o.tgl2.slice(0, 4)) + ')</small></div><img src="' + S.cfg.logo6s + '" alt="6S"></div><div class="ln"></div>' +
    '<div class="inf"><b>AREA / MILL</b><span>: ' + esc(o.mill) + '</span><b>AUDITOR</b><span>: ' + esc(o.auditor) + '</span><b>AUDITEE</b><span>: ' + esc(o.auditee) + '</span><b>DATE</b><span>: ' + esc(o.tgl1 + ' - ' + o.tgl2) + '</span></div>' + tabel + '</div>';
  $('mPrev').classList.add('on');
}
function unduh() {
  if (!S.pin) return toast('Hanya admin yang dapat mengunduh hasil akhir.', false);
  const o = readX(); if (!o.areaIds.length) return toast('Pilih minimal satu area.', false);
  const b = $('btnX'); b.disabled = true; b.textContent = 'Menyiapkan dokumen… (bisa 1 menit)'; $('xLink').style.display = 'none';
  google.script.run.withSuccessHandler(r => {
    b.disabled = false; b.textContent = 'Buka / Unduh Dokumen';
    if (!r.success) return toast(r.message, false);
    $('xLink').href = r.data.url; $('xLink').style.display = 'block'; $('xLink').textContent = o.format === 'gdoc' ? 'Buka Google Doc' : 'Belum terunduh? Klik di sini';
    if (o.format === 'gdoc') window.open(r.data.url, '_blank');
    else if (r.data.b64) { simpanBlob(r.data.name, r.data.b64); toast('Dokumen terunduh & tersimpan di folder Unduhan Drive'); }
    else { window.open(r.data.url, '_blank'); toast('Dokumen siap, tersimpan di folder Unduhan Drive'); }
  }).withFailureHandler(e => { b.disabled = false; b.textContent = 'Buka / Unduh Dokumen'; toast(e.message, false); }).exportHasil(S.pin, o);
}
$('pin').addEventListener('keydown', e => { if (e.key === 'Enter') loginAdmin(); });
document.addEventListener('DOMContentLoaded', init);

// ═ CROP FOTO MANUAL (mouse & sentuh, sama di semua perangkat) ═
const C = { k: null, src: null, W: 0, H: 0, sel: null, ratio: 0, drag: null };
const cvs = $('cvs');
function openCrop(k, file, tgt) {
  const im = new Image(), u = URL.createObjectURL(file);
  im.onload = () => {
    URL.revokeObjectURL(u);
    const m = Math.min(1, 2400 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width * m); c.height = Math.round(im.height * m); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    C.k = k; C.t = tgt || null; C.src = c; C.ratio = 0; $('mCrop').classList.add('on'); layoutCrop();
  };
  im.onerror = () => { URL.revokeObjectURL(u); toast('Foto tidak bisa dibaca.', false); };
  im.src = u;
}
function layoutCrop() {
  const s = Math.min(Math.min(window.innerWidth - 56, 880) / C.src.width, (window.innerHeight * 0.55) / C.src.height);
  C.W = cvs.width = Math.max(60, Math.round(C.src.width * s)); C.H = cvs.height = Math.max(60, Math.round(C.src.height * s));
  setSel(C.ratio);
}
function setSel(r) {
  C.ratio = r; let w = C.W * .94, h = C.H * .94;
  if (r) { if (w / h > r) w = h * r; else h = w / r; }
  C.sel = { x: (C.W - w) / 2, y: (C.H - h) / 2, w: w, h: h }; drawCrop();
}
const corners = () => { const s = C.sel; return [[s.x, s.y], [s.x + s.w, s.y], [s.x, s.y + s.h], [s.x + s.w, s.y + s.h]]; };
function drawCrop() {
  const g = cvs.getContext('2d'), s = C.sel;
  g.clearRect(0, 0, C.W, C.H); g.drawImage(C.src, 0, 0, C.W, C.H);
  g.fillStyle = 'rgba(0,0,0,.55)';
  g.fillRect(0, 0, C.W, s.y); g.fillRect(0, s.y + s.h, C.W, C.H - s.y - s.h); g.fillRect(0, s.y, s.x, s.h); g.fillRect(s.x + s.w, s.y, C.W - s.x - s.w, s.h);
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(s.x, s.y, s.w, s.h);
  g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.5)';
  for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(s.x + s.w * i / 3, s.y); g.lineTo(s.x + s.w * i / 3, s.y + s.h); g.moveTo(s.x, s.y + s.h * i / 3); g.lineTo(s.x + s.w, s.y + s.h * i / 3); g.stroke(); }
  g.fillStyle = '#fff'; g.strokeStyle = '#1E3A8A'; g.lineWidth = 2;
  corners().forEach(p => { g.fillRect(p[0] - 9, p[1] - 9, 18, 18); g.strokeRect(p[0] - 9, p[1] - 9, 18, 18); });
}
function cpos(e) { const r = cvs.getBoundingClientRect(); return [(e.clientX - r.left) * C.W / r.width, (e.clientY - r.top) * C.H / r.height]; }
cvs.addEventListener('pointerdown', e => {
  const p = cpos(e), s = C.sel, cs = corners(), hit = cs.findIndex(c => Math.abs(c[0] - p[0]) < 26 && Math.abs(c[1] - p[1]) < 26);
  if (hit >= 0) C.drag = { t: 'r', ax: cs[3 - hit][0], ay: cs[3 - hit][1] };
  else if (p[0] > s.x && p[0] < s.x + s.w && p[1] > s.y && p[1] < s.y + s.h) C.drag = { t: 'm', dx: p[0] - s.x, dy: p[1] - s.y };
  else return;
  cvs.setPointerCapture(e.pointerId); e.preventDefault();
});
cvs.addEventListener('pointermove', e => {
  if (!C.drag) return; const p = cpos(e), d = C.drag, s = C.sel;
  if (d.t === 'm') { s.x = Math.min(Math.max(0, p[0] - d.dx), C.W - s.w); s.y = Math.min(Math.max(0, p[1] - d.dy), C.H - s.h); }
  else {
    const sx = p[0] >= d.ax ? 1 : -1, sy = p[1] >= d.ay ? 1 : -1;
    let w = Math.min(Math.abs(p[0] - d.ax), sx > 0 ? C.W - d.ax : d.ax), h = Math.min(Math.abs(p[1] - d.ay), sy > 0 ? C.H - d.ay : d.ay);
    if (C.ratio) { if (w / Math.max(h, 1) > C.ratio) w = h * C.ratio; else h = w / C.ratio; }
    w = Math.max(w, 30); h = Math.max(h, 30);
    C.sel = { x: Math.max(0, Math.min(sx > 0 ? d.ax : d.ax - w, C.W - w)), y: Math.max(0, Math.min(sy > 0 ? d.ay : d.ay - h, C.H - h)), w: w, h: h };
  }
  drawCrop();
});
['pointerup', 'pointercancel'].forEach(t => cvs.addEventListener(t, () => { C.drag = null; }));
function cropRatio(r) { setSel(r); }
function cropRotate() {
  const s = C.src, c = document.createElement('canvas'); c.width = s.height; c.height = s.width;
  const g = c.getContext('2d'); g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(s, 0, 0); C.src = c; layoutCrop();
}
function cropCancel() { closeM('mCrop'); C.src = null; C.t = null; }
function cropDone(full) {
  const s = C.sel, f = C.src.width / C.W, out = document.createElement('canvas');
  const sx = full ? 0 : s.x * f, sy = full ? 0 : s.y * f, sw = full ? C.src.width : s.w * f, sh = full ? C.src.height : s.h * f;
  const m = Math.min(1, 1280 / Math.max(sw, sh)); out.width = Math.max(1, Math.round(sw * m)); out.height = Math.max(1, Math.round(sh * m));
  out.getContext('2d').drawImage(C.src, sx, sy, sw, sh, 0, 0, out.width, out.height);
  const d = out.toDataURL('image/jpeg', .72);
  if (C.t) { const t = C.t; closeM('mCrop'); C.src = null; C.t = null; return kirimTambah(t.id, t.k, d); }
  photos[C.k] = d.split(',')[1]; $('pv-' + C.k).src = d; $('dz-' + C.k).classList.add('has');
  S.zone = C.k; closeM('mCrop'); C.src = null;
}

// ═ Sorot kata pencarian ═
function hlText(s, q) {
  s = String(s == null ? '' : s); if (!q) return esc(s);
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return s.split(re).map((p, i) => i % 2 ? '<mark>' + esc(p) + '</mark>' : esc(p)).join('');
}

// ═ Admin: foto pada form edit ═
function renderEditFoto(t) {
  $('eFoto').innerHTML = [['b', 'Before', t.FotoBefore], ['a', 'After', t.FotoAfter]].map(p => p[2]
    ? '<div class="ef"><img src="' + thumb(p[2]) + '" alt="' + p[1] + '"><button class="btn danger" type="button" onclick="hapusFotoAdmin(\'' + p[0] + '\')">Hapus foto ' + p[1] + '</button></div>'
    : '<div class="ef mut">Foto ' + p[1] + ' belum ada</div>').join('');
}
function hapusFotoAdmin(k) {
  const t = S.temuan.find(x => x.ID === S.editId); if (!t) return; const lb = k === 'b' ? 'Before' : 'After';
  if (!confirm('Hapus foto ' + lb + ' dari temuan #' + t.No + '?')) return;
  google.script.run.withSuccessHandler(r => {
    if (!r.success) return toast(r.message, false);
    if (k === 'b') t.FotoBefore = ''; else t.FotoAfter = '';
    renderEditFoto(t); renderList(); toast('Foto ' + lb + ' dihapus');
  }).withFailureHandler(e => toast(e.message, false)).hapusFotoTemuan(S.pin, S.editId, k === 'b' ? 'before' : 'after');
}

// ═ Unduh otomatis ke perangkat ═
function simpanBlob(name, b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([u])), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ═ PWA: tombol "Pasang" & pendaftaran service worker ═
let tundaPasang = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); tundaPasang = e; $('btnInstall').style.display = ''; });
window.addEventListener('appinstalled', () => { $('btnInstall').style.display = 'none'; toast('Aplikasi terpasang'); });
function pasangApp() { if (!tundaPasang) return; tundaPasang.prompt(); tundaPasang.userChoice.finally(() => { tundaPasang = null; $('btnInstall').style.display = 'none'; }); }
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
