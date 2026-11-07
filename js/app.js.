const $ = (s, e = document) => e.querySelector(s), $$ = (s, e = document) => [...e.querySelectorAll(s)];
const S = { files: [], paths: new Set(), tree: [], id: 0, busy: false,
  cfg: JSON.parse(localStorage.pd_cfg || '{}'), hist: JSON.parse(localStorage.pd_hist || '[]') };
const cfg = (k, d) => S.cfg[k] ?? d;
const setCfg = (k, v) => { S.cfg[k] = v; localStorage.pd_cfg = JSON.stringify(S.cfg) };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
const clean = p => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');

function toast(m, err) { const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = m; $('#toasts').append(t); setTimeout(() => t.remove(), 4200) }
function log(m, bold) { const t = $('#term'); t.innerHTML += '\n' + (bold ? '<b>' + esc(m) + '</b>' : esc(m)); t.scrollTop = 1e9 }
function beep() { try { const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 660; g.gain.setValueAtTime(.08, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .4); o.start(); o.stop(a.currentTime + .4) } catch {} }

/* ---------- abas ---------- */
const TABS=['enviar','repo','editor','commits','historico','ajustes','ajuda'];
function tab(n) { $$('.tab').forEach(t => t.classList.toggle('on', t.id === n)); $$('#tabs button').forEach(b => { const on = b.dataset.tab === n; b.classList.toggle('on', on); if (on) { const t = $('#tabs'); t.style.setProperty('--x', b.offsetLeft + 'px'); t.style.setProperty('--w', b.offsetWidth + 'px'); b.scrollIntoView({ inline: 'center', block: 'nearest' }) } }); if (n === 'commits') loadCommits(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
$('#tabs').onclick = e => e.target.dataset.tab && tab(e.target.dataset.tab);

/* ---------- conexao ---------- */
const repoVal = () => $('#repo').value.split('/');
async function connect() {
  const tk = $('#token').value.trim(); if (!tk) return toast('Informe o token', 1);
  GH.token = tk; $('#b-conn').textContent = '...';
  try {
    const u = await GH.user();
    (cfg('remember') ? localStorage : sessionStorage).pd_token = tk;
    $('#dot').classList.add('on'); $('#who').textContent = u.login;
    const rs = await GH.repos();
    $('#repo').innerHTML = rs.map(r => `<option value="${r.full_name}" data-b="${r.default_branch}">${r.full_name}${r.private ? ' [privado]' : ''}</option>`).join('');
    if (cfg('lastRepo')) $('#repo').value = cfg('lastRepo');
    toast('Conectado como ' + u.login); $('#b-conn').textContent = 'Reconectar';
    await loadBranches();
  } catch (e) { GH.token = ''; $('#b-conn').textContent = 'Conectar'; toast('Falha: ' + e.message, 1) }
}
async function loadBranches() {
  const [o, r] = repoVal(); if (!r) return; setCfg('lastRepo', o + '/' + r);
  const bs = await GH.branches(o, r), def = $('#repo').selectedOptions[0].dataset.b;
  $('#branch').innerHTML = bs.map(b => `<option>${esc(b.name)}</option>`).join(''); $('#branch').value = def;
  await loadTree();
}
async function loadTree() {
  const [o, r] = repoVal(), b = $('#branch').value; if (!r) return;
  try {
    const t = await GH.tree(o, r, b); S.tree = t.tree;
    S.paths = new Set(S.tree.filter(x => x.type === 'blob').map(x => x.path));
    const dirs = S.tree.filter(x => x.type === 'tree').map(x => x.path).sort();
    $('#dest').innerHTML = '<option value="">/ (raiz)</option>' + dirs.map(d => `<option>${esc(d)}</option>`).join('');
    renderRepo(); render(); pv();
  } catch (e) { S.tree = []; S.paths = new Set(); toast('Arvore: ' + e.message + ' (repo vazio?)', 1) }
}
$('#b-conn').onclick = connect; $('#repo').onchange = loadBranches; $('#branch').onchange = loadTree; $('#b-reload').onclick = loadTree;

/* ---------- destino ---------- */
const base = () => clean([$('#dest').value, $('#sub').value].filter(Boolean).join('/'));
const full = f => clean((base() ? base() + '/' : '') + f.rel);
function pv() { $('#pv').textContent = 'destino: /' + base() + ' @ ' + ($('#branch').value || '-') }
['dest', 'sub', 'branch'].forEach(i => $('#' + i).addEventListener('input', () => { pv(); render() }));

/* ---------- arquivos ---------- */
const ignored = p => cfg('ignore', '.DS_Store,node_modules,.git,Thumbs.db').split(',').map(s => s.trim()).filter(Boolean).some(x => p.split('/').includes(x));
function strip(rel) { return cfg('strip', true) && rel.includes('/') ? rel.split('/').slice(1).join('/') : rel }
function push(rel, blob) { rel = clean(rel); if (!rel || ignored(rel)) return; S.files = S.files.filter(f => f.rel !== rel); S.files.push({ id: ++S.id, rel, blob, size: blob.size, sel: true }) }
async function addFiles(list) {
  for (const f of list) {
    const rel = f._rel || f.webkitRelativePath || f.name;
    if (cfg('zip', true) && /\.zip$/i.test(f.name) && window.JSZip) {
      const z = await JSZip.loadAsync(f); const names = Object.keys(z.files).filter(n => !z.files[n].dir);
      for (const n of names) push(strip(n), await z.files[n].async('blob'));
    } else push(f.webkitRelativePath || f._rel ? strip(rel) : rel, f);
  }
  render(); toast('Fila atualizada: ' + S.files.length + ' arquivo(s)');
}
async function walk(en, p = '') {
  if (en.isFile) return [await new Promise(r => en.file(f => { f._rel = p + en.name; r(f) }))];
  const rd = en.createReader(); let all = [], b;
  do { b = await new Promise(r => rd.readEntries(r)); all.push(...b) } while (b.length);
  return (await Promise.all(all.map(e => walk(e, p + en.name + '/')))).flat();
}
const drop = $('#drop');
['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, x => { x.preventDefault(); drop.classList.add('over') }));
['dragleave', 'drop'].forEach(e => drop.addEventListener(e, x => { x.preventDefault(); drop.classList.remove('over') }));
drop.addEventListener('drop', async e => { const its = [...e.dataTransfer.items].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean); addFiles((await Promise.all(its.map(x => walk(x)))).flat()) });
$('#b-files').onclick = () => $('#f-files').click(); $('#b-folder').onclick = () => $('#f-folder').click();
$('#f-files').onchange = e => { addFiles([...e.target.files]); e.target.value = '' }; $('#f-folder').onchange = e => { addFiles([...e.target.files]); e.target.value = '' };
$('#b-paste').onclick = () => tab('editor');

function render() {
  const q = $('#filter').value.toLowerCase(), so = $('#sort').value;
  const st = f => S.paths.has(full(f)) ? 'rep' : 'new';
  let l = S.files.filter(f => full(f).toLowerCase().includes(q));
  l.sort((a, b) => so === 'size' ? b.size - a.size : so === 'status' ? st(a).localeCompare(st(b)) : a.rel.localeCompare(b.rel));
  $('#list').innerHTML = l.length ? l.map(f => `<div class="item" data-id="${f.id}"><input type="checkbox" ${f.sel ? 'checked' : ''}><input type="text" value="${esc(f.rel)}" title="${esc(full(f))}"><span class="sz">${fmt(f.size)}</span><span class="tag ${st(f)}">${st(f) === 'rep' ? 'SUBSTITUI' : 'NOVO'}</span><button class="x" title="remover">x</button></div>`).join('') : '<div class="empty">Fila vazia.</div>';
  const sel = S.files.filter(f => f.sel), rep = sel.filter(f => st(f) === 'rep').length;
  $('#s-files').textContent = sel.length; $('#s-size').textContent = fmt(sel.reduce((a, f) => a + f.size, 0));
  $('#s-new').textContent = sel.length - rep; $('#s-rep').textContent = rep; $('#s-commits').textContent = S.hist.length;
}
$('#list').addEventListener('input', e => { const f = S.files.find(x => x.id == e.target.closest('.item').dataset.id); if (e.target.type === 'checkbox') f.sel = e.target.checked; else f.rel = clean(e.target.value); if (e.target.type === 'checkbox') render() });
$('#list').addEventListener('change', e => e.target.type === 'text' && render());
$('#list').addEventListener('click', e => { if (e.target.classList.contains('x')) { S.files = S.files.filter(f => f.id != e.target.closest('.item').dataset.id); render() } });
$('#filter').oninput = render; $('#sort').onchange = render;
$('#b-all').onclick = () => { S.files.forEach(f => f.sel = true); render() }; $('#b-none').onclick = () => { S.files.forEach(f => f.sel = false); render() };
$('#b-rm').onclick = () => { S.files = S.files.filter(f => !f.sel); render() }; $('#b-clear').onclick = () => { S.files = []; render() };

/* ---------- envio ---------- */
const b64 = blob => () => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob) });
async function send(dry) {
  if (S.busy) return; const [o, r] = repoVal(), b = $('#branch').value;
  if (!GH.token || !r) return toast('Conecte e escolha um repositorio', 1);
  const sel = S.files.filter(f => f.sel); if (!sel.length) return toast('Nenhum arquivo marcado', 1);
  const files = sel.map(f => ({ path: full(f), b64: b64(f.blob) }));
  const msg = (cfg('prefix', '') ? cfg('prefix', '') + ' ' : '') + ($('#msg').value.trim() || 'update via pushdeck');
  $('#term').textContent = ''; log(`${dry ? 'SIMULACAO' : 'ENVIO'} :: ${o}/${r}@${b} :: ${files.length} arquivo(s)`, 1);
  files.forEach(f => log((S.paths.has(f.path) ? '~ ' : '+ ') + f.path));
  if (dry) return log('nada foi enviado.');
  S.busy = true; $('#b-go').disabled = true;
  try {
    const c = await GH.commit(o, r, b, files, msg, (i, n, p) => { $('#bar').style.width = (i / n * 100) + '%'; log(`[${i}/${n}] blob ${p}`) });
    log('commit ' + c.sha.slice(0, 7) + ' criado', 1);
    S.hist.unshift({ sha: c.sha, url: `https://github.com/${o}/${r}/commit/${c.sha}`, repo: o + '/' + r, branch: b, msg, n: files.length, t: Date.now() });
    localStorage.pd_hist = JSON.stringify(S.hist.slice(0, 200));
    if (!cfg('keep', false)) S.files = [];
    toast('Enviado: ' + c.sha.slice(0, 7)); if (cfg('sound', false)) beep();
    await loadTree(); renderHist();
  } catch (e) { log('ERRO: ' + e.message, 1); toast(e.message, 1) }
  S.busy = false; $('#b-go').disabled = false; setTimeout(() => $('#bar').style.width = 0, 1500);
}
$('#b-go').onclick = () => send(false); $('#b-dry').onclick = () => send(true);

