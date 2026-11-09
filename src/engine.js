// ===== Akış — trafik motoru (IDM + MOBIL benzeri şerit değiştirme) =====
const KMH = 1 / 3.6;
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEATHER = {
  acik:    { ad: 'Açık hava',      vf: 1.00, T: 1.3, a: 1.6, b: 2.0, bmax: 8.0, s0: 2.0, rec: 2 },
  yagmur:  { ad: 'Yağmur',         vf: 0.90, T: 1.6, a: 1.3, b: 1.7, bmax: 6.5, s0: 2.5, rec: 4 },
  saganak: { ad: 'Sağanak',        vf: 0.75, T: 2.0, a: 1.1, b: 1.5, bmax: 5.0, s0: 3.0, rec: 4 },
  kar:     { ad: 'Kar / buzlanma', vf: 0.60, T: 2.6, a: 0.7, b: 1.0, bmax: 3.0, s0: 4.0, rec: 6 },
  sis:     { ad: 'Sis',            vf: 0.70, T: 2.1, a: 1.4, b: 1.8, bmax: 7.0, s0: 3.0, rec: 4 },
};
const ENV = { w: WEATHER.acik };

function idm(v, v0, T, a, b, s0, gap, dv) {
  const r = v / Math.max(v0, 0.5);
  const free = r <= 1 ? a * (1 - r * r * r * r) : -b * (1 - 1 / (r * r));
  if (!isFinite(gap)) return free;
  const ss = s0 + Math.max(0, v * T + (v * dv) / (2 * Math.sqrt(a * b)));
  const g = Math.max(gap, 0.2);
  return free - a * (ss / g) * (ss / g);
}

class Arrivals {
  constructor(seed, opts) { this.r = rng(seed); this.list = []; this.t = 0; this.opts = opts; this.id = 0; }
  ensure(T) {
    const r = this.r;
    while (this.t < T) {
      const rate = Math.max(300, this.opts.demand) / 3600;
      const h0 = 0.15;
      this.t += h0 + -Math.log(1 - r()) * Math.max(0.05, 1 / rate - h0);
      const truck = r() < 0.07;
      const u = r();
      const cls = truck ? 0 : u < 0.33 ? 0 : u < 0.75 ? 1 : 2;
      let v0 = ([50, 70, 90][cls] + (r() - 0.5) * 10) * KMH;
      if (truck) v0 = Math.min(v0, 48 * KMH);
      this.list.push({
        id: this.id++, t: this.t, cls, v0, truck, len: truck ? 12 : 4.5,
        exit: r() < this.opts.exitFrac,
        camper: cls < 2 && r() < (cls === 0 ? 0.5 : 0.3),
        tail: r() < 0.2, polite: r() < 0.25, late: r() < 0.5,
        look: 120 + r() * 200, laneR: r(), aMul: truck ? 0.55 : 1, col: r(), bus: truck && r() < 0.4,
      });
    }
  }
}

