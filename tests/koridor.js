const { Sim, Arrivals, ENV, WEATHER } = require('../src/engine.js');
const cfg = { L: 3000, lanes: +process.argv[3] || 5, onramp: { x: 700, len: 250 }, exitX: 1750, pocket: [1450, 1750], drop: { lane: 0, x: 2550 },
  vslZones: [{ from: 1700, to: 2400, watch: [2350, 2650], lim: 70, on: 45, off: 62 }, { from: 250, to: 650, watch: [650, 1050], lim: 70, on: 45, off: 62 }] };
const D = +process.argv[2] || 6800, RD = +process.argv[4] || 1400;
ENV.w = WEATHER[process.argv[5] || 'acik'];
const combos = { hepsi: {}, yalnizSerit: { cep: false, fermuar: false, vsl: false, rampa: false }, yalnizRampa: { serit: false, cep: false, fermuar: false, vsl: false },
  yalnizFermuar: { serit: false, cep: false, vsl: false, rampa: false }, yalnizVsl: { serit: false, cep: false, fermuar: false, rampa: false }, rampasiz: { rampa: false } };
const f = (o) => ['flow', 'tt', 'spd', 'stopped', 'hb', 'queue', 'rampQ'].map((k) => k + '=' + (o[k] || 0).toFixed(1)).join(' ');
let first = true;
for (const [name, m] of Object.entries(combos)) {
  const arr = new Arrivals(42, { demand: D, exitFrac: 0.15 }), arr2 = new Arrivals(77, { demand: RD, exitFrac: 0 });
  const a = new Sim(cfg, 'bugun', arr, 11, null, arr2), b = new Sim(cfg, 'sistem', arr, 11, m, arr2);
  const t0 = Date.now();
  for (let i = 0; i < 6000; i++) { a.step(0.1); b.step(0.1); }
  if (first) { console.log('bugün      ', f(a.stats()), (Date.now() - t0) + 'ms'); first = false; }
  console.log(name.padEnd(11), f(b.stats()));
}
