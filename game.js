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
  // Отдельный звук поимки для каждого бонуса — чтобы они узнавались на слух,
  // не сливаясь в один и тот же "дзынь".
  catchBig:   () => { tone(300, 0.1, 'sine', 0.13); setTimeout(() => tone(420, 0.14, 'sine', 0.13), 50); },
  catchFire:  () => { tone(180, 0.05, 'sawtooth', 0.16); setTimeout(() => tone(140, 0.18, 'sawtooth', 0.14, 90), 30); },
  catchMulti: () => { [700, 850, 1000].forEach((f, i) => setTimeout(() => tone(f, 0.06, 'square', 0.11), i * 45)); },
  catchSlow:  () => tone(520, 0.35, 'sine', 0.13, 190),
  // Вредный бонус — резкий нисходящий "провал", на слух сразу понятно, что
  // случилось что-то плохое, в отличие от восходящих тонов полезных бонусов.
  catchShrink: () => { tone(260, 0.16, 'sawtooth', 0.16, 120); setTimeout(() => tone(160, 0.22, 'square', 0.13, 80), 90); },
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
const levelEl = $('level'), livesEl = $('lives'), bestEl = $('best');
const overlay = $('overlay'), startBtn = $('startBtn');

// Подгружаем рекорд сразу при загрузке страницы, а не только при старте игры
bestEl.textContent = localStorage.getItem('neonBreakoutBestLevel') || 1;

// ---- Состояние игры ----
let state = {
  running: false,
  paused: false,
  lives: 3,
  level: 1,
};