class Sim {
  constructor(cfg, policy, arr, seed, measures, arr2) {
    this.c = cfg; this.p = policy; this.sys = policy === 'sistem'; this.arr = arr; this.arr2 = arr2 || null;
    const all = { serit: true, cep: true, fermuar: true, vsl: true, rampa: true };
    this.m = this.sys ? Object.assign(all, measures || {}) : { serit: false, cep: false, fermuar: false, vsl: false, rampa: false };
    this.idx2 = 0; this.rq = []; this.meterNext = 0; this.meterH = 1.5; this.zt = 0; this.za = {}; this.mt = 0;
    this.r = rng(seed || 7);
    this.idx = 0; this.t = 0; this.veh = []; this.queue = []; this.ramp = [];
    this.done = []; this.hb = []; this.crit = 0; this.missed = 0; this.lcCount = 0; this.L = [];
    this.blocks = []; this.exits = [];
  }
  laneExists(l, x) {
    const c = this.c;
    if (l >= c.lanes || l < -1) return false;
    if (l === -1) return (this.m.cep && !!c.pocket && x >= c.pocket[0] && x <= c.exitX) || (!!c.onramp && x >= c.onramp.x && x <= c.onramp.x + c.onramp.len);
    if (c.drop && l === c.drop.lane && x > c.drop.x) return false;
    return true;
  }
  activeBlocks() { const t = this.t; return this.blocks.filter((b) => t >= b.t0 && t < b.t1); }
  blockedAhead(l, x, dist) {
    for (const b of this._ab || []) if (b.lane === l && b.x + b.len > x - 2 && b.x - x < dist) return true;
    return false;
  }
  addBlock(b) { this.blocks.push(Object.assign({ len: 10, t0: this.t, t1: Infinity, kind: 'kaza' }, b)); }
  brakeNear(x) {
    let best = null, bd = 1e9;
    for (const v of this.veh) { const d = Math.abs(v.x - x); if (d < bd && v.v > 5) { bd = d; best = v; } }
    if (best) best.fb = this.t + 2.2;
    return best ? best.id : null;
  }
  brakeId(id) { for (const v of this.veh) if (v.id === id) { v.fb = this.t + 2.2; return true; } return false; }
  exitLane() { return this.m.cep && this.c.pocket ? -1 : 0; }
  rampSpace() {
    if (!this.c.ramp) return true;
    const r = this.ramp;
    if (!r.length) return true;
    const last = r[r.length - 1];
    return last.s - last.len > 3;
  }
  green() { const R = this.c.ramp; return R ? this.t % R.cycle < R.green : true; }
  classLane(cls, lane, x) {
    const c = this.c, N = c.lanes;
    let lo = 0;
    if (c.drop && x > c.drop.x - 400) lo = c.drop.lane + 1;
    const hi = N - 1;
    if (cls === 0) return lo;
    if (cls === 2) return hi;
    let best = Math.min(hi, lo + 1);
    for (let l = lo + 1; l < hi; l++) if (Math.abs(l - lane) < Math.abs(best - lane)) best = l;
    return best;
  }
  nb(l, x) {
    const a = this.L[l + 1];
    if (!a) return { lead: null, fol: null };
    let lo = 0, hi = a.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].x > x) lo = m + 1; else hi = m; }
    return { lead: lo > 0 ? a[lo - 1] : null, fol: lo < a.length ? a[lo] : null };
  }
  stopFor(v, l) {
    const c = this.c;
    let s = Infinity;
    if (c.drop && l === c.drop.lane && v.x < c.drop.x) s = c.drop.x;
    if (c.onramp && l === -1 && v.x < c.onramp.x + c.onramp.len && v.x > c.onramp.x - 1) s = Math.min(s, c.onramp.x + c.onramp.len);
    for (const b of this._ab || []) if (b.lane === l && v.x < b.x + 0.5 && b.x < s) s = b.x;
    if (c.exitX !== undefined && v.exit && v.x < c.exitX + 0.5) {
      const el = this.exitLane();
      if (l !== el && !(this.m.cep && l === 0)) s = Math.min(s, c.exitX);
      else if (c.ramp && !this.rampSpace()) s = Math.min(s, c.exitX);
    }
    return s;
  }
  v0For(v, l) {
    const W = ENV.w, c = this.c;
    let v0 = v.v0 * W.vf;
    if (v.exit && c.exitX !== undefined) {
      const d = c.exitX - v.x;
      if (l === this.exitLane() && d < 160) v0 = Math.min(v0, 30 * KMH * W.vf);
      else if (this.m.cep && l === 0 && c.pocket && d < 420) v0 = Math.min(v0, 45 * KMH * W.vf);
    }
    if (this.m.vsl && c.vslZones) for (let i = 0; i < c.vslZones.length; i++) { const z = c.vslZones[i]; if (this.za[i] && v.x > z.from && v.x < z.to) v0 = Math.min(v0, z.lim * KMH * W.vf); }
    if (this.m.vsl && c.vsl && v.x > c.vsl[0] && v.x < c.vsl[1]) v0 = Math.min(v0, c.vsl[2] * KMH * W.vf);
    for (const b of this._ab || []) {
      const d = b.x - v.x;
      if (d < 90 && d > -b.len - 25) v0 = Math.min(v0, (b.kind === 'calisma' ? 50 : 40) * KMH * W.vf);
      else if (this.m.vsl && d >= 90 && d < 400) v0 = Math.min(v0, 60 * KMH * W.vf);
    }
    return v0;
  }
  accIn(v, l, lead) {
    const W = ENV.w;
    const T = W.T * (v.tail ? 0.6 : 1);
    let gap = Infinity, dv = 0;
    if (lead) { gap = lead.x - lead.len - v.x; dv = v.v - lead.v; }
    const st = this.stopFor(v, l);
    if (st < Infinity) { const g2 = st - v.x; if (g2 < gap) { gap = g2; dv = v.v; } }
    return idm(v.v, this.v0For(v, l), T, W.a * v.aMul, W.b, W.s0, gap, dv);
  }
  trySpawn(d) {
    const c = this.c, W = ENV.w, N = c.lanes;
    let order = [];
    if (this.m.serit) {
      const dl = d.exit && c.exitX !== undefined && this.m.cep ? 0 : this.classLane(d.cls, 0, 0);
      order = [...Array(N).keys()].sort((a, b) => Math.abs(a - dl) - Math.abs(b - dl));
    } else {
      order = d.camper ? [N - 1, N - 2] : [Math.min(N - 1, Math.floor(d.laneR * N))];
      for (let l = 0; l < N; l++) if (!order.includes(l)) order.push(l);
    }
    for (const l of order) {
      const arr = this.L[l + 1];
      const last = arr[arr.length - 1];
      const v0 = d.v0 * W.vf;
      let vs = v0;
      if (last) {
        const gap = last.x - last.len;
        if (gap < W.s0 + 3) continue;
        const safe = Math.max(0, (gap - W.s0) / Math.max(0.8, W.T));
        vs = Math.min(v0, Math.max(last.v, 0) + 2, safe);
      }
      const v = Object.assign({}, d, { x: 0, lane: l, v: Math.max(0, vs), acc: 0, accDes: 0, lc: this.r() * 0.5, cool: 1, y: l, want: null, hbc: 0, cc: 0, wait: 0 });
      this.veh.push(v); arr.push(v);
      return true;
    }
    return false;
  }
  tryLC(v) {
    const c = this.c, M = this.m;
    let need = 0, urg = 0, bsafe = M.serit ? 3 : 4;
    const p = M.serit ? 0.5 : 0.1, thr = M.serit ? 0.15 : 0.3;
    if (v.onr && v.lane === -1 && c.onramp) {
      const end = c.onramp.x + c.onramp.len, d = end - v.x;
      need = 1; urg = 1 + 6 * Math.max(0, 1 - d / c.onramp.len); bsafe = M.fermuar ? 3.5 : 5.5;
    }
    if (v.exit && c.exitX !== undefined && v.x < c.exitX) {
      const d = c.exitX - v.x, zone = M.cep ? 1e9 : v.look, el = this.exitLane();
      if (d < zone && v.lane > el) {
        need = -1; urg = (M.cep ? 1 : 2) + 5 * (1 - d / zone); if (!M.cep) bsafe = 6;
        // kaçırma: sistemde "kaçırdıysan devam et", bugün ise uzun süre bekleyip pes eder
        if ((M.cep && d < 40 && v.lane > el + 1) || (!M.cep && v.wait > 25)) { v.exit = false; v.missed = true; this.missed++; need = 0; urg = 0; v.want = null; }
      }
    }
    if (c.drop && v.lane === c.drop.lane && v.x < c.drop.x) {
      const d = c.drop.x - v.x, zone = M.fermuar ? 220 : v.late ? 70 : 600;
      if (d < zone) { need = 1; urg = 1.5 + 5 * (1 - d / zone); if (!M.fermuar && v.late) bsafe = 6.5; }
    }
    for (const b of this._ab || []) {
      if (b.lane !== v.lane || b.x < v.x - 0.5) continue;
      const d = b.x - v.x, zone = M.fermuar ? 200 : v.late ? 60 : 450;
      if (d >= zone) continue;
      if (v.bdir === undefined || !this.laneExists(v.lane + v.bdir, v.x) || this.blockedAhead(v.lane + v.bdir, v.x, d + 15)) {
        const opts = [-1, 1].filter((s) => this.laneExists(v.lane + s, v.x) && v.lane + s >= 0 && !this.blockedAhead(v.lane + s, v.x, d + 15));
        if (!opts.length) break;
        if (opts.length === 2) {
          const sc = (s) => { const { lead, fol } = this.nb(v.lane + s, v.x); return (lead ? lead.x - v.x : 200) + (fol ? v.x - fol.x : 200); };
          v.bdir = sc(-1) >= sc(1) ? -1 : 1;
        } else v.bdir = opts[0];
      }
      need = v.bdir; urg = 1.5 + 5 * (1 - d / zone); if (!M.fermuar && v.late) bsafe = 6.5;
      break;
    }
    if (!M.serit && v.camper && need === 0) { v.want = null; return; }
    const dl = M.serit && v.lane >= 0 ? this.classLane(v.cls, v.lane, v.x) : null;
    let best = null, bestInc = -1e9;
    for (const l of [v.lane - 1, v.lane + 1]) {
      if (!this.laneExists(l, v.x)) continue;
      if (l === -1 && !(v.exit && M.cep && c.pocket && v.x >= c.pocket[0])) continue;
      if (need !== 0 && Math.sign(l - v.lane) !== need) continue;
      if (this.blockedAhead(l, v.x, need !== 0 ? 25 : 260)) continue;
      const { lead, fol } = this.nb(l, v.x);
      const mg = v.v < 3 ? 0.8 : 1.5;
      if (lead && lead.x - lead.len - v.x < mg) continue;
      if (fol && v.x - v.len - fol.x < mg) continue;
      let aFN = 0, aFO = 0;
      if (fol) { aFN = this.accIn(fol, l, v); if (aFN < -bsafe) continue; aFO = fol.accDes; }
      const aNew = this.accIn(v, l, lead);
      if (aNew < -bsafe - (need ? 1.5 : 0)) continue;
      let inc = aNew - v.accDes + p * (aFN - aFO);
      if (need !== 0) inc += urg;
      else if (M.serit && dl !== null) inc += Math.abs(l - dl) < Math.abs(v.lane - dl) ? 0.45 : -0.45;
      if (inc > thr && inc > bestInc) { best = l; bestInc = inc; }
    }
    if (best !== null) { v.lane = best; v.cool = M.serit ? 3 : 1.5; v.want = null; this.lcCount++; if (v.onr && best >= 0) v.onr = false; }
    else if (need !== 0) { v.want = v.lane + need; }
    else v.want = null;
  }
  step(dt) {
    const c = this.c, W = ENV.w, sys = this.sys;
    this.t += dt;
    this._ab = this.activeBlocks();
    this.arr.ensure(this.t + 2);
    const list = this.arr.list;
    while (this.idx < list.length && list[this.idx].t <= this.t) this.queue.push(list[this.idx++]);
    const L = []; for (let k = 0; k <= c.lanes; k++) L.push([]);
    for (const v of this.veh) L[v.lane + 1].push(v);
    for (const a of L) { a.sort((p, q) => q.x - p.x); a.forEach((v, i) => (v.k = i)); }
    this.L = L;
    if (this.queue.length) {
      const keep = [];
      for (const d of this.queue) if (!this.trySpawn(d)) keep.push(d);
      this.queue = keep;
      for (const a of L) a.forEach((v, i) => (v.k = i));
    }
    if (c.onramp && this.arr2) { this.rampFeed(L); L[0].sort((p, q) => q.x - p.x); L[0].forEach((v, i) => (v.k = i)); }
    this.mt -= dt; this.zt -= dt;
    if (this.zt <= 0 && c.vslZones) {
      this.zt = 2;
      c.vslZones.forEach((z, i) => {
        const s = this.avgSpeed(z.watch[0], z.watch[1], 0, c.lanes - 1);
        if (s !== null) { if (s < z.on * KMH * W.vf) this.za[i] = true; else if (s > z.off * KMH * W.vf) this.za[i] = false; }
      });
    }
    // yol verme talepleri
    const wl = {};
    for (const v of this.veh) if (v.want !== null) (wl[v.want] || (wl[v.want] = [])).push(v);
    const hbThr = -Math.min(3, 0.85 * W.bmax);
    for (const v of this.veh) {
      const lead = v.k > 0 ? L[v.lane + 1][v.k - 1] : null;
      let a = this.accIn(v, v.lane, lead);
      const ws = wl[v.lane];
      if (ws && (this.m.fermuar || v.polite)) {
        for (const w of ws) {
          const d = w.x - v.x;
          if (d > w.len + 1 && d < 50 && (!lead || w.x < lead.x)) {
            const a2 = this.accIn(v, v.lane, w);
            if (a2 > -2.5 && a2 < a) a = a2;
          }
        }
      }
      v.accDes = a;
    }
    for (const v of this.veh) {
      v.cool -= dt; v.lc -= dt;
      v.wait = v.want !== null && v.v < 0.6 ? v.wait + dt : 0;
      if (v.cool <= 0 && v.lc <= 0) { v.lc = 0.4 + this.r() * 0.3; this.tryLC(v); }
    }
    const t = this.t;
    for (const v of this.veh) {
      let a = v.accDes;
      if (v.fb && v.fb > t) a = Math.min(a, -6);
      if (a < -W.bmax - 0.5 && v.cc <= 0) { this.crit++; v.cc = 3; }
      a = Math.max(-W.bmax, Math.min(a, W.a));
      v.hbc -= dt; v.cc -= dt;
      if (a < hbThr && v.hbc <= 0) { this.hb.push(t); v.hbc = 2.5; }
      v.acc = a;
      v.v = Math.max(0, v.v + a * dt);
      v.x += v.v * dt;
      v.y += (v.lane - v.y) * Math.min(1, dt * 2.2);
    }
    // çarpışmayı önle (aynı şeritte)
    const L2 = []; for (let k = 0; k <= c.lanes; k++) L2.push([]);
    for (const v of this.veh) L2[v.lane + 1].push(v);
    for (const a of L2) {
      a.sort((p, q) => q.x - p.x);
      for (let i = 1; i < a.length; i++) {
        const ld = a[i - 1], f = a[i];
        const lim = ld.x - ld.len - 0.3;
        if (f.x > lim) { f.x = lim; f.v = Math.min(f.v, ld.v); }
      }
    }
    // çıkışlar
    const keep = [];
    for (const v of this.veh) {
      if (v.x >= c.L) { this.done.push({ t, tt: t - v.t, ex: false }); continue; }
      if (v.exit && c.exitX !== undefined && (v.lane === this.exitLane() || (this.m.cep && v.lane === 0)) && v.x >= c.exitX - 0.6) {
        if (c.ramp) {
          if (this.rampSpace()) { this.ramp.push({ s: 0, v: v.v, a: 0, len: v.len, t0: v.t, truck: v.truck, bus: v.bus, col: v.col, id: v.id }); continue; }
        } else {
          this.done.push({ t, tt: t - v.t, ex: true });
          this.exits.push({ x: v.x, y: v.y, v: Math.max(v.v, 3), t, id: v.id, truck: v.truck, bus: v.bus, col: v.col, len: v.len });
          if (this.exits.length > 40) this.exits.shift();
          continue;
        }
      }
      keep.push(v);
    }
    this.veh = keep;
    if (c.ramp) {
      const R = c.ramp.R, g = this.green(), rk = [];
      for (let i = 0; i < this.ramp.length; i++) {
        const r = this.ramp[i], ld = i > 0 ? this.ramp[i - 1] : null;
        let gap = ld ? ld.s - ld.len - r.s : Infinity, dv = ld ? r.v - ld.v : 0;
        if (!g && R - r.s < gap && r.s < R) { gap = R - r.s; dv = r.v; }
        const a = Math.max(-W.bmax, Math.min(W.a, idm(r.v, 35 * KMH * W.vf, W.T, W.a, W.b, W.s0, gap, dv)));
        r.a = a;
        r.v = Math.max(0, r.v + a * dt);
        r.s += r.v * dt;
        if (ld && r.s > ld.s - ld.len - 0.3) { r.s = ld.s - ld.len - 0.3; r.v = Math.min(r.v, ld.v); }
        if (r.s >= R && g) { this.done.push({ t, tt: t - r.t0, ex: true }); continue; }
        if (r.s > R && !g) { r.s = R; r.v = 0; }
        rk.push(r);
      }
      this.ramp = rk;
    }
  }
  avgSpeed(x0, x1, l0, l1) {
    let s = 0, n = 0;
    for (const v of this.veh) if (v.x >= x0 && v.x <= x1 && v.lane >= l0 && v.lane <= l1) { s += v.v; n++; }
    return n ? s / n : null;
  }
  rampFeed(L) {
    const c = this.c, o = c.onramp, W = ENV.w;
    this.arr2.ensure(this.t + 2);
    const l2 = this.arr2.list;
    while (this.idx2 < l2.length && l2[this.idx2].t <= this.t) this.rq.push(l2[this.idx2++]);
    if (this.m.rampa && this.mt <= 0) {
      this.mt = 3;
      const s = this.avgSpeed(o.x - 300, o.x + o.len + 250, 0, 1);
      const k = s === null ? 99 : s / KMH / W.vf;
      this.meterH = k < 40 ? 6 : k < 55 ? 4 : k < 70 ? 2.6 : 1.4;
      if (this.rq.length > 30) this.meterH = Math.min(this.meterH, 1.6);
    }
    if (!this.rq.length || this.t < this.meterNext) return;
    const lane = L[0];
    let last = null;
    for (const v of lane) if (v.x >= o.x - 5 && v.x < o.x + 40 && (!last || v.x < last.x)) last = v;
    if (last && last.x - last.len - o.x < W.s0 + 4) return;
    const d = this.rq.shift();
    const vs = Math.min(d.v0 * W.vf, 45 * KMH * W.vf, last ? Math.max(0, last.v + 1) : 99);
    const v = Object.assign({}, d, { x: o.x, lane: -1, v: vs, acc: 0, accDes: 0, lc: 0.2, cool: 0.3, y: -1, want: null, hbc: 0, cc: 0, wait: 0, onr: true, exit: false, camper: false });
    this.veh.push(v); lane.push(v);
    this.meterNext = this.t + (this.m.rampa ? this.meterH : 0.8);
  }
  stats() {
    const t = this.t, win = 120;
    while (this.done.length > 2000) this.done.shift();
    while (this.hb.length && this.hb[0] < t - win) this.hb.shift();
    const span = Math.min(win, t) / 60 || 1;
    let n = 0; for (let i = this.done.length - 1; i >= 0 && this.done[i].t > t - win; i--) n++;
    const last = this.done.slice(-200);
    const tt = last.length ? last.reduce((s, d) => s + d.tt, 0) / last.length : 0;
    let sv = 0, st = 0;
    for (const v of this.veh) { sv += v.v; if (v.v < 1.5) st++; }
    for (const r of this.ramp) if (r.v < 1.5) st++;
    return {
      flow: n / span, tt, spd: this.veh.length ? (sv / this.veh.length) / KMH : 0,
      stopped: st, queue: this.queue.length, hb: this.hb.length / span, crit: this.crit,
      count: this.veh.length + this.ramp.length, missed: this.missed, rampQ: this.rq.length,
    };
  }
}

