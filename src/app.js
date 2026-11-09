(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const LW = 3.5;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n, d = 0) => (isFinite(n) ? n : 0).toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: d });
const mmss = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const store = {
  get(k, d) { try { const v = localStorage.getItem('akis.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('akis.' + k, JSON.stringify(v)); } catch (e) {} },
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DPR = () => Math.min(2, window.devicePixelRatio || 1);
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

let TK = {};
function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  ['grass', 'grass2', 'tree', 'asphalt', 'marking', 'curb', 'deck', 'stbg', 'ink', 'muted', 'card', 'cur', 'pro', 'good', 'bad', 'hair', 'bg', 'fill2', 'accent']
    .forEach((k) => (TK[k] = cs.getPropertyValue('--' + k).trim()));
}
readTokens();

// ---------- araç boyaları ----------
const PAINT = [[.23, '#f0f0ec'], [.17, '#b7bcc2'], [.14, '#6b7178'], [.17, '#1d2025'], [.08, '#25385c'], [.07, '#a2252d'], [.05, '#3768a4'], [.03, '#c9b897'], [.04, '#efbf2c'], [.02, '#2f5b46']];
const paint = (u) => { let a = 0; for (const [w, c] of PAINT) { a += w; if (u < a) return c; } return PAINT[0][1]; };
const shadeCache = {};
function shade(hex, amt) {
  const k = hex + amt; if (shadeCache[k]) return shadeCache[k];
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt));
  return (shadeCache[k] = `rgb(${f(r)},${f(g)},${f(b)})`);
}
const speedCol = (v) => { const k = clamp((v * 3.6) / 85, 0, 1); return `hsl(${Math.round(k * 130)} 72% ${44 + k * 6}%)`; };

// ---------- senaryolar ----------
const YOL = { koridor: 'Büyük koridor', otoyol: 'Otoyol', kavsak: 'Kavşak', daralma: 'Daralma', halka: 'Halka yol' };
const OLAY = { baglanti: 'Bağlanan yol', serit: 'Şerit disiplini', cikis: 'Çıkış', kaza: 'Kaza', ariza: 'Arıza', calisma: 'Yol çalışması', zirve: 'Zirve saati', hayalet: 'Hayalet sıkışma' };
const HAVA = { acik: 'Açık', yagmur: 'Yağmur', saganak: 'Sağanak', kar: 'Kar', sis: 'Sis' };
const STRAIGHT = (lanes = 4) => ({ L: 1500, lanes, exitX: 1250, pocketLen: 300, side: true });
const PLAIN = (lanes = 4) => ({ L: 1500, lanes });
const CORR = (lanes = 5) => ({ L: 3000, lanes, onramp: { x: 700, len: 250 }, exitX: 1750, pocketLen: 300, side: true, drop: { x: 2550 },
  vslZones: [{ from: 1700, to: 2400, watch: [2350, 2650], lim: 70, on: 45, off: 62 }, { from: 250, to: 650, watch: [650, 1050], lim: 70, on: 45, off: 62 }] });
const SCN = [
  { id: 'koridor', ad: 'Akşam zirvesi: büyük koridor', ozet: '3 km, 5 şerit. Bağlanan yoldan araç katılıyor, sağa çıkış var, köprü girişinde yol 4 şeride iniyor. Çözümleri tek tek açıp kapat, hangisinin ne kazandırdığını gör.', yol: 'koridor', olay: ['zirve', 'baglanti', 'cikis', 'serit'], hava: 'acik', cfg: CORR(), demand: 6800, rampDemand: 1400, exitFrac: 0.15, focus: 740, win: 260, big: true },
  { id: 'koridor-yagmur', ad: 'Yağmurda büyük koridor', ozet: 'Aynı koridor ıslak zeminde. Takip mesafesi uzayınca birleşme noktaları daha erken tıkanıyor.', yol: 'koridor', olay: ['zirve', 'baglanti', 'cikis'], hava: 'yagmur', cfg: CORR(), demand: 6200, rampDemand: 1300, exitFrac: 0.15, focus: 740, win: 260, big: true },
  { id: 'koridor-kaza', ad: 'Koridorda kaza', ozet: 'Zirve saatinde orta şeritte kaza. Bağlanan yoldan gelenler, çıkışa yönelenler ve kazadan kaçanlar aynı anda şerit değiştiriyor.', yol: 'koridor', olay: ['kaza', 'baglanti', 'zirve'], hava: 'acik', cfg: CORR(), demand: 6000, rampDemand: 1200, exitFrac: 0.15, focus: 1950, win: 260, big: true, events: [{ at: 8, type: 'kaza', lane: 2, x: 2000, dur: 300 }] },
  { id: 'sol-serit', ad: 'Sol şeritte yavaş araçlar', ozet: 'Yavaş araçlar sol şeritte kalınca arkalarında kuyruk birikir, herkes sağdan geçmeye çalışır.', yol: 'otoyol', olay: ['serit', 'cikis'], hava: 'acik', cfg: STRAIGHT(), demand: 4800, exitFrac: 0.25, focus: 1080 },
  { id: 'son-an', ad: 'Son anda çıkış', ozet: 'Sağa dönecek sürücülerin çoğu çıkışı son 200 metrede fark edip birkaç şeridi birden kesiyor.', yol: 'otoyol', olay: ['cikis'], hava: 'acik', cfg: STRAIGHT(), demand: 4200, exitFrac: 0.35, focus: 1150 },
  { id: 'kopru', ad: 'Köprülü kavşak', ozet: 'Sağa ayrılanlar rampadan köprü üstündeki ışıklı kavşağa çıkıyor. Rampa dolunca kuyruk nereye taşıyor?', yol: 'kavsak', olay: ['cikis'], hava: 'acik', cfg: { L: 1500, lanes: 4, exitX: 1050, pocketLen: 350, ramp: { R: 220, cycle: 60, green: 36 }, bridgeX: 1300 }, demand: 4200, exitFrac: 0.2, focus: 1175, win: 320 },
  { id: 'kaza-sag', ad: 'Sağ şeritte kaza', ozet: 'İki araç sağ şeritte çarpışıyor. Bakmak için yavaşlayanlar ve son anda şerit değiştirenler kuyruğu büyütüyor.', yol: 'otoyol', olay: ['kaza'], hava: 'acik', cfg: PLAIN(), demand: 4200, exitFrac: 0, focus: 860, events: [{ at: 6, type: 'kaza', lane: 0, x: 900, dur: 300 }] },
  { id: 'ariza-sol', ad: 'Sol şeritte arızalı araç', ozet: 'En hızlı şeritte duran tek bir araç. Arkadan 90 ile gelenler son anda sağa kaçmak zorunda kalıyor.', yol: 'otoyol', olay: ['ariza'], hava: 'acik', cfg: PLAIN(), demand: 4400, exitFrac: 0, focus: 760, events: [{ at: 4, type: 'ariza', lane: 'sol', x: 800, dur: 240 }] },
  { id: 'daralma', ad: 'Dört şerit üçe iniyor', ozet: 'Köprü girişinde sağ şerit kapanıyor. Fermuar birleşme ile zorla araya girmeyi karşılaştır.', yol: 'daralma', olay: ['zirve'], hava: 'acik', cfg: { L: 1500, lanes: 4, drop: { x: 950 }, vsl: [350, 950, 70] }, demand: 5200, exitFrac: 0, focus: 880 },
  { id: 'calisma', ad: 'Orta şeritte yol çalışması', ozet: 'Üç şeritli yolun ortası 80 metre boyunca kapalı. Araçlar iki yana bölünmek zorunda.', yol: 'daralma', olay: ['calisma'], hava: 'acik', cfg: PLAIN(3), demand: 3600, exitFrac: 0, focus: 680, events: [{ at: 0, type: 'calisma', lane: 1, x: 700, len: 80, dur: Infinity }] },
  { id: 'yagmur-zirve', ad: 'Yağmurlu sabah zirvesi', ozet: 'İşe gidiş saati ve yağmur aynı anda. Takip mesafesi uzuyor, yolun taşıyabildiği araç sayısı düşüyor.', yol: 'otoyol', olay: ['zirve', 'serit', 'cikis'], hava: 'yagmur', cfg: STRAIGHT(), demand: 5400, exitFrac: 0.2, focus: 1080 },
  { id: 'kopru-sis', ad: 'Sisli sabah, köprülü kavşak', ozet: 'Görüş azalınca herkes yavaşlar ve rampaya geç yönelir. Cep olmayınca kuyruk ana yola taşar.', yol: 'kavsak', olay: ['cikis'], hava: 'sis', cfg: { L: 1500, lanes: 4, exitX: 1050, pocketLen: 350, ramp: { R: 220, cycle: 60, green: 30 }, bridgeX: 1300 }, demand: 3800, exitFrac: 0.22, focus: 1175, win: 320 },
  { id: 'kar-donus', ad: 'Karlı akşam dönüşü', ozet: 'Buzlu yolda frenler zayıf, hızlanma yavaş. Küçük bir hata uzun bir kuyruğa dönüşüyor.', yol: 'otoyol', olay: ['cikis', 'zirve'], hava: 'kar', cfg: STRAIGHT(), demand: 3400, exitFrac: 0.2, focus: 1080 },
  { id: 'cevre-5', ad: 'Beş şeritli çevre yolu', ozet: 'Geniş yol her zaman akıcı değildir. Şerit sayısı arttıkça şerit değiştirme ve kesişme de artar.', yol: 'otoyol', olay: ['serit', 'zirve', 'cikis'], hava: 'acik', cfg: STRAIGHT(5), demand: 6200, exitFrac: 0.2, focus: 1080 },
  { id: 'hayalet', ad: 'Hayalet sıkışma', ozet: 'Ne kaza var ne ışık. Tek bir ani fren, yakın takip eden araçlar arasında geriye doğru büyüyen bir dalga yaratıyor.', yol: 'halka', olay: ['hayalet'], hava: 'acik', ring: true, ringN: 32 },
  { id: 'hayalet-kar', ad: 'Karda hayalet sıkışma', ozet: 'Aynı deney buzlu yolda. Daha az araçla bile dalga oluşuyor, çünkü frenler zayıf ve tepki süreleri uzun.', yol: 'halka', olay: ['hayalet'], hava: 'kar', ring: true, ringN: 26 },
];
const byId = (id) => SCN.find((s) => s.id === id) || SCN[0];

// ---------- durum ----------
const S = {
  scn: null, lanes: 4, demand: 4000, exitFrac: 0.2, green: 36, ringN: 32, wx: 'acik',
  view: store.get('view', 'both'), speedIdx: 1, playing: !reduced, heat: store.get('heat', false), zi: 2, cam: 0,
  meas: { serit: true, cep: true, fermuar: true, vsl: true, rampa: true }, rampDemand: 1200, arr2: null, onG: null,
  sims: null, rings: null, arr: null, cfg: null, rampG: null, t0: 0, pending: [], wave: null, hist: [[], []], histT: 0, fx: [{}, {}], st: null, stAcc: 0, kazaN: 0,
};
const SPEEDS = [1, 2, 4, 8];
const ZOOMS = [0.35, 0.6, 1, 1.6, 2.5];
let route = 'simulasyon';

// ---------- yardımcılar ----------
const N_ = () => S.lanes;
function laneName(l, N) { if (l === 0) return 'sağ şerit'; if (l === N - 1) return 'sol şerit'; return 'orta şerit'; }
function simT() { return S.rings ? S.rings[0].t : S.sims ? S.sims[0].t : 0; }
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}
function cfgOf(sc) {
  const c = sc.cfg, o = { L: c.L, lanes: S.lanes };
  if (c.exitX !== undefined) { o.exitX = c.exitX; o.pocket = [c.exitX - c.pocketLen, c.exitX]; }
  if (c.ramp) o.ramp = { R: c.ramp.R, cycle: c.ramp.cycle, green: S.green };
  if (c.drop) o.drop = { lane: 0, x: c.drop.x };
  if (c.vsl) o.vsl = c.vsl;
  if (c.onramp) o.onramp = { x: c.onramp.x, len: c.onramp.len };
  if (c.vslZones) o.vslZones = c.vslZones;
  return o;
}
function bez(P0, C1, C2, P3, n = 60) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; pts.push({ x: u * u * u * P0.x + 3 * u * u * t * C1.x + 3 * u * t * t * C2.x + t * t * t * P3.x, y: u * u * u * P0.y + 3 * u * u * t * C1.y + 3 * u * t * t * C2.y + t * t * t * P3.y, d: 0 }); }
  let L = 0; for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); pts[i].d = L; }
  return { pts, L };
}
function onGeom(cfg, N) {
  const W = N * LW, o = cfg.onramp;
  return bez({ x: o.x - 190, y: W + 30 }, { x: o.x - 95, y: W + 30 }, { x: o.x - 70, y: W + LW / 2 }, { x: o.x, y: W + LW / 2 });
}
function acrossRange(cfg, N) {
  const W = N * LW;
  return [-5, W + Math.max(cfg.ramp ? 46 : 0, cfg.onramp ? 33 : 0, cfg.side ? 24 : 0, cfg.exitX !== undefined ? 7 : 5)];
}
function rampGeom(cfg, N) {
  const W = N * LW, P0 = { x: cfg.exitX, y: W + 1.75 }, P3 = { x: cfg.bridgeX - 8.6, y: W + 36 };
  const C1 = { x: P0.x + (P3.x - P0.x) * 0.5, y: P0.y }, C2 = { x: P3.x - 26, y: P3.y };
  const pts = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80, u = 1 - t;
    pts.push({ x: u * u * u * P0.x + 3 * u * u * t * C1.x + 3 * u * t * t * C2.x + t * t * t * P3.x, y: u * u * u * P0.y + 3 * u * u * t * C1.y + 3 * u * t * t * C2.y + t * t * t * P3.y, d: 0 });
  }
  let L = 0; for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); pts[i].d = L; }
  return { pts, L, P3, bx: cfg.bridgeX };
}
function rampAt(G, f) {
  const d = clamp(f, 0, 1) * G.L, p = G.pts;
  for (let i = 1; i < p.length; i++) if (p[i].d >= d) {
    const k = (d - p[i - 1].d) / Math.max(1e-6, p[i].d - p[i - 1].d);
    return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * k, y: p[i - 1].y + (p[i].y - p[i - 1].y) * k, a: Math.atan2(p[i].y - p[i - 1].y, p[i].x - p[i - 1].x) };
  }
  const q = p[p.length - 1]; return { x: q.x, y: q.y, a: 0 };
}
function asphFor(wx) {
  const base = TK.asphalt;
  if (wx === 'yagmur' || wx === 'saganak') return shade(base, -0.22);
  if (wx === 'kar') return shade(base, 0.18);
  return base;
}

