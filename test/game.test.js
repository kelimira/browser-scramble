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