function togglePause() {
  state.paused = !state.paused;
  if (state.paused) {
    overlay.querySelector('h1').textContent = 'Пауза';
    overlay.querySelector('p').textContent = `Уровень ${state.level} · нажми "Продолжить" или P`;
    startBtn.textContent = 'Продолжить';
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

const platform = {
  x: W / 2,
  y: H - 30,
  w: 92,
  baseW: 92, // абсолютная база — не меняется в течение игры
  levelBaseW: 92, // фактическая база ДЛЯ ТЕКУЩЕГО УРОВНЯ (уже поменьше на боссах)
  h: 14,
  speed: 8,
  vx: 0,
};

let balls = [];
let bricks = [];
let bonuses = [];
let particles = [];
let stars = [];
let powers = { slowToken: 0, bigToken: 0, fireToken: 0, shrinkToken: 0 }; // активные бонусы { fire, big, multi, slowActive, slowToken }
let shake = { time: 0, power: 0 };

// ---- Режим разработчика ----
const dev = {
  active: false,
  infiniteLives: true,
  godMode: false,
  showHitboxes: false,
  slowMotion: false,
  bossFrequency: 5, // 'random' или число
  bonusesDisabled: false,
};

function triggerShake(power, duration = 140) {
  shake.power = Math.max(shake.power, power);
  shake.time = Math.max(shake.time, duration);
}

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

// ---- Туманности фона (лёгкая глубина, недорого по FPS — всего 3 объекта) ----
let nebulae = [];
function makeNebulae() {
  const palette = ['#4a5fd0', '#7a3fc0', '#2f8fb0'];
  nebulae = palette.map((color, i) => ({
    x: (W / 4) * (i + 1) + (Math.random() - 0.5) * 100,
    y: (H / 3) * (i % 2 === 0 ? 0.7 : 1.3) + (Math.random() - 0.5) * 60,
    r: 180 + Math.random() * 80,
    color,
    vx: (Math.random() - 0.5) * 0.06,
    vy: (Math.random() - 0.5) * 0.04,
  }));
}
makeNebulae();

// ---- Уровни (матрица кирпичей) ----
function isBossLevel(lvl) {
  const freq = (dev.active) ? dev.bossFrequency : 5;
  if (freq === 'random') {
    // Детерминированный "случайный" выбор по номеру уровня, чтобы одно и то же
    // значение level всегда давало одинаковый результат (не дёргалось при перерисовке).
    return ((lvl * 2654435761) % 100) < 22; // ~22% уровней — боссы
  }
  return lvl % freq === 0;
}

// Платформа одинаковая на всех уровнях, включая боссов — её размер меняют
// ТОЛЬКО бонусы (big увеличивает, shrink уменьшает). levelBaseW сохранён как
// единая точка отсчёта, к которой бонусы возвращают платформу по истечении.
function applyPlatformWidthForLevel() {
  platform.levelBaseW = platform.baseW;
  if (!powers.big && !powers.shrink) platform.w = platform.levelBaseW;
}

// 0 - пусто, 1 - обычный, 2 - крепкий
function buildLevel(lvl) {
  applyPlatformWidthForLevel();
  if (isBossLevel(lvl)) {
    buildBossLevel(lvl);
    return;
  }
  bricks = [];
  // Более мелкая сетка, чем раньше — больше ячеек, каждая уже (было 10 колонок
  // по 62px, стало 16 колонок по 42px) — больше пространства для манёвра мяча
  // между рядами и точнее читается форма фигуры.
  const cols = 16;
  const bw = 42, bh = 18, gap = 5;
  const rows = Math.min(7 + Math.floor(lvl / 3), 12);
  const top = 70;
  const totalW = cols * bw + (cols - 1) * gap;
  const startX = (W - totalW) / 2;

  const filled = choosePattern(lvl, cols, rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${c},${r}`;
      if (!filled.has(key)) continue;

      // Клетки на краю фигуры (мало заполненных соседей) — сложнее попасть
      // прицельно, поэтому чаще получают доп. прочность, как ты и просил.
      const neighbors = [[1,0],[-1,0],[0,1],[0,-1]]
        .filter(([dx, dy]) => filled.has(`${c+dx},${r+dy}`)).length;
      const isEdge = neighbors <= 2;

      let hp = 1;
      if (lvl >= 3 && isEdge && Math.random() < 0.35) hp = 2;
      if (hp === 2 && Math.random() < 0.08) hp = 3;

      bricks.push({
        x: startX + c * (bw + gap),
        y: top + r * (bh + gap),
        w: bw,
        h: bh,
        hp,
        maxHp: hp,
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

// ---- Фигуры обычных уровней ----
// Возвращают Set ключей "col,row" — какие клетки сетки заполнены кирпичом.
// Чередуются по номеру уровня, чтобы каждый уровень между боссами выглядел по-разному.
function choosePattern(lvl, cols, rows) {
  // Раньше здесь было lvl % 5, но уровни кратные 5 — это боссы, поэтому
  // ветка default фактически никогда не выполнялась и вместо 5 фигур игрок
  // видел только 4. Считаем порядковый номер среди НЕбоссовых уровней —
  // так все фигуры честно чередуются.
  const patterns = [
    diamondPattern, pyramidPattern, hourglassPattern, crossPattern,
    checkerGapPattern, archPattern, zigzagPattern, ringPattern,
    pillarsPattern, funnelPattern,
  ];
  const ordinal = lvl - Math.floor(lvl / 5); // сколько небоссовых уровней пройдено
  return patterns[ordinal % patterns.length](cols, rows);
}

// Арка: сплошной свод сверху и две толстые опоры, между ними сквозной проём.
// Мяч, залетевший внутрь проёма, рикошетит между опорами — маленькая камера
// в духе боссовых туннелей, но на обычном уровне.
function archPattern(cols, rows) {
  const filled = new Set();
  const cx = (cols - 1) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isRoof = r < 2;
      const inColumn = Math.abs(c - cx) >= cols * 0.22;
      if (isRoof || inColumn) filled.add(`${c},${r}`);
    }
  }
  return filled;
}

// Зигзаг: синусоидальная лента поперёк поля. Много косых поверхностей, из-за
// которых мяч уходит под непредсказуемыми углами.
function zigzagPattern(cols, rows) {
  const filled = new Set();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wave = Math.sin(c * 0.7) * (rows * 0.25) + rows / 2;
      if (Math.abs(r - wave) <= 1.6) filled.add(`${c},${r}`);
    }
  }
  return filled;
}

// Кольцо: пустота в центре. Пробив стенку, мяч попадает во внутреннюю полость
// и может долго крушить кольцо изнутри — самый "щедрый" из обычных уровней.
function ringPattern(cols, rows) {
  const filled = new Set();
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const d = Math.hypot((c - cx) / (cols / 2), (r - cy) / (rows / 2));
      if (d <= 1.0 && d >= 0.42) filled.add(`${c},${r}`);
    }
  }
  return filled;
}

// Столбы: решётка со сквозными щелями по обеим осям. Мяч проваливается
// в щели и застревает в них, выбивая длинные вертикальные каналы.
function pillarsPattern(cols, rows) {
  const filled = new Set();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c % 4 === 3 || r % 4 === 3) continue;
      filled.add(`${c},${r}`);
    }
  }
  return filled;
}

// Воронка: центр пустой и открыт до самого верха, к краям масса нарастает.
// Провоцирует лететь в лёгкий центр, где на самом деле нечего разбивать.
function funnelPattern(cols, rows) {
  const filled = new Set();
  const cx = (cols - 1) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const norm = Math.abs(c - cx) / (cols / 2);
      if (r < Math.round(norm * rows * 0.9)) filled.add(`${c},${r}`);
    }
  }
  return filled;
}

function diamondPattern(cols, rows) {
  const filled = new Set();
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  const rx = cols / 2, ry = rows / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.abs(c - cx) / rx + Math.abs(r - cy) / ry <= 1.0) filled.add(`${c},${r}`);
    }
  }
  return filled;
}

function pyramidPattern(cols, rows) {
  const filled = new Set();
  const cx = (cols - 1) / 2;
  for (let r = 0; r < rows; r++) {
    const half = Math.round((r + 1) * (cols / 2) / rows);
    for (let c = 0; c < cols; c++) {
      if (Math.abs(c - cx) <= half) filled.add(`${c},${r}`);
    }
  }
  return filled;
}

function hourglassPattern(cols, rows) {
  const filled = new Set();
  const cx = (cols - 1) / 2;
  // Защита от деления на ноль: при rows=1 midRow был бы 0, все сравнения
  // давали NaN и уровень генерировался полностью пустым (непроходимым).
  const midRow = Math.max((rows - 1) / 2, 0.5);
  for (let r = 0; r < rows; r++) {
    const distFromMid = Math.abs(r - midRow) / midRow;
    const half = distFromMid * (cols / 2);
    for (let c = 0; c < cols; c++) {
      if (Math.abs(c - cx) <= half) filled.add(`${c},${r}`);
    }
  }
  return filled;
}

function crossPattern(cols, rows) {
  const filled = new Set();
  const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
  const armW = Math.max(2, Math.floor(cols * 0.2));
  const armH = Math.max(1, Math.floor(rows * 0.22));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.abs(c - cx) <= armW || Math.abs(r - cy) <= armH) filled.add(`${c},${r}`);
    }
  }
  return filled;
}

function checkerGapPattern(cols, rows) {
  const filled = new Set();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((c + r) % 3 !== 0) filled.add(`${c},${r}`);
    }
  }
  return filled;
}

// ---- Boss-уровень: плотное поле мелких ячеек с туннелем-лабиринтом ----
function buildBossLevel(lvl) {
  bricks = [];
  // Ещё мельче сетка, чем в прошлый раз (было 26x18, стало 32x15), и меньше
  // высота поля (280 вместо 360) — это одновременно даёт более мелкие ячейки
  // И больший зазор до платформы, как ты просил оба раза сразу.
  const cols = 32;
  const rows = 15;
  const cw = W / cols;
  const fieldH = 280;
  const ch = fieldH / rows;
  const top = 12;
  bossFieldCenterY = top + fieldH / 2;
  const cx = Math.floor(cols / 2);
  // Позиция ядра зависит от формы: туннелям и диагонали нужен долгий путь
  // (ядро ближе к верху), спирали — простор со всех сторон (ядро в центре).
  const variant = Math.floor(lvl / 5) % 6;
  const cy = variant === 1 ? Math.floor(rows / 2) : 3;

  // Число входов — от 1 до 3, меняется по номеру уровня, как ты просил.
  const entryCount = 1 + (Math.abs(Math.floor((lvl * 2654435761) / 97)) % 3);
  const entryCols = pickEntryColumns(cols, entryCount);

  const corridor = new Set();
  if (variant === 0) {
    // Один или несколько прямых туннелей с камерами, сходящихся к ядру.
    entryCols.forEach(ec => buildSingleTunnelMask(corridor, cols, rows, cx, cy, ec));
  } else if (variant === 1) {
    buildSpiralCorridorMask(corridor, cols, rows, cx, cy);
  } else if (variant === 2) {
    // Туннель под углом — по диагонали от входа к ядру.
    buildDiagonalTunnelMask(corridor, cols, rows, cx, cy, entryCols[0]);
  } else if (variant === 4) {
    // Гребёнка: несколько одинаковых на вид шахт, но лишь одна ведёт к ядру,
    // остальные — тупики. Игрок не знает заранее, какая настоящая.
    buildCombMask(corridor, cols, rows, cx, cy);
  } else if (variant === 5) {
    // Змейка: длинный извилистый путь с разворотами через всё поле.
    buildSnakeMask(corridor, cols, rows, cx, cy, entryCols[0]);
  } else {
    // Пространство за стеной заполнено целиком — никакого готового пути нет,
    // только точки входа в самой стене. Мяч прогрызает себе дорогу сам, по
    // мере разрушения ячеек, и чем дальше он забирается в глубину плотной
    // массы, тем меньше уверенности, что он благополучно вернётся обратно.
    entryCols.forEach(ec => corridor.add(`${ec},${rows - 1}`));
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${c},${r}`;
      const isPerimeter = c === 0 || c === cols - 1 || r === 0 || r === rows - 1;
      if (isPerimeter) continue; // периметр строится отдельно слитыми сегментами (см. ниже)
      if (corridor.has(key)) continue; // пустой коридор — здесь ячейки нет

      const isCenter = c === cx && r === cy;
      const distToCenter = Math.hypot(c - cx, r - cy);
      let hp = 1;
      if (variant !== 3 && !isCenter && distToCenter < 3 && Math.random() < 0.3) hp = 2;

      bricks.push({
        x: c * cw + cw / 2,
        y: top + r * ch + ch / 2,
        w: cw - 2,
        h: ch - 2,
        hp,
        maxHp: hp,
        alive: true,
        isBossCore: isCenter,
        isBossCell: true,
      });
    }
  }

  // Неразрушимая стена по периметру — слитыми сегментами, а не отдельными
  // ячейками. Раньше каждая ячейка периметра была отдельным объектом
  // коллизии, и мяч, задевая стык двух соседних ячеек, иногда отражался как
  // от угла (диагонально) вместо ровной прямой — потому что физика видела
  // "угол этой конкретной ячейки", а не "ровный участок общей стены". Слитые
  // сегменты полностью убирают эти ложные внутренние стыки.
  buildPerimeterWallSegments(cols, rows, corridor, cw, ch, top);

  const pals = ['#ff4dd2', '#b48cff', '#7ad7ff', '#ff9a3c'];
  bricks.forEach(b => {
    if (b.indestructible) return;
    b.hue = Math.floor(Math.random() * pals.length);
    b.pal = b.isBossCore ? '#ffe14d' : pals[b.hue] || pals[0];
  });
}

// Гребёнка: пять одинаковых на вид вертикальных шахт, уходящих вглубь массы.
// Только центральная доходит до ядра, остальные обрываются тупиками на
// середине. Снаружи все выглядят идентично — игрок узнаёт правду, только
// загнав туда мяч, и это ровно та фрустрация, которая нужна.
function buildCombMask(corridor, cols, rows, cx, cy) {
  const shafts = [4, Math.round(cols * 0.3), cx, Math.round(cols * 0.7), cols - 5];
  shafts.forEach((sc, i) => {
    const isTrueShaft = sc === cx;
    const depth = isTrueShaft ? cy : Math.round(cy + (rows - cy) * 0.45);
    for (let r = rows - 1; r >= depth; r--) {
      if (sc >= 1 && sc <= cols - 2) corridor.add(`${sc},${r}`);
    }
  });
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      corridor.add(`${cx + dx},${cy + dy}`);
    }
  }
}