// ---------- kurulum ----------
function loadScenario(id, keepView) {
  const sc = byId(id);
  S.scn = sc;
  S.lanes = sc.cfg ? sc.cfg.lanes : 1;
  S.demand = sc.demand || 4000; S.exitFrac = sc.exitFrac || 0;
  S.green = sc.cfg && sc.cfg.ramp ? sc.cfg.ramp.green : 36;
  S.ringN = sc.ringN || 32; S.rampDemand = sc.rampDemand || 1200;
  S.meas = { serit: true, cep: true, fermuar: true, vsl: true, rampa: true };
  setWeather(sc.hava, true);
  S.zi = 2;
  build();
  S.cam = sc.focus || 0;
  store.set('scn', sc.id);
  syncHeader(); syncSettings(); renderEvButtons();
  if (!keepView) renderCards();
}
function build() {
  const sc = S.scn;
  S.hist = [[], []]; S.histT = 0; S.fx = [{}, {}]; S.wave = null; S.kazaN = 0;
  if (sc.ring) {
    S.sims = null;
    S.rings = [new Ring(S.ringN, 600, 'yakin', 3), new Ring(S.ringN, 600, 'normal', 3)];
    S.st = [mkST(), mkST()];
    S.warm = 1100; S.warmN = 1100; S.t0 = 0;
    S.afterWarm = [{ at: 6, type: 'fren' }]; S.pending = [];
  } else {
    S.rings = null;
    S.cfg = cfgOf(sc);
    S.rampG = sc.cfg.ramp ? rampGeom(sc.cfg, S.lanes) : null;
    S.arr = new Arrivals(42, { demand: S.demand, exitFrac: S.exitFrac });
    S.arr2 = sc.cfg.onramp ? new Arrivals(77, { demand: S.rampDemand, exitFrac: 0 }) : null;
    S.onG = sc.cfg.onramp ? onGeom(sc.cfg, S.lanes) : null;
    S.sims = [new Sim(S.cfg, 'bugun', S.arr, 11, null, S.arr2), new Sim(S.cfg, 'sistem', S.arr, 11, S.meas, S.arr2)];
    const evs = (sc.events || []).map((e) => Object.assign({}, e));
    evs.filter((e) => e.at <= 0).forEach((e) => addEvent(e.type, e, true));
    S.warm = S.warmN = sc.big ? 2600 : 1200; S.t0 = 0;
    S.afterWarm = evs.filter((e) => e.at > 0); S.pending = [];
  }
  renderActive(); layout(); updateStats(true);
}

// ---------- olaylar ----------
const EVDEF = {
  kaza: { ad: 'Kaza', alt: 'İki araç çarpışır', ico: 'i-warn', col: '#e5484d' },
  ariza: { ad: 'Arızalı araç', alt: 'Sol şeritte durur', ico: 'i-car', col: '#f2994a' },
  calisma: { ad: 'Yol çalışması', alt: 'Bir şerit kapanır', ico: 'i-cone', col: '#e8811a' },
  fren: { ad: 'Ani fren', alt: 'Bir sürücü sert frenler', ico: 'i-brake', col: '#8e5bd8' },
  saganak: { ad: 'Sağanak başlat', alt: 'Yol ıslanır, görüş düşer', ico: 'i-storm', col: '#3d7fd9' },
  dalga: { ad: 'Yoğunluk dalgası', alt: '2 dakika %50 fazla araç', ico: 'i-wave', col: '#0f9d76' },
};
function renderEvButtons() {
  const box = $('#evbtns'); box.innerHTML = '';
  const list = S.scn.ring ? ['fren', 'saganak'] : ['kaza', 'ariza', 'calisma', 'fren', 'saganak', 'dalga'];
  for (const k of list) {
    const d = EVDEF[k], b = document.createElement('button');
    b.type = 'button'; b.className = 'ev';
    b.innerHTML = `<span class="ico" style="background:${d.col}"><svg class="i sm"><use href="#${d.ico}"/></svg></span><span><b>${d.ad}</b><br><small>${d.alt}</small></span>`;
    b.addEventListener('click', () => addEvent(k));
    box.appendChild(b);
  }
}
function addEvent(type, opt = {}, silent) {
  if (type === 'saganak') { setWeather(S.wx === 'saganak' ? 'acik' : 'saganak'); toast(S.wx === 'saganak' ? 'Sağanak başladı: hız düştü, takip mesafesi uzadı' : 'Hava açtı'); return; }
  if (S.rings) {
    if (type === 'fren') { const i = S.rings[0].brake(opt.i); S.rings[1].brake(i); if (!silent) toast('Bir sürücü 2 saniye ani fren yaptı'); }
    return;
  }
  const [a, b] = S.sims, N = S.lanes, L = S.cfg.L, t = a.t;
  const ahead = clamp(S.cam + 30, 220, L - 220);
  if (type === 'fren') {
    const id = a.brakeNear(S.cam);
    if (id === null || !b.brakeId(id)) b.brakeNear(S.cam);
    if (!silent) toast('Ekranın ortasındaki bir sürücü ani fren yaptı');
    return;
  }
  if (type === 'dalga') {
    S.wave = { until: t + 120, base: S.demand };
    S.arr.opts.demand = S.demand * 1.5;
    if (!silent) toast('2 dakika boyunca %50 daha fazla araç geliyor');
    renderActive(); return;
  }
  let lane, len, dur, kind = type, x = opt.x !== undefined ? opt.x : ahead;
  if (type === 'kaza') { lane = opt.lane !== undefined ? opt.lane : (S.kazaN++ % 2 ? Math.min(1, N - 1) : 0); len = 12; dur = opt.dur || 180; }
  else if (type === 'ariza') { lane = opt.lane === 'sol' || opt.lane === undefined ? N - 1 : opt.lane; len = 6; dur = opt.dur || 150; }
  else { lane = opt.lane !== undefined ? opt.lane : Math.floor((N - 1) / 2); len = opt.len || 80; dur = opt.dur || 300; kind = 'calisma'; }
  if (S.cfg.drop && lane === 0 && x > S.cfg.drop.x - 80) x = S.cfg.drop.x - 160;
  const bl = { lane, x, len, t0: t, t1: t + dur, kind, seed: hash(type + x + t) % 1000 / 1000 };
  a.addBlock(Object.assign({}, bl)); b.addBlock(Object.assign({}, bl));
  if (!silent) toast(`${EVDEF[type].ad}: ${laneName(lane, N)}, ${fmt(x)}. metre`);
  if (!silent && Math.abs(S.cam - x) > 160) S.cam = x - 40;
  renderActive();
}
function renderActive() {
  const box = $('#activeEv'); box.innerHTML = '';
  let any = false;
  if (S.sims) {
    const a = S.sims[0], t = a.t;
    a.blocks.forEach((bl, i) => {
      if (t >= bl.t1) return;
      any = true;
      const el = document.createElement('span'); el.className = 'aev';
      const rem = isFinite(bl.t1) ? mmss(bl.t1 - t) : 'süresiz';
      el.innerHTML = `${EVDEF[bl.kind] ? EVDEF[bl.kind].ad : 'Olay'} · ${laneName(bl.lane, S.lanes)} <em data-rem="${i}">${rem}</em><button type="button" aria-label="Kaldır"><svg class="i sm"><use href="#i-x"/></svg></button>`;
      el.querySelector('button').addEventListener('click', () => { S.sims.forEach((s) => { if (s.blocks[i]) s.blocks[i].t1 = s.t; }); renderActive(); toast('Olay kaldırıldı, yol açıldı'); });
      box.appendChild(el);
    });
    if (S.wave) {
      any = true;
      const el = document.createElement('span'); el.className = 'aev';
      el.innerHTML = `Yoğunluk dalgası <em data-rem="w">${mmss(S.wave.until - t)}</em><button type="button" aria-label="Kaldır"><svg class="i sm"><use href="#i-x"/></svg></button>`;
      el.querySelector('button').addEventListener('click', endWave);
      box.appendChild(el);
    }
  }
  $('#clearEv').hidden = !any;
}
function endWave() { if (!S.wave) return; S.arr.opts.demand = S.demand; S.wave = null; renderActive(); }
$('#clearEv').addEventListener('click', () => { if (S.sims) S.sims.forEach((s) => s.blocks.forEach((b) => { if (b.t1 > s.t) b.t1 = s.t; })); endWave(); renderActive(); toast('Tüm olaylar kaldırıldı'); });

// ---------- ısınma ----------
function warmStep() {
  const t0 = performance.now();
  let i = 0;
  while (S.warm > 0 && (i < 20 || performance.now() - t0 < 28)) {
    if (S.rings) { S.rings[0].step(0.1); S.rings[1].step(0.1); if (S.warm % 2) stColumns(); }
    else { S.sims[0].step(0.1); S.sims[1].step(0.1); if (S.rampG) { crossStep(0, 0.1); crossStep(1, 0.1); } }
    S.warm--; i++;
  }
  const w = $('#warm');
  if (S.warm > 0) { w.hidden = false; w.textContent = `Trafik oluşuyor · %${Math.round((1 - S.warm / S.warmN) * 100)}`; }
  else { w.hidden = true; S.t0 = simT(); S.pending = S.afterWarm || []; S.hist = [[], []]; S.histT = 0; updateStats(true); renderActive(); }
}
// ---------- adım ----------
function stepAll(dt) {
  if (S.rings) {
    S.rings[0].step(dt); S.rings[1].step(dt);
    S.stAcc += dt; if (S.stAcc >= 0.25) { S.stAcc = 0; stColumns(); }
  } else {
    S.sims[0].step(dt); S.sims[1].step(dt);
    if (S.rampG) for (let i = 0; i < 2; i++) crossStep(i, dt);
    if (S.wave && S.sims[0].t >= S.wave.until) endWave();
  }
  const rel = simT() - S.t0;
  if (S.pending.length) {
    const due = S.pending.filter((e) => rel >= e.at);
    if (due.length) { S.pending = S.pending.filter((e) => rel < e.at); due.forEach((e) => addEvent(e.type, e)); }
  }
  S.histT += dt;
  if (S.histT >= 2) {
    S.histT = 0;
    for (let i = 0; i < 2; i++) {
      let v = 0;
      if (S.rings) v = S.rings[i].cars.reduce((s, c) => s + c.v, 0) / S.rings[i].cars.length;
      else { const vs = S.sims[i].veh; v = vs.length ? vs.reduce((s, c) => s + c.v, 0) / vs.length : 0; }
      S.hist[i].push(v * 3.6); if (S.hist[i].length > 90) S.hist[i].shift();
    }
  }
}
// köprü üstü çapraz trafik
function crossStep(i, dt) {
  const fx = S.fx[i], G = S.rampG, N = S.lanes, sim = S.sims[i];
  const yMin = -60, yMax = N * LW + 90;
  if (!fx.s) {
    fx.s = []; fx.n = [];
    for (let k = 0; k < 7; k++) { fx.s.push({ y: yMin + k * 21, col: (k * 0.37) % 1, v: 10, a: 0 }); fx.n.push({ y: yMin + 8 + k * 21, col: (k * 0.53 + 0.2) % 1, v: 10, a: 0 }); }
  }
  const red = sim.green();
  const stopS = G.P3.y - 7, stopN = G.P3.y + 7;
  fx.s.sort((p, q) => q.y - p.y);
  fx.s.forEach((c, k) => {
    const ld = k > 0 ? fx.s[k - 1] : null;
    let lim = ld ? ld.y - 6.5 : Infinity;
    if (red && c.y <= stopS + 0.1) lim = Math.min(lim, stopS);
    const want = c.y + 11 * dt, ny = Math.min(want, lim);
    c.a = (ny - c.y) / dt - c.v; c.v = (ny - c.y) / dt; c.y = Math.max(c.y, ny);
    if (c.y > yMax) c.y = yMin - 6;
  });
  fx.n.sort((p, q) => p.y - q.y);
  fx.n.forEach((c, k) => {
    const ld = k > 0 ? fx.n[k - 1] : null;
    let lim = ld ? ld.y + 6.5 : -Infinity;
    if (red && c.y >= stopN - 0.1) lim = Math.max(lim, stopN);
    const want = c.y - 11 * dt, ny = Math.max(want, lim);
    c.a = (c.y - ny) / dt - c.v; c.v = (c.y - ny) / dt; c.y = Math.min(c.y, ny);
    if (c.y < yMin) c.y = yMax + 6;
  });
}
// zaman-yol grafiği
function mkST() { const c = document.createElement('canvas'); c.width = 520; c.height = 200; const x = c.getContext('2d'); x.fillStyle = TK.stbg; x.fillRect(0, 0, 520, 200); return c; }
function stColumns() {
  for (let i = 0; i < 2; i++) {
    const c = S.st[i], x = c.getContext('2d'), r = S.rings[i];
    x.drawImage(c, -1, 0);
    x.fillStyle = TK.stbg; x.fillRect(519, 0, 1, 200);
    for (const car of r.cars) { x.fillStyle = speedCol(car.v); x.fillRect(519, (car.x / r.C) * 198, 1, 2); }
  }
}

