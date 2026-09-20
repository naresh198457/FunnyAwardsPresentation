/* Funny Awards Presenter – editor, presenter and live-vote host (all in the browser). */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="200" height="150" fill="#e5e5ea"/><circle cx="100" cy="62" r="24" fill="#f3f3f6"/><path d="M52 150c0-30 21-46 48-46s48 16 48 46z" fill="#f3f3f6"/></svg>');
const MAX_CANDS = 6;
// CSS object-position that puts the chosen face point (fx,fy in 0..1) at the centre of a 4:3 crop
function posOf(x) {
  const ar = x.ar || 4 / 3, fx = x.fx ?? 0.5, fy = x.fy ?? 0.35;
  const at = (f, full, box) => full <= box + 0.001 ? 50 : Math.min(100, Math.max(0, (f * full - box / 2) / (full - box) * 100));
  const W = 400, boxH = W * 3 / 4;                       // compare at a fixed box width
  const H = W / ar, Wd = boxH * ar;                      // image size when scaled to cover
  return H > boxH ? `50% ${at(fy, H, boxH).toFixed(1)}%` : `${at(fx, Wd, W).toFixed(1)}% 50%`;
}
const imgTag = x => `<img src="${x.img || PLACEHOLDER}" style="object-position:${x.img ? posOf(x) : '50% 50%'}">`;

/* ---------------- data ---------------- */
const newCand = (name = '', caption = '') => ({ id: uid(), name, caption, img: '' });
const newCat = title => ({ id: uid(), title, candidates: [newCand('Person 1', '"Funny comment"'), newCand('Person 2', '"Another funny comment"')] });

let deck = load('fa_deck', null) || {
  title: 'Funny Awards Ceremony',
  instructions: 'Please scan the QR code above with your smartphone to cast your vote now! The winner of this prestigious award will be announced at the end of the evening.',
  categories: [newCat('Best Excuse for Missing a Match')]
};
let votes = load('fa_votes', {});    // { catId: { voterId: candId } }
let closed = load('fa_closed', {});  // { catId: true }

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem('fa_deck', JSON.stringify(deck)); }
    catch { toast('Browser storage is full – use a smaller photo or “Save deck” to keep a backup.'); }
  }, 250);
}
const saveVotes = () => { localStorage.setItem('fa_votes', JSON.stringify(votes)); localStorage.setItem('fa_closed', JSON.stringify(closed)); };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3500);
}