// Змейка: путь идёт вверх, разворачивается поперёк всего поля, снова вверх и
// обратно — длинный маршрут с двумя разворотами. Мяч проходит его целиком,
// только если сохраняет удачный угол на каждом повороте.
function buildSnakeMask(corridor, cols, rows, cx, cy, entryCol) {
  const bandLow = cy + 2;
  for (let r = rows - 1; r >= bandLow; r--) {
    corridor.add(`${entryCol},${r}`);
  }
  let dir = entryCol < cx ? 1 : -1;
  let c = entryCol;
  const farEnd = dir > 0 ? cols - 3 : 2;
  for (; dir > 0 ? c <= farEnd : c >= farEnd; c += dir) {
    if (c >= 1 && c <= cols - 2) corridor.add(`${c},${bandLow}`);
  }
  c -= dir;
  for (let r = bandLow; r >= cy; r--) {
    if (c >= 1 && c <= cols - 2) corridor.add(`${c},${r}`);
  }
  dir *= -1;
  for (; dir > 0 ? c <= cx : c >= cx; c += dir) {
    if (c >= 1 && c <= cols - 2) corridor.add(`${c},${cy}`);
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      corridor.add(`${cx + dx},${cy + dy}`);
    }
  }
}

// Выбирает 1-3 точки входа, равномерно распределённые по нижнему краю поля,
// не задевая самые углы (0 и cols-1 — это сама стена).
function pickEntryColumns(cols, count) {
  const usableStart = 2, usableEnd = cols - 3;
  if (count === 1) return [Math.floor(cols / 2)];
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    out.push(Math.round(usableStart + t * (usableEnd - usableStart)));
  }
  return out;
}

// Диагональный туннель — прямая линия от входа снизу к ядру под углом
// (не строго вертикально-горизонтально, как обычный Г-образный туннель),
// с двумя камерами-расширениями по пути для рикошета.
function buildDiagonalTunnelMask(corridor, cols, rows, cx, cy, entryCol) {
  const x0 = entryCol, y0 = rows - 1;
  // Ограничение только по горизонтали (не задеть левую/правую стену) — по
  // вертикали линия сама естественным образом не достаёт до верхней стены,
  // так как заканчивается на cy=3, а раньше жёсткий зажим по gy отрезал
  // саму точку входа и создавал разрыв с остальной линией.
  spiralThickLine(x0, y0, cx, cy, (gx, gy) => {
    if (gx >= 1 && gx <= cols - 2) corridor.add(`${gx},${gy}`);
  });
  [0.35, 0.7].forEach(t => {
    const bx = Math.round(x0 + (cx - x0) * t);
    const by = Math.round(y0 + (cy - y0) * t);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const gx = bx + dx, gy = by + dy;
        if (gx >= 1 && gx <= cols - 2 && gy >= 1 && gy <= rows - 2) corridor.add(`${gx},${gy}`);
      }
    }
  });
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      corridor.add(`${cx + dx},${cy + dy}`);
    }
  }
}