// ---------- hava ----------
const WXICO = { acik: 'i-sun', yagmur: 'i-rain', saganak: 'i-storm', kar: 'i-snow', sis: 'i-fog' };
function setWeather(k, silent) {
  S.wx = k; ENV.w = WEATHER[k];
  $$('#wxseg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.k === k));
  const W = ENV.w;
  $('#wxOut').textContent = k === 'acik' ? 'Kuru yol' : `Hız %${Math.round((1 - W.vf) * 100)} düşük, fren %${Math.round((1 - W.bmax / 8) * 100)} zayıf`;
}

// ---------- yerleşim ----------
const cv = $('#cv'), stageEl = $('#stage');
let LAY = { W: 0, H: 0, V: false, panes: [], mm: null, d: 1 };
function layout() {
  if (!S.scn) return;
  const W = stageEl.clientWidth; if (!W) return;
  const V = W < 560, both = S.view === 'both', ring = !!S.scn.ring, ih = window.innerHeight || 800;
  let H;
  if (ring) H = V ? (both ? clamp(W * 1.25, 420, 560) : clamp(W * 1.6, 480, 680)) : (both ? 520 : 380);
  else if (V) H = clamp(ih * 0.64, 440, 700);
  else H = both ? clamp(ih * 0.6, 400, 600) : clamp(ih * 0.48, 300, 460);
  const d = DPR();
  cv.width = Math.round(W * d); cv.height = Math.round(H * d); cv.style.height = H + 'px';
  cv.classList.toggle('v', V && !ring);
  const ids = both ? [0, 1] : [S.view === 'a' ? 0 : 1];
  const n = ids.length, gap = 3, mm = ring ? 0 : 30;
  const panes = [];
  if (V) {
    const pw = (W - mm - gap * (n - 1)) / n;
    ids.forEach((id, i) => panes.push({ id, x: i * (pw + gap), y: 0, w: pw, h: H, V }));
  } else {
    const ph = (H - mm - gap * (n - 1)) / n;
    ids.forEach((id, i) => panes.push({ id, x: 0, y: i * (ph + gap), w: W, h: ph, V }));
  }
  const mmR = ring ? null : V ? { x: W - mm + 6, y: 10, w: mm - 12, h: H - 20 } : { x: 10, y: H - mm + 6, w: W - 20, h: mm - 12 };
  LAY = { W, H, V, panes, mm: mmR, d };
  // etiketler
  const lab = $('#labels'); lab.innerHTML = '';
  panes.forEach((p) => {
    const el = document.createElement('div'); el.className = 'plabel'; el.dataset.id = p.id;
    el.style.left = p.x + 10 + 'px'; el.style.top = p.y + 10 + 'px';
    if (V && both) el.style.maxWidth = p.w - 16 + 'px';
    const name = ring ? (p.id ? 'Öngörülü sürüş' : 'Yakın takip') : (p.id ? 'Önerilen' : 'Mevcut');
    el.innerHTML = `<i style="background:${p.id ? 'var(--pro)' : 'var(--cur)'}"></i>${name} <em></em>`;
    lab.appendChild(el);
  });
  $('#hint').hidden = ring || V;
  $('#hud').style.bottom = (V || ring ? 12 : 12 + mm) + 'px';
  $('#focus').hidden = ring; $('#zin').hidden = ring; $('#zout').hidden = ring;
  sizeSpark();
}

// ---------- çizim ----------
function geomFor(p, cfg, N, zoom, cam, win0) {
  const V = p.V, acrossPx = V ? p.w : p.h, alongPx = V ? p.h : p.w, L = cfg.L;
  const [top, bot] = acrossRange(cfg, N);
  const target = (win0 || 160) * (V && p.w < 260 ? 0.85 : 1);
  let ppm = Math.min(acrossPx / (bot - top), alongPx / target) * zoom;
  ppm = Math.max(ppm, alongPx / (L + 160));
  ppm = Math.min(ppm, 16);
  const span = acrossPx / ppm;
  let yTop;
  if (span >= bot - top) yTop = (top + bot) / 2 - span / 2;
  else { const yc = (N * LW) / 2 + (cfg.ramp ? 6 : 2); yTop = clamp(yc - span / 2, top, bot - span); }
  const win = alongPx / ppm;
  let x0 = cam - win / 2;
  if (win > L + 60) x0 = (L - win) / 2; else x0 = clamp(x0, -30, L + 30 - win);
  return { V, ppm, yTop, x0, x1: x0 + win, win, span };
}
function setRoad(ctx, p, g, d) {
  const k = g.ppm;
  if (!g.V) ctx.setTransform(d * k, 0, 0, d * k, d * (p.x - g.x0 * k), d * (p.y - g.yTop * k));
  else ctx.setTransform(0, -d * k, d * k, 0, d * (p.x - g.yTop * k), d * (p.y + p.h + g.x0 * k));
}
function rrect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); } else { ctx.beginPath(); ctx.rect(x, y, w, h); }
}
// araç: ön uç x=0, gövde -len..0
function vehLocal(ctx, o) {
  const len = o.len, w = o.truck ? 2.5 : 1.85, hw = w / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-len + 0.25, -hw + 0.3, len, w);
  if (o.truck && !o.bus) {
    const cab = o.heat ? speedCol(o.v) : paint(o.col);
    ctx.fillStyle = o.heat ? cab : '#e7e5df'; rrect(ctx, -len, -hw, len - 2.6, w, 0.25); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-len + 0.3, -hw + 0.3, len - 3.2, 0.25);
    ctx.fillStyle = cab; rrect(ctx, -2.4, -hw + 0.05, 2.4, w - 0.1, 0.45); ctx.fill();
    ctx.fillStyle = '#1b232c'; ctx.fillRect(-0.75, -hw + 0.25, 0.4, w - 0.5);
  } else if (o.bus) {
    ctx.fillStyle = o.heat ? speedCol(o.v) : '#e3e8ea'; rrect(ctx, -len, -hw, len, w, 0.5); ctx.fill();
    ctx.fillStyle = '#26323b'; ctx.fillRect(-len + 0.8, -hw + 0.12, len - 1.6, 0.32); ctx.fillRect(-len + 0.8, hw - 0.44, len - 1.6, 0.32);
    ctx.fillStyle = '#1b232c'; ctx.fillRect(-0.7, -hw + 0.3, 0.45, w - 0.6);
    ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(-len * 0.6, -0.5, 1.6, 1); ctx.fillRect(-len * 0.3, -0.5, 1.6, 1);
  } else {
    const body = o.heat ? speedCol(o.v) : paint(o.col);
    ctx.fillStyle = body; rrect(ctx, -len, -hw, len, w, 0.55); ctx.fill();
    ctx.fillStyle = '#18212a'; rrect(ctx, -1.75, -hw + 0.18, 0.62, w - 0.36, 0.18); ctx.fill();
    ctx.fillStyle = o.heat ? body : shade(body, 0.12); ctx.fillRect(-3.25, -hw + 0.22, 1.5, w - 0.44);
    ctx.fillStyle = '#18212a'; ctx.fillRect(-3.75, -hw + 0.26, 0.42, w - 0.52);
    ctx.fillStyle = 'rgba(255,250,225,0.9)'; ctx.fillRect(-0.18, -hw + 0.15, 0.16, 0.38); ctx.fillRect(-0.18, hw - 0.53, 0.16, 0.38);
  }
  // fren lambaları
  const br = o.brake;
  ctx.fillStyle = br ? '#ff2b1c' : '#6e1712';
  ctx.fillRect(-len, -hw + 0.12, 0.18, 0.42); ctx.fillRect(-len, hw - 0.54, 0.18, 0.42);
  if (br) { ctx.fillStyle = 'rgba(255,40,20,0.28)'; ctx.beginPath(); ctx.ellipse(-len - 0.4, 0, 1.0, hw + 0.45, 0, 0, 7); ctx.fill(); }
  // sinyal
  if (o.sig) {
    const sy = o.sig > 0 ? hw - 0.32 : -hw;
    ctx.fillStyle = '#ffb21a';
    ctx.fillRect(-0.4, sy, 0.38, 0.32); ctx.fillRect(-len, sy, 0.38, 0.32);
    ctx.fillStyle = 'rgba(255,178,26,0.32)';
    ctx.beginPath(); ctx.arc(-0.2, sy + 0.16, 0.8, 0, 7); ctx.arc(-len + 0.2, sy + 0.16, 0.8, 0, 7); ctx.fill();
  }
  if (o.hazard) {
    ctx.fillStyle = '#ffb21a';
    for (const sy of [-hw, hw - 0.32]) { ctx.fillRect(-0.4, sy, 0.38, 0.32); ctx.fillRect(-len, sy, 0.38, 0.32); }
    ctx.fillStyle = 'rgba(255,178,26,0.3)'; ctx.beginPath(); ctx.arc(-len / 2, 0, len * 0.7, 0, 7); ctx.fill();
  }
}
function vehAt(ctx, x, y, ang, o) {
  if (!ang) { ctx.translate(x, y); vehLocal(ctx, o); ctx.translate(-x, -y); return; }
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); vehLocal(ctx, o); ctx.restore();
}
function paintText(ctx, txt, x, y, size, V, color) {
  ctx.save(); ctx.translate(x, y); if (V) ctx.rotate(Math.PI / 2); ctx.scale(0.1, 0.1);
  ctx.fillStyle = color; ctx.font = `700 ${size * 10}px ${getFont()}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, 0, 0); ctx.restore();
}
let _font = null;
const getFont = () => _font || (_font = '-apple-system, BlinkMacSystemFont, "Geist", "Segoe UI", Roboto, sans-serif');
function speedSign(ctx, x, y, r, txt, V) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = r * 0.26; ctx.strokeStyle = '#d0201c'; ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, 7); ctx.stroke();
  paintText(ctx, txt, x, y + (V ? 0 : r * 0.04), r * 0.95, V, '#111');
}
function trees(ctx, g, R) {
  const N = R.N, W = N * LW, rows = [-9, -15];
  if (!R.cfg.ramp) rows.push(W + (R.cfg.side ? 20 : 9), W + (R.cfg.side ? 28 : 15));
  const start = Math.floor((g.x0 - 20) / 17), end = Math.ceil((g.x1 + 20) / 17);
  for (let i = start; i <= end; i++) {
    for (let r = 0; r < rows.length; r++) {
      const h = hash('t' + i + '_' + r), u = (h % 1000) / 1000, u2 = ((h >> 10) % 1000) / 1000;
      if (u < 0.35) continue;
      const x = i * 17 + u2 * 10, y = rows[r] + (u - 0.5) * 4, rad = 2.2 + u2 * 2.2;
      if (R.cfg.side && x > R.cfg.exitX - 14 && x < R.cfg.exitX + 22) continue;
      if (R.cfg.onramp && r >= 2 && x > R.cfg.onramp.x - 220 && x < R.cfg.onramp.x + R.cfg.onramp.len + 50) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(x + 0.8, y + 0.9, rad, 0, 7); ctx.fill();
      ctx.fillStyle = TK.tree; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.55, 0, 7); ctx.fill();
    }
  }
}
function drawBlocks(ctx, sim, R, g, now) {
  const N = R.N, blink = Math.floor(now * 2.2) % 2 === 0;
  for (const b of sim._ab || sim.activeBlocks()) {
    if (b.x + b.len < g.x0 - 40 || b.x - 60 > g.x1) continue;
    const yc = (N - 1 - b.lane + 0.5) * LW, yl = (N - 1 - b.lane) * LW;
    if (b.kind === 'calisma') {
      ctx.save(); ctx.beginPath(); ctx.rect(b.x, yl + 0.3, b.len, LW - 0.6); ctx.clip();
      ctx.fillStyle = 'rgba(232,129,26,0.22)'; ctx.fillRect(b.x, yl, b.len, LW);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.35;
      for (let x = b.x - LW; x < b.x + b.len; x += 2.2) { ctx.beginPath(); ctx.moveTo(x, yl + LW); ctx.lineTo(x + LW, yl); ctx.stroke(); }
      ctx.restore();
      const cone = (x, y) => { ctx.fillStyle = '#f07a12'; ctx.beginPath(); ctx.arc(x, y, 0.36, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 0.15, 0, 7); ctx.fill(); };
      for (let i = 0; i <= 8; i++) { const f = i / 8; cone(b.x - 30 + f * 30, (yl + LW - 0.3) * (1 - f) + (yl + 0.3) * f); }
      for (let x = b.x; x <= b.x + b.len; x += 5) { cone(x, yl + 0.3); cone(x, yl + LW - 0.3); }
      ctx.fillStyle = '#f07a12'; ctx.fillRect(b.x - 0.6, yl + 0.4, 0.6, LW - 0.8);
      ctx.fillStyle = '#fff'; for (let k = 0; k < 4; k++) ctx.fillRect(b.x - 0.6, yl + 0.55 + k * 0.75, 0.6, 0.35);
      if (blink) { ctx.fillStyle = 'rgba(255,190,40,0.55)'; ctx.beginPath(); ctx.arc(b.x - 0.3, yl + 0.4, 0.7, 0, 7); ctx.arc(b.x - 0.3, yl + LW - 0.4, 0.7, 0, 7); ctx.fill(); }
      continue;
    }
    // uyarı üçgeni
    const tx = b.x - (b.kind === 'kaza' ? 32 : 26);
    ctx.fillStyle = '#e02a24'; ctx.beginPath(); ctx.moveTo(tx + 0.55, yc); ctx.lineTo(tx - 0.45, yc - 0.6); ctx.lineTo(tx - 0.45, yc + 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(tx + 0.25, yc); ctx.lineTo(tx - 0.25, yc - 0.3); ctx.lineTo(tx - 0.25, yc + 0.3); ctx.closePath(); ctx.fill();
    if (b.kind === 'kaza') {
      const u = b.seed || 0.3;
      vehAt(ctx, b.x + 8, yc - 0.3, 0.42, { len: 4.5, col: (u * 7) % 1, hazard: blink });
      vehAt(ctx, b.x + 2.8, yc + 0.5, -0.28, { len: 4.5, col: (u * 13 + 0.3) % 1, hazard: blink });
      ctx.fillStyle = 'rgba(200,205,210,0.8)';
      for (let k = 0; k < 9; k++) { const h = hash('d' + k + u); ctx.fillRect(b.x + 3 + (h % 70) / 10, yc - 1.2 + ((h >> 8) % 24) / 10, 0.18, 0.18); }
    } else {
      vehAt(ctx, b.x + b.len - 0.5, yc, 0.02, { len: 4.5, col: b.seed || 0.6, hazard: blink });
    }
  }
}
function signalOf(v, sim, R) {
  if (Math.abs(v.lane - v.y) > 0.06) return v.lane < v.y ? 1 : -1;
  if (v.want !== null && v.want !== undefined) return v.want < v.lane ? 1 : -1;
  if (v.exit && R.cfg.exitX !== undefined) { const d = R.cfg.exitX - v.x; if (d > 0 && d < 260) return 1; }
  return 0;
}
function drawRoadPane(ctx, d, p, sim, R, g, now) {
  const N = R.N, cfg = R.cfg, W = N * LW, k = 1 / g.ppm;
  const M = sim.m || { serit: sim.sys, cep: sim.sys, fermuar: sim.sys, vsl: sim.sys, rampa: sim.sys }, sys = !!(M.cep && cfg.pocket), o = cfg.onramp;
  ctx.save();
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();
  ctx.fillStyle = TK.grass; ctx.fillRect(p.x, p.y, p.w, p.h);
  setRoad(ctx, p, g, d);
  const xa = Math.max(-200, g.x0 - 10), xb = Math.min(cfg.L + 400, g.x1 + 10);
  // yol kenarı otları
  ctx.fillStyle = TK.grass2; ctx.fillRect(xa, -2.5, xb - xa, 2.5); ctx.fillRect(xa, W, xb - xa, 2.5);
  trees(ctx, g, R);
  const asph = asphFor(R.wx);
  // yan yol / rampa / cep
  const ex = cfg.exitX;
  ctx.fillStyle = TK.curb;
  if (cfg.side) { ctx.fillRect(ex - 0.5, W, 8.5, 200); }
  if (cfg.ramp && R.rampG) {
    ctx.strokeStyle = TK.curb; ctx.lineWidth = 5.2; ctx.lineCap = 'butt';
    ctx.beginPath(); R.rampG.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke();
    ctx.strokeStyle = asph; ctx.lineWidth = 4.2;
    ctx.beginPath(); R.rampG.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke();
  }
  if (o && R.onG) {
    ctx.lineCap = 'butt';
    ctx.strokeStyle = TK.curb; ctx.lineWidth = 4.8; ctx.beginPath(); R.onG.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x - 30, q.y))); ctx.stroke();
    ctx.strokeStyle = asph; ctx.lineWidth = 3.9; ctx.beginPath(); R.onG.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x - 30, q.y))); ctx.stroke();
    ctx.fillStyle = TK.curb; ctx.beginPath(); ctx.moveTo(o.x - 4, W); ctx.lineTo(o.x - 4, W + LW + 0.45); ctx.lineTo(o.x + o.len, W + LW + 0.45); ctx.lineTo(o.x + o.len + 45, W); ctx.closePath(); ctx.fill();
    ctx.fillStyle = asph; ctx.beginPath(); ctx.moveTo(o.x - 4, W); ctx.lineTo(o.x - 4, W + LW); ctx.lineTo(o.x + o.len, W + LW); ctx.lineTo(o.x + o.len + 45, W); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = asph;
  if (cfg.side) {
    ctx.fillRect(ex, W, 7.5, 200);
    ctx.beginPath(); ctx.moveTo(ex - 11, W); ctx.quadraticCurveTo(ex, W, ex, W + 11); ctx.lineTo(ex, W); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ex + 7.5, W + 9); ctx.quadraticCurveTo(ex + 7.5, W, ex + 16.5, W); ctx.lineTo(ex + 7.5, W); ctx.closePath(); ctx.fill();
  }
  if (ex !== undefined) {
    if (sys) { const ps = cfg.pocket[0]; ctx.beginPath(); ctx.moveTo(ps - 45, W); ctx.lineTo(ps, W + LW); ctx.lineTo(ex + (cfg.ramp ? 4 : 0), W + LW); ctx.lineTo(ex + (cfg.ramp ? 4 : 0), W); ctx.closePath(); ctx.fill(); }
    else if (cfg.ramp) { ctx.beginPath(); ctx.moveTo(ex - 55, W); ctx.lineTo(ex, W + LW); ctx.lineTo(ex + 4, W + LW); ctx.lineTo(ex + 4, W); ctx.closePath(); ctx.fill(); }
  }
  // ana yol
  ctx.fillStyle = TK.curb; ctx.fillRect(xa, -0.45, xb - xa, 0.45);
  if (!cfg.drop) ctx.fillRect(xa, W, xb - xa, 0.45);
  ctx.fillStyle = asph;
  if (cfg.drop) {
    const dx = cfg.drop.x;
    ctx.fillRect(xa, 0, xb - xa, W - LW);
    ctx.beginPath(); ctx.moveTo(xa, W - LW); ctx.lineTo(dx, W - LW); ctx.lineTo(dx - 65, W); ctx.lineTo(xa, W); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = TK.curb; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(xa, W + 0.22); ctx.lineTo(dx - 65, W + 0.22); ctx.lineTo(dx, W - LW + 0.22); ctx.lineTo(xb, W - LW + 0.22); ctx.stroke();
  } else ctx.fillRect(xa, 0, xb - xa, W);
  if (ex !== undefined && (sys || cfg.ramp)) { ctx.fillStyle = asph; ctx.fillRect(Math.max(xa, (sys ? cfg.pocket[0] : ex - 50) - 40), W - 0.1, (sys ? ex - cfg.pocket[0] : 50) + 40 + (cfg.ramp ? 4 : 0), 0.7); }
  if (cfg.side) { ctx.fillStyle = asph; ctx.fillRect(ex - 11, W - 0.1, 27.5, 0.7); }
  if (o) { ctx.fillStyle = asph; ctx.fillRect(o.x - 4, W - 0.1, o.len + 40, 0.7); }
  // ıslak yol parlaması
  if (R.wx === 'yagmur' || R.wx === 'saganak') {
    ctx.fillStyle = 'rgba(160,190,220,0.07)';
    for (let x = Math.floor(xa / 40) * 40; x < xb; x += 40) ctx.fillRect(x + 6, 0.6, 14, W - 1.2);
  }
  if (R.wx === 'kar') {
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(xa, -1.6, xb - xa, 1.3); ctx.fillRect(xa, cfg.drop ? W - LW + 0.3 : W + 0.3, xb - xa, 1.3);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let l = 0; l < N; l++) { const y = l * LW; ctx.fillRect(xa, y + 0.5, xb - xa, 0.5); ctx.fillRect(xa, y + 2.4, xb - xa, 0.5); }
  }
  // çizgiler
  ctx.strokeStyle = TK.marking; ctx.lineCap = 'butt';
  ctx.lineWidth = 0.15; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(xa, 0.3); ctx.lineTo(xb, 0.3); ctx.stroke();
  // sağ kenar
  const segs = [], opens = [];
  if (ex !== undefined) {
    opens.push([cfg.side ? ex - 11 : sys ? cfg.pocket[0] - 45 : ex - 55, cfg.side ? ex + 16.5 : ex + 4]);
    if (sys && !cfg.side) segs.push([cfg.pocket[0], ex, W + LW - 0.3]);
    if (sys && cfg.side) segs.push([cfg.pocket[0], ex - 11, W + LW - 0.3]);
  }
  if (o) { opens.push([o.x - 4, o.x + o.len + 45]); segs.push([o.x, o.x + o.len, W + LW - 0.3]); }
  opens.sort((a, b) => a[0] - b[0]);
  let cur = xa; const endX = cfg.drop ? cfg.drop.x - 65 : xb;
  for (const [a, b] of opens) { if (a > cur) segs.push([cur, Math.min(a, endX), W - 0.3]); cur = Math.max(cur, b); }
  if (cur < endX) segs.push([cur, endX, W - 0.3]);
  if (cfg.drop) segs.push([cfg.drop.x, xb, W - LW - 0.3]);
  ctx.beginPath(); for (const [a, b, y] of segs) { if (b > a) { ctx.moveTo(a, y); ctx.lineTo(b, y); } }
  if (cfg.drop) { ctx.moveTo(cfg.drop.x - 65, W - 0.3); ctx.lineTo(cfg.drop.x, W - LW - 0.3); }
  if (o) { ctx.moveTo(o.x + o.len, W + LW - 0.3); ctx.lineTo(o.x + o.len + 45, W - 0.3); }
  ctx.stroke();
  ctx.lineWidth = 0.13; ctx.setLineDash([3, 6]);
  for (let i = 1; i < N; i++) {
    const y = i * LW, end = cfg.drop && i === N - 1 ? cfg.drop.x - 65 : xb;
    ctx.beginPath(); ctx.moveTo(Math.floor(xa / 9) * 9, y); ctx.lineTo(end, y); ctx.stroke();
  }
  if (sys && ex !== undefined) { ctx.lineWidth = 0.3; ctx.setLineDash([1, 1]); ctx.beginPath(); ctx.moveTo(cfg.pocket[0], W); ctx.lineTo(ex, W); ctx.stroke(); }
  if (o) { ctx.lineWidth = 0.3; ctx.setLineDash([1, 1]); ctx.beginPath(); ctx.moveTo(o.x, W); ctx.lineTo(o.x + o.len, W); ctx.stroke(); }
  if (cfg.side) { ctx.lineWidth = 0.13; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(ex + 3.75, W + 4); ctx.lineTo(ex + 3.75, W + 200); ctx.stroke(); }
  ctx.setLineDash([]);
  // yol boyaları
  if (M.serit) {
    const lbl = (l) => (l === 0 && !cfg.drop ? '50' : l === N - 1 ? '90' : '70');
    for (const px of [110, 520, 860, 1380, 2100]) {
      if (px < g.x0 - 10 || px > g.x1 + 10) continue;
      for (let l = 0; l < N; l++) {
        if (cfg.drop && l === 0) continue;
        paintText(ctx, lbl(l), px, (N - 1 - l + 0.5) * LW, 1.9, g.V, 'rgba(244,244,236,0.82)');
      }
    }
  }
  {
    if (sys) {
      const mid = (cfg.pocket[0] + ex) / 2;
      paintText(ctx, 'CEP', mid, W + LW / 2, 1.7, g.V, 'rgba(244,244,236,0.85)');
      for (const ax of [cfg.pocket[0] + 25, ex - 25]) arrowPaint(ctx, ax, W + LW / 2);
    }
  }
  if (cfg.drop) {
    for (const ax of [cfg.drop.x - 190, cfg.drop.x - 120]) mergeArrow(ctx, ax, W - LW / 2);
    ctx.fillStyle = '#f07a12';
    for (let i = 0; i <= 6; i++) { const f = i / 6; ctx.beginPath(); ctx.arc(cfg.drop.x - 65 + 65 * f, W - 0.3 - (LW - 0.3) * f, 0.32, 0, 7); ctx.fill(); }
    roadSign(ctx, cfg.drop.x - 260, W + 2.2, g, M.fermuar ? 'zip' : 'merge');
    if (M.vsl && cfg.vsl) { speedSign(ctx, cfg.vsl[0], -2.2, 1.3, '70', g.V); speedSign(ctx, cfg.vsl[0], W + 2.2, 1.3, '70', g.V); }
  }
  if (M.vsl && cfg.vslZones) cfg.vslZones.forEach((z, i) => {
    if (z.from < g.x0 - 10 || z.from > g.x1 + 10) return;
    const on = sim.za && sim.za[i];
    for (const yy of [-2.2, W + 2.2]) {
      if (on) speedSign(ctx, z.from, yy, 1.3, String(z.lim), g.V);
      else { ctx.fillStyle = '#15181b'; ctx.beginPath(); ctx.arc(z.from, yy, 1.3, 0, 7); ctx.fill(); ctx.strokeStyle = '#4a4f55'; ctx.lineWidth = 0.15; ctx.stroke(); }
    }
  });
  drawBlocks(ctx, sim, R, g, now);
  // çıkış animasyonu
  if (cfg.side && sim.exits) {
    for (const e of sim.exits) {
      const age = sim.t - e.t; if (age > 8 || age < 0) continue;
      const vt = clamp(e.v, 4, 7), s = vt * age;
      const y0 = (N - 1 - e.y + 0.5) * LW, P1 = { x: ex + 1.9, y: y0 }, P2 = { x: ex + 1.9, y: y0 + 9 };
      const Lb = 12;
      let x, y, a;
      if (s < Lb) { const t = s / Lb, u = 1 - t; x = u * u * e.x + 2 * u * t * P1.x + t * t * P2.x; y = u * u * y0 + 2 * u * t * P1.y + t * t * P2.y; const dx = 2 * u * (P1.x - e.x) + 2 * t * (P2.x - P1.x), dy = 2 * u * (P1.y - y0) + 2 * t * (P2.y - P1.y); a = Math.atan2(dy, dx); }
      else { x = P2.x; y = P2.y + (s - Lb); a = Math.PI / 2; }
      vehAt(ctx, x, y, a, { len: e.len, col: e.col, truck: e.truck, bus: e.bus, v: vt, heat: R.heat, sig: s < Lb ? 1 : 0 });
    }
  }
  // araçlar
  const blinkOn = Math.floor(now * 3) % 2 === 0;
  for (const v of sim.veh) {
    if (v.x < g.x0 - 14 || v.x - v.len > g.x1 + 2) continue;
    const yc = (N - 1 - v.y + 0.5) * LW;
    const sig = blinkOn ? signalOf(v, sim, R) : 0;
    const ang = Math.abs(v.lane - v.y) > 0.03 ? clamp((v.y - v.lane) * 0.16, -0.12, 0.12) : 0;
    vehAt(ctx, v.x, yc, ang, { len: v.len, col: v.col, truck: v.truck, bus: v.bus, v: v.v, heat: R.heat, brake: v.acc < -0.9 || v.v < 0.4, sig });
  }
  if (o && R.onG && sim.rq) {
    const G = R.onG, n = sim.rq.length;
    for (let i = 0; i < n; i++) {
      const s = G.L - 4 - i * 6.6; if (s < 0) break;
      const q = rampAt(G, s / G.L), d0 = sim.rq[i];
      vehAt(ctx, q.x, q.y, q.a, { len: d0.len, col: d0.col, truck: d0.truck, bus: d0.bus, v: 0, heat: R.heat, brake: true });
    }
    if (M.rampa) {
      const q = rampAt(G, (G.L - 1.5) / G.L), gr = sim.t >= sim.meterNext - 0.4;
      const lx = q.x - 1, ly = q.y + 2.6;
      ctx.fillStyle = '#16181b'; rrect(ctx, lx - 1.4, ly - 0.7, 2.8, 1.4, 0.3); ctx.fill();
      ctx.fillStyle = gr ? '#2fd36b' : '#ff3b30'; ctx.beginPath(); ctx.arc(gr ? lx + 0.65 : lx - 0.65, ly, 0.48, 0, 7); ctx.fill();
      ctx.fillStyle = gr ? 'rgba(47,211,107,0.3)' : 'rgba(255,59,48,0.3)'; ctx.beginPath(); ctx.arc(gr ? lx + 0.65 : lx - 0.65, ly, 1.3, 0, 7); ctx.fill();
    }
    if (n > 0) {
      const q = rampAt(G, 0.12);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.restore();
      paintText(ctx, n + ' bekliyor', q.x - 6, q.y + 4.5, 1.8, g.V, 'rgba(255,255,255,0.92)');
    }
  }
  if (cfg.ramp && R.rampG) {
    for (const r of sim.ramp) {
      const q = rampAt(R.rampG, r.s / cfg.ramp.R);
      vehAt(ctx, q.x, q.y, q.a, { len: r.len, col: r.col, truck: r.truck, bus: r.bus, v: r.v, heat: R.heat, brake: (r.a || 0) < -0.9 || r.v < 0.4 });
    }
    drawBridge(ctx, sim, R, g, now);
  }
  // tabela köprüsü (önerilen)
  if (M.serit) for (const gx of [40, 1300]) if (gx > g.x0 - 10 && gx < g.x1 + 10) gantry(ctx, gx, N, cfg, g);
  // hava efekti
  ctx.setTransform(d, 0, 0, d, 0, 0);
  weatherFx(ctx, p, R.wx, now);
  ctx.restore();
}
function arrowPaint(ctx, x, y) {
  ctx.fillStyle = 'rgba(244,244,236,0.82)';
  ctx.fillRect(x - 3.6, y - 0.75, 3.6, 0.34);
  ctx.fillRect(x - 0.34, y - 0.75, 0.34, 0.95);
  ctx.beginPath(); ctx.moveTo(x - 0.8, y + 0.2); ctx.lineTo(x + 0.46, y + 0.2); ctx.lineTo(x - 0.17, y + 1.1); ctx.closePath(); ctx.fill();
}
function mergeArrow(ctx, x, y) {
  ctx.strokeStyle = 'rgba(244,244,236,0.82)'; ctx.lineWidth = 0.32; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 5, y + 0.4); ctx.lineTo(x, y + 0.4); ctx.lineTo(x + 3, y - 1.1); ctx.stroke();
  ctx.fillStyle = 'rgba(244,244,236,0.82)'; ctx.beginPath(); ctx.moveTo(x + 3.9, y - 1.6); ctx.lineTo(x + 2.2, y - 1.6); ctx.lineTo(x + 3.2, y - 0.3); ctx.closePath(); ctx.fill();
}
function roadSign(ctx, x, y, g, kind) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#f2c230'; ctx.fillRect(-0.95, -0.95, 1.9, 1.9);
  ctx.strokeStyle = '#111'; ctx.lineWidth = 0.12; ctx.strokeRect(-0.8, -0.8, 1.6, 1.6);
  ctx.restore();
  ctx.save(); ctx.translate(x, y); if (g.V) ctx.rotate(Math.PI / 2);
  ctx.strokeStyle = '#111'; ctx.lineWidth = 0.16; ctx.beginPath();
  if (kind === 'zip') { ctx.moveTo(-0.5, -0.45); ctx.lineTo(0, 0); ctx.lineTo(0.5, -0.45); ctx.moveTo(0, 0); ctx.lineTo(0, 0.6); }
  else { ctx.moveTo(-0.45, 0.55); ctx.lineTo(-0.45, -0.55); ctx.moveTo(0.4, 0.55); ctx.lineTo(0.4, 0); ctx.lineTo(-0.4, -0.4); }
  ctx.stroke(); ctx.restore();
}
function gantry(ctx, x, N, cfg, g) {
  const W = N * LW;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 0.6, -1.4, 0.5, W + 2.8);
  ctx.fillStyle = '#8b9096'; ctx.fillRect(x - 0.25, -1.6, 0.5, W + 3.2);
  for (let l = 0; l < N; l++) {
    if (cfg.drop && l === 0 && x > cfg.drop.x - 300) continue;
    const yc = (N - 1 - l + 0.5) * LW, t = l === 0 && !cfg.drop ? '50' : l === N - 1 ? '90' : '70';
    ctx.fillStyle = '#1f4e9c'; rrect(ctx, x - 1.1, yc - 1.25, 2.2, 2.5, 0.2); ctx.fill();
    speedSign(ctx, x, yc, 0.85, t, g.V);
  }
}
function drawBridge(ctx, sim, R, g, now) {
  const G = R.rampG, bx = G.bx, top = g.yTop - 4, bot = g.yTop + g.span + 4, N = R.N;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx - 8 + 2.2, top, 16, bot - top);
  ctx.fillStyle = TK.deck; ctx.fillRect(bx - 8, top, 16, bot - top);
  ctx.fillStyle = TK.curb;
  ctx.fillRect(bx - 8.6, top, 0.6, G.P3.y - 2.6 - top); ctx.fillRect(bx - 8.6, G.P3.y + 2.6, 0.6, bot - G.P3.y);
  ctx.fillRect(bx + 8, top, 0.6, bot - top);
  ctx.strokeStyle = TK.marking; ctx.lineWidth = 0.13; ctx.setLineDash([3, 6]);
  ctx.beginPath(); ctx.moveTo(bx, top); ctx.lineTo(bx, G.P3.y - 8); ctx.moveTo(bx, G.P3.y + 8); ctx.lineTo(bx, bot); ctx.stroke(); ctx.setLineDash([]);
  ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(bx - 7.6, G.P3.y - 7); ctx.lineTo(bx, G.P3.y - 7); ctx.moveTo(bx, G.P3.y + 7); ctx.lineTo(bx + 7.6, G.P3.y + 7); ctx.stroke();
  const fx = S.fx[sim.sys ? 1 : 0] || {};
  const green = sim.green();
  if (fx.s) {
    for (const c of fx.s) vehAt(ctx, bx - 3.9, c.y, Math.PI / 2, { len: 4.5, col: c.col, v: c.v, heat: R.heat, brake: c.v < 2 });
    for (const c of fx.n) vehAt(ctx, bx + 3.9, c.y, -Math.PI / 2, { len: 4.5, col: c.col, v: c.v, heat: R.heat, brake: c.v < 2 });
  }
  // ışık
  const lx = G.P3.x - 1.2, ly = G.P3.y - 3.6;
  ctx.fillStyle = '#16181b'; rrect(ctx, lx - 0.7, ly - 1.4, 1.4, 2.8, 0.3); ctx.fill();
  ctx.fillStyle = green ? '#2fd36b' : '#ff3b30'; ctx.beginPath(); ctx.arc(lx, green ? ly + 0.65 : ly - 0.65, 0.48, 0, 7); ctx.fill();
  ctx.fillStyle = green ? 'rgba(47,211,107,0.3)' : 'rgba(255,59,48,0.3)'; ctx.beginPath(); ctx.arc(lx, green ? ly + 0.65 : ly - 0.65, 1.3, 0, 7); ctx.fill();
}
function weatherFx(ctx, p, wx, t) {
  const { x, y, w, h } = p;
  if (wx === 'yagmur' || wx === 'saganak') {
    ctx.fillStyle = 'rgba(40,60,85,0.10)'; ctx.fillRect(x, y, w, h);
    const n = Math.round((w * h) / (wx === 'saganak' ? 700 : 1900));
    ctx.strokeStyle = 'rgba(210,225,240,0.42)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sx = x + ((((i * 97.13 + t * 120) % (w + 40)) + w + 40) % (w + 40)) - 20;
      const sy = y + ((i * 53.71 + t * 620 * (1 + (i % 3) * 0.2)) % (h + 24)) - 12;
      ctx.moveTo(sx, sy); ctx.lineTo(sx - 2, sy + 9);
    }
    ctx.stroke();
  } else if (wx === 'kar') {
    ctx.fillStyle = 'rgba(235,240,245,0.10)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const n = Math.round((w * h) / 1300);
    for (let i = 0; i < n; i++) {
      const sx = x + ((((i * 91.7 + Math.sin(t * 0.8 + i) * 14 + t * 18) % w) + w) % w);
      const sy = y + ((i * 37.3 + t * 36 * (1 + (i % 4) * 0.25)) % h);
      const r = 0.8 + (i % 3) * 0.5; ctx.fillRect(sx, sy, r, r);
    }
  } else if (wx === 'sis') {
    const gr = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.15, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
    gr.addColorStop(0, 'rgba(214,219,224,0.25)'); gr.addColorStop(1, 'rgba(214,219,224,0.78)');
    ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
  }
}
function drawMinimap(ctx, d, mm, R, g) {
  if (!mm) return;
  const V = LAY.V, ids = LAY.panes.map((p) => p.id), n = ids.length, L = R.cfg.L, N = R.N;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.fillStyle = 'rgba(18,20,24,0.55)'; rrect(ctx, mm.x - 4, mm.y - 4, mm.w + 8, mm.h + 8, 9); ctx.fill();
  const along = (x) => (V ? mm.y + mm.h - (x / L) * mm.h : mm.x + (x / L) * mm.w);
  ids.forEach((id, i) => {
    const sim = S.sims[id];
    const t = (V ? mm.w : mm.h) / n, o = i * t, lw = (t - 2) / N;
    for (const v of sim.veh) {
      ctx.fillStyle = speedCol(v.v);
      const a = along(v.x), c = o + 1 + (N - 1 - Math.max(0, v.y)) * lw;
      if (V) ctx.fillRect(mm.x + c, a - 1, Math.max(1, lw - 0.4), 2); else ctx.fillRect(a - 1, mm.y + c, 2, Math.max(1, lw - 0.4));
    }
    for (const b of sim._ab || []) {
      ctx.fillStyle = '#ff3b30'; const a = along(b.x);
      if (V) ctx.fillRect(mm.x + o, a - 2, t, 3); else ctx.fillRect(a - 1, mm.y + o, 3, t);
    }
  });
  const a0 = along(Math.max(0, g.x0)), a1 = along(Math.min(L, g.x1));
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
  if (V) rrect(ctx, mm.x - 2, Math.min(a0, a1), mm.w + 4, Math.abs(a1 - a0), 4); else rrect(ctx, Math.min(a0, a1), mm.y - 2, Math.abs(a1 - a0), mm.h + 4, 4);
  ctx.stroke();
}
function drawRingPane(ctx, d, p, ring, idx, now, wx, heat, noST) {
  ctx.save(); ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();
  ctx.fillStyle = TK.grass; ctx.fillRect(p.x, p.y, p.w, p.h);
  let rb, sb;
  if (noST) { const s = Math.min(p.w, p.h) * 1.1; rb = { x: p.x + (p.w - s) / 2, y: p.y + (p.h - s) / 2 - 10, s }; sb = { h: 0, w: 0 }; }
  else if (p.V) { const s = Math.min(p.w, p.h * 0.6); rb = { x: p.x + (p.w - s) / 2, y: p.y + 34, s }; sb = { x: p.x + 10, y: p.y + s + 64, w: p.w - 20, h: p.h - s - 80 }; }
  else { const s = Math.min(p.h - 30, p.w * 0.46); rb = { x: p.x + 4, y: p.y + 30 + (p.h - 30 - s) / 2, s }; sb = { x: p.x + s + 18, y: p.y + 44, w: p.w - s - 32, h: p.h - 60 }; }
  const cx = rb.x + rb.s / 2, cy = rb.y + rb.s / 2 + (p.V ? 10 : 0), R = rb.s * 0.36, rw = Math.max(12, rb.s * 0.07);
  ctx.strokeStyle = TK.curb; ctx.lineWidth = rw + 3; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  ctx.strokeStyle = asphFor(wx); ctx.lineWidth = rw; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  ctx.strokeStyle = TK.marking; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R + rw / 2 - 2, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, R - rw / 2 + 2, 0, 7); ctx.stroke();
  ctx.fillStyle = TK.grass2; ctx.beginPath(); ctx.arc(cx, cy, R - rw / 2 - 1.5, 0, 7); ctx.fill();
  const ppm = (2 * Math.PI * R) / ring.C, sc = Math.max(ppm, rw / 3.2);
  ring.cars.forEach((c, i) => {
    const a = (c.x / ring.C) * Math.PI * 2 - Math.PI / 2;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.rotate(a + Math.PI / 2); ctx.scale(sc, sc);
    vehLocal(ctx, { len: 4.5, col: c.col, v: c.v, heat, brake: c.a < -0.9 || c.v < 0.4, hazard: false });
  });
  ctx.setTransform(d, 0, 0, d, 0, 0);
  const avg = ring.cars.reduce((s, c) => s + c.v, 0) / ring.cars.length * 3.6;
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(R * 0.42)}px ${getFont()}`; ctx.fillText(fmt(avg), cx, cy - R * 0.06);
  ctx.font = `500 ${Math.max(10, Math.round(R * 0.11))}px ${getFont()}`; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText('ort. km/s', cx, cy + R * 0.26);
  if (!noST && sb.h > 60 && sb.w > 80) {
    ctx.fillStyle = 'rgba(18,20,24,0.35)'; rrect(ctx, sb.x - 6, sb.y - 28, sb.w + 12, sb.h + 36, 12); ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(S.st[idx], 0, 0, 520, 200, sb.x, sb.y, sb.w, sb.h);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = `600 12px ${getFont()}`;
    ctx.fillText('Zaman-yol grafiği', sb.x, sb.y - 10);
    ctx.font = `500 11px ${getFont()}`; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'right';
    ctx.fillText('zaman →', sb.x + sb.w, sb.y - 10);
  }
  weatherFx(ctx, p, wx, now);
  ctx.restore();
}
function draw(now) {
  const ctx = cv.getContext('2d'), d = LAY.d;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(d, 0, 0, d, 0, 0); ctx.fillStyle = TK.card; ctx.fillRect(0, 0, LAY.W, LAY.H);
  if (S.rings) { for (const p of LAY.panes) drawRingPane(ctx, d, p, S.rings[p.id], p.id, now, S.wx, S.heat); return; }
  const R = { N: S.lanes, cfg: S.scn.cfg.ramp || S.scn.cfg.side ? Object.assign({}, S.cfg, { side: S.scn.cfg.side, bridgeX: S.scn.cfg.bridgeX }) : S.cfg, wx: S.wx, heat: S.heat, rampG: S.rampG, onG: S.onG };
  let g = null;
  for (const p of LAY.panes) {
    g = geomFor(p, R.cfg, R.N, ZOOMS[S.zi], S.cam, S.scn.win);
    drawRoadPane(ctx, d, p, S.sims[p.id], R, g, simT());
  }
  if (g) { S._g = g; drawMinimap(ctx, d, LAY.mm, R, g); }
  ctx.setTransform(d, 0, 0, d, 0, 0);
}