/* ---------- repositorio / historico ---------- */
function renderRepo() {
  const q = $('#rfilter').value.toLowerCase();
  const l = S.tree.filter(x => x.path.toLowerCase().includes(q)).slice(0, 600);
  $('#rinfo').textContent = `${S.tree.filter(x => x.type === 'blob').length} arquivos, ${S.tree.filter(x => x.type === 'tree').length} pastas. Clique numa pasta para defini-la como destino.`;
  $('#rtree').innerHTML = l.map(x => `<div class="node ${x.type === 'tree' ? 'dir' : ''}" data-p="${esc(x.path)}" data-t="${x.type}"><span>${x.type === 'tree' ? '[+] ' : '    '}${esc(x.path)}</span><span>${x.size ? fmt(x.size) : ''}</span></div>`).join('');
}
$('#rfilter').oninput = renderRepo;
$('#rtree').onclick = e => { const n = e.target.closest('.node'); if (n && n.dataset.t === 'tree') { $('#dest').value = n.dataset.p; pv(); render(); tab('enviar'); toast('Destino: /' + n.dataset.p) } };
function renderHist() {
  $('#hlist').innerHTML = S.hist.length ? S.hist.map(h => `<a class="node" style="text-decoration:none;color:inherit" target="_blank" href="${h.url}"><span>${h.sha.slice(0, 7)} :: ${esc(h.msg)} :: ${h.n} arq.</span><span>${esc(h.repo)}@${esc(h.branch)} - ${new Date(h.t).toLocaleString('pt-BR')}</span></a>`).join('') : '<div class="empty">Nenhum envio ainda.</div>';
  $('#s-commits').textContent = S.hist.length;
}
$('#b-hclear').onclick = () => { S.hist = []; localStorage.pd_hist = '[]'; renderHist() };