// Строит неразрушимую границу поля слитыми прямоугольными сегментами вместо
// отдельных ячеек на каждую клетку сетки — устраняет ложные "угловые" отскоки
// на стыках соседних ячеек стены (см. комментарий в buildBossLevel выше).
// Верх/низ — на всю ширину (включая углы); лево/право — только между ними,
// чтобы не задваивать сами углы.
// Строит неразрушимую границу поля крупными цельными сегментами.
// Углы НЕ являются отдельными кусками и не образуют стыков: левая и правая
// полосы идут на всю высоту поля (включая свои углы), а верхняя и нижняя —
// только между ними. Так в каждом углу находится ровно один прямоугольник,
// а не два состыкованных, и мяч физически не может поймать "внутренний угол"
// на ровном участке. Зазор между сегментами тоже убран (раньше каждый кусок
// рисовался на 2px уже, что оставляло видимые щели вдоль всей рамки).
function buildPerimeterWallSegments(cols, rows, corridor, cw, ch, top) {
  const fieldBottom = top + rows * ch;
  function pushSegment(x0, y0, x1, y1) {
    if (x1 - x0 <= 0 || y1 - y0 <= 0) return;
    bricks.push({
      x: (x0 + x1) / 2, y: (y0 + y1) / 2,
      w: x1 - x0, h: y1 - y0,
      hp: 1, maxHp: 1, alive: true,
      isBossCell: true, indestructible: true,
    });
  }

  // Левая и правая полосы — цельные, на всю высоту поля вместе с углами.
  pushSegment(0, top, cw, fieldBottom);
  pushSegment(W - cw, top, W, fieldBottom);

  // Верхняя и нижняя полосы — только в промежутке между боковыми полосами,
  // разрываются лишь там, где проходят реальные входы в конструкцию.
  function scanHorizontalBand(r, y0, y1) {
    let start = null;
    for (let c = 1; c <= cols - 1; c++) {
      const isWall = c < cols - 1 && !corridor.has(`${c},${r}`);
      if (isWall && start === null) start = c;
      if ((!isWall || c === cols - 1) && start !== null) {
        pushSegment(start * cw, y0, c * cw, y1);
        start = null;
      }
    }
  }
  scanHorizontalBand(0, top, top + ch);
  scanHorizontalBand(rows - 1, fieldBottom - ch, fieldBottom);
}

// Один туннель с входом СНИЗУ поля и двумя "камерами" — расширениями до 3
// клеток вдоль вертикального ствола. Узкое горлышко у входа требует точного
// попадания (промах — мяч просто улетает обратно), а внутри камер туннель
// достаточно широк, чтобы мяч реально рикошетил из стороны в сторону и
// разбивал ячейки по бокам — в туннеле шириной 1 клетка это физически
// невозможно, поэтому камеры обязательны для задуманной механики.
function buildSingleTunnelMask(corridor, cols, rows, cx, cy, entryCol) {
  const bottom = rows - 1;
  const chamberY1 = Math.round(bottom - (bottom - cy) * 0.35);
  const chamberY2 = Math.round(bottom - (bottom - cy) * 0.7);
  const chamberHalfHeight = 1; // высота камеры = 3 клетки (±1 от центра)
  const chamberWidth = 1; // расширение ±1 клетка от ствола = 3 клетки шириной

  for (let r = bottom; r >= cy; r--) {
    const inChamber = Math.abs(r - chamberY1) <= chamberHalfHeight || Math.abs(r - chamberY2) <= chamberHalfHeight;
    const width = inChamber ? chamberWidth : 0;
    for (let dx = -width; dx <= width; dx++) {
      const c = entryCol + dx;
      if (c >= 1 && c <= cols - 2) corridor.add(`${c},${r}`);
    }
  }
  const stepCol = entryCol < cx ? 1 : -1;
  for (let c = entryCol; c !== cx + stepCol; c += stepCol) {
    corridor.add(`${c},${cy}`);
  }
  // камера-приёмник вокруг ядра 3x3 — тоже даёт мячу порикошетить перед финальным ударом
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      corridor.add(`${cx + dx},${cy + dy}`);
    }
  }
}

// Строит связную спиральную маску "пустых" клеток от края поля к центру.
// Спираль задаётся математически в полярных координатах (угол растёт, радиус
// падает), а между соседними точками кривой проводится "толстая" линия
// (модифицированный Брезенхэм с доп. клеткой на диагональных шагах), чтобы
// коридор был гарантированно 4-связным — без этого мяч мог физически пройти
// по диагонали через "дыру", а логика игры считала бы клетки не соединёнными.
function buildSpiralCorridorMask(corridor, cols, rows, cx, cy) {
  const maxR = Math.min(cx, cy, cols - cx, rows - cy) - 1;
  const turns = 2.4;
  const totalAngle = turns * Math.PI * 2;
  const steps = 500;

  let prevX = null, prevY = null;
  let firstX = null, firstY = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * totalAngle;
    const r = maxR * (1 - t);
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) { firstX = Math.round(px); firstY = Math.round(py); }
    if (prevX !== null) {
      spiralThickLine(prevX, prevY, px, py, (gx, gy) => {
        if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) corridor.add(`${gx},${gy}`);
      });
    }
    prevX = px; prevY = py;
  }

  // Гарантируем, что центр (ядро) и его 4 соседа всегда пусты.
  const core = [[cx, cy], [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
  core.forEach(([cxN, cyN]) => corridor.add(`${cxN},${cyN}`));

  // ВХОД: без этого канала внешняя точка спирали не касается края поля, и
  // мяч физически не может попасть внутрь конструкции — прокладываем прямой
  // проход от первой точки кривой вниз до нижней границы поля.
  for (let r = rows - 1; r >= firstY; r--) {
    corridor.add(`${firstX},${r}`);
  }
}

function spiralThickLine(x0, y0, x1, y1, cb) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0, y = y0;
  cb(x, y);
  while (!(x === x1 && y === y1)) {
    const e2 = 2 * err;
    const movX = e2 >= dy, movY = e2 <= dx;
    if (movX && movY) {
      cb(x + sx, y);
      err += dy; x += sx;
      err += dx; y += sy;
    } else if (movX) { err += dy; x += sx; }
    else { err += dx; y += sy; }
    cb(x, y);
  }
}

// ---- Мячи ----
function baseBallSpeed() {
  // Скорость не растёт с уровнем — на боссах и на 1 уровне одинаковая.
  return 5.5;
}
function maxBallSpeed() {
  // Потолок был 11 — вдвое выше стартовой, мяч успевал сильно разогнаться
  // за уровень. Теперь максимум +15% от старта, разгон почти не ощущается.
  return 6.3;
}