// ---------- istatistik ----------
function metricRow(lbl, a, b, unit, better, fmtv) {
  const pct = a > 0 ? ((b - a) / a) * 100 : 0;
  let good = better === 'low' ? pct < -3 : pct > 3, bad = better === 'low' ? pct > 3 : pct < -3;
  let txt = Math.abs(pct) < 3 || !isFinite(pct) ? 'Benzer' : `${pct > 0 ? '+' : '−'}%${fmt(Math.abs(pct))}`;
  if (a === 0 && b > 0.05) { txt = `+${fmtv(b)}`; good = better === 'high'; bad = better === 'low'; }
  const cls = good ? 'good' : bad ? 'bad' : 'eq';
  const mx = Math.max(a, b, 1e-6);
  return `<div class="metric"><span class="lbl">${lbl}</span><span class="vals"><span>${fmtv(a)}</span><b>${fmtv(b)}</b></span>
  <div class="bars"><div class="bar"><i style="width:${(a / mx) * 100}%;background:var(--cur)"></i></div><div class="bar"><i style="width:${(b / mx) * 100}%;background:var(--pro)"></i></div></div>
  <div class="note"><span class="meta">${unit}</span><span class="pill ${cls}">${txt}</span></div></div>`;
}
function updateStats(force) {
  if (!S.scn) return;
  const t = S.warm > 0 ? 0 : simT() - S.t0;
  $('#clock').textContent = mmss(t);
  $$('[data-rem]').forEach((el) => {
    const k = el.dataset.rem;
    if (!S.sims) return;
    if (k === 'w') { if (S.wave) el.textContent = mmss(S.wave.until - S.sims[0].t); }
    else { const b = S.sims[0].blocks[+k]; if (b) { if (S.sims[0].t >= b.t1) renderActive(); else if (isFinite(b.t1)) el.textContent = mmss(b.t1 - S.sims[0].t); } }
  });
  let html = '', vBig = '', vTxt = '', vCls = '';
  const labs = $$('#labels .plabel em');
  if (S.rings) {
    const st = S.rings.map((r) => {
      const avg = (r.cars.reduce((s, c) => s + c.v, 0) / r.cars.length) * 3.6;
      const stopped = r.cars.filter((c) => c.v < 0.8).length;
      r._h = r._h || []; r._h.push([r.t, r.stops]); while (r._h.length && r._h[0][0] < r.t - 60) r._h.shift();
      const per = r._h.length > 1 ? ((r.stops - r._h[0][1]) / Math.max(1, r.t - r._h[0][0])) * 60 : 0;
      return { avg, stopped, per };
    });
    const [a, b] = st;
    html = metricRow('Ortalama hız', a.avg, b.avg, 'km/s', 'high', (v) => fmt(v))
      + metricRow('Şu an duran araç', a.stopped, b.stopped, 'araç', 'low', (v) => fmt(v))
      + metricRow('Tam duruş', a.per, b.per, 'dakikada', 'low', (v) => fmt(v));
    labs.forEach((el) => { const id = +el.parentElement.dataset.id; el.textContent = `${st[id].stopped} duran`; });
    if (a.per > 2 && b.per < a.per * 0.3) { vBig = 'Öngörülü sürüşte dur-kalk yok'; vCls = 'good'; vTxt = `Yakın takipte dakikada ${fmt(a.per)} tam duruş oluyor, öngörülü sürüşte ${fmt(b.per)}. Dalga geriye yayılmadan sönüyor.`; }
    else if (a.per <= 2) { vBig = 'Akış şimdilik düzgün'; vTxt = 'Bir sürücü ani fren yapınca neler olduğunu izle. Olay ekle bölümünden “Ani fren”e dokun.'; }
    else { vBig = 'İki tarafta da dalga var'; vCls = 'bad'; vTxt = 'Araç sayısı yolun kaldırabileceğinden fazla. Araç sayısını azaltmayı dene.'; }
  } else {
    const [a, b] = S.sims.map((s) => s.stats());
    html = metricRow('Ortalama yolculuk', a.tt, b.tt, `${fmt(S.cfg.L / 1000, 1)} km için, dk:sn`, 'low', mmss)
      + metricRow('Ortalama hız', a.spd, b.spd, 'km/s', 'high', (v) => fmt(v))
      + metricRow('Geçen araç', a.flow, b.flow, 'dakikada', 'high', (v) => fmt(v))
      + metricRow('Sert fren', a.hb, b.hb, 'dakikada', 'low', (v) => fmt(v, 1))
      + metricRow('Duran araç', a.stopped, b.stopped, 'şu an', 'low', (v) => fmt(v))
      + (S.scn.cfg.onramp ? metricRow('Bağlanan yolda bekleyen', a.rampQ, b.rampQ, 'araç', 'low', (v) => fmt(v)) : '')
      + (a.queue + b.queue > 5 ? metricRow('Yola giremeyen', a.queue, b.queue, 'girişte bekleyen', 'low', (v) => fmt(v)) : '');
    const sts = [a, b];
    labs.forEach((el) => { const id = +el.parentElement.dataset.id; el.textContent = `${fmt(sts[id].spd)} km/s`; });
    const pct = a.tt ? Math.round(((a.tt - b.tt) / a.tt) * 100) : 0;
    const hbp = a.hb > 0.3 ? Math.round(((a.hb - b.hb) / a.hb) * 100) : null;
    const hbTxt = hbp === null ? 'Sert fren iki tarafta da çok az.' : hbp >= 10 ? `Sert frenler %${hbp} daha az, yani kaza riski de düşük.` : hbp <= -10 ? `Sert frenler %${-hbp} daha fazla.` : 'Sert fren sayıları benzer.';
    if (S.warm > 0) { vBig = 'Trafik oluşuyor'; vTxt = 'Yol araçlarla doluyor. Ölçüm birazdan başlayacak.'; }
    else if (t < 20 && !force) { vBig = 'Ölçüm sürüyor'; vTxt = 'Son 2 dakikadaki araçlar karşılaştırılıyor.'; }
    else if (pct > 3) { vBig = `Önerilen düzen %${pct} daha hızlı`; vCls = 'good'; vTxt = `Ortalama yolculuk ${mmss(a.tt)} yerine ${mmss(b.tt)}. ${hbTxt}`; }
    else if (pct < -3) { vBig = `Bu durumda mevcut düzen %${-pct} daha hızlı`; vCls = 'bad'; vTxt = `Yolculuk ${mmss(a.tt)} ile ${mmss(b.tt)}. ${hbTxt} Önerilen düzenin uyarı hız sınırı burada akışı yavaşlatıyor olabilir.`; }
    else { vBig = 'Yolculuk süresi başa baş'; vTxt = `Darboğazın kapasitesi değişmez, ama akışın kalitesi değişebilir. ${hbTxt}`; }
    const off = Object.keys(MEAS).filter((k) => measRelevant(k) && !S.meas[k]);
    if (off.length) vTxt += ` Kapalı önlemler: ${off.map((k) => MEAS[k].ad.toLocaleLowerCase('tr-TR')).join(', ')}.`;
  }
  $('#metrics').innerHTML = html;
  const vb = $('#vBig'); vb.textContent = vBig; vb.className = 'big ' + vCls; $('#vTxt').textContent = vTxt;
  drawSpark();
  $('#nowName').textContent = S.scn.ad;
  $('#nowState').textContent = S.playing ? `Çalışıyor · ${SPEEDS[S.speedIdx]}×` : 'Duraklatıldı';
  $('#nowDot').className = 'live-dot' + (S.playing ? '' : ' off');
}
function sizeSpark() {
  const c = $('#spark'), w = c.clientWidth || 300, d = DPR();
  c.width = Math.round(w * d); c.height = Math.round(120 * d);
}
function drawSpark() {
  const c = $('#spark'), w = c.clientWidth; if (!w) return;
  const d = DPR(); if (c.width !== Math.round(w * d)) sizeSpark();
  const ctx = c.getContext('2d'), h = 120, padL = 30, padB = 18, padT = 18;
  ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, w, h);
  const H = S.hist, all = H[0].concat(H[1]);
  const mx = Math.max(40, Math.ceil(Math.max(...all, 0) / 20) * 20);
  ctx.font = `500 11px ${getFont()}`; ctx.fillStyle = TK.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = TK.hair; ctx.lineWidth = 1;
  for (let v = 0; v <= mx; v += mx / 2) {
    const y = padT + (h - padT - padB) * (1 - v / mx);
    ctx.beginPath(); ctx.moveTo(padL, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); ctx.stroke();
    ctx.fillText(fmt(v), padL - 6, y);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = TK.muted;
  ctx.fillText('Ortalama hız, km/s · son 3 dk', padL, 11);
  const X = (i) => padL + (w - padL - 8) * (i / 89), Y = (v) => padT + (h - padT - padB) * (1 - v / mx);
  [[0, TK.cur], [1, TK.pro]].forEach(([k, col]) => {
    const arr = H[k]; if (arr.length < 2) return;
    const off = 90 - arr.length;
    if (k === 1) {
      ctx.beginPath(); arr.forEach((v, i) => (i ? ctx.lineTo(X(i + off), Y(v)) : ctx.moveTo(X(i + off), Y(v))));
      ctx.lineTo(X(89), Y(0)); ctx.lineTo(X(off), Y(0)); ctx.closePath();
      ctx.globalAlpha = 0.12; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.beginPath(); arr.forEach((v, i) => (i ? ctx.lineTo(X(i + off), Y(v)) : ctx.moveTo(X(i + off), Y(v))));
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    const lv = arr[arr.length - 1]; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(89), Y(lv), 3.2, 0, 7); ctx.fill();
  });
  ctx.fillStyle = TK.muted; ctx.textAlign = 'right'; ctx.fillText('şimdi', w - 4, h - 3); ctx.textAlign = 'left'; ctx.fillText('3 dk önce', padL, h - 3);
}

