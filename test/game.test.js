const test = require('node:test'), assert = require('node:assert');
const G = require('../game.js');
const none = {};

test('terrain leaves a flyable gap everywhere', () => {
  for (let x = 0; x < 50000; x += 7) assert.ok(G.floorY(x) - G.ceilY(x) > 150, `gap at ${x}`);
});

test('entities are deterministic and none at start', () => {
  assert.deepStrictEqual(G.entityForSlot(10), G.entityForSlot(10));
  for (let i = 0; i < 4; i++) assert.strictEqual(G.entityForSlot(i), null);
});

test('scrolling and score advance', () => {
  const g = G.newGame(); g.ship.y = 200; G.step(g, none, false, false);
  assert.ok(g.scroll > 0 && g.score > 0);
});

test('hitting the floor loses a life; three lives ends the game', () => {
  const g = G.newGame();
  for (let n = 0; n < 3; n++) { g.dead = 0; g.ship.y = 399; G.step(g, none, false, false); }
  assert.strictEqual(g.lives, 0); assert.ok(g.over);
});

test('respawn refills fuel', () => {
  const g = G.newGame(); g.fuel = 5; g.ship.y = 399; G.step(g, none, false, false);
  for (let i = 0; i < 70; i++) G.step(g, none, false, false);
  assert.ok(g.fuel > G.FUEL_MAX - 1);
});

test('shooting a fuel tank refuels and scores', () => {
  const g = G.newGame();
  const e = { kind: 'fuel', x: 300, y: 300, w: 20, h: 22, alive: true, launched: false, vy: 0 };
  g.ents.set(2, e); g.fuel = 10; g.ship = { x: 100, y: 285 };
  g.shots.push({ x: 296, y: 290 });
  G.step(g, none, false, false);
  assert.strictEqual(e.alive, false); assert.ok(g.fuel > 10);
});

test('running out of fuel sinks the ship', () => {
  const g = G.newGame(); g.fuel = 0.001; g.ship.y = 150; G.step(g, none, false, false);
  const y = g.ship.y; G.step(g, none, false, false);
  assert.ok(g.ship.y > y);
});

test('fire and bomb are capped', () => {
  const g = G.newGame(); g.ship.y = 200;
  for (let i = 0; i < 10; i++) { G.step(g, none, true, true); g.ship.y = 200; }
  assert.ok(g.shots.length <= 4 && g.bombs.length <= 3);
});

const ent = (kind, x, y) => ({ kind, x, y, w: 20, h: 22, alive: true, launched: false, vy: 0 });

test('final death explosion keeps animating after game over', () => {
  const g = G.newGame(); g.lives = 1; g.ship.y = 399; G.step(g, none, false, false);
  assert.ok(g.over); G.step(g, none, false, false);
  assert.ok(g.booms.length && g.booms[0].t > 0);
});

test('ceiling collision loses a life', () => {
  const g = G.newGame(); g.ship.y = -5; G.step(g, none, false, false);
  assert.strictEqual(g.lives, 2);
});

test('shots are destroyed by the floor', () => {
  const g = G.newGame(); g.ship.y = 200; const x = 300, fy = G.floorY(x + 2);
  g.shots.push({ x, y: fy + 5 }); G.step(g, none, false, false);
  assert.strictEqual(g.shots.length, 0);
});

test('bomb falls, hits floor target and is consumed', () => {
  const g = G.newGame(); g.ship.y = 200;
  const e = ent('base', 210, G.floorY(210)); g.ents.set(1, e);
  g.bombs.push({ x: 200, y: e.y - 40, vx: 0, vy: 0 });
  for (let i = 0; i < 20 && e.alive; i++) G.step(g, none, false, false);
  assert.strictEqual(e.alive, false);
});

test('bomb is removed on terrain', () => {
  const g = G.newGame(); g.ship.y = 200; g.bombs.push({ x: 400, y: G.floorY(400) + 1, vx: 2, vy: 0 });
  G.step(g, none, false, false); assert.strictEqual(g.bombs.length, 0);
});

test('rocket launches when ship is near, not when far', () => {
  const g = G.newGame(); g.ship.y = 200;
  const near = ent('rocket', 100 + 100, G.floorY(200)), far = ent('rocket', 100 + 600, G.floorY(700));
  g.ents.set(1, near); g.ents.set(5, far); G.step(g, none, false, false);
  assert.ok(near.launched); assert.ok(!far.launched);
});

test('ship colliding with ground entity loses a life', () => {
  const g = G.newGame(); g.ship.y = 200;
  g.ents.set(1, ent('base', 100 + 2 + 5, 205 + 22)); G.step(g, none, false, false);
  assert.strictEqual(g.lives, 2);
});

test('launched rocket despawns at the ceiling', () => {
  const g = G.newGame(); g.ship.y = 200;
  const r = ent('rocket', 300, G.ceilY(300) + 30); r.launched = true; r.vy = 3.5; g.ents.set(2, r);
  for (let i = 0; i < 5 && r.alive; i++) G.step(g, none, false, false);
  assert.strictEqual(r.alive, false);
});
