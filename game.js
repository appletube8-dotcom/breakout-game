// ---- Звук (Web Audio) ----
let audioCtx = null;
let muted = false;
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function tone(freq, dur, type = 'square', vol = 0.15, slideTo = null) {
  if (!audioCtx || muted) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur);
}
const sfx = {
  bounce: () => tone(700, 0.05, 'square', 0.1),
  wall:   () => tone(400, 0.05, 'sine', 0.08),
  brick:  (hp) => tone(520 + hp * 60, 0.08, 'square', 0.12, 260),
  bonus:  () => { tone(600, 0.09, 'sine', 0.14); setTimeout(() => tone(900, 0.12, 'sine', 0.14), 70); },
  lose:   () => tone(320, 0.4, 'sawtooth', 0.15, 80),
  win:    () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'triangle', 0.14), i * 110)); },
};
document.addEventListener('mousedown', initAudio, { once: true });
document.addEventListener('keydown', initAudio, { once: true });
document.addEventListener('pointerdown', initAudio);
document.addEventListener('touchstart', initAudio);
document.addEventListener('touchend', () => initAudio());

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const $ = id => document.getElementById(id);
const scoreEl = $('score'), levelEl = $('level'), livesEl = $('lives'), bestEl = $('best');
const overlay = $('overlay'), startBtn = $('startBtn');

// ---- Состояние игры ----
let state = {
  running: false,
  score: 0,
  lives: 3,
  level: 1,
};

const platform = {
  x: W / 2,
  y: H - 30,
  w: 110,
  baseW: 110,
  h: 14,
  speed: 8,
  vx: 0,
  fire: false, // огненный режим
  fireTimer: 0,
};

let balls = [];
let bricks = [];
let bonuses = [];
let particles = [];
let stars = [];
let powers = {}; // активные бонусы { fire, big, multi }

// ---- Звёзды фона ----
function makeStars(count) {
  stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.5 + 0.3,
      tw: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.02 + 0.01,
    });
  }
}
makeStars(140);

// ---- Уровни (матрица кирпичей) ----
// 0 - пусто, 1 - обычный, 2 - крепкий
function buildLevel(lvl) {
  bricks = [];
  const rows = Math.min(3 + lvl, 8);
  const cols = 10;
  const bw = 62, bh = 22, gap = 8;
  const top = 80;
  const totalW = cols * bw + (cols - 1) * gap;
  const startX = (W - totalW) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let hp = 1;
      if (lvl >= 3 && (r === 0 || r === 1)) hp = 2; // крепкие сверху
      if (Math.random() < 0.06 && hp === 2) hp = 3;
      bricks.push({
        x: startX + c * (bw + gap),
        y: top + r * (bh + gap),
        w: bw,
        h: bh,
        hp,
        maxHp: hp,
        color: hp === 3 ? '#ff4dd2' : hp === 2 ? '#ff9a3c' : null,
        alive: true,
      });
    }
  }
  // псевдослучайная расцветка
  const pals = ['#7ad7ff', '#b48cff', '#6fffd0', '#ff9a3c', '#ff6fa5'];
  bricks.forEach(b => {
    b.hue = Math.floor(Math.random() * pals.length);
    b.pal = pals[b.hue] || pals[0];
  });
}

// ---- Мячи ----
function spawnBalls(n = 1, fromBrick = null) {
  for (let i = 0; i < n; i++) {
    const ang = (Math.PI / 2) + (Math.random() - 0.5) * 0.7;
    balls.push({
      x: platform.x,
      y: platform.y - 20,
      r: 9,
      vx: Math.cos(ang) * 5.5,
      vy: -Math.abs(Math.sin(ang) * 5.5),
      stuck: true,
      fire: false,
    });
  }
}

function resetBall() {
  balls = [];
  spawnBalls(1);
}

// ---- Бонусы (выпадают) ----
const BONUS_TYPES = [
  { id: 'big', label: 'Широкая пластина', color: '#6fffd0' },
  { id: 'fire', label: 'Огненный мяч', color: '#ff6f3c' },
  { id: 'multi', label: 'Тройной мяч', color: '#b48cff' },
  { id: 'slow', label: 'Замедление', color: '#5ec8ff' },
];