/* ---------------- live-vote host (ntfy.sh relay) ---------------- */
let presenting = false, idx = 0;
const hostId = () => {
  let id = localStorage.getItem('fa_host');
  if (!id) { id = 'poplars-fa-' + uid() + uid(); localStorage.setItem('fa_host', id); }
  return id;
};
const siteBase = () => {
  const typed = (localStorage.getItem('fa_site') || '').trim();
  if (typed) return typed.replace(/[?#].*$/, '').replace(/index\.html$|vote\.html$/, '').replace(/\/?$/, '/');
  return location.href.split('#')[0].split('?')[0];
};
const voteURL = () => new URL('vote.html', siteBase()).href + '?h=' + hostId();
const canReachPhones = () => /^https?:/.test(voteURL()) && !/\/\/(localhost|127\.)/.test(voteURL());

function setStatus(kind, text) {
  const s = $('#status');
  s.className = 'status ' + (kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : '');
  s.textContent = '● ' + text;
}

const RELAY = 'https://ntfy.sh/';
let es, votesSeen = 0, sendT;
function startHost() {
  setStatus('', 'Connecting…');
  if (es) es.close();
  // votes arrive on topic "<id>-v"; replay the last 10 min so a page refresh loses nothing
  es = new EventSource(RELAY + hostId() + '-v/sse?since=10m');
  es.onopen = () => { setStatus('ok', 'Live voting ready'); broadcast(); };
  es.onerror = () => setStatus('err', 'Voting offline – check internet (retrying)');
  es.onmessage = ev => {
    try { const d = JSON.parse(ev.data); if (d.event === 'message') onMsg(JSON.parse(d.message)); } catch { }
  };
}

const cur = () => screens()[idx];
function stateMsg() {
  const s = presenting && cur();
  const c = s && s.c;
  if (!c) return { type: 'state', event: deck.title, catId: null, ended: !!(s && s.t === 'final') };
  return {
    type: 'state', event: deck.title.slice(0, 80), catId: c.id, title: c.title.slice(0, 120), open: !closed[c.id],
    candidates: c.candidates.map(x => ({ id: x.id, name: x.name.slice(0, 60), caption: x.caption.slice(0, 100) }))
  };
}
// publish the current slide to phones (debounced so quick clicks send one message)
function broadcast() {
  clearTimeout(sendT);
  sendT = setTimeout(() => {
    fetch(RELAY + hostId() + '-s', { method: 'POST', body: JSON.stringify(stateMsg()) })
      .then(r => { if (!r.ok) toast('Could not update phones (' + r.status + '). Slow down slide changes for a moment.'); })
      .catch(() => toast('Could not reach the voting relay – check internet.'));
  }, 300);
}
function updCount() {
  const s = presenting && cur(), n = s && s.c ? Object.keys(votes[s.c.id] || {}).length : 0;
  $('#cVoters').textContent = '🗳 ' + n + ' vote' + (n === 1 ? '' : 's') + ' this category';
}

function onMsg(m) {
  if (!m || m.type !== 'vote' || !presenting) return;
  const s = cur(), c = s && s.c;
  if (!c || c.id !== m.catId || closed[c.id]) return;
  if (!c.candidates.some(x => x.id === m.candId) || typeof m.voter !== 'string') return;
  (votes[c.id] ||= {})[m.voter.slice(0, 40)] = m.candId;
  saveVotes(); updCount();
  if (s.t === 'results') paintResults($('#pbox'), c, false);
}

/* ---------------- slide rendering ---------------- */
function qrSVG(text) {
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}"/></svg>`;
}

function screens() {
  const s = [];
  deck.categories.forEach(c => { s.push({ t: 'vote', c }); s.push({ t: 'results', c }); });
  return s;
}

function tally(c, demo) {
  const counts = {};
  c.candidates.forEach((x, i) => counts[x.id] = demo ? [7, 4, 3, 2, 1, 1][i] || 0 : 0);
  if (!demo) Object.values(votes[c.id] || {}).forEach(id => { if (id in counts) counts[id]++; });
  const list = c.candidates.map(x => counts[x.id]);
  return { counts, total: list.reduce((a, b) => a + b, 0), max: Math.max(0, ...list) };
}

function slideHTML(s, demo) {
  const head = `<h1>${esc(deck.title)}</h1>`;
  if (s.t === 'vote') {
    const c = s.c;
    return head + `<h2>${esc(c.title)}${closed[c.id] && !demo ? '<span class="closed-tag">Voting closed</span>' : ''}</h2>
      <div class="cards">${c.candidates.map(x => `<div class="card">${imgTag(x)}<div class="nm">${esc(x.name)}</div><div class="cp">${esc(x.caption)}</div></div>`).join('')}
      <div class="card qr"><div class="qrbox">${qrSVG(voteURL())}</div><b>SCAN TO VOTE</b></div></div>
      <p class="ins"><b>Instructions:</b><br>${esc(deck.instructions)}</p>`;
  }
  if (s.t === 'results') {
    const c = s.c;
    return head + `<h2>${esc(c.title)} – Live results</h2>
      <div class="res">${c.candidates.map(x => `<div class="rrow" data-id="${x.id}">${imgTag(x)}<div class="rn"><b>${esc(x.name)}</b><i>${esc(x.caption)}</i></div><div class="bar"><span></span></div><div class="ct"></div></div>`).join('')}</div>
      <div class="foot"><span class="total"></span>${!demo && closed[c.id] ? '<span>🔒 Voting closed</span>' : `<span class="mini">Still time to vote <span class="qrbox">${qrSVG(voteURL())}</span></span>`}</div>`;
  }
  const rows = deck.categories.map(c => {
    const t = tally(c, demo), w = t.max ? c.candidates.filter(x => t.counts[x.id] === t.max).map(x => x.name).join(' & ') : 'No votes yet';
    return `<div class="wcard"><small>${esc(c.title)}</small>🏆 <b>${esc(w)}</b></div>`;
  }).join('');
  return head + `<h2>The winners</h2><div class="winners">${rows}</div>`;
}

function paintResults(root, c, demo) {
  const t = tally(c, demo), isClosed = !demo && closed[c.id];
  root.querySelectorAll('.rrow').forEach(row => {
    const n = t.counts[row.dataset.id] || 0, lead = t.max > 0 && n === t.max;
    row.classList.toggle('lead', lead);
    row.classList.toggle('win', lead && !!isClosed);
    row.querySelector('.bar span').style.width = (t.max ? n / t.max * 100 : 0) + '%';
    row.querySelector('.ct').innerHTML = (lead && isClosed ? '🏆 ' : '') + n + `<small>${t.total ? Math.round(n / t.total * 100) : 0}%</small>`;
  });
  root.querySelector('.total').textContent = t.total + ' vote' + (t.total === 1 ? '' : 's') + ' so far';
}

/* Scale a 1280x720 stage into its box */
function mountStage(box, s, demo) {
  box.innerHTML = `<div class="stage">${slideHTML(s, demo)}</div>`;
  const st = box.firstElementChild;
  const fit = () => {
    const k = Math.min(box.clientWidth / 1280, box.clientHeight / 720);
    st.style.transform = `scale(${k})`;
    st.style.left = (box.clientWidth - 1280 * k) / 2 + 'px';
    st.style.top = (box.clientHeight - 720 * k) / 2 + 'px';
  };
  fit();
  if (box._ro) box._ro.disconnect();
  box._ro = new ResizeObserver(fit); box._ro.observe(box);
  if (s.t === 'results') requestAnimationFrame(() => requestAnimationFrame(() => paintResults(box, s.c, demo)));
}

/* ---------------- editor ---------------- */
let sel = 'settings';
const selCat = () => deck.categories.find(c => c.id === sel);

function renderAll() { renderSide(); renderForm(); renderPreview(); }

function renderSide() {
  document.querySelectorAll('.side-item[data-sel="settings"]').forEach(b => b.classList.toggle('on', sel === 'settings'));
  $('#catList').innerHTML = deck.categories.map((c, i) =>
    `<button class="side-item ${sel === c.id ? 'on' : ''}" data-sel="${c.id}">${i + 1}. ${esc(c.title) || '(untitled)'}</button>`).join('');
}

function renderForm() {
  const f = $('#form');
  if (sel === 'settings' || !selCat()) {
    sel = 'settings';
    f.innerHTML = `<h2>Event settings</h2>
      <label class="f">Presentation title (shown on every slide)</label><input type="text" data-k="title" value="${esc(deck.title)}">
      <label class="f">Voting instructions (shown on the voting slide)</label><textarea data-k="instructions">${esc(deck.instructions)}</textarea>
      <div class="help"><b>How it works</b><ol>
        <li>Add a category on the left for each award, then add people, photos and funny comments.</li>
        <li>Click <b>▶ Start presentation</b>. Each category shows a <b>voting slide</b> with a QR code, then a <b>live results slide</b>.</li>
        <li>Guests scan the QR code with their phone camera and tap their pick. Bars move live on the results slide.</li>
        <li>Press <b>Close voting</b> on the results slide to reveal the winner.</li></ol></div>
      <label class="f">Published website address (your GitHub Pages link, e.g. https://yourname.github.io/funny-awards/)</label><input type="text" data-k="site" value="${esc(localStorage.getItem('fa_site') || '')}" placeholder="https://yourname.github.io/funny-awards/">
      ${canReachPhones() ? '' : '<div class="help warn"><b>Phones cannot open this voting link yet.</b> Publish the site on GitHub Pages (see README), then paste its address in the box above. The QR code will then work.</div>'}
      <div class="help"><b>Voting link</b> (try it on your phone before the event)
        <div class="linkbox"><input type="text" readonly value="${esc(voteURL())}" id="vlink"><button class="btn" id="copyLink">Copy</button></div>
        <div class="muted" style="margin-top:6px">Keep this tab open during the event – it receives the votes. Votes survive a page refresh.</div></div>`;
    return;
  }
  const c = selCat(), i = deck.categories.indexOf(c);
  f.innerHTML = `<h2>Category ${i + 1}</h2>
    <div class="row-btns">
      <button class="btn" data-act="up" ${i === 0 ? 'disabled' : ''}>↑ Move up</button>
      <button class="btn" data-act="down" ${i === deck.categories.length - 1 ? 'disabled' : ''}>↓ Move down</button>
      <button class="btn" data-act="dup">⧉ Duplicate</button>
      <button class="btn danger" data-act="del">🗑 Delete</button></div>
    <label class="f">Category title</label><input type="text" data-k="ctitle" value="${esc(c.title)}" placeholder="e.g. Best Excuse for Missing a Match">
    <label class="f">People (up to ${MAX_CANDS}) – click a photo to change it</label>
    <div class="cands">${c.candidates.map((x, j) => `<div class="cand" data-j="${j}">
      <div class="pic ${x.img ? 'has' : ''}" data-act="focus">${x.img ? `<img src="${x.img}" draggable="false"><i class="mk" style="left:${(x.fx ?? 0.5) * 100}%;top:${(x.fy ?? 0.35) * 100}%"></i>` : `<img src="${PLACEHOLDER}">`}</div>
      ${x.img ? '<div class="muted">👆 Click the face to centre it</div>' : ''}
      <label class="btn">${x.img ? 'Change photo' : 'Add photo'}<input type="file" accept="image/*" hidden data-k="img"></label>
      <input type="text" data-k="name" placeholder="Name" value="${esc(x.name)}">
      <input type="text" data-k="caption" placeholder='Funny comment' value="${esc(x.caption)}">
      <button class="btn danger" data-act="rmc" ${c.candidates.length <= 2 ? 'disabled' : ''}>Remove</button></div>`).join('')}</div>
    <button class="btn wide" data-act="addc" ${c.candidates.length >= MAX_CANDS ? 'disabled' : ''}>＋ Add person</button>`;
}

function renderPreview() {
  const c = selCat() || deck.categories[0];
  if (!c) { $('#pv1').innerHTML = $('#pv2').innerHTML = ''; return; }
  mountStage($('#pv1'), { t: 'vote', c }, true);
  mountStage($('#pv2'), { t: 'results', c }, true);
}

/* shrink photos (keeping the whole picture) so many fit in browser storage; guess the face position */
function processImage(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      const im = new Image();
      im.onerror = rej;
      im.onload = async () => {
        const k = Math.min(1, 560 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
        cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        const out = { img: cv.toDataURL('image/jpeg', 0.8), ar: cv.width / cv.height, fx: 0.5, fy: 0.35 };
        try {
          if ('FaceDetector' in window) {
            const faces = await new FaceDetector({ fastMode: true }).detect(cv);
            if (faces.length) {
              const f = faces.sort((a, b) => b.boundingBox.width - a.boundingBox.width)[0].boundingBox;
              out.fx = (f.x + f.width / 2) / cv.width; out.fy = (f.y + f.height / 2) / cv.height;
            }
          }
        } catch { }
        res(out);
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

$('#form').addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k || e.target.type === 'file') return;
  if (k === 'site') { localStorage.setItem('fa_site', e.target.value); $('#vlink').value = voteURL(); renderPreview(); return; }
  if (k === 'title' || k === 'instructions') deck[k] = e.target.value;
  else {
    const c = selCat(); if (!c) return;
    if (k === 'ctitle') { c.title = e.target.value; renderSide(); }
    else c.candidates[+e.target.closest('.cand').dataset.j][k] = e.target.value;
  }
  save(); renderPreview();
});

$('#form').addEventListener('change', async e => {
  if (e.target.dataset.k !== 'img' || !e.target.files[0]) return;
  const cand = selCat().candidates[+e.target.closest('.cand').dataset.j];
  try { Object.assign(cand, await processImage(e.target.files[0])); save(); renderForm(); renderPreview(); }
  catch { toast('Could not read that image.'); }
});

$('#form').addEventListener('click', e => {
  if (e.target.id === 'copyLink') { navigator.clipboard?.writeText($('#vlink').value); toast('Link copied'); return; }
  const pic = e.target.closest('.pic.has');
  if (pic) {
    const r = pic.querySelector('img').getBoundingClientRect(), cand = selCat().candidates[+pic.closest('.cand').dataset.j];
    cand.fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); cand.fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const mk = pic.querySelector('.mk'); mk.style.left = cand.fx * 100 + '%'; mk.style.top = cand.fy * 100 + '%';
    save(); renderPreview(); return;
  }
  const act = e.target.dataset.act; if (!act) return;
  const c = selCat(), a = deck.categories, i = a.indexOf(c);
  if (act === 'addc' && c.candidates.length < MAX_CANDS) c.candidates.push(newCand('', ''));
  else if (act === 'rmc') c.candidates.splice(+e.target.closest('.cand').dataset.j, 1);
  else if (act === 'up' && i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]];
  else if (act === 'down' && i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]];
  else if (act === 'dup') {
    const d = JSON.parse(JSON.stringify(c)); d.id = uid(); d.title += ' (copy)'; d.candidates.forEach(x => x.id = uid());
    a.splice(i + 1, 0, d); sel = d.id;
  } else if (act === 'del') {
    if (!confirm('Delete this category?')) return;
    a.splice(i, 1); delete votes[c.id]; delete closed[c.id]; saveVotes();
    sel = a[Math.min(i, a.length - 1)]?.id || 'settings';
  }
  save(); renderAll();
});