function spawnBalls(n = 1) {
  const sp = baseBallSpeed();
  for (let i = 0; i < n; i++) {
    const ang = (Math.PI / 2) + (Math.random() - 0.5) * 0.7;
    balls.push({
      x: platform.x,
      y: platform.y - 20,
      r: 7,
      vx: Math.cos(ang) * sp,
      vy: -Math.abs(Math.sin(ang) * sp),
      stuck: true,
      fire: !!powers.fire,
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
  // Вредный бонус — сужает платформу на время. Красный цвет и предупреждающая
  // иконка дают игроку шанс сообразить, что этот ловить НЕ надо, и уйти с его
  // траектории — это и создаёт то самое напряжение при падающем бонусе.
  { id: 'shrink', label: 'Узкая пластина', color: '#ff3b5c', harmful: true },
];

function spawnBonus(x, y, chance = 0.22) {
  if (dev.active && dev.bonusesDisabled) return;
  if (Math.random() > chance) return;
  const b = BONUS_TYPES[Math.floor(Math.random() * BONUS_TYPES.length)];
  bonuses.push({
    x, y, vy: 2.2,
    r: 12,
    type: b.id,
    label: b.label,
    color: b.color,
    harmful: !!b.harmful,
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
  if (e.code === 'Space' && !state.running && !state.paused) startGame();
  if (e.code === 'Escape' && dev.active) { closeDevMode(); return; }
  if ((e.code === 'KeyP' || e.code === 'Escape') && state.running) togglePause();
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
function playBonusCatchSound(type) {
  if (type === 'big') sfx.catchBig();
  else if (type === 'fire') sfx.catchFire();
  else if (type === 'multi') sfx.catchMulti();
  else if (type === 'slow') sfx.catchSlow();
  else if (type === 'shrink') sfx.catchShrink();
  else sfx.bonus();
}

function applyBonus(type) {
  if (type === 'big') {
    // Big и Shrink взаимоисключающие — поймав Big, игрок снимает сужение,
    // иначе два противоположных эффекта дрались бы за ширину платформы.
    powers.shrink = false;
    powers.shrinkToken++;
    platform.w = Math.min(platform.levelBaseW * 1.8, platform.w * 1.35);
    powers.big = true;
    // Баг из прошлой версии: повторная поимка Big во время уже активного эффекта
    // запускала НОВЫЙ независимый таймер на 15с, но старый таймер срабатывал
    // раньше и резко возвращал платформу к обычной ширине — теперь повторная
    // поимка корректно продлевает эффект (тот же паттерн, что и у Slow).
    const myToken = ++powers.bigToken;
    setTimeout(() => {
      if (powers.bigToken !== myToken) return;
      platform.w = platform.levelBaseW;
      powers.big = false;
    }, 15000);
  } else if (type === 'fire') {
    // Fire был отмечен как избыточно сильный бонус — сократил длительность
    // действия с 12с до 7с. Сам эффект (прохождение мяча сквозь кирпичи без
    // отскока) не трогал — при желании можно ослабить и его отдельно.
    powers.fire = true;
    balls.forEach(b => b.fire = true);
    const myToken = ++powers.fireToken;
    setTimeout(() => {
      // Тот же баг стакинга, что был у Slow/Big — фиксирую тем же способом.
      if (powers.fireToken !== myToken) return;
      powers.fire = false;
      balls.forEach(b => b.fire = false);
    }, 7000);
  } else if (type === 'multi') {
    // Решение по балансу: multi не снимается таймером (в отличие от big/fire),
    // потому что лишние мячи сами по себе теряются, падая за платформу —
    // это естественное затухание эффекта, а не бесконечный баф.
    if (balls.length < 8) {
      const n = balls.length;
      // Минимум ~23° между новыми мячами одного источника, чтобы они не слипались визуально.
      const minSpread = 0.4;
      for (let i = 0; i < n * 2; i++) {
        const src = balls[Math.floor(Math.random() * n)];
        const baseAng = Math.atan2(src.vy, src.vx);
        const side = i % 2 === 0 ? 1 : -1;
        const ang = baseAng + side * (minSpread + Math.random() * 0.8);
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
    powers.slowActive = (powers.slowActive || 0) + 1;
    const isFirstActivation = powers.slowActive === 1;
    if (isFirstActivation) {
      // Замедление применяется только при первом срабатывании — повторная
      // поимка Slow, пока эффект уже активен, не усиливает замедление,
      // а лишь продлевает время его действия (см. ниже).
      balls.forEach(b => { b.vx *= 0.75; b.vy *= 0.75; });
    }
    const myToken = ++powers.slowToken;
    setTimeout(() => {
      // Снимаем эффект только если это последний выданный таймер (токен
      // совпадает) — предотвращает преждевременное снятие при повторной ловле.
      if (powers.slowToken !== myToken) return;
      powers.slowActive = 0;
      balls.forEach(b => {
        const cur = Math.hypot(b.vx, b.vy);
        if (cur === 0) return;
        // Раньше здесь было cur / 0.75 — то есть слепое умножение текущей
        // скорости. Если за время действия эффекта игрок успевал сменить
        // уровень, новый (не замедленный) мяч разгонялся сверх нормы.
        // Теперь просто нормализуем к базовой скорости — она одинакова
        // на всех уровнях, поэтому это всегда корректный ориентир.
        const scale = baseBallSpeed() / cur;
        b.vx *= scale;
        b.vy *= scale;
      });
    }, 8000);
  } else if (type === 'shrink') {
    // Вредный бонус: сужает платформу на 10с. Взаимоисключающий с Big —
    // поймав Shrink, игрок теряет активное расширение. Защита от стакинга
    // тем же токен-паттерном, что у остальных временных эффектов.
    powers.big = false;
    powers.bigToken++;
    powers.shrink = true;
    platform.w = Math.max(platform.levelBaseW * 0.55, platform.levelBaseW * 0.55);
    const myToken = ++powers.shrinkToken;
    setTimeout(() => {
      if (powers.shrinkToken !== myToken) return;
      powers.shrink = false;
      platform.w = platform.levelBaseW;
    }, 10000);
  }
}

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
  const remaining = Math.max(0, speed * speed - minimumVertical * minimumVertical);
  ball.vx = horizontalDirection * Math.sqrt(remaining);
  // Подстраховка от накопления погрешности округления — жёстко фиксируем модуль скорости.
  const actualSpeed = Math.hypot(ball.vx, ball.vy);
  if (actualSpeed > 0) {
    const correction = speed / actualSpeed;
    ball.vx *= correction;
    ball.vy *= correction;
  }
}

function hitBrick(ball, brick) {
  if (brick.indestructible) {
    // Неразрушимая граница поля: мяч просто высекает искру, hp не убывает
    // и очки не начисляются — эта ячейка не может быть уничтожена никаким
    // способом, включая Fire-бонус (тот тоже проходит через этот блок первым).
    explode(ball.x, ball.y, '#888899', 4);
    sfx.wall();
    return;
  }

  brick.hp--;
  const color = brick.pal;
  explode(ball.x, ball.y, color, 10);
  sfx.brick(brick.maxHp);

  if (brick.hp <= 0) {
    brick.alive = false;

    if (brick.isBossCore) {
      // Ядро спирали разрушено правильным прохождением — награда за успешное прохождение.
      spawnBonus(brick.x, brick.y, 1);
      explode(brick.x, brick.y, '#ffe14d', 40);
      triggerShake(9, 260);
      sfx.win();
    } else if (brick.isBossCell) {
      // Ячейки коридора спирали — почти гарантированный бонус, это и есть награда
      // за правильную траекторию мяча внутри лабиринта.
      spawnBonus(brick.x, brick.y, 0.03);
      explode(brick.x, brick.y, color, 18);
      triggerShake(2, 100);
    } else {
      spawnBonus(brick.x, brick.y, 0.1);
      explode(brick.x, brick.y, color, 18);
      // Крепкие кирпичи (maxHp 2-3) дают более заметную отдачу при разрушении
      triggerShake(brick.maxHp >= 3 ? 6 : brick.maxHp === 2 ? 3.5 : 1.5, brick.maxHp >= 2 ? 160 : 100);
    }
  }

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

      if (b.vy > 0) {
        const paddleCollision = circleRectCollision(b, {
          x: platform.x, y: platform.y, w: platform.w, h: platform.h,
        });
        if (paddleCollision) {
          const hit = Math.max(-1, Math.min(1, (b.x - platform.x) / (platform.w / 2)));
          const angle = hit * (Math.PI / 3);
          // Разгон "самую малость": было 1.02 на каждый отскок, что за 50
          // отскоков разгоняло мяч почти вдвое. Теперь 1.004 с низким потолком —
          // ускорение едва заметное и упирается в предел очень быстро.
          const speed = Math.min(Math.hypot(b.vx, b.vy) * 1.004, maxBallSpeed());
          b.vx = Math.sin(angle) * speed;
          b.vy = -Math.abs(Math.cos(angle) * speed);
          b.y = platform.y - platform.h / 2 - b.r - 0.5;
          explode(b.x, platform.y - platform.h / 2, '#7ad7ff', 6);
          sfx.bounce();
        }
      }

      for (const br of bricks) {
        if (!br.alive || hitThisFrame.has(br)) continue;
        const collision = circleRectCollision(b, br);
        if (!collision) continue;

        hitThisFrame.add(br);
        hitBrick(b, br);
        // Неразрушимая граница отражает мяч всегда, даже при Fire — иначе
        // огненный мяч прошёл бы сквозь стену поля и улетел за его пределы.
        if (!b.fire || br.indestructible) {
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

  // God Mode: мяч не улетает вниз, а отражается от невидимого пола —
  // так можно тестировать уровень без риска потерять мяч вообще.
  if (dev.active && dev.godMode) {
    for (const b of balls) {
      if (b.y + b.r > H) {
        b.y = H - b.r;
        b.vy = -Math.abs(b.vy);
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
    if (!(dev.active && dev.infiniteLives)) {
      state.lives--;
    }
    livesEl.textContent = dev.active && dev.infiniteLives ? '∞' : state.lives;
    if (!(dev.active && dev.infiniteLives) && state.lives <= 0) {
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

      explode(bo.x, bo.y, bo.color, 14);
      showBuff(bo.label, bo.color);
      playBonusCatchSound(bo.type);
      triggerShake(2, 120);
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

  // туманности — медленный дрейф с отражением от краёв
  for (const n of nebulae) {
    n.x += n.vx;
    n.y += n.vy;
    if (n.x - n.r < 0 || n.x + n.r > W) n.vx *= -1;
    if (n.y - n.r < 0 || n.y + n.r > H) n.vy *= -1;
  }

  // тряска экрана
  if (shake.time > 0) {
    shake.time -= 16.7; // ~1 кадр при 60fps
    if (shake.time <= 0) { shake.time = 0; shake.power = 0; }
  }

  // победа
  // ВАЖНО: неразрушимые кирпичи (рамка боссов) не могут быть уничтожены,
  // поэтому их надо исключать из проверки — иначе boss-уровень невозможно
  // пройти вообще и игра застревает на нём навсегда.
  if (state.running && balls.length > 0 && bricks.every(b => !b.alive || b.indestructible)) {
    state.level++;
    levelEl.textContent = state.level;
    updateBestLevel();
    buildLevel(state.level);
    resetBall();
    sfx.win();
  }
}

// ---- Отображение активных бонусов ----
function showBuff(label, color) {
  const wrap = document.getElementById('buffsWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'buff';
  el.style.borderColor = color;
  el.style.color = color;
  el.textContent = label;
  wrap.appendChild(el);

  // Плавное появление/исчезновение через Web Animations API — не зависит от CSS-файла.
  const supportsAnimate = typeof el.animate === 'function';
  if (supportsAnimate) {
    el.animate(
      [
        { opacity: 0, transform: 'translateY(6px) scale(0.9)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      { duration: 180, easing: 'ease-out', fill: 'forwards' }
    );
  }

  setTimeout(() => {
    if (!supportsAnimate) { el.remove(); return; }
    const anim = el.animate(
      [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: 'translateY(-6px) scale(0.9)' },
      ],
      { duration: 220, easing: 'ease-in', fill: 'forwards' }
    );
    anim.onfinish = () => el.remove();
  }, 2700);
}

// ---- Рендер ----
function draw() {
  ctx.save();
  if (shake.time > 0 && shake.power > 0) {
    const falloff = shake.time / 160; // затухание к концу тряски
    const sx = (Math.random() - 0.5) * 2 * shake.power * falloff;
    const sy = (Math.random() - 0.5) * 2 * shake.power * falloff;
    ctx.translate(sx, sy);
  }
  // фон
  ctx.clearRect(-20, -20, W + 40, H + 40);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a1120');
  grad.addColorStop(1, '#02030a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // туманности — мягкие радиальные пятна под звёздами, для глубины
  for (const n of nebulae) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, n.color + '26'); // низкая непрозрачность (~15%)
    g.addColorStop(1, n.color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
  }

  // звёзды
  for (const s of stars) {
    const a = 0.4 + 0.6 * Math.abs(Math.sin(s.tw));
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fill();
  }

  // кирпичи
  liveBrickCountCache = bricks.reduce((n, br) => n + (br.alive ? 1 : 0), 0);
  for (const br of bricks) {
    if (!br.alive) continue;
    drawBrick(br);
  }

  // бонусы
  for (const bo of bonuses) {
    drawBonusIcon(bo);
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

  // хитбоксы (только dev-режим)
  if (dev.active && dev.showHitboxes) {
    drawHitboxes();
  }

  ctx.restore();
}

function drawHitboxes() {
  ctx.save();
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.8;

  for (const br of bricks) {
    if (!br.alive) continue;
    ctx.strokeRect(br.x - br.w / 2, br.y - br.h / 2, br.w, br.h);
  }

  ctx.strokeStyle = '#ff2ecb';
  ctx.strokeRect(platform.x - platform.w / 2, platform.y - platform.h / 2, platform.w, platform.h);

  ctx.strokeStyle = '#ffe14d';
  for (const b of balls) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

let liveBrickCountCache = 0;
// Вертикальный центр поля boss-уровня — нужен отрисовке рамки, чтобы понять,
// какая её кромка обращена внутрь конструкции (см. drawIndestructibleWall).
let bossFieldCenterY = H / 2;

// Отрисовка неразрушимой рамки: холодный градиент сталь→индиго поперёк
// сегмента и тонкий неоновый кант по кромке, обращённой внутрь конструкции.
// Сторона канта определяется по геометрии самого сегмента (вертикальный он
// или горизонтальный и с какого края поля стоит), поэтому кант ложится ровной
// непрерывной линией по внутреннему периметру, не проявляя стыков.
function drawIndestructibleWall(br) {
  const x0 = br.x - br.w / 2, y0 = br.y - br.h / 2;
  const isVertical = br.h > br.w;

  const g = isVertical
    ? ctx.createLinearGradient(x0, 0, x0 + br.w, 0)
    : ctx.createLinearGradient(0, y0, 0, y0 + br.h);
  g.addColorStop(0, '#1b2030');
  g.addColorStop(0.45, '#2b3550');
  g.addColorStop(1, '#161a26');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, br.w, br.h);

  // Неоновый кант — только по внутренней кромке.
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.85)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(90, 180, 255, 0.9)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  if (isVertical) {
    // Боковая полоса: внутрь смотрит та вертикальная кромка, что ближе к центру канваса.
    const edgeX = br.x < W / 2 ? x0 + br.w - 1 : x0 + 1;
    ctx.moveTo(edgeX, y0);
    ctx.lineTo(edgeX, y0 + br.h);
  } else {
    // Верхняя/нижняя полоса. Сравнивать с центром КАНВАСА (H/2) нельзя: поле
    // боссов занимает лишь верхнюю часть экрана, поэтому обе полосы оказались
    // бы "верхними" и у нижней кант лёг бы с внешней стороны. Ориентируемся на
    // центр самой рамки, который передаётся через bossFieldCenterY.
    const isTopBand = br.y < bossFieldCenterY;
    const edgeY = isTopBand ? y0 + br.h - 1 : y0 + 1;
    ctx.moveTo(x0, edgeY);
    ctx.lineTo(x0 + br.w, edgeY);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawBrick(br) {
  ctx.save();

  // Неразрушимая рамка рисуется отдельным путём: градиент вдоль длинной
  // стороны сегмента + узкий неоновый кант по кромке, обращённой внутрь поля.
  // Кант рисуется только с внутренней стороны — обводка по всему периметру
  // сегмента снова проявила бы стыки между соседними кусками рамки.
  if (br.indestructible) {
    drawIndestructibleWall(br);
    ctx.restore();
    return;
  }

  let col;
  if (br.isBossCell) {
    col = br.isBossCore ? '#ffe14d' : br.pal;
  } else {
    const colors = { 1: br.pal, 2: '#ff9a3c', 3: '#ff4dd2' };
    col = colors[br.maxHp] || br.pal;
  }
  // При большом количестве кирпичей на экране shadowBlur — одна из самых дорогих
  // операций canvas, особенно на мобильных. На boss-уровнях ячеек в разы больше,
  // чем на обычных, поэтому порог отдельный — иначе спираль потеряет всё свечение.
  const glowThreshold = br.isBossCell ? 260 : 40;
  const glowAllowed = liveBrickCountCache <= glowThreshold || br.maxHp >= 2 || br.isBossCore;
  ctx.shadowColor = col;
  ctx.shadowBlur = glowAllowed ? (br.isBossCore ? 26 : 14) : 0;
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

function drawBonusIcon(bo) {
  ctx.save();
  ctx.translate(bo.x, bo.y);
  ctx.rotate(bo.ang * 0.3); // медленное вращение — было слишком резким при полном bo.ang

  // Общая подложка-капсула — светящийся круг в цвете бонуса, единая база
  // для всех типов, чтобы они читались как одно семейство предметов.
  ctx.beginPath();
  ctx.arc(0, 0, bo.r, 0, Math.PI * 2);
  ctx.fillStyle = bo.color;
  ctx.shadowColor = bo.color;
  ctx.shadowBlur = 16;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Вредный бонус пульсирует тревожной обводкой — визуальный сигнал, что этот
  // ловить не нужно, и у игрока есть шанс успеть увести платформу в сторону.
  if (bo.harmful) {
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(bo.ang * 3));
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + pulse * 0.5})`;
    ctx.lineWidth = 1.5 + pulse * 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, bo.r + 2 + pulse * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Уникальный силуэт внутри — узнаётся на глаз без чтения подписи.
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  const r = bo.r;

  if (bo.type === 'big') {
    // Двойная стрелка "расширение" ↔
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, 0); ctx.lineTo(r * 0.55, 0);
    ctx.moveTo(-r * 0.55, 0); ctx.lineTo(-r * 0.3, -r * 0.28);
    ctx.moveTo(-r * 0.55, 0); ctx.lineTo(-r * 0.3, r * 0.28);
    ctx.moveTo(r * 0.55, 0); ctx.lineTo(r * 0.3, -r * 0.28);
    ctx.moveTo(r * 0.55, 0); ctx.lineTo(r * 0.3, r * 0.28);
    ctx.stroke();
  } else if (bo.type === 'fire') {
    // Силуэт капли пламени
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.65);
    ctx.quadraticCurveTo(r * 0.5, -r * 0.1, r * 0.28, r * 0.35);
    ctx.quadraticCurveTo(r * 0.15, r * 0.6, 0, r * 0.6);
    ctx.quadraticCurveTo(-r * 0.15, r * 0.6, -r * 0.28, r * 0.35);
    ctx.quadraticCurveTo(-r * 0.5, -r * 0.1, 0, -r * 0.65);
    ctx.closePath();
    ctx.fill();
  } else if (bo.type === 'multi') {
    // Три маленьких круга — три мяча
    [[0, -r * 0.42], [-r * 0.4, r * 0.28], [r * 0.4, r * 0.28]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(dx, dy, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (bo.type === 'slow') {
    // Песочные часы
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, -r * 0.5); ctx.lineTo(r * 0.4, -r * 0.5);
    ctx.lineTo(-r * 0.4, r * 0.5); ctx.lineTo(r * 0.4, r * 0.5);
    ctx.closePath();
    ctx.stroke();
  } else if (bo.type === 'shrink') {
    // Сходящиеся стрелки → ← — зеркально противоположно Big, читается как "сжатие"
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, 0); ctx.lineTo(-r * 0.12, 0);
    ctx.moveTo(-r * 0.12, 0); ctx.lineTo(-r * 0.38, -r * 0.26);
    ctx.moveTo(-r * 0.12, 0); ctx.lineTo(-r * 0.38, r * 0.26);
    ctx.moveTo(r * 0.6, 0); ctx.lineTo(r * 0.12, 0);
    ctx.moveTo(r * 0.12, 0); ctx.lineTo(r * 0.38, -r * 0.26);
    ctx.moveTo(r * 0.12, 0); ctx.lineTo(r * 0.38, r * 0.26);
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

// ---- Прогресс (лучший достигнутый уровень) ----
// Очки из игры убраны намеренно: цель — пройти как можно дальше, а не
// набирать счёт, поэтому единственная сохраняемая метрика — номер уровня.
function updateBestLevel() {
  if (state.level > parseInt(bestEl.textContent || '1', 10)) {
    bestEl.textContent = state.level;
    localStorage.setItem('neonBreakoutBestLevel', state.level);
  }
}

// ---- Старт / конец ----
function startGame() {
  dev.active = false;
  devPanel.classList.add('hidden');
  state = { running: true, paused: false, lives: 3, level: 1 };
  platform.w = platform.baseW;
  powers = { slowToken: 0, bigToken: 0, fireToken: 0, shrinkToken: 0 };
  const saved = localStorage.getItem('spaceBreakBest');
  bestEl.textContent = saved || 0;
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
  overlay.querySelector('p').textContent = `Ты дошёл до уровня ${state.level}`;
  startBtn.textContent = 'Ещё раз';
  sfx.lose();
  overlay.classList.remove('hidden');
}

startBtn.addEventListener('click', () => {
  if (state.paused) { togglePause(); return; }
  startGame();
});
overlay.addEventListener('click', e => {
  if (e.target !== overlay) return;
  if (state.paused) { togglePause(); return; }
  startGame();
});

const muteBtn = document.getElementById('muteBtn');
muteBtn.addEventListener('click', e => {
  muted = !muted;
  muteBtn.textContent = muted ? '🔇' : '🔊';
  e.stopPropagation();
});

// ---- Главный цикл ----
let slowMoSkip = false;
function loop() {
  if (state.running && !state.paused) {
    if (dev.active && dev.slowMotion) {
      // Замедление вдвое через пропуск каждого второго кадра обновления —
      // не меняет саму физику/скорости, только частоту тиков.
      slowMoSkip = !slowMoSkip;
      if (!slowMoSkip) update();
    } else {
      update();
    }
  }
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

// ---- Developer Mode ----
const developerBtn = document.getElementById('developerBtn');
const devPanel = document.getElementById('devPanel');
const devLevelInput = document.getElementById('devLevelInput');
const devLoadLevel = document.getElementById('devLoadLevel');
const devPrevLevel = document.getElementById('devPrevLevel');
const devNextLevel = document.getElementById('devNextLevel');
const devRestart = document.getElementById('devRestart');
const devSkip = document.getElementById('devSkip');
const devInfiniteLives = document.getElementById('devInfiniteLives');
const devGodMode = document.getElementById('devGodMode');
const devHitboxes = document.getElementById('devHitboxes');
const devSlowMotion = document.getElementById('devSlowMotion');
const devBossFrequency = document.getElementById('devBossFrequency');
const devForceBig = document.getElementById('devForceBig');
const devForceFire = document.getElementById('devForceFire');
const devForceMulti = document.getElementById('devForceMulti');
const devForceSlow = document.getElementById('devForceSlow');
const devBonusesDisabled = document.getElementById('devBonusesDisabled');
const devExit = document.getElementById('devExit');

function openDevMode() {
  dev.active = true;
  overlay.classList.add('hidden');
  devPanel.classList.remove('hidden');
  // Стартуем сразу играбельную сессию, чтобы можно было тестировать уровни вживую.
  state = { running: true, paused: false, lives: dev.infiniteLives ? Infinity : 3, level: 1 };
  platform.w = platform.baseW;
  powers = { slowToken: 0, bigToken: 0, fireToken: 0, shrinkToken: 0 };
  livesEl.textContent = dev.infiniteLives ? '∞' : state.lives;
  levelEl.textContent = 1;
  bonuses = [];
  particles = [];
  buildLevel(1);
  resetBall();
  devLevelInput.value = 1;
}

function closeDevMode() {
  dev.active = false;
  devPanel.classList.add('hidden');
  state.running = false;
  overlay.querySelector('h1').textContent = 'NEON BREAKOUT';
  overlay.querySelector('p').textContent = 'Разбей все блоки и доберись до следующего уровня';
  startBtn.textContent = '🎮 Играть';
  overlay.classList.remove('hidden');
}

function devGoToLevel(lvl) {
  const target = Math.max(1, Math.min(9999, Math.floor(lvl) || 1));
  state.level = target;
  levelEl.textContent = target;
  buildLevel(target);
  resetBall();
  balls.forEach(b => b.stuck = false);
  devLevelInput.value = target;
}

developerBtn.addEventListener('click', openDevMode);
const devCloseX = document.getElementById('devCloseX');
devExit.addEventListener('click', closeDevMode);
devCloseX.addEventListener('click', closeDevMode);

devLoadLevel.addEventListener('click', () => {
  devGoToLevel(parseInt(devLevelInput.value, 10));
});
devPrevLevel.addEventListener('click', () => {
  devGoToLevel(state.level - 1);
});
devNextLevel.addEventListener('click', () => {
  devGoToLevel(state.level + 1);
});
devSkip.addEventListener('click', () => {
  devGoToLevel(state.level + 1);
});
devRestart.addEventListener('click', () => {
  devGoToLevel(state.level);
});

devInfiniteLives.addEventListener('change', () => {
  dev.infiniteLives = devInfiniteLives.checked;
  if (dev.active && dev.infiniteLives) {
    state.lives = Infinity;
    livesEl.textContent = '∞';
  } else if (dev.active) {
    state.lives = 3;
    livesEl.textContent = state.lives;
  }
});
devGodMode.addEventListener('change', () => {
  dev.godMode = devGodMode.checked;
});
devHitboxes.addEventListener('change', () => {
  dev.showHitboxes = devHitboxes.checked;
});
devSlowMotion.addEventListener('change', () => {
  dev.slowMotion = devSlowMotion.checked;
});
devBossFrequency.addEventListener('change', () => {
  dev.bossFrequency = devBossFrequency.value === 'random' ? 'random' : parseInt(devBossFrequency.value, 10);
});

// Принудительная активация бонусов — для тестирования без ожидания их выпадения.
devForceBig.addEventListener('click', () => applyBonus('big'));
devForceFire.addEventListener('click', () => applyBonus('fire'));
devForceMulti.addEventListener('click', () => applyBonus('multi'));
devForceSlow.addEventListener('click', () => applyBonus('slow'));
document.getElementById('devForceShrink').addEventListener('click', () => applyBonus('shrink'));
devBonusesDisabled.addEventListener('change', () => {
  dev.bonusesDisabled = devBonusesDisabled.checked;
});

// checkbox "Бесконечные жизни" стоит checked в разметке по умолчанию — синхронизируем стартовое состояние
dev.infiniteLives = devInfiniteLives.checked;