function spawnBonus(x, y) {
  // шанс выпадения ~ 22%
  if (Math.random() > 0.22) return;
  const b = BONUS_TYPES[Math.floor(Math.random() * BONUS_TYPES.length)];
  bonuses.push({
    x, y, vy: 2.2,
    r: 12,
    type: b.id,
    label: b.label,
    color: b.color,
    ang: 0,
  });
}

// ---- Частицы ----
function explode(x, y, color, n = 12) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = Math.random() * 4 + 1;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 1,
      decay: Math.random() * 0.03 + 0.02,
      r: Math.random() * 3 + 1,
      color,
    });
  }
}

// ---- Управление ----
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space', 'KeyW', 'ArrowUp'].includes(e.code)) {
    e.preventDefault();
  }
  if (e.code === 'Space' && !state.running) startGame();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

document.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const mx = (e.clientX - rect.left) * scaleX;
  platform.x = mx;
});

canvas.addEventListener('touchstart', e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  platform.x = (e.touches[0].clientX - rect.left) * scaleX;
  platform.x = Math.max(platform.w / 2, Math.min(W - platform.w / 2, platform.x));
  releaseStuck(); // тап = запуск мяча
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  platform.x = (e.touches[0].clientX - rect.left) * scaleX;
  platform.x = Math.max(platform.w / 2, Math.min(W - platform.w / 2, platform.x));
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('mousedown', () => releaseStuck());

function releaseStuck() {
  let any = false;
  balls.forEach(b => { if (b.stuck) { b.stuck = false; b.vy = -Math.abs(b.vy); any = true; } });
  if (any) sfx.bounce();
}

// ---- Активация бонусов ----
function applyBonus(type) {
  if (type === 'big') {
    platform.w = Math.min(platform.baseW * 1.8, platform.w * 1.35);
    powers.big = true;
    setTimeout(() => {
      platform.w = platform.baseW;
      powers.big = false;
    }, 15000);
  } else if (type === 'fire') {
    powers.fire = true;
    balls.forEach(b => b.fire = true);
    setTimeout(() => {
      powers.fire = false;
      balls.forEach(b => b.fire = false);
    }, 12000);
  } else if (type === 'multi') {
    if (balls.length < 8) {
      const n = balls.length;
      for (let i = 0; i < n * 2; i++) {
        const src = balls[Math.floor(Math.random() * n)];
        const ang = Math.atan2(src.vy, src.vx) + (Math.random() - 0.5) * 1.2;
        const sp = Math.hypot(src.vx, src.vy);
        balls.push({
          x: src.x, y: src.y,
          r: src.r,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          stuck: false,
          fire: powers.fire,
        });
      }
      // оставляем не больше 8, обрезаем лишние
      if (balls.length > 8) balls.length = 8;
    }
  } else if (type === 'slow') {
    balls.forEach(b => { b.vx *= 0.75; b.vy *= 0.75; });
  }
}

// ---- Отладочная панель бонусов не нужна, соберём в отдельный список ----
let activeBuffs = [];

function circleRectCollision(ball, brick) {
  const left = brick.x - brick.w / 2;
  const right = brick.x + brick.w / 2;
  const top = brick.y - brick.h / 2;
  const bottom = brick.y + brick.h / 2;
  const closestX = Math.max(left, Math.min(ball.x, right));
  const closestY = Math.max(top, Math.min(ball.y, bottom));
  let dx = ball.x - closestX;
  let dy = ball.y - closestY;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared > ball.r * ball.r) return null;

  // Центр мяча внутри кирпича: выбираем ближайшую грань, чтобы вытолкнуть его наружу.
  if (distanceSquared === 0) {
    const distances = [ball.x - left, right - ball.x, ball.y - top, bottom - ball.y];
    const minimum = Math.min(...distances);
    if (minimum === distances[0]) return { nx: -1, ny: 0, push: ball.r + minimum };
    if (minimum === distances[1]) return { nx: 1, ny: 0, push: ball.r + minimum };
    if (minimum === distances[2]) return { nx: 0, ny: -1, push: ball.r + minimum };
    return { nx: 0, ny: 1, push: ball.r + minimum };
  }

  const distance = Math.sqrt(distanceSquared);
  dx /= distance;
  dy /= distance;
  return { nx: dx, ny: dy, push: ball.r - distance };
}