// ---------- başlık & ayarlar ----------
function syncHeader() {
  const sc = S.scn;
  $('#scnTitle').textContent = sc.ad;
  $('#scnDesc').textContent = sc.ozet;
  $('#scnEyebrow').textContent = `${YOL[sc.yol]} · ${HAVA[S.wx] || ''}`;
  $$('#viewSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === S.view));
  const [a, , b] = $$('#viewSeg button');
  a.textContent = sc.ring ? 'Yakın takip' : 'Mevcut'; b.textContent = sc.ring ? 'Öngörülü' : 'Önerilen';
}
function setRange(id, v) { const el = $(id); el.value = v; const p = ((v - el.min) / (el.max - el.min)) * 100; el.style.setProperty('--p', p + '%'); }
function syncSettings() {
  const sc = S.scn, ring = !!sc.ring;
  $$('#settings [data-need]').forEach((r) => {
    const n = r.dataset.need;
    r.hidden = n === 'ring' ? !ring : ring || (n === 'exit' && sc.cfg.exitX === undefined) || (n === 'ramp' && !sc.cfg.ramp) || (n === 'onramp' && !sc.cfg.onramp);
  });
  setRange('#sDemand', S.demand); $('#oDemand').textContent = `${fmt(S.demand)} araç/saat`;
  setRange('#sExit', Math.round(S.exitFrac * 100)); $('#oExit').textContent = `%${Math.round(S.exitFrac * 100)}`;
  setRange('#sGreen', S.green); $('#oGreen').textContent = `${S.green} sn`;
  setRange('#sRing', S.ringN); $('#oRing').textContent = `${S.ringN} araç`;
  setRange('#sRamp', S.rampDemand); $('#oRamp').textContent = `${fmt(S.rampDemand)} araç/saat`;
  $('#measCard').hidden = ring; renderMeasures();
  $('#oLanes').textContent = S.lanes;
  const minL = sc.cfg && (sc.cfg.drop || (sc.events || []).some((e) => e.type === 'calisma' || e.lane === 2)) ? 3 : 2;
  $('#lMinus').disabled = S.lanes <= minL; $('#lPlus').disabled = S.lanes >= 6;
  $('#sHeat').checked = S.heat;
}
const MEAS = {
  serit: { ad: 'Hıza göre şerit', alt: 'Sağ 50, orta 70, sol 90. Sollayınca sağa dön.' },
  cep: { ad: 'Sağa dönüş cebi', alt: 'Çıkacaklar erkenden sağa geçer, cepte yavaşlar.' },
  fermuar: { ad: 'Fermuar birleşme', alt: 'Daralma ve bağlantıda sırayla geçiş, yol verme.' },
  vsl: { ad: 'Değişken hız limiti', alt: 'Sıkışma başlayınca öncesinde hız 70’e iner.' },
  rampa: { ad: 'Rampa ışığı', alt: 'Bağlanan yoldan araçlar ana yol akışına göre tek tek bırakılır.' },
};
function measRelevant(k) {
  const c = S.scn && S.scn.cfg; if (!c) return false;
  if (k === 'cep') return c.exitX !== undefined;
  if (k === 'rampa') return !!c.onramp;
  if (k === 'vsl') return !!(c.vsl || c.vslZones || (S.sims && S.sims[0].blocks.length) || (S.scn.events || []).length);
  return true;
}
function renderMeasures() {
  const box = $('#measures'); if (!box) return;
  box.innerHTML = '';
  Object.entries(MEAS).forEach(([k, m]) => {
    if (!measRelevant(k)) return;
    const row = document.createElement('div'); row.className = 'mrow';
    row.innerHTML = `<div><label for="m-${k}">${m.ad}</label><span class="help">${m.alt}</span></div><input type="checkbox" class="switch" id="m-${k}" ${S.meas[k] ? 'checked' : ''}>`;
    row.querySelector('input').addEventListener('change', (e) => { S.meas[k] = e.target.checked; build(); toast(`${m.ad} ${e.target.checked ? 'açıldı' : 'kapatıldı'}. Simülasyon yeniden başladı.`); });
    box.appendChild(row);
  });
}
(function initSettings() {
  const box = $('#wxseg');
  Object.keys(HAVA).forEach((k) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.k = k;
    b.innerHTML = `<svg class="i"><use href="#${WXICO[k]}"/></svg>${HAVA[k]}`;
    b.addEventListener('click', () => { setWeather(k); syncHeader(); });
    box.appendChild(b);
  });
  const live = (id, fn) => $(id).addEventListener('input', (e) => { const v = +e.target.value; fn(v); syncSettings(); });
  live('#sDemand', (v) => { S.demand = v; if (S.arr && !S.wave) S.arr.opts.demand = v; if (S.wave) { S.wave.base = v; S.arr.opts.demand = v * 1.5; } });
  live('#sExit', (v) => { S.exitFrac = v / 100; if (S.arr) S.arr.opts.exitFrac = v / 100; });
  live('#sRamp', (v) => { S.rampDemand = v; if (S.arr2) S.arr2.opts.demand = v; });
  live('#sGreen', (v) => { S.green = v; if (S.cfg && S.cfg.ramp) S.cfg.ramp.green = v; });
  let rt = null;
  live('#sRing', (v) => { S.ringN = v; clearTimeout(rt); rt = setTimeout(build, 150); });
  $('#lMinus').addEventListener('click', () => { S.lanes--; build(); syncSettings(); });
  $('#lPlus').addEventListener('click', () => { S.lanes++; build(); syncSettings(); });
  $('#sHeat').addEventListener('change', (e) => { S.heat = e.target.checked; store.set('heat', S.heat); });
  $$('#viewSeg button').forEach((b) => b.addEventListener('click', () => { S.view = b.dataset.v; store.set('view', S.view); syncHeader(); layout(); updateStats(true); }));
  const syncPlay = () => { const b = $('#play'); b.innerHTML = `<svg class="i fill"><use href="#${S.playing ? 'i-pause' : 'i-play'}"/></svg>`; b.setAttribute('aria-label', S.playing ? 'Duraklat' : 'Oynat'); };
  $('#play').addEventListener('click', () => { S.playing = !S.playing; syncPlay(); updateStats(true); });
  syncPlay();
  $('#speed').addEventListener('click', () => { S.speedIdx = (S.speedIdx + 1) % SPEEDS.length; $('#speed').textContent = SPEEDS[S.speedIdx] + '×'; });
  $('#zin').addEventListener('click', () => { S.zi = Math.min(ZOOMS.length - 1, S.zi + 1); });
  $('#zout').addEventListener('click', () => { S.zi = Math.max(0, S.zi - 1); });
  $('#focus').addEventListener('click', () => { S.cam = S.scn.focus || 0; S.zi = 2; });
  $('#reset').addEventListener('click', () => { build(); toast('Simülasyon baştan başladı'); });
})();

