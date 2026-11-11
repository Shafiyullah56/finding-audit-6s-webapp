// ═ Penghubung ke Google Apps Script ═
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

// ═ STATE ═
const S = { areas: [], temuan: [], forms: [], aktif: '', formSel: '', fv: 'all', editForm: null, cfg: {}, pin: null, editId: null, kat: [], zone: 'b', next: 'admin', addTarget: null, openGroups: new Set() };
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const thumb = (id, w) => id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (w || 400) : '';
const areaName = id => (S.areas.find(a => a.ID === id) || {}).Label || '-';
const byNo = (x, y) => (Number(x.No) || 0) - (Number(y.No) || 0);
const isImg = f => f && /^image\//.test(f.type);
let photos = { b: null, a: null }, tmr;

function toast(m, ok) { const t = $('toast'); t.textContent = m; t.style.background = ok === false ? '#B91C1C' : '#166534'; t.style.display = 'block'; clearTimeout(t._t); t._t = setTimeout(() => t.style.display = 'none', 3400); }
function closeM(id) { $(id).classList.remove('on'); }
function applyAdmin() {
  const on = !!S.pin;
  ['U', 'A'].forEach(k => { $('g' + k).style.display = on ? 'none' : 'block'; $('c' + k).style.display = on ? 'block' : 'none'; });
  $('btnAdm').textContent = on ? 'Admin ✓' : 'Admin';
  if (on) renderFormAdmin();
}
function navigateTo(s) {
  document.querySelectorAll('.sec').forEach(e => e.classList.toggle('on', e.id === 'sec-' + s));
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.s === s));
  applyAdmin(); if (s === 'daftar') renderList(); window.scrollTo(0, 0);
}

function fillAreas() {
  const opt = S.areas.map(a => '<option value="' + esc(a.ID) + '">' + esc(a.Nama) + '</option>').join('');
  $('area').innerHTML = '<option value="">Pilih area</option>' + opt; $('eA').innerHTML = '<option value="">— pilih area —</option>' + opt;
  $('xAreas').innerHTML = S.areas.map(a => '<label><input type="checkbox" value="' + esc(a.ID) + '" checked onchange="hitungUnduh()"> ' + esc(a.Nama) + '</label>').join('');
}
function init() {
  navigateTo('input');
  google.script.run.withSuccessHandler(r => {
    if (!r.success) return toast(r.message, false);
    Object.assign(S, r.data); fillAreas(); $('lg').src = S.cfg.logo6s;
    $('eK').innerHTML = '<option value="">-</option>' + S.kat.map(k => '<option>' + k + '</option>').join('');
    S.formSel = formOf(S.aktif) ? S.aktif : ((S.forms.filter(f => f.Status !== 'Ditutup')[0] || {}).ID || '');
    S.fv = S.formSel || 'all'; fillForms(); $('fv').value = S.fv; loadDraft(); renderList();
    setInterval(cekForm, 60000); document.addEventListener('visibilitychange', () => { if (!document.hidden) cekForm(); });
  }).withFailureHandler(e => toast('Gagal memuat: ' + e.message, false)).getInit();
}

function refreshDaftar() {
  const btn = $('btnRefresh');
  if (btn) { btn.disabled = true; btn.classList.add('spinning'); }
  toast('Memuat data terbaru…');

  google.script.run.withSuccessHandler(r => {
    if (btn) { btn.disabled = false; btn.classList.remove('spinning'); }
    if (!r.success) return toast(r.message, false);
    S.temuan = r.data.temuan;
    S.forms = r.data.forms;
    if (r.data.areas) S.areas = r.data.areas;
    fillForms();
    renderList();
    toast('Data temuan berhasil diperbarui!');
  }).withFailureHandler(e => {
    if (btn) { btn.disabled = false; btn.classList.remove('spinning'); }
    toast('Gagal memuat data: ' + e.message, false);
  }).getInit();
}

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
function resetForm() { $('area').value = ''; $('remark').value = ''; $('cnt').textContent = '0/250'; hapusFoto('b'); hapusFoto('a'); try { localStorage.removeItem(dk()); } catch (e) {} }