/* ---------- ajustes ---------- */
const opts = { 'o-strip': 'strip', 'o-zip': 'zip', 'o-keep': 'keep', 'o-sound': 'sound', 'o-remember': 'remember', 'o-fx': 'fx', 'o-light': 'light' };
const defs = { strip: true, zip: true, fx: true };
for (const [id, k] of Object.entries(opts)) { const el = $('#' + id); el.checked = cfg(k, defs[k] ?? false); el.onchange = () => { setCfg(k, el.checked); if (k === 'light') theme(); render() } }
$('#o-ignore').value = cfg('ignore', '.DS_Store,node_modules,.git,Thumbs.db'); $('#o-ignore').oninput = e => setCfg('ignore', e.target.value);
$('#o-prefix').value = cfg('prefix', ''); $('#o-prefix').oninput = e => setCfg('prefix', e.target.value);
const theme = () => document.documentElement.dataset.theme = cfg('light', false) ? 'light' : 'dark';
$('#b-wipe').onclick = () => { if (confirm('Apagar token, historico e ajustes?')) { localStorage.clear(); sessionStorage.clear(); location.reload() } };

/* ---------- atalhos ---------- */
addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'Enter') send(false);
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (!typing && e.key === '/') { e.preventDefault(); tab('enviar'); $('#filter').focus() }
  if (!typing && '1234567'.includes(e.key) && e.key) tab(TABS[e.key - 1]);
});