document.querySelector('.side').addEventListener('click', e => {
  const b = e.target.closest('.side-item'); if (!b) return;
  sel = b.dataset.sel; renderAll();
});
$('#btnAddCat').onclick = () => {
  const c = newCat(''); deck.categories.push(c); sel = c.id; save(); renderAll();
  document.querySelector('[data-k=ctitle]').focus();
};

/* ---- backup / restore / reset ---- */
$('#btnBackup').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(deck)], { type: 'application/json' }));
  a.download = 'funny-awards-deck.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#fileLoad').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.categories)) throw 0;
    deck = d; votes = {}; closed = {}; saveVotes(); sel = 'settings'; save(); renderAll(); toast('Deck loaded');
  } catch { toast('That file is not a saved deck.'); }
};
$('#btnReset').onclick = () => {
  if (!confirm('Delete ALL votes and re-open voting on every category?')) return;
  votes = {}; closed = {}; saveVotes(); broadcast(); toast('Votes cleared');
};

/* ---------------- presenter ---------------- */
let hideT;
function present() {
  if (!deck.categories.length) { toast('Add at least one category first.'); return; }
  presenting = true; idx = 0; $('#present').hidden = false;
  document.documentElement.requestFullscreen?.().catch(() => { });
  show(); wakeCtrl();
}
function exitPresent() {
  presenting = false; $('#present').hidden = true;
  if (document.fullscreenElement) document.exitFullscreen();
  broadcast(); renderPreview();
}
function show() {
  const list = screens(), s = list[idx];
  mountStage($('#pbox'), s, false);
  $('#cInfo').textContent = `Slide ${idx + 1} of ${list.length} · ${s.t === 'vote' ? 'Voting' : s.t === 'results' ? 'Live results' : 'Winners'}`;
  $('#cPrev').disabled = idx === 0; $('#cNext').disabled = idx === list.length - 1;
  $('#cClose').hidden = !s.c;
  if (s.c) $('#cClose').textContent = closed[s.c.id] ? '🔓 Re-open voting' : '🔒 Close voting';
  updCount(); broadcast();
}
function go(d) { const n = idx + d; if (n >= 0 && n < screens().length) { idx = n; show(); } }
function toggleClose() {
  const s = cur(); if (!s.c) return;
  closed[s.c.id] = !closed[s.c.id]; if (!closed[s.c.id]) delete closed[s.c.id];
  saveVotes(); show();
}
function wakeCtrl() { $('#ctrl').classList.remove('hide'); clearTimeout(hideT); hideT = setTimeout(() => $('#ctrl').classList.add('hide'), 3000); }

$('#btnPresent').onclick = present;
$('#cPrev').onclick = () => go(-1);
$('#cNext').onclick = () => go(1);
$('#cClose').onclick = toggleClose;
$('#cExit').onclick = exitPresent;
$('#present').addEventListener('mousemove', wakeCtrl);
document.addEventListener('keydown', e => {
  if (!presenting) return;
  if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(1); }
  else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(-1); }
  else if (e.key === 'Escape') exitPresent();
  else if (e.key.toLowerCase() === 'c') toggleClose();
});

/* ---------------- start ---------------- */
renderAll();
startHost();