function keepBallMovingVertically(ball) {
  const speed = Math.hypot(ball.vx, ball.vy);
  const minimumVertical = speed * 0.32;
  if (speed === 0 || Math.abs(ball.vy) >= minimumVertical) return;

  const horizontalDirection = Math.sign(ball.vx) || 1;
  const verticalDirection = Math.sign(ball.vy) || -1;
  ball.vy = verticalDirection * minimumVertical;
  ball.vx = horizontalDirection * Math.sqrt(speed * speed - minimumVertical * minimumVertical);
}

function hitBrick(ball, brick) {
  brick.hp--;
  const color = brick.pal;
  explode(ball.x, ball.y, color, 10);
  state.score += 50;
  sfx.brick(brick.maxHp);

  if (brick.hp <= 0) {
    brick.alive = false;
    state.score += 100;
    spawnBonus(brick.x, brick.y);
    explode(brick.x, brick.y, color, 18);
  }
  updateScore();
}

// ---- Логика ----
function update() {
  // Платформа по клавишам
  let dir = 0;
  if (keys['KeyA'] || keys['ArrowLeft']) dir -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) dir += 1;
  if (dir !== 0) {
    platform.x += dir * platform.speed;
  }
  platform.x = Math.max(platform.w / 2, Math.min(W - platform.w / 2, platform.x));
  platform.vx = dir;

  // Мячи
  for (const b of balls) {
    if (b.stuck) {
      b.x = platform.x;
      b.y = platform.y - b.r - 1;
      continue;
    }
    // Небольшие подшаги предотвращают пролетание через угол между кадрами.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.vx), Math.abs(b.vy)) / 3));
    const hitThisFrame = new Set();
    for (let step = 0; step < steps; step++) {
      b.x += b.vx / steps;
      b.y += b.vy / steps;

      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); sfx.wall(); }
      if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); sfx.wall(); }
      if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); sfx.wall(); }

      if (b.vy > 0 &&
          b.y + b.r >= platform.y - platform.h / 2 &&
          b.y + b.r <= platform.y + platform.h / 2 + 10 &&
          b.x >= platform.x - platform.w / 2 &&
          b.x <= platform.x + platform.w / 2) {
        const hit = (b.x - platform.x) / (platform.w / 2);
        const angle = hit * (Math.PI / 3);
        const speed = Math.min(Math.hypot(b.vx, b.vy) * 1.02, 11);
        b.vx = Math.sin(angle) * speed;
        b.vy = -Math.abs(Math.cos(angle) * speed);
        b.y = platform.y - platform.h / 2 - b.r;
        explode(b.x, platform.y - platform.h / 2, '#7ad7ff', 6);
        sfx.bounce();
      }

      for (const br of bricks) {
        if (!br.alive || hitThisFrame.has(br)) continue;
        const collision = circleRectCollision(b, br);
        if (!collision) continue;

        hitThisFrame.add(br);
        hitBrick(b, br);
        if (!b.fire) {
          // Сначала выводим мяч наружу, затем отражаем его по нормали столкновения.
          b.x += collision.nx * (collision.push + 0.01);
          b.y += collision.ny * (collision.push + 0.01);
          const dot = b.vx * collision.nx + b.vy * collision.ny;
          if (dot < 0) {
            b.vx -= 2 * dot * collision.nx;
            b.vy -= 2 * dot * collision.ny;
          }
          keepBallMovingVertically(b);
        }
        break;
      }
    }
  }

  // удаляем мячи улетевшие вниз
  balls = balls.filter(b => {
    if (b.y - b.r > H + 20) {
      explode(b.x, H, '#ff6fa5', 10);
      return false;
    }
    return true;
  });

  // если все мячи потеряны
  if (balls.length === 0 && state.running) {
    state.lives--;
    livesEl.textContent = state.lives;
    if (state.lives <= 0) {
      gameOver();
    } else {
      resetBall();
    }
  }

  // отпустить мячи (прилипшие) — по пробелу или клику
  if (keys['Space'] || keys['KeyW'] || keys['ArrowUp']) {
    releaseStuck();
    keys['Space'] = false; keys['ArrowUp'] = false; keys['KeyW'] = false;
  }

  // бонусы
  for (const bo of bonuses) {
    bo.y += bo.vy;
    bo.ang += 0.05;
    // ловим платформой
    if (bo.y + bo.r >= platform.y - platform.h / 2 &&
        bo.y - bo.r <= platform.y + platform.h / 2 &&
        bo.x >= platform.x - platform.w / 2 - bo.r &&
        bo.x <= platform.x + platform.w / 2 + bo.r) {
      applyBonus(bo.type);
      state.score += 150;
      updateScore();
      explode(bo.x, bo.y, bo.color, 14);
      showBuff(bo.label, bo.color);
      sfx.bonus();
      bo.caught = true;
    }
  }
  bonuses = bonuses.filter(b => !b.caught && b.y < H + 20);

  // частицы
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05;
    p.life -= p.decay;
  }
  particles = particles.filter(p => p.life > 0);

  // звёзды
  for (const s of stars) {
    s.tw += s.speed;
  }

  // победа
  if (state.running && balls.length > 0 && bricks.every(b => !b.alive)) {
    state.level++;
    levelEl.textContent = state.level;
    buildLevel(state.level);
    resetBall();
    sfx.win();
  }
}

