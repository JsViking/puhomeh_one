// Собака-враг: бродит по округе, замечает котика и гонится за ним по кратчайшему пути.
import { pickDir, findPath } from './util.js';
import * as sfx from './audio.js';

const DETECT = 4.5;      // с какого расстояния (в тайлах) собака замечает котика
const GIVE_UP = 7.5;     // дальше — теряет из виду
const MAX_CHASE = 7;     // секунд погони, потом устаёт
const TIRED = 3;         // секунд отдыха после погони
const SPEED_CHASE = 2.5; // тайлов/с — чуть медленнее котика, убежать можно
const SPEED_WALK = 1.1;
const WANDER_RADIUS = 5;

export class Dog {
  constructor(level, x, y) {
    this.level = level;
    this.home = { x, y };
    this.x = x; this.y = y;
    this.dir = 1; this.frame = 0; this.anim = 0; this.moving = false;
    this.state = 'wander';  // wander | chase
    this.path = [];
    this.pause = Math.random() * 2;
    this.repath = 0;
    this.chaseTime = 0;
    this.cooldown = 1.5;    // в начале игры даём котику оглядеться
    this.alert = 0;         // сколько ещё показывать «!» над головой
  }

  tile() { return [Math.floor(this.x), Math.floor(this.y)]; }

  calmDown(seconds) {
    this.state = 'wander';
    this.path = [];
    this.cooldown = seconds;
    this.pause = 0.5;
  }

  update(dt, cat, canChase) {
    const dist = Math.hypot(cat.x - this.x, cat.y - this.y);
    this.cooldown -= dt;
    this.alert = Math.max(0, this.alert - dt);

    if (this.state === 'wander') {
      if (canChase && this.cooldown <= 0 && dist < DETECT) {
        this.state = 'chase';
        this.chaseTime = 0;
        this.repath = 0;
        this.alert = 1;
        sfx.bark();
      } else if (!this.path.length) {
        this.pause -= dt;
        if (this.pause <= 0) this.pickWanderTarget();
      }
    }

    if (this.state === 'chase') {
      this.chaseTime += dt;
      this.repath -= dt;
      if (!canChase || dist > GIVE_UP || this.chaseTime > MAX_CHASE) {
        this.calmDown(TIRED);
      } else if (this.repath <= 0) {
        const [dx, dy] = this.tile();
        this.path = findPath(this.level, dx, dy, Math.floor(cat.x), Math.floor(cat.y));
        this.repath = 0.3;
      }
    }

    // Цель движения: следующая клетка пути, а в одной клетке с котиком — прямо к нему
    let target = this.path[0];
    if (!target && this.state === 'chase') target = { x: cat.x, y: cat.y };
    this.moving = false;
    if (target) {
      const speed = this.state === 'chase' ? SPEED_CHASE : SPEED_WALK;
      const vx = target.x - this.x, vy = target.y - this.y, len = Math.hypot(vx, vy);
      const step = speed * dt;
      if (len <= step) {
        this.x = target.x; this.y = target.y;
        if (this.path.length) this.path.shift();
        if (!this.path.length && this.state === 'wander') this.pause = 0.8 + Math.random() * 1.8;
      } else {
        this.x += (vx / len) * step;
        this.y += (vy / len) * step;
      }
      if (len > 0.01) {
        this.dir = pickDir(vx, vy, this.dir);
        this.moving = true;
      }
    }
    if (this.moving) {
      this.anim += dt * (this.state === 'chase' ? 1.6 : 1);
      this.frame = 1 + (Math.floor(this.anim * 7) % 2);
    } else {
      this.frame = 0;
      this.anim = 0;
    }
    return dist;
  }

  pickWanderTarget() {
    const options = this.level.spawnTiles.filter((t) => Math.hypot(t.x + 0.5 - this.home.x, t.y + 0.5 - this.home.y) < WANDER_RADIUS);
    const t = options[Math.floor(Math.random() * options.length)];
    const [dx, dy] = this.tile();
    this.path = t ? findPath(this.level, dx, dy, t.x, t.y) : [];
    if (!this.path.length) this.pause = 1;
  }
}