// ---------- sahne etkileşimi ----------
let drag = null;
function inMM(px, py) { const m = LAY.mm; return m && px >= m.x - 6 && px <= m.x + m.w + 6 && py >= m.y - 6 && py <= m.y + m.h + 6; }
function camFromMM(px, py) { const m = LAY.mm, L = S.cfg.L; S.cam = clamp(LAY.V ? (1 - (py - m.y) / m.h) * L : ((px - m.x) / m.w) * L, 0, L); }
cv.addEventListener('pointerdown', (e) => {
  if (S.rings) return;
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  drag = inMM(px, py) ? { mm: true } : { x: e.clientX, y: e.clientY, cam: S.cam };
  if (drag.mm) camFromMM(px, py);
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  $('#hint').style.opacity = 0;
});
cv.addEventListener('pointermove', (e) => {
  if (!drag || !S._g) return;
  const r = cv.getBoundingClientRect();
  if (drag.mm) { camFromMM(e.clientX - r.left, e.clientY - r.top); return; }
  const ppm = S._g.ppm;
  S.cam = clamp(LAY.V ? drag.cam + (e.clientY - drag.y) / ppm : drag.cam - (e.clientX - drag.x) / ppm, 0, S.cfg.L);
});
const endDrag = () => { drag = null; };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('wheel', (e) => {
  if (S.rings || !S._g) return;
  const dd = LAY.V ? e.deltaY : (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0);
  if (!dd) return;
  e.preventDefault(); S.cam = clamp(S.cam + (LAY.V ? -dd : dd) / S._g.ppm, 0, S.cfg.L);
}, { passive: false });

