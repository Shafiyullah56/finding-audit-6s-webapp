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
  compress(f).then(d => { photos[k] = d.split(',')[1]; $('pv-' + k).src = d; $('dz-' + k).classList.add('has'); S.zone = k; }).catch(() => toast('Foto tidak bisa dibaca.', false));
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
  if (!f || !$('sec-input').classList.contains('on')) return;
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
  const id = k === 'b' ? t.FotoBefore : t.FotoAfter, lb = k === 'b' ? 'Before' : 'After';
  return id ? '<img loading="lazy" src="' + thumb(id) + '" alt="' + lb + '" onclick="zoom(\'' + id + '\')">'
    : '<label class="add" for="ad' + t.ID + k + '">+ Tambah foto ' + lb + '</label><input type="file" id="ad' + t.ID + k + '" accept="image/*" hidden onchange="addPhoto(\'' + t.ID + '\',\'' + k + '\',this)">';
}
function renderList() {
  const q = $('q').value.toLowerCase(), fs = $('fs').value;
  $('sT').textContent = S.temuan.length; $('sO').textContent = S.temuan.filter(t => t.Status !== 'Close').length; $('sC').textContent = S.temuan.filter(t => t.Status === 'Close').length;
  const open = new Set([...document.querySelectorAll('.grp.open')].map(g => g.dataset.a));
  const html = S.areas.map(a => {
    const its = S.temuan.filter(t => t.AreaID === a.ID && (!fs || t.Status === fs) && (!q || (t.Remark + a.Nama + t.PIC).toLowerCase().includes(q))).sort(byNo);
    if (!its.length) return '';
    return '<div class="grp ' + (open.has(a.ID) || q ? 'open' : '') + '" data-a="' + esc(a.ID) + '"><div class="gh" onclick="this.parentNode.classList.toggle(\'open\')"><span>' + esc(a.Nama) + '</span><span class="pill">' + its.length + ' temuan</span></div><div class="gb">' +
      its.map(t => '<div class="it ' + (t.Status === 'Close' ? 'cl' : '') + '"><b>#' + esc(t.No) + '</b> <span class="st ' + (t.Status === 'Close' ? 'c' : '') + '">' + esc(t.Status) + '</span> <span class="meta">' + esc(String(t.Tanggal).slice(0, 10)) + '</span><p>' + esc(t.Remark) + '</p><div class="ph">' + slot(t, 'b') + slot(t, 'a') + '</div><div class="meta">Kategori: ' + esc(t.Kategori || '—') + ' • PIC: ' + esc(t.PIC || '—') + '</div>' +
        (S.pin ? '<button onclick="bukaEdit(\'' + t.ID + '\')">Lengkapi / Edit</button>' : '') + '</div>').join('') + '</div></div>';
  }).join('');
  $('list').innerHTML = html || '<div class="card">Belum ada temuan.</div>';
}
function addPhoto(id, k, inp) {
  const f = inp.files[0]; if (!isImg(f)) return; toast('Mengunggah foto…');
  compress(f).then(d => google.script.run.withSuccessHandler(r => {
    if (!r.success) return toast(r.message, false);
    const t = S.temuan.find(x => x.ID === id); if (t) { if (k === 'b') t.FotoBefore = r.data.id; else t.FotoAfter = r.data.id; }
    renderList(); toast('Foto ditambahkan');
  }).withFailureHandler(e => toast(e.message, false)).tambahFoto(id, k === 'b' ? 'before' : 'after', d.split(',')[1])).catch(() => toast('Foto tidak bisa dibaca.', false));
}

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
  $('eA').value = t.AreaID; $('eK').value = m[1] || ''; $('eN').value = m[2] || ''; $('eP').value = t.PIC || ''; $('eS').value = t.Status || 'Open'; $('mEdit').classList.add('on');
}
function simpanEdit() {
  const t = S.temuan.find(x => x.ID === S.editId), k = $('eK').value, n = $('eN').value;
  const f = { AreaID: $('eA').value, Kategori: k ? k + (n ? '-' + n : '') : '', PIC: $('eP').value.trim(), Status: $('eS').value }, old = Object.assign({}, t);
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
    b.disabled = false; b.textContent = 'Siapkan Dokumen';
    if (!r.success) return toast(r.message, false);
    $('xLink').href = r.data.url; $('xLink').style.display = 'block'; toast('Dokumen siap');
  }).withFailureHandler(e => { b.disabled = false; b.textContent = 'Siapkan Dokumen'; toast(e.message, false); }).exportHasil(S.pin, o);
}
$('pin').addEventListener('keydown', e => { if (e.key === 'Enter') loginAdmin(); });
document.addEventListener('DOMContentLoaded', init);