function simpan() {
  const o = { formId: S.formSel, areaId: $('area').value, remark: $('remark').value.trim(), before: photos.b, after: photos.a }, fm = formOf(o.formId);
  if (!fm) return toast('Belum ada form terbuka. Minta admin membuat form.', false);
  if (fm.Status === 'Ditutup') return toast('Form "' + fm.Label + '" sudah ditutup. Pilih form lain.', false);
  if (!o.areaId) return toast('Pilih area dulu.', false);
  if (o.remark.length < 5) return toast('Remark minimal 5 karakter.', false);
  if (!o.before && !o.after) return toast('Upload minimal satu foto (Before atau After).', false);
  const b = $('btnSave'); b.disabled = true; b.textContent = 'Mengunggah foto…';
  const done = () => { b.textContent = 'Simpan Temuan'; renderFormBar(); };
  google.script.run.withSuccessHandler(r => {
    done();
    if (!r.success) { if (/form/i.test(r.message)) cekForm(); return toast(r.message, false); }
    S.temuan.push(r.data); resetForm(); fillForms(); toast('Temuan #' + r.data.No + ' tersimpan di ' + areaName(r.data.AreaID) + ' (' + fm.Label + ')');
  }).withFailureHandler(e => { done(); toast('Unggah gagal, coba lagi: ' + e.message, false); }).saveTemuan(o);
}

function debounceRender() { clearTimeout(tmr); tmr = setTimeout(renderList, 250); }
function zoom(id) { $('zImg').src = thumb(id, 1200); $('mZoom').classList.add('on'); }
function slot(t, k) {
  const id = k === 'b' ? t.FotoBefore : t.FotoAfter, lb = k === 'b' ? 'Before' : 'After', ik = 'ad' + t.ID + k, ic = 'kc' + t.ID + k;
  if (id) return '<div class="pw"><img loading="lazy" src="' + thumb(id) + '" alt="' + lb + '" onclick="zoom('' + id + '')"><button type="button" class="del" onclick="hapusFotoKartu('' + t.ID + '','' + k + '')">Hapus foto ' + lb + '</button></div>';
  return '<div class="add" tabindex="0" data-id="' + t.ID + '" data-k="' + k + '"><b>+ Foto ' + lb + '</b><small>Seret &amp; lepas, atau klik lalu Ctrl+V</small><span class="ab"><label for="' + ic + '">Kamera</label><label for="' + ik + '">Pilih File</label><button type="button" onclick="tempelAdd('' + t.ID + '','' + k + '')">Tempel</button></span></div>'
    + '<input type="file" id="' + ik + '" data-id="' + t.ID + '" data-k="' + k + '" accept="image/*" hidden onchange="pilihTambah(this)">'
    + '<input type="file" id="' + ic + '" data-id="' + t.ID + '" data-k="' + k + '" accept="image/*" capture="environment" hidden onchange="pilihTambah(this)">';
}

function toggleGrp(el, areaId) {
  const grp = el.parentNode;
  const isOpen = grp.classList.toggle('open');
  if (isOpen) S.openGroups.add(areaId);
  else S.openGroups.delete(areaId);
}