// ---------- senaryo kütüphanesi ----------
const F = { yol: 'tum', olay: new Set(), hava: 'tum', q: '' };
const norm = (s) => s.toLocaleLowerCase('tr-TR');
function matches(s, f) {
  const q = norm(f.q.trim());
  return (f.yol === 'tum' || s.yol === f.yol) && (f.hava === 'tum' || s.hava === f.hava) && [...f.olay].every((o) => s.olay.includes(o))
    && (!q || norm(s.ad + ' ' + s.ozet + ' ' + s.olay.map((o) => OLAY[o]).join(' ') + ' ' + YOL[s.yol] + ' ' + HAVA[s.hava]).split(/[\s,.:;·]+/).some((w) => w.startsWith(q)) || norm(s.ad).includes(q));
}
const countWith = (patch) => { const f = Object.assign({}, F, patch); return SCN.filter((s) => matches(s, f)).length; };
function chipRow(boxId, items, isOn, onTap, countFor) {
  const box = $(boxId); box.innerHTML = '';
  items.forEach(([k, label]) => {
    const on = isOn(k), n = countFor(k);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
    b.innerHTML = `${label} <span class="n">${n}</span>`;
    b.setAttribute('aria-pressed', on); b.disabled = !on && n === 0;
    b.addEventListener('click', () => { onTap(k); renderFilters(); renderCards(); const again = $$(boxId + ' .chip')[items.findIndex((it) => it[0] === k)]; if (again) again.focus(); });
    box.appendChild(b);
  });
}
const activeCount = () => (F.yol !== 'tum') + F.olay.size + (F.hava !== 'tum');
function renderFilters() {
  chipRow('#fYol', [['tum', 'Tümü'], ...Object.entries(YOL)], (k) => F.yol === k, (k) => (F.yol = k), (k) => countWith({ yol: k }));
  chipRow('#fOlay', Object.entries(OLAY), (k) => F.olay.has(k), (k) => (F.olay.has(k) ? F.olay.delete(k) : F.olay.add(k)),
    (k) => countWith({ olay: new Set([...F.olay, k]) }));
  chipRow('#fHava', [['tum', 'Tümü'], ...Object.entries(HAVA).filter(([k]) => SCN.some((s) => s.hava === k))], (k) => F.hava === k, (k) => (F.hava = k), (k) => countWith({ hava: k }));
  const n = activeCount();
  const badge = $('#fBadge'); badge.hidden = !n; badge.textContent = n;
  $('#fOpen').classList.toggle('on', n > 0);
  $('#fClear').hidden = !n && !F.q;
  const total = SCN.filter((s) => matches(s, F)).length;
  $('#fShow').textContent = total ? `${total} senaryoyu göster` : 'Uyan senaryo yok';
  // seçili filtre etiketleri
  const pills = $('#fPills'); pills.innerHTML = '';
  const add = (group, label, off) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'fpill';
    b.setAttribute('aria-label', `${group} filtresini kaldır: ${label}`);
    b.innerHTML = `<small>${group}</small> ${label}<span class="x"><svg class="i sm"><use href="#i-x"/></svg></span>`;
    b.addEventListener('click', () => { off(); renderFilters(); renderCards(); });
    pills.appendChild(b);
  };
  if (F.yol !== 'tum') add('Yol', YOL[F.yol], () => (F.yol = 'tum'));
  F.olay.forEach((o) => add('Olay', OLAY[o], () => F.olay.delete(o)));
  if (F.hava !== 'tum') add('Hava', HAVA[F.hava], () => (F.hava = 'tum'));
}
let sheetReturn = null;
function openSheet() {
  sheetReturn = document.activeElement;
  $('#fBack').hidden = false; $('#fSheet').hidden = false;
  document.body.style.overflow = 'hidden';
  const first = $('#fSheet .chip[aria-pressed="true"]') || $('#fSheet .chip'); if (first) first.focus();
}
function closeSheet() {
  if ($('#fSheet').hidden) return;
  $('#fBack').hidden = true; $('#fSheet').hidden = true;
  document.body.style.overflow = '';
  if (sheetReturn && sheetReturn.focus) sheetReturn.focus();
}
$('#fOpen').addEventListener('click', openSheet);
$('#fBack').addEventListener('click', closeSheet);
$('#fDone').addEventListener('click', closeSheet);
$('#fShow').addEventListener('click', closeSheet);
$('#fReset').addEventListener('click', () => { F.yol = 'tum'; F.olay.clear(); F.hava = 'tum'; renderFilters(); renderCards(); });
document.addEventListener('keydown', (e) => {
  if ($('#fSheet').hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
  if (e.key === 'Tab') {
    const f = $$('#fSheet button:not(:disabled)'); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
});

function renderCards() {
  const grid = $('#sgrid'); if (!grid) return;
  const list = SCN.filter((s) => matches(s, F));
  $('#count').textContent = `${list.length} senaryo`;
  grid.innerHTML = '';
  if (!list.length) {
    grid.innerHTML = `<div class="empty card" style="grid-column:1/-1"><b>Bu filtrelere uyan senaryo yok</b><span>Bir filtreyi kaldırmayı dene.</span></div>`;
    return;
  }
  for (const s of list) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'card scard' + (S.scn && S.scn.id === s.id ? ' current' : '');
    const meta = s.ring ? `${s.ringN} araç · 600 m halka` : `${s.cfg.lanes} şerit · ${fmt(s.demand)} araç/saat`;
    b.innerHTML = `<canvas aria-hidden="true"></canvas><div class="body"><h3>${s.ad}</h3><p>${s.ozet}</p><div class="tags"><span class="tag">${YOL[s.yol]}</span>${s.olay.map((o) => `<span class="tag">${OLAY[o]}</span>`).join('')}<span class="tag">${HAVA[s.hava]}</span></div><span class="meta">${meta}</span></div>`;
    b.addEventListener('click', () => { loadScenario(s.id, true); go('simulasyon'); });
    grid.appendChild(b);
    requestAnimationFrame(() => thumb(b.querySelector('canvas'), s));
  }
}
function thumb(c, s) {
  const w = c.clientWidth; if (!w) return;
  const h = Math.round(w / 2), d = DPR();
  c.width = Math.round(w * d); c.height = Math.round(h * d);
  const ctx = c.getContext('2d'), p = { x: 0, y: 0, w, h, V: false }, r = rng(hash(s.id));
  if (s.ring) {
    const n = s.ringN, cars = [];
    for (let i = 0; i < n; i++) { const x = (i / n) * 600 + (i > n * 0.6 ? -(i - n * 0.6) * 6 : 0); cars.push({ x: (x + 600) % 600, v: i > n * 0.6 ? 1 : 12, a: i > n * 0.6 ? -2 : 0, col: r() }); }
    const fake = { cars, C: 600 };
    drawRingPane(ctx, d, { x: 0, y: 0, w, h, V: true }, fake, 0, 0, s.hava, false, true);
    return;
  }
  const N = s.cfg.lanes, cfg = Object.assign(cfgOfThumb(s), { side: s.cfg.side, bridgeX: s.cfg.bridgeX });
  const blocks = (s.events || []).map((e) => ({ lane: e.lane === 'sol' ? N - 1 : e.lane, x: e.x, len: e.type === 'kaza' ? 12 : e.len || 6, kind: e.type, t0: 0, t1: Infinity, seed: 0.4 }));
  const veh = [];
  for (let l = 0; l < N; l++) {
    let x = s.focus - 180;
    while (x < s.focus + 180) {
      x += 8 + r() * (s.demand > 5000 ? 14 : 26);
      if (cfg.drop && l === 0 && x > cfg.drop.x) continue;
      if (blocks.some((b) => b.lane === l && x > b.x - 2 && x < b.x + b.len + 8)) continue;
      const truck = r() < 0.08;
      veh.push({ x, y: l, lane: l, v: 6 + r() * 14, acc: r() < 0.15 ? -2 : 0, len: truck ? 12 : 4.5, truck, bus: truck && r() < 0.4, col: r(), want: null, exit: false });
    }
  }
  const fake = { sys: true, veh, ramp: [], exits: [], t: 1, rq: s.cfg.onramp ? [{ len: 4.5, col: 0.2 }, { len: 4.5, col: 0.6 }, { len: 4.5, col: 0.8 }] : null, meterNext: 0, _ab: blocks, blocks, green: () => false, activeBlocks: () => blocks };
  const R = { N, cfg, wx: s.hava, heat: false, rampG: s.cfg.ramp ? rampGeom(s.cfg, N) : null, onG: s.cfg.onramp ? onGeom(s.cfg, N) : null };
  const keepFx = S.fx; S.fx = [{}, {}];
  const g = geomFor(p, cfg, N, 1, blocks.length ? blocks[0].x + 4 : s.focus, s.cfg.ramp ? 300 : s.cfg.onramp ? 200 : 95);
  drawRoadPane(ctx, d, p, fake, R, g, 0.3);
  S.fx = keepFx;
}
function cfgOfThumb(s) {
  const c = s.cfg, o = { L: c.L, lanes: c.lanes };
  if (c.exitX !== undefined) { o.exitX = c.exitX; o.pocket = [c.exitX - c.pocketLen, c.exitX]; }
  if (c.ramp) o.ramp = Object.assign({}, c.ramp);
  if (c.drop) o.drop = { lane: 0, x: c.drop.x };
  if (c.vsl) o.vsl = c.vsl;
  if (c.onramp) o.onramp = { x: c.onramp.x, len: c.onramp.len };
  return o;
}
$('#q').addEventListener('input', (e) => { F.q = e.target.value; renderFilters(); renderCards(); });
$('#fClear').addEventListener('click', () => { F.yol = 'tum'; F.olay.clear(); F.hava = 'tum'; F.q = ''; $('#q').value = ''; renderFilters(); renderCards(); });
const _go = go; go = (v, h) => { closeSheet(); _go(v, h); };

// ---------- öğren ----------
const DIA = {
  serit: `<svg class="dia" viewBox="0 0 320 132" role="img" aria-label="Üç şeritli yol: sağda 50, ortada 70, solda 90"><rect width="320" height="132" fill="var(--grass)"/><rect y="20" width="320" height="92" fill="var(--asphalt)"/><g stroke="var(--marking)" stroke-width="2"><line x1="0" y1="23" x2="320" y2="23"/><line x1="0" y1="109" x2="320" y2="109"/></g><g stroke="var(--marking)" stroke-width="1.6" stroke-dasharray="14 18"><line x1="0" y1="51" x2="320" y2="51"/><line x1="0" y1="81" x2="320" y2="81"/></g><g font-family="-apple-system,Geist,sans-serif" font-weight="700" font-size="16" fill="var(--marking)" opacity=".85" text-anchor="middle"><text x="44" y="42">90</text><text x="44" y="72">70</text><text x="44" y="102">50</text></g><g><rect x="200" y="30" width="34" height="14" rx="4" fill="#3768a4"/><rect x="250" y="30" width="34" height="14" rx="4" fill="#f0f0ec"/><rect x="120" y="60" width="34" height="14" rx="4" fill="#b7bcc2"/><rect x="186" y="60" width="34" height="14" rx="4" fill="#a2252d"/><rect x="96" y="90" width="58" height="15" rx="3" fill="#e7e5df"/><rect x="154" y="90" width="12" height="15" rx="3" fill="#25385c"/><rect x="214" y="90" width="34" height="14" rx="4" fill="#1d2025"/></g><path d="M292 37h18m-6-5 6 5-6 5" stroke="var(--marking)" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  cep: `<svg class="dia" viewBox="0 0 320 150" role="img" aria-label="Sağa dönüş cebi: ana yoldan ayrılan ayrı şerit"><rect width="320" height="150" fill="var(--grass)"/><rect y="18" width="320" height="64" fill="var(--asphalt)"/><path d="M90 82 L130 108 L262 108 L262 82Z" fill="var(--asphalt)"/><rect x="262" y="82" width="34" height="68" fill="var(--asphalt)"/><path d="M240 82 Q262 82 262 104 L262 82Z" fill="var(--asphalt)"/><g stroke="var(--marking)" stroke-width="2" fill="none"><line x1="0" y1="21" x2="320" y2="21"/><line x1="0" y1="80" x2="90" y2="80"/></g><line x1="0" y1="50" x2="320" y2="50" stroke="var(--marking)" stroke-width="1.6" stroke-dasharray="14 18"/><line x1="130" y1="82" x2="240" y2="82" stroke="var(--marking)" stroke-width="2.5" stroke-dasharray="4 4"/><text x="196" y="100" font-family="-apple-system,Geist,sans-serif" font-weight="700" font-size="13" fill="var(--marking)" text-anchor="middle" opacity=".85">CEP</text><rect x="150" y="88" width="30" height="13" rx="4" fill="#efbf2c"/><rect x="104" y="58" width="32" height="13" rx="4" fill="#f0f0ec"/><rect x="190" y="58" width="32" height="13" rx="4" fill="#3768a4"/><rect x="60" y="28" width="32" height="13" rx="4" fill="#b7bcc2"/><rect x="174" y="28" width="32" height="13" rx="4" fill="#1d2025"/><path d="M118 95 q20 0 28 0" stroke="#ffb21a" stroke-width="3" stroke-linecap="round"/></svg>`,
  fermuar: `<svg class="dia" viewBox="0 0 320 120" role="img" aria-label="Fermuar birleşme: araçlar sırayla tek şeride geçer"><rect width="320" height="120" fill="var(--grass)"/><path d="M0 22 H320 V58 H240 L180 92 H0Z" fill="var(--asphalt)"/><g stroke="var(--marking)" stroke-width="2" fill="none"><line x1="0" y1="25" x2="320" y2="25"/><path d="M0 89 H180 L240 55 H320"/></g><line x1="0" y1="57" x2="180" y2="57" stroke="var(--marking)" stroke-width="1.6" stroke-dasharray="14 18"/><rect x="40" y="33" width="30" height="13" rx="4" fill="#f0f0ec"/><rect x="40" y="67" width="30" height="13" rx="4" fill="#a2252d"/><rect x="100" y="33" width="30" height="13" rx="4" fill="#3768a4"/><rect x="100" y="67" width="30" height="13" rx="4" fill="#efbf2c"/><rect x="160" y="33" width="30" height="13" rx="4" fill="#b7bcc2"/><rect x="196" y="56" width="30" height="13" rx="4" fill="#1d2025" transform="rotate(-25 211 62)"/><rect x="246" y="33" width="30" height="13" rx="4" fill="#25385c"/><g fill="#f07a12"><circle cx="190" cy="86" r="3"/><circle cx="205" cy="78" r="3"/><circle cx="220" cy="69" r="3"/><circle cx="235" cy="60" r="3"/></g></svg>`,
  mesafe: `<svg class="dia" viewBox="0 0 320 110" role="img" aria-label="Takip mesafesi: kuru yolda 2, yağmurda 4, karda 6 saniye"><rect width="320" height="110" fill="var(--grass)"/><rect y="26" width="320" height="44" fill="var(--asphalt)"/><g stroke="var(--marking)" stroke-width="2"><line x1="0" y1="29" x2="320" y2="29"/><line x1="0" y1="67" x2="320" y2="67"/></g><rect x="30" y="41" width="36" height="15" rx="4" fill="#3768a4"/><rect x="250" y="41" width="36" height="15" rx="4" fill="#f0f0ec"/><g stroke="var(--marking)" stroke-width="1.5"><line x1="70" y1="82" x2="246" y2="82"/><line x1="70" y1="76" x2="70" y2="88"/><line x1="246" y1="76" x2="246" y2="88"/></g><text x="158" y="100" font-family="-apple-system,Geist,sans-serif" font-weight="600" font-size="12" fill="var(--ink)" text-anchor="middle">kuru 2 sn · yağmur 4 sn · kar 6 sn</text></svg>`,
};
function renderLearn() {
  const W = WEATHER;
  const wrows = Object.entries(HAVA).map(([k, n]) => `<tr><td>${n}</td><td class="n">%${Math.round(W[k].vf * 100)}</td><td class="n">${fmt(W[k].T, 1)} sn</td><td class="n">${fmt(W[k].bmax, 1)} m/s²</td><td class="n">${W[k].rec} sn</td></tr>`).join('');
  $('#learn').innerHTML = `
  <article class="card lcard wide"><span class="num">BÜYÜK SIKIŞMA</span><h2>Tek bir çözüm yetmez</h2>
    <p>Büyük koridorlarda sıkışma genelde üç noktada başlar: bağlanan yolun ana yola katıldığı yer, çıkışa yönelenlerin şerit kestiği yer ve yolun daraldığı yer. Bu noktalar birbirini besler. Birindeki kuyruk geriye doğru uzayıp diğerini de kilitler.</p>
    <div class="twocol"><ul>
      <li><b>Hıza göre şerit:</b> Yavaş ve hızlı aynı şeritte karşılaşmaz, sollama ve fren azalır.</li>
      <li><b>Sağa dönüş cebi:</b> Çıkışa yönelenler ana yolu yavaşlatmaz.</li>
      <li><b>Fermuar birleşme:</b> Daralmada ve bağlantıda sırayla geçilir, zorla girme olmaz.</li></ul><ul>
      <li><b>Değişken hız limiti:</b> Sıkışma başlayınca öncesinde hız düşürülür. Araçlar durmadan yavaş akar, dalga oluşmaz.</li>
      <li><b>Rampa ışığı:</b> Bağlanan yoldan araçlar tek tek bırakılır. Ana yol tıkanmaz, bekleme rampada olur.</li></ul></div>
    <p>Simülasyonda bu önlemleri tek tek açınca etkileri sınırlı kalıyor. Hepsi birlikte açıkken koridor çok daha akıcı oluyor. Rampa ışığının bedeli de görünüyor: bağlanan yolda bekleyen araç sayısı artıyor.</p>
    <div><button type="button" class="btn tint" data-scn="koridor">Büyük koridoru aç</button></div></article>
  <article class="card lcard"><span class="num">KURAL 1</span><h2>Hızına göre şerit</h2>${DIA.serit}<p>Sağ şerit 50, orta şeritler 70, sol şerit 90 civarı gidenler için. Sol şerit sollama içindir, sollayınca sağa dönülür. Böylece yavaş ve hızlı araç aynı şeritte karşılaşmaz, sürekli fren ve şerit değiştirme azalır.</p><button type="button" class="btn tint" data-scn="sol-serit">Simülasyonda gör</button></article>
  <article class="card lcard"><span class="num">KURAL 2</span><h2>Sağa dönüş cebi</h2>${DIA.cep}<p>Sağa dönecek araç erkenden sağa geçer ve yavaşlamayı ana yolda değil, ayrı bir cepte yapar. Rampa dolarsa kuyruk cepte bekler, düz gidenler durmaz.</p><button type="button" class="btn tint" data-scn="kopru">Simülasyonda gör</button></article>
  <article class="card lcard"><span class="num">KURAL 3</span><h2>Daralmada fermuar</h2>${DIA.fermuar}<p>Kapanan şerit sonuna kadar kullanılır, birleşme noktasında araçlar birer birer sırayla geçer. Son anda zorla girme ve gereksiz erken sıkışma ortadan kalkar.</p><button type="button" class="btn tint" data-scn="daralma">Simülasyonda gör</button></article>
  <article class="card lcard"><span class="num">KURAL 4</span><h2>Mesafe ve öngörü</h2>${DIA.mesafe}<p>Önündeki aracın önünü de izle, freni erken ve yumuşak yap. Mesafe bırakan sürücü bir fren dalgasını kendinden sonrakilere büyütmeden söndürür.</p><button type="button" class="btn tint" data-scn="hayalet">Simülasyonda gör</button></article>
  <article class="card lcard wide"><h2>Trafik neden sıkışır?</h2><div class="twocol">
    <ul><li><b>Kapasite:</b> Bir şerit saatte yaklaşık 1.800-2.200 araç taşır. Talep bunu aşınca kuyruk kaçınılmazdır.</li><li><b>Fren dalgası:</b> Yakın takipte her fren arkadakine daha sert geçer. Önde hiçbir şey yokken araçlar durur.</li><li><b>Şerit kesme:</b> Son anda birkaç şeridi çapraz geçmek, o şeritlerin hepsini aynı anda yavaşlatır.</li></ul>
    <ul><li><b>Hız karışıklığı:</b> 50 ile giden ve 90 ile gelmek isteyen aynı şeritte olunca sürekli sollama ve fren olur.</li><li><b>Taşan kuyruk:</b> Rampa veya ışık önündeki kuyruk ana yola taşarsa düz gidenler de durur.</li><li><b>Merak yavaşlaması:</b> Kaza olan şeridin yanındaki şeritler de bakmak için yavaşlar.</li></ul>
  </div></article>
  <article class="card lcard wide"><h2>Hava trafiği nasıl etkiler?</h2><p>Islak ve buzlu yolda lastik daha az tutunur, sürücüler daha yavaş gider ve daha geç görür. Araştırmalarda hafif yağmurda yol kapasitesinin birkaç yüzde, sağanak ve karda ise yüzde 10-30 ve üzerinde düştüğü görülüyor. Simülasyonda kullanılan değerler:</p>
    <div class="tablewrap"><table><thead><tr><th>Hava</th><th>Hız</th><th>Takip süresi</th><th>En sert fren</th><th>Önerilen mesafe</th></tr></thead><tbody>${wrows}</tbody></table></div>
    <div><button type="button" class="btn tint" data-scn="yagmur-zirve">Yağmurlu zirveyi izle</button></div></article>
  <article class="card lcard do"><h3>Yapılmalı</h3><ul><li>Sağdan git, sollayınca sağa dön.</li><li>Çıkışını en az 1 km önceden planla.</li><li>Yavaşlamayı cepte veya çıkış şeridinde yap.</li><li>Kuru yolda 2, yağmurda 4, karda 6 saniye mesafe bırak.</li><li>Daralmada sırayla gir, sıra sendeyse yol ver.</li><li>Fren yerine gazdan erken ayağını çek.</li></ul></article>
  <article class="card lcard dont"><h3>Yapılmamalı</h3><ul><li>Sol şeritte yavaş gitmek.</li><li>Son 200-300 metrede birden fazla şerit kesmek.</li><li>Çıkışı kaçırınca yolda durmak. Bir sonrakinden dön.</li><li>Önündekine yapışmak, zikzak çizmek.</li><li>Kaza görünce yavaşlayıp bakmak.</li><li>Yağmurda ani fren ve ani direksiyon.</li></ul></article>
  <article class="card lcard"><h3>Şehirler ne yapabilir?</h3><ul><li>Şerit üstü tabelalarla hız sınıflı şeritler.</li><li>Her önemli sağa dönüşte kuyruğa göre boyutlandırılmış cep.</li><li>Çıkışlardan 1 km ve 500 m önce şerit yönlendirmesi.</li><li>Kuyruk sensörlü rampa ışıkları.</li><li>Yoğunlukta ve yağışta değişken hız limiti.</li><li>Kaza ve arızaya hızlı müdahale ekipleri.</li></ul></article>
  <article class="card lcard"><h3>Bu model nasıl çalışıyor?</h3><p>Her araç, trafik araştırmalarında yaygın kullanılan Akıllı Sürücü Modeli (IDM) ile hızlanıp frenliyor. Şerit değişimi “bana kazanç var mı, arkadakini sert frene zorluyor muyum?” sorusuyla karar veriliyor. İki yola aynı sürücüler aynı sırayla gönderiliyor, sadece kurallar değişiyor.</p><p>Sayılar eğilimi gösterir. Gerçek bir yol için karar vermeden önce model o yolun sayım verileriyle ayarlanmalı. Darboğaz ve kaza senaryolarında önerilen düzen yolculuğu çoğu zaman kısaltmaz, ama sert frenleri belirgin şekilde azaltır. Bunu saklamıyoruz.</p></article>`;
  $$('#learn [data-scn]').forEach((b) => b.addEventListener('click', () => { loadScenario(b.dataset.scn, true); go('simulasyon'); }));
}

// ---------- gezinme ----------
const VIEWS = ['simulasyon', 'senaryolar', 'ogren'];
function go(v, fromHash) {
  if (!VIEWS.includes(v)) v = 'simulasyon';
  route = v;
  $$('[data-view]').forEach((s) => (s.hidden = s.id !== 'v-' + v));
  $$('[data-nav] button').forEach((b) => (b.getAttribute('data-go') === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  if (!fromHash && location.hash !== '#' + v) { try { history.replaceState(null, '', '#' + v); } catch (e) {} }
  if (v === 'simulasyon') { layout(); updateStats(true); }
  if (v === 'senaryolar') renderCards();
  if (!fromHash) window.scrollTo(0, 0);
}
$$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.getAttribute('data-go'))));
window.addEventListener('hashchange', () => go(location.hash.slice(1), true));

// ---------- tema ve boyut ----------
const retheme = () => { readTokens(); if (S.rings) S.st = S.st.map(() => mkST()); if (route === 'senaryolar') renderCards(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', retheme);
new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
let rz = null;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { layout(); if (route === 'senaryolar') renderCards(); }, 120); });

// ---------- döngü ----------
let last = performance.now(), acc = 0, uiT = 0, wall = 0;
function frame(now) {
  const rdt = Math.min(0.05, (now - last) / 1000); last = now; wall += rdt;
  if (route === 'simulasyon' && S.scn) {
    if (S.warm > 0) { warmStep(); acc = 0; }
    else if (S.playing) {
      acc += rdt * SPEEDS[S.speedIdx];
      let n = 0;
      while (acc >= 0.1 && n < 60) { stepAll(0.1); acc -= 0.1; n++; }
      if (n >= 60) acc = 0;
    }
    draw(S.playing ? simT() : wall);
    uiT += rdt; if (uiT > 0.5) { uiT = 0; updateStats(); }
  }
  requestAnimationFrame(frame);
}

// ---------- başlat ----------
renderFilters(); renderLearn();
const startView = location.hash.slice(1);
go(VIEWS.includes(startView) ? startView : 'simulasyon', true);
loadScenario(store.get('scn', SCN[0].id), true);
if (route === 'senaryolar') renderCards();
requestAnimationFrame(frame);
})();