class Ring {
  constructor(n, C, mode, seed) {
    this.C = C; this.mode = mode; this.r = rng(seed || 3); this.t = 0; this.stops = 0; this.pert = null;
    this.cars = [];
    for (let i = 0; i < n; i++) this.cars.push({ x: (i * C) / n, v: 8, a: 0, len: 4.5, st: false, col: (i * 0.618) % 1 });
  }
  params() {
    const W = ENV.w;
    if (this.mode === 'yakin') return { T: Math.max(0.8, W.T * 0.6), tau: 0.9, noise: 0.35 };
    if (this.mode === 'guvenli') return { T: W.T * 1.6, tau: 0.6, noise: 0.2 };
    return { T: W.T, tau: 0.25, noise: 0.05, smart: true };
  }
  brake(i) { if (i === undefined) i = Math.floor(this.r() * this.cars.length); this.pert = { i: i % this.cars.length, t: 2.5 }; return i; }
  step(dt) {
    const W = ENV.w, P = this.params(), n = this.cars.length, C = this.C;
    this.t += dt;
    const des = new Array(n);
    for (let i = 0; i < n; i++) {
      const c = this.cars[i], l = this.cars[(i + 1) % n];
      const gap = ((l.x - c.x + C) % C) - l.len;
      let a = idm(c.v, 72 * KMH * W.vf, P.T, W.a, W.b, W.s0, gap, c.v - l.v);
      if (P.smart) {
        const l2 = this.cars[(i + 2) % n];
        const gap2 = ((l2.x - c.x + C) % C) - l2.len - l.len;
        const a2 = idm(c.v, 72 * KMH * W.vf, P.T, W.a, W.b, W.s0 * 2, gap2, c.v - l2.v);
        a = Math.min(a, 0.5 * (a + a2) + 0.2);
      }
      a += (this.r() - 0.5) * 2 * P.noise;
      if (this.pert && this.pert.i === i) a = -4.5;
      des[i] = a;
    }
    if (this.pert) { this.pert.t -= dt; if (this.pert.t <= 0) this.pert = null; }
    for (let i = 0; i < n; i++) {
      const c = this.cars[i];
      c.a += (des[i] - c.a) * Math.min(1, dt / P.tau);
      c.a = Math.max(-W.bmax, Math.min(W.a, c.a));
      c.v = Math.max(0, c.v + c.a * dt);
      c.x = (c.x + c.v * dt) % C;
    }
    for (let i = 0; i < n; i++) {
      const c = this.cars[i], l = this.cars[(i + 1) % n];
      const gap = ((l.x - c.x + C) % C) - l.len;
      if (gap < 0.4) { c.x = (l.x - l.len - 0.4 + C) % C; c.v = Math.min(c.v, l.v); }
      const s = c.v < 0.8;
      if (s && !c.st) this.stops++;
      c.st = s;
    }
  }
}

if (typeof module !== 'undefined') module.exports = { Sim, Ring, Arrivals, ENV, WEATHER, KMH };
