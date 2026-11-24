'use strict';
// Scramble: pure game logic (testable in node) plus a thin canvas/DOM layer.
const W = 800, H = 400, SHIP_W = 24, SHIP_H = 10;
const SPEED = 2, FUEL_MAX = 100, FUEL_BURN = 0.012, FUEL_PICKUP = 40;

// Terrain is a pure function of world x, so no storage is needed.
function floorY(x) { return H - (70 + 35 * Math.sin(x / 180) + 22 * Math.sin(x / 67 + 1)); }
function ceilY(x) { return 28 + 18 * Math.sin(x / 230 + 2) + 10 * Math.sin(x / 90); }

// Deterministic per-slot hash -> 0..1
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

const SLOT = 130;
function entityForSlot(i) {
  const r = hash(i), x = i * SLOT + 40;
  if (i < 4 || r < 0.3) return null;
  const kind = r < 0.55 ? 'fuel' : r < 0.85 ? 'rocket' : 'base';
  return { kind, x, y: floorY(x), w: 20, h: 22, alive: true, launched: false, vy: 0 };
}

function rectHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function newGame() {
  return { scroll: 0, ship: { x: 100, y: 180 }, fuel: FUEL_MAX, lives: 3, score: 0,
    ents: new Map(), shots: [], bombs: [], booms: [], over: false, level: 1, dead: 0 };
}

function shipHitsTerrain(sh, scroll) {
  for (const dx of [0, SHIP_W / 2, SHIP_W]) {
    const wx = scroll + sh.x + dx;
    if (sh.y < ceilY(wx) || sh.y + SHIP_H > floorY(wx)) return true;
  }
  return false;
}

function ensureEntities(g) {
  const first = Math.floor(g.scroll / SLOT) - 1, last = Math.ceil((g.scroll + W) / SLOT) + 1;
  for (let i = first; i <= last; i++) if (!g.ents.has(i)) g.ents.set(i, entityForSlot(i));
  for (const k of g.ents.keys()) if (k < first - 2) g.ents.delete(k);
}

function explode(g, x, y) { g.booms.push({ x, y, t: 0 }); }

function loseLife(g) {
  explode(g, g.ship.x + g.scroll, g.ship.y);
  g.lives--; g.dead = 60;
  if (g.lives <= 0) g.over = true;
}

// keys: {left,right,up,down}; fire/bomb are one-shot booleans.
function step(g, keys, fire, bomb) {
  if (g.over) { g.booms.forEach(b => b.t++); g.booms = g.booms.filter(b => b.t < 20); return; }
  if (g.dead > 0) {
    if (--g.dead === 0) { // respawn, keeping scroll and refilling fuel
      g.ship = { x: 100, y: (ceilY(g.scroll + 100) + floorY(g.scroll + 100)) / 2 };
      g.fuel = FUEL_MAX; g.shots = []; g.bombs = [];
    }
    g.booms.forEach(b => b.t++); g.booms = g.booms.filter(b => b.t < 20);
    return;
  }
  const sp = SPEED + (g.level - 1) * 0.3;
  g.scroll += sp; g.score += 1;
  const s = g.ship;
  if (keys.left) s.x -= 2; if (keys.right) s.x += 2;
  if (keys.up) s.y -= 2.5; if (keys.down) s.y += 2.5;
  s.x = Math.max(20, Math.min(W / 2, s.x));
  g.fuel -= FUEL_BURN * (1 + g.level * 0.1);
  if (g.fuel <= 0) { g.fuel = 0; s.y += 3; } // out of fuel: sink
  if (fire && g.shots.length < 4) g.shots.push({ x: s.x + SHIP_W, y: s.y + 3 });
  if (bomb && g.bombs.length < 3) g.bombs.push({ x: s.x + 8, y: s.y + SHIP_H, vx: sp, vy: 0 });

  ensureEntities(g);
  g.shots.forEach(b => b.x += 7);
  g.bombs.forEach(b => { b.vy += 0.15; b.y += b.vy; b.x += b.vx; });
  const ents = [...g.ents.values()].filter(e => e && e.alive);
  for (const e of ents) { // rockets launch when ship is near
    if (e.kind === 'rocket' && !e.launched && Math.abs(e.x - (g.scroll + s.x)) < 170) e.launched = true;
    if (e.launched) { e.vy = Math.min(e.vy + 0.08, 3.5); e.y -= e.vy;
    if (e.launched && e.y - e.h <= ceilY(e.x)) { e.alive = false; explode(g, e.x, e.y); } }
  }
  const screen = e => ({ x: e.x - g.scroll, y: e.y - e.h, w: e.w, h: e.h });
  const hitEnt = (px, py, r) => ents.find(e => e.alive && rectHit({ x: px - r, y: py - r, w: 2 * r, h: 2 * r }, screen(e)));
  const kill = e => { e.alive = false; g.score += e.kind === 'fuel' ? 150 : 100; if (e.kind === 'fuel') g.fuel = Math.min(FUEL_MAX, g.fuel + FUEL_PICKUP); explode(g, e.x, e.y - 10); };
  for (const b of g.shots) { const e = hitEnt(b.x, b.y, 2); if (e) { kill(e); b.x = W + 99; } }
  for (const b of g.bombs) {
    const e = hitEnt(b.x, b.y, 3);
    if (e) { kill(e); b.y = H + 99; } else if (b.y > floorY(b.x + g.scroll)) b.y = H + 99;
  }
  g.shots = g.shots.filter(b => b.x < W && b.y > ceilY(b.x + g.scroll) && b.y < floorY(b.x + g.scroll));
  g.bombs = g.bombs.filter(b => b.y < H);
  g.booms.forEach(b => b.t++); g.booms = g.booms.filter(b => b.t < 20);

  const sr = { x: s.x, y: s.y, w: SHIP_W, h: SHIP_H };
  if (shipHitsTerrain(s, g.scroll) || ents.some(e => e.alive && rectHit(sr, screen(e)))) loseLife(g);
  if (g.scroll > g.level * 8000) { g.level++; g.score += 1000; }
}

