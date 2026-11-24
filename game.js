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

// ---- Rendering (vector sprites; no game logic) ----
function terrainPath(ctx, fn, edgeY, scroll) {
  ctx.beginPath(); ctx.moveTo(0, edgeY);
  for (let x = 0; x <= W; x += 2) ctx.lineTo(x, fn(x + scroll));
  ctx.lineTo(W, edgeY); ctx.closePath();
}

function drawTerrain(ctx, g) {
  const fl = ctx.createLinearGradient(0, 200, 0, H);
  fl.addColorStop(0, '#3a9d23'); fl.addColorStop(0.35, '#8a5a1e'); fl.addColorStop(1, '#3b230c');
  const ce = ctx.createLinearGradient(0, 0, 0, 80);
  ce.addColorStop(0, '#2a1a5e'); ce.addColorStop(1, '#6a3fb5');
  for (const [fn, edge, fill, line] of [[floorY, H, fl, '#9fff6a'], [ceilY, 0, ce, '#c9a8ff']]) {
    terrainPath(ctx, fn, edge, g.scroll); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
    for (let x = 0; x <= W; x += 2) ctx[x ? 'lineTo' : 'moveTo'](x, fn(x + g.scroll));
    ctx.stroke();
  }
}

function drawEntity(ctx, e, x) {
  const { y, w, h } = e, top = y - h;
  ctx.lineWidth = 1;
  if (e.kind === 'rocket') {
    ctx.fillStyle = '#d8d8e0'; ctx.beginPath(); // body with pointed nose
    ctx.moveTo(x + w / 2, top); ctx.lineTo(x + w * 0.75, top + 8); ctx.lineTo(x + w * 0.75, y - 3);
    ctx.lineTo(x + w * 0.25, y - 3); ctx.lineTo(x + w * 0.25, top + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e02020'; ctx.beginPath(); // nose cone + fins
    ctx.moveTo(x + w / 2, top); ctx.lineTo(x + w * 0.72, top + 8); ctx.lineTo(x + w * 0.28, top + 8); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w * 0.25, y - 10); ctx.lineTo(x, y); ctx.lineTo(x + w * 0.25, y - 3);
    ctx.moveTo(x + w * 0.75, y - 10); ctx.lineTo(x + w, y); ctx.lineTo(x + w * 0.75, y - 3); ctx.fill();
    if (e.launched) { ctx.fillStyle = '#fa0'; ctx.beginPath(); ctx.moveTo(x + w * 0.3, y - 3); ctx.lineTo(x + w / 2, y + 8); ctx.lineTo(x + w * 0.7, y - 3); ctx.fill(); }
  } else if (e.kind === 'fuel') {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#a01010'); g.addColorStop(0.35, '#ff5040'); g.addColorStop(1, '#801010');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, top + 2, w, h - 2, 5); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.strokeRect(x + 2, top + 8, w - 4, 9);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
    ctx.fillText('FUEL', x + w / 2, top + 16); ctx.textAlign = 'left';
  } else { // base: domed bunker with antenna
    ctx.fillStyle = '#4a8a4a'; ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + 3, y - 8);
    ctx.lineTo(x + w - 3, y - 8); ctx.lineTo(x + w + 2, y); ctx.fill();
    ctx.fillStyle = '#9fe09f'; ctx.beginPath(); ctx.arc(x + w / 2, y - 8, 7, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#9fe09f'; ctx.beginPath(); ctx.moveTo(x + w / 2, y - 15); ctx.lineTo(x + w / 2, y - h); ctx.stroke();
    ctx.fillStyle = '#f33'; ctx.fillRect(x + w / 2 - 1.5, y - h - 2, 3, 3);
  }
}

function drawShip(ctx, x, y) { // delta-wing jet pointing right
  ctx.fillStyle = '#e8eef5'; ctx.beginPath();
  ctx.moveTo(x + SHIP_W, y + 6); ctx.lineTo(x + 16, y + 2); ctx.lineTo(x + 6, y + 1); ctx.lineTo(x, y - 3);
  ctx.lineTo(x + 3, y + 5); ctx.lineTo(x + 2, y + SHIP_H + 2); ctx.lineTo(x + 8, y + SHIP_H); ctx.lineTo(x + 18, y + 9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3ab8ff'; ctx.beginPath(); ctx.ellipse(x + 14, y + 3, 5, 2.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#e02020'; ctx.fillRect(x + 4, y + 4, 8, 2);
  ctx.fillStyle = '#fa0'; ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x - 7, y + 6); ctx.lineTo(x, y + 8); ctx.fill();
}

function draw(ctx, g) {
  ctx.fillStyle = '#05050f'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 60; i++) { // parallax stars
    const sx = ((hash(i) * W * 2 - g.scroll * (0.1 + hash(i + 99) * 0.2)) % W + W) % W;
    ctx.fillRect(sx, hash(i + 50) * H, 1.5, 1.5);
  }
  drawTerrain(ctx, g);
  for (const e of g.ents.values()) if (e && e.alive) drawEntity(ctx, e, e.x - g.scroll);
  ctx.fillStyle = '#ffe9a0';
  g.shots.forEach(b => { ctx.beginPath(); ctx.ellipse(b.x + 5, b.y, 6, 1.5, 0, 0, 7); ctx.fill(); });
  ctx.fillStyle = '#ccc';
  g.bombs.forEach(b => { ctx.beginPath(); ctx.ellipse(b.x, b.y, 2.5, 4, 0, 0, 7); ctx.fill(); });
  if (!g.dead) drawShip(ctx, g.ship.x, g.ship.y);
  g.booms.forEach(b => {
    const r = b.t * 1.5, bx = b.x - g.scroll, a = 1 - b.t / 20;
    const rg = ctx.createRadialGradient(bx, b.y, 0, bx, b.y, r + 1);
    rg.addColorStop(0, `rgba(255,255,200,${a})`); rg.addColorStop(0.5, `rgba(255,160,0,${a})`); rg.addColorStop(1, 'rgba(200,30,0,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(bx, b.y, r + 1, 0, 7); ctx.fill();
  });
  ctx.fillStyle = '#fff'; ctx.font = '14px monospace';
  ctx.fillText(`SCORE ${g.score}  LIVES ${g.lives}  LEVEL ${g.level}`, 10, H - 6);
  ctx.fillText('FUEL', W - 255, H - 8);
  ctx.fillStyle = '#222'; ctx.fillRect(W - 210, H - 18, 200, 10);
  ctx.fillStyle = g.fuel < 25 ? '#f33' : '#fd0'; ctx.fillRect(W - 210, H - 18, 2 * g.fuel, 10);
  if (g.over) { ctx.fillStyle = '#fff'; ctx.font = '28px monospace'; ctx.fillText('GAME OVER - press Enter', 220, 200); }
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
  (function loop() { step(g, keys, fire, bomb); fire = bomb = false; draw(ctx, g); requestAnimationFrame(loop); })();
}

if (typeof module !== 'undefined') module.exports = { newGame, step, floorY, ceilY, entityForSlot, rectHit, shipHitsTerrain, draw, W, H, FUEL_MAX };
else start();