function renderList() {
  const qr = $('q').value.trim(), q = qr.toLowerCase(), fs = $('fs').value, fv = $('fv').value || 'all', hl = s => hlText(s, qr);
  const base = S.temuan.filter(t => fv === 'all' || t.FormID === fv);
  $('sT').textContent = base.length; $('sO').textContent = base.filter(t => t.Status !== 'Close').length; $('sC').textContent = base.filter(t => t.Status === 'Close').length;
  
  const known = new Set(S.areas.map(a => a.ID));
  const fl = t => (formOf(t.FormID) || {}).Label || '';
  const cocok = (t, an) => (!fs || t.Status === fs) && (!q || (t.Remark + ' ' + an + ' ' + t.PIC + ' ' + t.Kategori + ' ' + fl(t)).toLowerCase().includes(q));
  const urut = (x, y) => S.forms.findIndex(f => f.ID === x.FormID) - S.forms.findIndex(f => f.ID === y.FormID) || byNo(x, y);

  const card = t => '<div class="it ' + (t.Status === 'Close' ? 'cl' : '') + '">' + (fv === 'all' ? '<div class="fm">' + hl(fl(t)) + '</div>' : '') + '<b>#' + esc(t.No) + '</b> <span class="st ' + (t.Status === 'Close' ? 'c' : '') + '">' + esc(t.Status) + '</span> <span class="meta">' + esc(String(t.Tanggal).slice(0, 10)) + '</span><p>' + hl(t.Remark) + '</p><div class="ph">' + slot(t, 'b') + slot(t, 'a') + '</div><div class="meta">Kategori: ' + (t.Kategori ? hl(t.Kategori) : '—') + ' • PIC: ' + (t.PIC ? hl(t.PIC) : '—') + '</div>' +
    (S.pin ? '<button onclick="bukaEdit('' + t.ID + '')">Lengkapi / Edit</button>' : '') + '</div>';

  const grp = (a, its) => {
    if (!its.length) return '';
    const isExpanded = q ? true : S.openGroups.has(a.ID);
    return '<div class="grp ' + (isExpanded ? 'open' : '') + '" data-a="' + esc(a.ID) + '">' +
      '<div class="gh" onclick="toggleGrp(this, '' + esc(a.ID) + '')"><span>' + hl(a.Nama) + '</span><span class="pill">' + its.length + ' temuan</span></div>' +
      '<div class="gb">' + its.map(card).join('') + '</div></div>';
  };

  const yatim = { ID: '?', Nama: 'Area tidak dikenal (pilih area lewat Lengkapi / Edit)' };
  const html = S.areas.map(a => grp(a, base.filter(t => t.AreaID === a.ID && cocok(t, a.Nama)).sort(urut))).join('') +
    grp(yatim, base.filter(t => !known.has(t.AreaID) && cocok(t, '')).sort(urut));
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

function openPin(next) { S.next = next || 'admin'; if (S.pin) return navigateTo(S.next); $('pin').value = ''; $('mPin').classList.add('on'); $('pin').focus(); }
function loginAdmin() {
  const p = $('pin').value; google.script.run.withSuccessHandler(r => {
    if (!r.success) return toast(r.message || 'PIN salah.', false);
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
  $('eA').value = t.AreaID; $('eF').value = t.FormID; $('eR').value = t.Remark || ''; $('eK').value = m[1] || ''; $('eN').value = m[2] || ''; $('eP').value = t.PIC || ''; $('eS').value = t.Status || 'Open'; $('mEdit').classList.add('on');
}
function simpanEdit() {
  const t = S.temuan.find(x => x.ID === S.editId), k = $('eK').value, n = $('eN').value;
  if ($('eR').value.trim().length < 5) return toast('Remark minimal 5 karakter.', false);
  const f = { Remark: $('eR').value.trim(), FormID: $('eF').value, AreaID: $('eA').value, Kategori: k ? k + (n ? '-' + n : '') : '', PIC: $('eP').value.trim(), Status: $('eS').value }, old = Object.assign({}, t);
  Object.assign(t, f); closeM('mEdit'); renderList();
  google.script.run.withSuccessHandler(r => {
    if (!r.success) { Object.assign(t, old); renderList(); return toast(r.message, false); }
    t.AreaID = r.data.AreaID; t.FormID = r.data.FormID; t.No = r.data.No; fillForms(); renderList(); toast('Tersimpan');
  }).withFailureHandler(e => { Object.assign(t, old); renderList(); toast(e.message, false); }).updateTemuan(S.pin, S.editId, f);
}
function hapus() {
  if (!confirm('Hapus temuan ini? Foto juga ikut terhapus.')) return;
  google.script.run.withSuccessHandler(r => { if (r.success) { S.temuan = S.temuan.filter(x => x.ID !== S.editId); closeM('mEdit'); renderList(); toast('Dihapus'); } else toast(r.message, false); })
    .withFailureHandler(e => toast(e.message, false)).hapusTemuan(S.pin, S.editId);
}

function readX() {
  return { format: document.querySelector('input[name=fmt]:checked').value, foto: $('xFoto').value || 'both', formIds: selForms(), areaIds: [...document.querySelectorAll('#xAreas input:checked')].map(i => i.value) };
}
function preview() {
  if (!S.pin) return toast('Hanya admin yang dapat membuka menu ini.', false);
  const o = readX(); if (!o.formIds.length) return toast('Pilih form yang akan diunduh.', false);
  if (!o.areaIds.length) return toast('Pilih minimal satu area.', false);
  const forms = S.forms.filter(f => o.formIds.includes(f.ID)), fb = o.foto !== 'after', fa = o.foto !== 'before';
  const th = '<th>No</th><th>Remark of finding</th><th>Location</th><th>Finding Category<br><small>(FP, R1-5+W, Z)</small></th>' + (fb ? '<th>Foto Before</th>' : '') + (fa ? '<th>Foto After</th>' : '') + '<th>PIC</th><th>Status</th>';
  const cg = fb && fa ? '<col width="4%"><col width="17%"><col width="10%"><col width="9%"><col width="23%"><col width="23%"><col width="8%"><col width="6%">' : '<col width="4%"><col width="24%"><col width="12%"><col width="10%"><col width="34%"><col width="9%"><col width="7%">';
  const im = id => id ? '<img src="' + thumb(id, 360) + '" alt="">' : ''; let total = 0;
  
  const isGabungan = forms.length > 1;
  const mainForm = forms[0] || {};
  const isSelesai = t => t.Status === 'Close' || (t.FotoAfter && String(t.FotoAfter).trim() !== '');

  const dateStr = isGabungan ? '' : (tg(mainForm.Tgl1) + ' - ' + tg(mainForm.Tgl2));
  const millStr = isGabungan ? '-' : (mainForm.Mill || '');
  const auditorStr = isGabungan ? '-' : (mainForm.Auditor || '');
  const auditeeStr = isGabungan ? '-' : (mainForm.Auditee || '');
  const yearStr = !isGabungan && mainForm.Tgl2 ? ' (' + esc(tg(mainForm.Tgl2).slice(0, 4)) + ')' : '';

  let globalNo = 1;

  const tabel = S.areas.filter(a => o.areaIds.includes(a.ID)).map(a => {
    const its = S.temuan.filter(t => o.formIds.includes(t.FormID) && t.AreaID === a.ID);
    if (!its.length) return '';
    
    its.sort((x, y) => {
      const sX = isSelesai(x) ? 0 : 1;
      const sY = isSelesai(y) ? 0 : 1;
      if (sX !== sY) return sX - sY;
      return (Number(x.No) || 0) - (Number(y.No) || 0);
    });

    total += its.length;
    return '<div class="pa">AREA / SUB-AREA: ' + esc(a.Nama.toUpperCase()) + '</div><table class="pt"><colgroup>' + cg + '</colgroup><thead><tr>' + th + '</tr></thead><tbody>' +
      its.map(t => '<tr><td class="no">' + (globalNo++) + '</td><td class="l">' + esc(t.Remark) + '</td><td>' + esc(a.Nama) + '</td><td>' + esc(t.Kategori) + '</td>' + (fb ? '<td>' + im(t.FotoBefore) + '</td>' : '') + (fa ? '<td>' + im(t.FotoAfter) + '</td>' : '') + '<td>' + esc(t.PIC) + '</td><td>' + esc(t.Status) + '</td></tr>').join('') + '</tbody></table>';
  }).join('');

  const body = '<div class="paper"><div class="ph2"><img src="' + S.cfg.logoApp + '" alt="APP"><div class="tt">FORM FINDING AUDIT 6S/6K &amp; IMPROVEMENT <small>' + yearStr + '</small></div><img src="' + S.cfg.logo6s + '" alt="6S"></div><div class="ln"></div>' +
    '<div class="inf"><b>AREA / MILL</b><span>: ' + esc(millStr) + '</span><b>AUDITOR</b><span>: ' + esc(auditorStr) + '</span><b>AUDITEE</b><span>: ' + esc(auditeeStr) + '</span><b>DATE</b><span>: ' + esc(dateStr) + '</span></div>' + (tabel || '<p>(Belum ada temuan pada area yang dipilih)</p>') + '</div>';

  if (!total) return toast('Tidak ada temuan pada form dan area tersebut.', false);
  $('prevBody').innerHTML = body; $('mPrev').classList.add('on');
}

function cetakPDF() {
  window.print();
}

function unduh() {
  const o = readX();
  if (!o.formIds.length) return toast('Pilih minimal satu form.', false);
  if (!o.areaIds.length) return toast('Pilih minimal satu area.', false);
  if (o.format === 'pdf' || o.format === 'gdoc') {
    preview();
    toast('Silakan klik "Cetak / Simpan PDF" pada layar pratinjau.');
  } else {
    toast('Gunakan pratinjau untuk mencetak/menyimpan laporan PDF.', false);
  }
}

$('pin').addEventListener('keydown', e => { if (e.key === 'Enter') loginAdmin(); });
document.addEventListener('DOMContentLoaded', init);

// ═ CROP & DRAWING PENCIL TOOLBAR ═
const C = { k: null, src: null, W: 0, H: 0, sel: null, ratio: 0, drag: null, pencilMode: false, penShape: 'free', penColor: '#EF4444', penSize: 6, undoStack: [], drawing: false };
const cvs = $('cvs');

function openCrop(k, file, tgt) {
  const im = new Image(), u = URL.createObjectURL(file);
  im.onload = () => {
    URL.revokeObjectURL(u);
    const m = Math.min(1, 2400 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width * m); c.height = Math.round(im.height * m); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    C.k = k; C.t = tgt || null; C.src = c; C.ratio = 0;
    C.pencilMode = false; C.undoStack = []; C.penShape = 'free';
    if ($('btnPencil')) $('btnPencil').classList.remove('active');
    if ($('penBar')) $('penBar').style.display = 'none';
    $('mCrop').classList.add('on'); layoutCrop();
  };
  im.onerror = () => { URL.revokeObjectURL(u); toast('Foto tidak bisa dibaca.', false); };
  im.src = u;
}

function togglePencilMode() {
  C.pencilMode = !C.pencilMode;
  $('btnPencil').classList.toggle('active', C.pencilMode);
  $('penBar').style.display = C.pencilMode ? 'flex' : 'none';
  drawCrop();
}

function setPenColor(col) {
  C.penColor = col;
  if ($('penColor')) $('penColor').value = col;
}

function undoDraw() {
  if (C.undoStack && C.undoStack.length > 0) {
    const lastState = C.undoStack.pop();
    const ctx = C.src.getContext('2d');
    ctx.putImageData(lastState, 0, 0);
    drawCrop();
  }
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
  if (!C.pencilMode) {
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(0, 0, C.W, s.y); g.fillRect(0, s.y + s.h, C.W, C.H - s.y - s.h); g.fillRect(0, s.y, s.x, s.h); g.fillRect(s.x + s.w, s.y, C.W - s.x - s.w, s.h);
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(s.x, s.y, s.w, s.h);
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.5)';
    for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(s.x + s.w * i / 3, s.y); g.lineTo(s.x + s.w * i / 3, s.y + s.h); g.moveTo(s.x, s.y + s.h * i / 3); g.lineTo(s.x + s.w, s.y + s.h * i / 3); g.stroke(); }
    g.fillStyle = '#fff'; g.strokeStyle = '#1E3A8A'; g.lineWidth = 2;
    corners().forEach(p => { g.fillRect(p[0] - 9, p[1] - 9, 18, 18); g.strokeRect(p[0] - 9, p[1] - 9, 18, 18); });
  }
}
function cpos(e) { const r = cvs.getBoundingClientRect(); return [(e.clientX - r.left) * C.W / r.width, (e.clientY - r.top) * C.H / r.height]; }

cvs.addEventListener('pointerdown', e => {
  const p = cpos(e);
  if (C.pencilMode) {
    const ctx = C.src.getContext('2d');
    if (!C.undoStack) C.undoStack = [];
    C.undoStack.push(ctx.getImageData(0, 0, C.src.width, C.src.height));
    const scaleX = C.src.width / C.W, scaleY = C.src.height / C.H;
    const sx = p[0] * scaleX, sy = p[1] * scaleY;
    C.drawing = true;
    C.startPt = { x: sx, y: sy };
    C.lastPt = { x: sx, y: sy };
    cvs.setPointerCapture(e.pointerId); e.preventDefault(); return;
  }
  const s = C.sel, cs = corners(), hit = cs.findIndex(c => Math.abs(c[0] - p[0]) < 26 && Math.abs(c[1] - p[1]) < 26);
  if (hit >= 0) C.drag = { t: 'r', ax: cs[3 - hit][0], ay: cs[3 - hit][1] };
  else if (p[0] > s.x && p[0] < s.x + s.w && p[1] > s.y && p[1] < s.y + s.h) C.drag = { t: 'm', dx: p[0] - s.x, dy: p[1] - s.y };
  else return;
  cvs.setPointerCapture(e.pointerId); e.preventDefault();
});

cvs.addEventListener('pointermove', e => {
  const p = cpos(e);
  if (C.pencilMode && C.drawing) {
    const ctx = C.src.getContext('2d');
    const scaleX = C.src.width / C.W, scaleY = C.src.height / C.H;
    const sx = p[0] * scaleX, sy = p[1] * scaleY;
    ctx.strokeStyle = C.penColor; ctx.fillStyle = C.penColor;
    ctx.lineWidth = C.penSize * scaleX; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    if (C.penShape === 'free') {
      ctx.beginPath(); ctx.moveTo(C.lastPt.x, C.lastPt.y); ctx.lineTo(sx, sy); ctx.stroke();
      C.lastPt = { x: sx, y: sy };
    } else {
      ctx.putImageData(C.undoStack[C.undoStack.length - 1], 0, 0);
      ctx.beginPath();
      const dx = sx - C.startPt.x, dy = sy - C.startPt.y;
      if (C.penShape === 'circle') {
        const r = Math.sqrt(dx * dx + dy * dy);
        ctx.arc(C.startPt.x, C.startPt.y, r, 0, 2 * Math.PI); ctx.stroke();
      } else if (C.penShape === 'rect') {
        ctx.strokeRect(C.startPt.x, C.startPt.y, dx, dy);
      } else if (C.penShape === 'arrow') {
        const headlen = Math.max(12, ctx.lineWidth * 3), angle = Math.atan2(dy, dx);
        ctx.moveTo(C.startPt.x, C.startPt.y); ctx.lineTo(sx, sy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx, sy);
        ctx.lineTo(sx - headlen * Math.cos(angle - Math.PI / 6), sy - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(sx - headlen * Math.cos(angle + Math.PI / 6), sy - headlen * Math.sin(angle + Math.PI / 6));
        ctx.closePath(); ctx.fill();
      }
    }
    drawCrop(); return;
  }
  if (!C.drag) return; const d = C.drag, s = C.sel;
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
['pointerup', 'pointercancel'].forEach(t => cvs.addEventListener(t, () => { C.drag = null; C.drawing = false; }));

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

function hlText(s, q) {
  s = String(s == null ? '' : s); if (!q) return esc(s);
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return s.split(re).map((p, i) => i % 2 ? '<mark>' + esc(p) + '</mark>' : esc(p)).join('');
}

function simpanBlob(name, b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([u])), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const hariIni = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const tg = s => String(s || '').slice(0, 10);
const formOf = id => S.forms.find(f => f.ID === id);
const maks = () => (S.cfg && S.cfg.maks) || 1000;
const fopt = f => '<option value="' + esc(f.ID) + '">' + esc(f.Label) + (f.Status === 'Ditutup' ? ' (ditutup)' : '') + '</option>';
let td;
const dk = () => 'd:' + S.formSel;
function saveDraft() { try { const a = $('area').value, r = $('remark').value; if (a || r.trim()) localStorage.setItem(dk(), JSON.stringify({ a: a, r: r })); else localStorage.removeItem(dk()); } catch (e) {} }
function draftSoon() { clearTimeout(td); td = setTimeout(saveDraft, 500); }
function loadDraft() {
  try { const d = JSON.parse(localStorage.getItem(dk()) || 'null'); if (d) { $('area').value = d.a || ''; $('remark').value = d.r || ''; $('cnt').textContent = $('remark').value.length + '/250'; } } catch (e) {}
}
function fillForms() {
  const prevX = $('xForm').value;
  if (!formOf(S.formSel)) S.formSel = formOf(S.aktif) ? S.aktif : ((S.forms.filter(f => f.Status !== 'Ditutup')[0] || {}).ID || '');
  const op = S.forms.filter(f => f.Status !== 'Ditutup' || f.ID === S.formSel);
  $('fSel').innerHTML = op.length ? op.map(fopt).join('') : '<option value="">(tidak ada form terbuka)</option>'; $('fSel').value = S.formSel;
  const cur = $('fv').value || S.fv || 'all';
  $('fv').innerHTML = '<option value="all">Semua form</option>' + S.forms.map(fopt).join('');
  $('fv').value = cur === 'all' || formOf(cur) ? cur : 'all';
  $('eF').innerHTML = S.forms.map(fopt).join('');
  const cnt = id => S.temuan.filter(t => t.FormID === id).length;
  $('xForm').innerHTML = '<option value="all">Semua form (digabung jadi satu file)</option>' + S.forms.map(f => '<option value="' + esc(f.ID) + '">' + esc(f.Label) + ' (' + cnt(f.ID) + ' temuan)</option>').join('');
  $('xForm').value = prevX && (prevX === 'all' || formOf(prevX)) ? prevX : (formOf(S.aktif) ? S.aktif : 'all');
  renderFormBar(); renderFormAdmin(); hitungUnduh();
}
function renderFormBar() {
  const f = formOf(S.formSel), b = $('formBar'); let h, cls = 'fb';
  if (!f) { h = '<b>Belum ada form terbuka.</b><span>Minta admin membuat atau membuka form dulu.</span>'; cls += ' warn'; }
  else {
    h = '<small>Anda mengisi form:</small><b>' + esc(f.Label) + '</b><span>Auditor: ' + esc(f.Auditor || '—') + ' • ' + esc(tg(f.Tgl1)) + ' s/d ' + esc(tg(f.Tgl2)) + '</span>';
    const hi = hariIni(), ak = formOf(S.aktif);
    if (f.Status === 'Ditutup') { h += '<em>Perhatian: form ini sudah ditutup. Pilih form lain sebelum menyimpan.</em>'; cls += ' bad'; }
    else {
      if (f.ID !== S.aktif) { h += '<em>Perhatian: ini bukan form aktif' + (ak ? ' (form aktif: ' + esc(ak.Label) + ')' : '') + '. Pastikan sudah benar.</em>'; cls += ' warn'; }
      if (hi > tg(f.Tgl2) || hi < tg(f.Tgl1)) { h += '<em>Perhatian: tanggal hari ini di luar periode form.</em>'; cls += ' warn'; }
    }
  }
  b.className = cls; b.innerHTML = h;
  $('btnSave').disabled = !f || f.Status === 'Ditutup';
}
function gantiForm() {
  const ada = $('remark').value.trim() || photos.b || photos.a, old = S.formSel;
  S.formSel = $('fSel').value;
  if (ada) { try { localStorage.removeItem('d:' + old); } catch (e) {} saveDraft(); } else loadDraft();
  renderFormBar();
}
function cekForm() {
  google.script.run.withSuccessHandler(r => {
    if (!r.success) return;
    const lama = S.aktif; S.forms = r.data.forms; S.aktif = r.data.aktif;
    const f = formOf(S.formSel);
    if (S.aktif !== lama) toast('Form aktif sekarang: ' + ((formOf(S.aktif) || {}).Label || 'tidak ada'));
    if (f && f.Status === 'Ditutup') toast('Form "' + f.Label + '" sudah ditutup. Pilih form lain sebelum menyimpan.', false);
    fillForms(); renderList();
  }).getForms();
}

function renderFormAdmin() {
  if (!$('fAdmin')) return;
  $('fAdmin').innerHTML = S.forms.map(f => {
    const n = S.temuan.filter(t => t.FormID === f.ID).length, ak = f.ID === S.aktif, tut = f.Status === 'Ditutup';
    return '<div class="fc"><div class="row"><b>' + esc(f.Label) + '</b><span class="st ' + (tut ? 'g' : 'c') + '">' + (ak ? 'Aktif' : tut ? 'Ditutup' : 'Terbuka') + '</span></div>' +
      '<div class="meta">Auditor: ' + esc(f.Auditor || '—') + ' • Auditee: ' + esc(f.Auditee || '—') + '<br>' + esc(f.Mill || '—') + ' • ' + esc(tg(f.Tgl1)) + ' s/d ' + esc(tg(f.Tgl2)) + ' • ' + n + ' temuan</div><div class="pbtn">' +
      (ak ? '' : '<button class="btn ghost" type="button" onclick="aktifkanForm('' + f.ID + '')">' + (tut ? 'Lanjutkan' : 'Jadikan aktif') + '</button>') +
      '<button class="btn ghost" type="button" onclick="bukaFormModal('' + f.ID + '')">Ubah kop</button>' +
      (tut ? '' : '<button class="btn ghost" type="button" onclick="tutupForm('' + f.ID + '')">Tutup</button>') +
      (n ? '' : '<button class="btn danger" type="button" onclick="hapusForm('' + f.ID + '')">Hapus</button>') + '</div></div>';
  }).join('') || '<p class="mut">Belum ada form.</p>';
}
function terapkanForm(r) {
  const i = S.forms.findIndex(f => f.ID === r.data.form.ID); if (i >= 0) S.forms[i] = r.data.form; else S.forms.push(r.data.form);
  S.forms.sort((a, b) => nat(a.Label, b.Label));
  if (r.data.aktif !== undefined) S.aktif = r.data.aktif;
  fillForms(); renderList();
}
function bukaFormModal(id) {
  S.editForm = id || null; const f = id ? formOf(id) : null, last = S.forms[S.forms.length - 1] || {};
  $('fmTitle').textContent = f ? 'Ubah Kop Form' : 'Tambah Form Baru';
  $('fmN').value = f ? f.Nama : saranNama(); $('fmM').value = f ? f.Mill : (last.Mill || 'FINISHING PF 1');
  $('fmE').value = f ? f.Auditee : ''; $('fmA').value = f ? f.Auditor : '';
  $('fmT1').value = f ? tg(f.Tgl1) : hariIni(); $('fmT2').value = f ? tg(f.Tgl2) : hariIni();
  $('fmAk').checked = !f; $('fmAkRow').style.display = f ? 'none' : ''; $('mForm').classList.add('on');
}
function simpanForm() {
  const o = { nama: $('fmN').value.trim(), mill: $('fmM').value.trim(), auditee: $('fmE').value.trim(), auditor: $('fmA').value.trim(), tgl1: $('fmT1').value, tgl2: $('fmT2').value, aktifkan: $('fmAk').checked }, edit = S.editForm;
  if (!o.tgl1 || !o.tgl2 || o.tgl2 < o.tgl1) return toast('Isi tanggal dengan benar (selesai tidak boleh sebelum mulai).', false);
  if (!o.nama) return toast('Isi nama form (contoh: Form 3 - Pak Andi).', false);
  const ok = r => { if (!r.success) return toast(r.message, false); closeM('mForm'); terapkanForm(r); toast(edit ? 'Form diperbarui' : 'Form dibuat'); }, ng = e => toast(e.message, false);
  if (edit) google.script.run.withSuccessHandler(ok).withFailureHandler(ng).ubahForm(S.pin, edit, o);
  else google.script.run.withSuccessHandler(ok).withFailureHandler(ng).buatForm(S.pin, o);
}
function aktifkanForm(id) {
  const f = formOf(id), kosong = !$('remark').value.trim() && !photos.b && !photos.a;
  google.script.run.withSuccessHandler(r => { if (!r.success) return toast(r.message, false); if (kosong) S.formSel = id; terapkanForm(r); toast('Form aktif: ' + f.Label); })
    .withFailureHandler(e => toast(e.message, false)).setFormAktif(S.pin, id);
}
function tutupForm(id) {
  const f = formOf(id); if (!confirm('Tutup form "' + f.Label + '"? Temuan baru tidak bisa ditambahkan, tetapi bisa dibuka kembali lewat tombol Lanjutkan.')) return;
  google.script.run.withSuccessHandler(r => { if (!r.success) return toast(r.message, false); terapkanForm(r); toast('Form ditutup'); })
    .withFailureHandler(e => toast(e.message, false)).setFormStatus(S.pin, id, 'Ditutup');
}
function hapusForm(id) {
  const f = formOf(id); if (!confirm('Hapus form kosong "' + f.Label + '"?')) return;
  google.script.run.withSuccessHandler(r => {
    if (!r.success) return toast(r.message, false);
    S.forms = S.forms.filter(x => x.ID !== id); S.aktif = r.data.aktif; if (S.formSel === id) S.formSel = ''; fillForms(); renderList(); toast('Form dihapus');
  }).withFailureHandler(e => toast(e.message, false)).hapusForm(S.pin, id);
}

function selForms() { const v = $('xForm').value; return v === 'all' ? S.forms.map(f => f.ID) : (v ? [v] : []); }
function hitungUnduh() {
  const ids = selForms(), ar = new Set([...document.querySelectorAll('#xAreas input:checked')].map(i => i.value));
  const n = S.temuan.filter(t => ids.includes(t.FormID) && ar.has(t.AreaID)).length;
  const maxLimit = maks();
  
  $('xInfo').textContent = n + ' temuan terpilih (maksimal ' + maxLimit + ' per file)' + (n > maxLimit ? ' — kurangi form atau area yang dipilih.' : '');
  $('xInfo').className = 'info' + (n > maxLimit ? ' bad' : '');
  $('btnX').disabled = !n || n > maxLimit;
}

function rapikanFoto() {
  if (!confirm('Rapikan foto di Google Drive sekarang? Foto tidak dihapus, hanya dipindah ke folder form dan area yang benar lalu dinamai ulang. Proses bisa beberapa menit; jangan tutup halaman.')) return;
  const b = $('btnRapi'); b.disabled = true; b.textContent = 'Merapikan… (jangan tutup halaman)';
  const sel = () => { b.disabled = false; b.textContent = 'Rapikan Folder Foto'; };
  google.script.run.withSuccessHandler(r => {
    sel(); if (!r.success) return toast(r.message, false);
    const d = r.data;
    alert('Selesai.\nFoto dipindah: ' + d.pindah + '\nFoto dinamai ulang: ' + d.nama + '\nFolder kosong dibuang: ' + d.dibuang +
      (d.lewat ? '\n\nWaktu proses habis sebelum selesai. Jalankan sekali lagi.' : '') +
      (d.sisa.length ? '\n\nFolder berikut masih berisi file salinan yang tidak dipakai aplikasi (periksa, lalu hapus manual bila sudah yakin):\n- ' + d.sisa.join('\n- ') : ''));
  }).withFailureHandler(e => { sel(); toast(e.message, false); }).rapikanFoto(S.pin);
}

let hf = null;
function hapusFotoKartu(id, k) {
  const t = S.temuan.find(x => x.ID === id); if (!t) return; const fid = k === 'b' ? t.FotoBefore : t.FotoAfter;
  hf = { id: id, k: k }; $('hfImg').src = thumb(fid, 500); $('hfTeks').textContent = 'Foto ' + (k === 'b' ? 'Before' : 'After') + ' pada temuan #' + t.No + ' (' + areaName(t.AreaID) + ').';
  $('mHapusFoto').classList.add('on');
}
function hapusFotoYa() {
  if (!hf) return; const h = hf, t = S.temuan.find(x => x.ID === h.id), b = $('hfOk'); b.disabled = true;
  google.script.run.withSuccessHandler(r => {
    b.disabled = false; closeM('mHapusFoto'); hf = null;
    if (!r.success) return toast(r.message, false);
    if (t) { if (h.k === 'b') t.FotoBefore = ''; else t.FotoAfter = ''; }
    renderList(); toast('Foto dihapus');
  }).withFailureHandler(e => { b.disabled = false; toast(e.message, false); }).hapusFotoTemuan(h.id, h.k === 'b' ? 'before' : 'after');
}

const nat = (a, b) => {
  const x = String(a || '').toLowerCase().match(/\d+|\D+/g) || [], y = String(b || '').toLowerCase().match(/\d+|\D+/g) || [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) { const p = x[i], q = y[i]; if (/^\d/.test(p) && /^\d/.test(q)) { const d = Number(p) - Number(q); if (d) return d; } else if (p !== q) return p < q ? -1 : 1; }
  return x.length - y.length;
};
function saranNama() { return 'Form ' + (S.forms.reduce((m, x) => { const g = /^Form\s*(\d+)/i.exec(x.Nama || ''); return g ? Math.max(m, Number(g[1])) : m; }, 0) + 1); }

let tundaPasang = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); tundaPasang = e; $('btnInstall').style.display = ''; });
window.addEventListener('appinstalled', () => { $('btnInstall').style.display = 'none'; toast('Aplikasi terpasang'); });
function pasangApp() { if (!tundaPasang) return; tundaPasang.prompt(); tundaPasang.userChoice.finally(() => { tundaPasang = null; $('btnInstall').style.display = 'none'; }); }
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