/* ---------- efeitos ---------- */
addEventListener('pointermove', e => {
  const g = $('#glow'); g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px';
  const c = e.target.closest && e.target.closest('.card'); if (c) { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px') }
  M.x = e.clientX; M.y = e.clientY;
});
const io = new IntersectionObserver(es => es.forEach(x => x.isIntersecting && x.target.classList.add('vis')), { threshold: .08 });
function observe() { $$('.tab.on .reveal').forEach(el => io.observe(el)) }
const M = { x: -999, y: -999 };
(() => {
  const c = $('#bg'), x = c.getContext('2d'); let w, h, P = [];
  const rs = () => { w = c.width = innerWidth; h = c.height = innerHeight; P = Array.from({ length: Math.min(90, w * h / 15000) }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35 })) };
  rs(); addEventListener('resize', rs);
  (function f() {
    x.clearRect(0, 0, w, h);
    if (cfg('fx', true)) {
      const fg = cfg('light', false) ? '#000' : '#fff'; x.fillStyle = x.strokeStyle = fg;
      for (const p of P) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1; x.globalAlpha = .5; x.fillRect(p.x, p.y, 1.6, 1.6) }
      for (let i = 0; i < P.length; i++) {
        for (let j = i + 1; j < P.length; j++) { const d = Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y); if (d < 120) { x.globalAlpha = (1 - d / 120) * .14; x.beginPath(); x.moveTo(P[i].x, P[i].y); x.lineTo(P[j].x, P[j].y); x.stroke() } }
        const d = Math.hypot(P[i].x - M.x, P[i].y - M.y); if (d < 170) { x.globalAlpha = (1 - d / 170) * .4; x.beginPath(); x.moveTo(P[i].x, P[i].y); x.lineTo(M.x, M.y); x.stroke() }
      }
    }
    requestAnimationFrame(f);
  })();
})();
function counters() { $$('[data-n]').forEach(el => { const t = +el.textContent; if (!t) return; let i = 0; const s = setInterval(() => { el.textContent = Math.min(t, ++i); if (i >= t) clearInterval(s) }, 30) }) }