// ---- Browser layer ----
function start() {
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  let g = newGame(), fire = false, bomb = false;
  const keys = {}, map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  addEventListener('keydown', e => {
    if (map[e.key]) keys[map[e.key]] = true;
    if (e.key === ' ') fire = true;
    if (e.key === 'b' || e.key === 'B' || e.key === 'Control') bomb = true;
    if (e.key === 'Enter' && g.over) g = newGame();
    if (map[e.key] || e.key === ' ') e.preventDefault();
  });
  addEventListener('keyup', e => { if (map[e.key]) keys[map[e.key]] = false; });
  function draw() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#a52'; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) ctx.lineTo(x, floorY(x + g.scroll));
    ctx.lineTo(W, H); ctx.fill();
    ctx.fillStyle = '#25a'; ctx.beginPath(); ctx.moveTo(0, 0);
    for (let x = 0; x <= W; x += 4) ctx.lineTo(x, ceilY(x + g.scroll));
    ctx.lineTo(W, 0); ctx.fill();
    const col = { fuel: '#fd0', rocket: '#e33', base: '#3c3' };
    for (const e of g.ents.values()) if (e && e.alive) { ctx.fillStyle = col[e.kind]; ctx.fillRect(e.x - g.scroll, e.y - e.h, e.w, e.h); }
    ctx.fillStyle = '#fff';
    g.shots.forEach(b => ctx.fillRect(b.x, b.y, 10, 2));
    g.bombs.forEach(b => ctx.fillRect(b.x, b.y, 5, 5));
    if (!g.dead) { ctx.fillStyle = '#0ff'; ctx.fillRect(g.ship.x, g.ship.y, SHIP_W, SHIP_H); }
    ctx.fillStyle = '#fa0';
    g.booms.forEach(b => { ctx.beginPath(); ctx.arc(b.x - g.scroll, b.y, b.t * 1.5, 0, 7); ctx.fill(); });
    ctx.fillStyle = '#fff'; ctx.font = '14px monospace';
    ctx.fillText(`SCORE ${g.score}  LIVES ${g.lives}  LEVEL ${g.level}`, 10, H - 6);
    ctx.fillStyle = '#333'; ctx.fillRect(W - 210, H - 18, 200, 10);
    ctx.fillStyle = g.fuel < 25 ? '#f33' : '#fd0'; ctx.fillRect(W - 210, H - 18, 2 * g.fuel, 10);
    if (g.over) { ctx.fillStyle = '#fff'; ctx.font = '28px monospace'; ctx.fillText('GAME OVER - press Enter', 220, 200); }
  }
  (function loop() { step(g, keys, fire, bomb); fire = bomb = false; draw(); requestAnimationFrame(loop); })();
}

if (typeof module !== 'undefined') module.exports = { newGame, step, floorY, ceilY, entityForSlot, rectHit, shipHitsTerrain, W, H, FUEL_MAX };
else start();