// ---- Отображение активных бонусов ----
function showBuff(label, color) {
  const wrap = document.getElementById('buffs') || createBuffsWrap();
  const el = document.createElement('div');
  el.className = 'buff';
  el.style.borderColor = color;
  el.style.color = color;
  el.textContent = label;
  wrap.appendChild(el);
  setTimeout(() => { el.remove(); }, 3000);
}

let buffsWrap = null;
function createBuffsWrap() {
  buffsWrap = document.createElement('div');
  buffsWrap.id = 'buffs';
  document.getElementById('game-wrap').appendChild(buffsWrap);
  return buffsWrap;
}

// ---- Рендер ----
function draw() {
  // фон
  ctx.clearRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a1120');
  grad.addColorStop(1, '#02030a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // звёзды
  for (const s of stars) {
    const a = 0.4 + 0.6 * Math.abs(Math.sin(s.tw));
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fill();
  }

  // кирпичи
  for (const br of bricks) {
    if (!br.alive) continue;
    drawBrick(br);
  }

  // бонусы
  for (const bo of bonuses) {
    ctx.save();
    ctx.translate(bo.x, bo.y);
    ctx.rotate(bo.ang);
    ctx.beginPath();
    ctx.moveTo(0, -bo.r);
    ctx.lineTo(bo.r, bo.r);
    ctx.lineTo(-bo.r, bo.r);
    ctx.closePath();
    ctx.fillStyle = bo.color;
    ctx.shadowColor = bo.color;
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    // подпись
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(bo.label === 'Широкая пластина' ? 'ШИР' : bo.label === 'Огненный мяч' ? 'ОГОНЬ' : bo.label === 'Тройной мяч' ? 'x3' : 'SLOW', bo.x, bo.y + 4);
  }

  // мячи
  for (const b of balls) {
    drawBall(b);
  }

  // платформа
  drawPlatform();

  // частицы
  for (const p of particles) {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawBrick(br) {
  ctx.save();
  const colors = {
    1: br.pal,
    2: '#ff9a3c',
    3: '#ff4dd2',
  };
  const col = colors[br.maxHp] || br.pal;
  ctx.shadowColor = col;
  ctx.shadowBlur = 18;
  ctx.fillStyle = col;
  ctx.fillRect(br.x - br.w / 2, br.y - br.h / 2, br.w, br.h);
  ctx.shadowBlur = 0;
  // неоновая рамка
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  ctx.strokeRect(br.x - br.w / 2 + 1.5, br.y - br.h / 2 + 1.5, br.w - 3, br.h - 3);
  ctx.globalAlpha = 1;
  // внутреннее свечение
  const g = ctx.createLinearGradient(0, br.y - br.h / 2, 0, br.y + br.h / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(br.x - br.w / 2, br.y - br.h / 2, br.w, br.h / 2);
  // трещины на крепких
  if (br.maxHp === 2 && br.hp === 1) {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(br.x, br.y - br.h / 2);
    ctx.lineTo(br.x - br.w / 4, br.y + br.h / 2);
    ctx.stroke();
  }
  if (br.maxHp === 3 && br.hp === 2) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(br.x - br.w / 3, br.y - br.h / 2);
    ctx.lineTo(br.x + br.w / 6, br.y + br.h / 2);
    ctx.moveTo(br.x + br.w / 6, br.y - br.h / 2);
    ctx.lineTo(br.x - br.w / 4, br.y + br.h / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBall(b) {
  ctx.save();
  let color = '#9ff0ff';
  let glow = '#7ad7ff';
  if (b.fire || powers.fire) {
    color = '#ffd24f';
    glow = '#ff7a3c';
  }
  ctx.shadowColor = glow;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(b.x - 3, b.y - 3, 2, b.x, b.y, b.r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, color);
  g.addColorStop(1, glow);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  // огненный хвост
  if (b.fire || powers.fire) {
    ctx.fillStyle = 'rgba(255,120,40,0.6)';
    ctx.beginPath();
    ctx.arc(b.x - b.vx * 1.5, b.y - b.vy * 1.5, b.r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlatform() {
  ctx.save();
  const col = '#8fb8ff';
  ctx.shadowColor = col;
  ctx.shadowBlur = 20;
  // корпус
  const g = ctx.createLinearGradient(0, platform.y - platform.h / 2, 0, platform.y + platform.h / 2);
  g.addColorStop(0, '#cfe4ff');
  g.addColorStop(0.5, col);
  g.addColorStop(1, '#4a6bd0');
  ctx.fillStyle = g;
  const r = platform.h / 2;
  roundRect(platform.x - platform.w / 2, platform.y - platform.h / 2, platform.w, platform.h, r);
  ctx.fill();
  ctx.shadowBlur = 0;
  // огоньки-индикаторы
  if (powers.big) {
    ctx.fillStyle = '#6fffd0';
    ctx.beginPath();
    ctx.arc(platform.x, platform.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- Счёт ----
function updateScore() {
  scoreEl.textContent = state.score;
  if (state.score > parseInt(bestEl.textContent || '0')) {
    bestEl.textContent = state.score;
    localStorage.setItem('spaceBreakBest', state.score);
  }
}

// ---- Старт / конец ----
function startGame() {
  state = { running: true, score: 0, lives: 3, level: 1 };
  platform.w = platform.baseW;
  powers = {};
  const saved = localStorage.getItem('spaceBreakBest');
  bestEl.textContent = saved || 0;
  scoreEl.textContent = 0;
  livesEl.textContent = state.lives;
  levelEl.textContent = 1;
  bonuses = [];
  particles = [];
  buildLevel(1);
  resetBall();
  overlay.classList.add('hidden');
}

function gameOver() {
  state.running = false;
  overlay.querySelector('h1').textContent = 'Игра окончена';
  overlay.querySelector('p').textContent = `Счёт: ${state.score}`;
  startBtn.textContent = 'Ещё раз';
  sfx.lose();
  overlay.classList.remove('hidden');
}

startBtn.addEventListener('click', startGame);
overlay.addEventListener('click', e => { if (e.target === overlay) startGame(); });

const muteBtn = document.getElementById('muteBtn');
muteBtn.addEventListener('click', e => {
  muted = !muted;
  muteBtn.textContent = muted ? '🔇' : '🔊';
  e.stopPropagation();
});

// ---- Главный цикл ----
function loop() {
  if (state.running) update();
  draw();
  requestAnimationFrame(loop);
}
loop();

// ---- Адаптация под экран iPhone ----
function fitCanvas() {
  const wrap = document.getElementById('game-wrap');
  const hud = document.getElementById('hud');
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hudH = hud ? hud.offsetHeight : 50;
  const availW = Math.min(vw * 0.96, 800);
  const availH = Math.max(vh * 0.9 - hudH, 200);
  // сохраняем пропорцию 800:600
  const ratio = H / W; // 0.75
  let cw = availW;
  let ch = cw * ratio;
  if (ch > availH) {
    ch = availH;
    cw = ch / ratio;
    if (cw > availW) cw = availW;
  }
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  wrap.style.width = cw + 'px';
  // пересчитать платформу, если внутренние координаты менялись (не меняются)
}
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 200));
fitCanvas();