/* ---------- repo: selecao, excluir, abrir no editor ---------- */
S.sel = new Set();
function renderRepo() {
  const q = $('#rfilter').value.toLowerCase();
  const l = S.tree.filter(x => x.path.toLowerCase().includes(q)).slice(0, 600);
  $('#rinfo').textContent = `${S.tree.filter(x => x.type === 'blob').length} arquivos, ${S.tree.filter(x => x.type === 'tree').length} pastas. Toque numa pasta para usar como destino; toque num arquivo para marcar.`;
  $('#rtree').innerHTML = l.map(x => `<div class="node ${x.type === 'tree' ? 'dir' : ''} ${S.sel.has(x.path) ? 'sel' : ''}" data-p="${esc(x.path)}" data-t="${x.type}"><span>${x.type === 'tree' ? '[pasta] ' : ''}${esc(x.path)}</span><span>${x.size ? fmt(x.size) : ''}</span></div>`).join('');
}
$('#rtree').onclick = e => {
  const n = e.target.closest('.node'); if (!n) return; const p = n.dataset.p;
  if (n.dataset.t === 'tree') { $('#dest').value = p; pv(); render(); tab('enviar'); toast('Destino: /' + p) }
  else { S.sel.has(p) ? S.sel.delete(p) : S.sel.add(p); n.classList.toggle('sel') }
};
$('#b-del').onclick = async () => {
  const [o, r] = repoVal(), b = $('#branch').value, ps = [...S.sel].filter(p => S.paths.has(p));
  if (!ps.length) return toast('Marque arquivos no Repositorio', 1);
  if (!confirm(`Excluir ${ps.length} arquivo(s) de ${o}/${r}@${b}?`)) return;
  try { const c = await GH.remove(o, r, b, ps, 'delete via pushdeck'); toast('Excluido: ' + c.sha.slice(0, 7)); S.sel.clear(); await loadTree() } catch (e) { toast(e.message, 1) }
};
async function loadFile(p) {
  const [o, r] = repoVal(), b = $('#branch').value;
  try { const f = await GH.file(o, r, p, b); const bin = atob(f.content.replace(/\n/g, '')); $('#ed-code').value = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); $('#ed-name').value = p; $('#ed-code').oninput(); toast('Carregado: ' + p) } catch (e) { toast(e.message, 1) }
}
$('#b-edit').onclick = () => { const p = [...S.sel][0]; if (!p) return toast('Marque um arquivo', 1); tab('editor'); loadFile(p) };
$('#ed-load').onclick = () => $('#ed-from').value && loadFile(clean($('#ed-from').value));

/* ---------- editor ---------- */
$('#ed-code').oninput = () => { const v = $('#ed-code').value; $('#ed-info').textContent = v.split('\n').length + ' linhas, ' + fmt(new Blob([v]).size) };
$('#ed-code').addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  ') } });
$('#ed-add').onclick = () => { const n = clean($('#ed-name').value), c = $('#ed-code').value; if (!n) return toast('Informe o nome do arquivo', 1); if (!c) return toast('Codigo vazio', 1); push(n, new Blob([c], { type: 'text/plain' })); render(); toast('Adicionado a fila: ' + n); $('#ed-name').value = ''; $('#ed-code').value = ''; $('#ed-code').oninput(); tab('enviar') };
$('#ed-clear').onclick = () => { $('#ed-name').value = ''; $('#ed-code').value = ''; $('#ed-code').oninput() };

/* ---------- commits ---------- */
async function loadCommits() {
  const [o, r] = repoVal(), b = $('#branch').value; if (!GH.token || !r) return;
  try { const cs = await GH.commits(o, r, b);
    $('#clist').innerHTML = cs.map(c => `<a class="node" target="_blank" href="${c.html_url}"><span>${c.sha.slice(0, 7)} ${esc(c.commit.message.split('\n')[0])}</span><span>${esc(c.commit.author.name)} - ${new Date(c.commit.author.date).toLocaleDateString('pt-BR')}</span></a>`).join('') || '<div class="empty">Sem commits.</div>';
  } catch (e) { toast(e.message, 1) }
}
$('#b-creload').onclick = loadCommits;

/* ---------- ripple nos botoes ---------- */
document.addEventListener('pointerdown', e => { const b = e.target.closest('.btn'); if (!b) return; const r = b.getBoundingClientRect(), s = document.createElement('span'), d = Math.max(r.width, r.height) / 4; s.className = 'rp'; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`; b.append(s); setTimeout(() => s.remove(), 600) });

/* ---------- init ---------- */
theme(); observe(); tab('enviar'); render(); renderHist(); pv(); counters();
const saved = localStorage.pd_token || sessionStorage.pd_token; if (saved) { $('#token').value = saved; connect() }
