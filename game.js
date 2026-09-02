// ============================================================
// NEON BREAKOUT
// BUILD 1
// Player Mode + Developer Mode
// ============================================================


// ============================================================
// AUDIO
// ============================================================

let audioCtx = null;
let muted = false;

function initAudio() {
  if (!audioCtx) {
    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }

  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function tone(
  frequency = 440,
  duration = 0.05,
  type = "sine",
  volume = 0.04
) {
  if (muted) return;

  initAudio();

  if (!audioCtx) return;

  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(volume, audioCtx.currentTime);

  gain.gain.exponentialRampToValueAtTime(
    0.001,
    audioCtx.currentTime + duration
  );

  oscillator.connect(gain);
  gain.connect(audioCtx.destination);

  oscillator.start();

  oscillator.stop(
    audioCtx.currentTime + duration
  );
}

function sfx(name) {
  if (name === "brick") {
    tone(520, 0.035, "square", 0.025);
  }

  if (name === "break") {
    tone(180, 0.08, "sawtooth", 0.04);
  }

  if (name === "paddle") {
    tone(280, 0.035, "sine", 0.025);
  }

  if (name === "bonus") {
    tone(760, 0.08, "triangle", 0.04);
    setTimeout(() => tone(980, 0.08, "triangle", 0.03), 60);
  }

  if (name === "level") {
    tone(520, 0.1, "triangle", 0.04);
    setTimeout(() => tone(700, 0.1, "triangle", 0.04), 80);
    setTimeout(() => tone(920, 0.14, "triangle", 0.04), 160);
  }

  if (name === "gameover") {
    tone(260, 0.12, "sawtooth", 0.035);
    setTimeout(() => tone(180, 0.2, "sawtooth", 0.035), 100);
  }
}


// ============================================================
// CANVAS
// ============================================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;


// ============================================================
// DOM
// ============================================================

const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const livesEl = document.getElementById("lives");
const bestEl = document.getElementById("best");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlaySubtitle = document.getElementById("overlaySubtitle");
const overlayHint = document.getElementById("overlayHint");

const startBtn = document.getElementById("startBtn");
const developerBtn = document.getElementById("developerBtn");

const muteBtn = document.getElementById("muteBtn");

const buffsWrap = document.getElementById("buffsWrap");


// ============================================================
// GAME STATE
// ============================================================

const state = {
  running: false,
  score: 0,
  lives: 3,
  level: 1
};


// ============================================================
// DEVELOPER MODE
// ============================================================

let devMode = false;

const devConfig = {
  infiniteLives: true,
  godMode: false,
  showHitboxes: false,
  slowMotion: false,
  bossFrequency: 5
};

const devPanel = document.getElementById("devPanel");

const devLevelInput =
  document.getElementById("devLevelInput");

const devLoadLevel =
  document.getElementById("devLoadLevel");

const devPrevLevel =
  document.getElementById("devPrevLevel");

const devNextLevel =
  document.getElementById("devNextLevel");

const devRestart =
  document.getElementById("devRestart");

const devSkip =
  document.getElementById("devSkip");

const devInfiniteLives =
  document.getElementById("devInfiniteLives");

const devGodMode =
  document.getElementById("devGodMode");

const devHitboxes =
  document.getElementById("devHitboxes");

const devSlowMotion =
  document.getElementById("devSlowMotion");

const devBossFrequency =
  document.getElementById("devBossFrequency");

const devExit =
  document.getElementById("devExit");


// ============================================================
// PLATFORM
// ============================================================

const platform = {
  x: W / 2,
  y: H - 30,

  w: 110,
  baseW: 110,

  h: 14,

  speed: 8,

  vx: 0,

  fire: false,
  fireTimer: 0
};


// ============================================================
// OBJECT ARRAYS
// ============================================================

let balls = [];
let bricks = [];
let bonuses = [];
let particles = [];

let stars = [];

let powers = {};


// ============================================================
// INPUT
// ============================================================

const keys = {
  left: false,
  right: false
};

let mouseX = W / 2;


// ============================================================
// LEVEL COLORS
// ============================================================

const LEVEL_COLORS = [
  "#7ad7ff",
  "#b48cff",
  "#6fffd0",
  "#ff9a3c",
  "#ff6fa5"
];


// ============================================================
// BONUS TYPES
// ============================================================

const BONUS_TYPES = [
  {
    id: "big",
    label: "Широкая пластина",
    color: "#6fffd0"
  },

  {
    id: "fire",
    label: "Огненный мяч",
    color: "#ff6f3c"
  },

  {
    id: "multi",
    label: "Тройной мяч",
    color: "#b48cff"
  },

  {
    id: "slow",
    label: "Замедление",
    color: "#5ec8ff"
  }
];


// ============================================================
// BACKGROUND STARS
// ============================================================

function createStars() {
  stars = [];

  for (let i = 0; i < 100; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.5 + 0.2,
      a: Math.random() * 0.7 + 0.1,
      tw: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.02 + 0.005
    });
  }
}

createStars();


// ============================================================
// LEVEL GENERATION
// ============================================================

function buildLevel(lvl) {
  bricks.length = 0;

  const rows = Math.min(3 + lvl, 8);
  const cols = 10;

  const brickW = 62;
  const brickH = 22;
  const gap = 8;

  const totalW =
    cols * brickW +
    (cols - 1) * gap;

  const startX =
    (W - totalW) / 2;

  const top = 80;

  for (let row = 0; row < rows; row++) {

    for (let col = 0; col < cols; col++) {

      let hp = 1;

      if (
        lvl >= 3 &&
        (row === 0 || row === 1)
      ) {
        hp = 2;
      }

      if (
        hp === 2 &&
        Math.random() < 0.22
      ) {
        hp = 3;
      }

      const color =
        LEVEL_COLORS[
          (row + lvl) %
          LEVEL_COLORS.length
        ];

      bricks.push({
        x:
          startX +
          col * (brickW + gap),

        y:
          top +
          row * (brickH + gap),

        w: brickW,
        h: brickH,

        hp,
        maxHp: hp,

        color,

        alive: true
      });
    }
  }
}


// ============================================================
// BALL
// ============================================================

function createBall(
  x,
  y,
  vx,
  vy,
  fire = false
) {
  return {
    x,
    y,

    r: 7,

    vx,
    vy,

    speed: Math.sqrt(vx * vx + vy * vy),

    stuck: true,

    fire,

    trail: []
  };
}


function spawnBalls(count = 1) {

  balls.length = 0;

  for (let i = 0; i < count; i++) {

    const angle =
      -Math.PI / 2 +
      (Math.random() - 0.5) * 0.7;

    const speed = 5.5;

    const ball = createBall(
      platform.x,
      platform.y - 15,

      Math.cos(angle) * speed,
      Math.sin(angle) * speed,

      powers.fire === true
    );

    ball.stuck = true;

    balls.push(ball);
  }
}


function resetBall() {
  spawnBalls(1);
}


// ============================================================
// BALL RELEASE
// ============================================================

function releaseStuck() {

  for (const ball of balls) {

    if (!ball.stuck) continue;

    const angle =
      -Math.PI / 2 +
      (Math.random() - 0.5) * 0.7;

    const speed =
      devConfig.slowMotion
        ? 4.8
        : 5.5;

    ball.vx =
      Math.cos(angle) * speed;

    ball.vy =
      Math.sin(angle) * speed;

    ball.speed = speed;

    ball.stuck = false;
  }
}


// ============================================================
// BONUS
// ============================================================

function spawnBonus(x, y) {

  if (Math.random() > 0.22) {
    return;
  }

  const type =
    BONUS_TYPES[
      Math.floor(
        Math.random() *
        BONUS_TYPES.length
      )
    ];

  bonuses.push({
    x,
    y,

    vy: 2.2,

    r: 12,

    type: type.id,

    label: type.label,

    color: type.color,

    ang: 0
  });
}


// ============================================================
// PARTICLES
// ============================================================

function explode(
  x,
  y,
  color,
  count = 14
) {

  for (let i = 0; i < count; i++) {

    const angle =
      Math.random() *
      Math.PI *
      2;

    const speed =
      Math.random() *
      3 +
      1;

    particles.push({
      x,
      y,

      vx:
        Math.cos(angle) *
        speed,

      vy:
        Math.sin(angle) *
        speed,

      life: 1,

      size:
        Math.random() *
        3 +
        1,

      color
    });
  }
}


// ============================================================
// COLLISION
// ============================================================

function circleRectCollision(
  ball,
  rect
) {

  const closestX =
    Math.max(
      rect.x,
      Math.min(
        ball.x,
        rect.x + rect.w
      )
    );

  const closestY =
    Math.max(
      rect.y,
      Math.min(
        ball.y,
        rect.y + rect.h
      )
    );

  const dx =
    ball.x - closestX;

  const dy =
    ball.y - closestY;

  const distSq =
    dx * dx +
    dy * dy;

  if (distSq > ball.r * ball.r) {
    return null;
  }

  const dist =
    Math.sqrt(distSq);

  let nx = 0;
  let ny = 0;

  if (dist > 0.0001) {

    nx = dx / dist;
    ny = dy / dist;

  } else {

    const left =
      Math.abs(
        ball.x - rect.x
      );

    const right =
      Math.abs(
        ball.x -
        (rect.x + rect.w)
      );

    const top =
      Math.abs(
        ball.y - rect.y
      );

    const bottom =
      Math.abs(
        ball.y -
        (rect.y + rect.h)
      );

    const min =
      Math.min(
        left,
        right,
        top,
        bottom
      );

    if (min === left) {
      nx = -1;
    } else if (min === right) {
      nx = 1;
    } else if (min === top) {
      ny = -1;
    } else {
      ny = 1;
    }
  }

  return {
    nx,
    ny,
    push:
      ball.r -
      dist +
      0.5
  };
}


// ============================================================
// KEEP VERTICAL MOVEMENT
// ============================================================

function keepBallMovingVertically(ball) {

  const minVertical = 1.3;

  if (
    Math.abs(ball.vy) <
    minVertical
  ) {

    ball.vy =
      ball.vy >= 0
        ? minVertical
        : -minVertical;
  }
}


// ============================================================
// HIT BRICK
// ============================================================

function hitBrick(ball, brick) {

  brick.hp--;

  state.score += 50;

  explode(
    ball.x,
    ball.y,
    brick.color,
    5
  );

  sfx("brick");

  if (brick.hp <= 0) {

    brick.alive = false;

    state.score += 100;

    spawnBonus(
      brick.x + brick.w / 2,
      brick.y + brick.h / 2
    );

    explode(
      brick.x + brick.w / 2,
      brick.y + brick.h / 2,
      brick.color,
      16
    );

    sfx("break");
  }

  updateScore();
}


// ============================================================
// BONUS EFFECTS
// ============================================================

function applyBonus(type) {

  if (type === "big") {

    platform.w =
      Math.min(
        platform.baseW * 1.8,
        platform.w * 1.35
      );

    powers.big = true;

    clearTimeout(
      powers.bigTimer
    );

    powers.bigTimer =
      setTimeout(() => {

        platform.w =
          platform.baseW;

        powers.big = false;

      }, 15000);
  }


  if (type === "fire") {

    powers.fire = true;

    for (const ball of balls) {
      ball.fire = true;
    }

    clearTimeout(
      powers.fireTimer
    );

    powers.fireTimer =
      setTimeout(() => {

        powers.fire = false;

        for (const ball of balls) {
          ball.fire = false;
        }

      }, 12000);
  }


  if (type === "multi") {

    if (balls.length < 8) {

      const current =
        [...balls];

      for (
        const source
        of current
      ) {

        if (
          balls.length >= 8
        ) {
          break;
        }

        if (source.stuck) {
          continue;
        }

        const angle =
          Math.atan2(
            source.vy,
            source.vx
          );

        const offset =
          (Math.random() > 0.5
            ? 1
            : -1) *
          (0.25 + Math.random() * 0.3);

        const speed =
          Math.sqrt(
            source.vx *
            source.vx +
            source.vy *
            source.vy
          );

        const clone =
          createBall(
            source.x,
            source.y,

            Math.cos(
              angle + offset
            ) * speed,

            Math.sin(
              angle + offset
            ) * speed,

            powers.fire === true
          );

        clone.stuck = false;

        balls.push(clone);
      }
    }
  }


  if (type === "slow") {

    powers.slow = true;

    for (const ball of balls) {

      ball.vx *= 0.75;
      ball.vy *= 0.75;
    }

    clearTimeout(
      powers.slowTimer
    );

    powers.slowTimer =
      setTimeout(() => {

        powers.slow = false;

        for (const ball of balls) {

          ball.vx *= 1.3333;
          ball.vy *= 1.3333;
        }

      }, 10000);
  }
}


// ============================================================
// BUFF UI
// ============================================================

function showBuff(
  label,
  color
) {

  const buff =
    document.createElement("div");

  buff.className = "buff";

  buff.textContent = label;

  buff.style.color = color;

  buff.style.borderColor =
    color;

  buffsWrap.appendChild(buff);

  setTimeout(() => {

    buff.remove();

  }, 2200);
}


// ============================================================
// PLATFORM INPUT
// ============================================================

function updatePlatform() {

  platform.vx = 0;

  if (keys.left) {
    platform.vx -= platform.speed;
  }

  if (keys.right) {
    platform.vx += platform.speed;
  }

  if (platform.vx !== 0) {

    platform.x +=
      platform.vx;
  }

  if (platform.vx === 0) {

    const dx =
      mouseX -
      platform.x;

    if (
      Math.abs(dx) > 1
    ) {

      platform.x +=
        dx * 0.25;
    }
  }

  const half =
    platform.w / 2;

  platform.x =
    Math.max(
      half,
      Math.min(
        W - half,
        platform.x
      )
    );
}


// ============================================================
// UPDATE
// ============================================================

function update() {

  if (!state.running) {
    return;
  }

  const timeScale =
    devMode &&
    devConfig.slowMotion
      ? 0.35
      : 1;

  updatePlatform();


  // ----------------------------------------------------------
  // BALLS
  // ----------------------------------------------------------

  for (const ball of balls) {

    if (ball.stuck) {

      ball.x =
        platform.x;

      ball.y =
        platform.y -
        ball.r -
        2;

      continue;
    }


    const velocity =
      Math.sqrt(
        ball.vx * ball.vx +
        ball.vy * ball.vy
      );

    const steps =
      Math.max(
        1,
        Math.ceil(
          velocity / 4
        )
      );


    for (
      let step = 0;
      step < steps;
      step++
    ) {

      ball.x +=
        (ball.vx / steps) *
        timeScale;

      ball.y +=
        (ball.vy / steps) *
        timeScale;


      // ------------------------------------------------------
      // WALLS
      // ------------------------------------------------------

      if (
        ball.x -
          ball.r <=
        0
      ) {

        ball.x =
          ball.r;

        ball.vx =
          Math.abs(
            ball.vx
          );

        sfx("brick");
      }


      if (
        ball.x +
          ball.r >=
        W
      ) {

        ball.x =
          W -
          ball.r;

        ball.vx =
          -Math.abs(
            ball.vx
          );

        sfx("brick");
      }


      if (
        ball.y -
          ball.r <=
        0
      ) {

        ball.y =
          ball.r;

        ball.vy =
          Math.abs(
            ball.vy
          );

        sfx("brick");
      }


      // ------------------------------------------------------
      // PLATFORM
      // ------------------------------------------------------

      if (
        ball.vy > 0 &&
        ball.y + ball.r >=
          platform.y &&
        ball.y - ball.r <=
          platform.y +
          platform.h &&
        ball.x >=
          platform.x -
          platform.w / 2 &&
        ball.x <=
          platform.x +
          platform.w / 2
      ) {

        ball.y =
          platform.y -
          ball.r -
          0.5;

        const hit =
          (
            ball.x -
            platform.x
          ) /
          (platform.w / 2);

        const maxAngle =
          Math.PI / 3;

        const angle =
          hit * maxAngle;

        const speed =
          Math.max(
            5.2,
            Math.sqrt(
              ball.vx *
                ball.vx +
              ball.vy *
                ball.vy
            )
          );

        ball.vx =
          Math.sin(angle) *
          speed;

        ball.vy =
          -Math.cos(angle) *
          speed;

        ball.speed =
          speed;

        keepBallMovingVertically(ball);

        sfx("paddle");
      }


      // ------------------------------------------------------
      // BRICKS
      // ------------------------------------------------------

      for (const brick of bricks) {

        if (!brick.alive) {
          continue;
        }

        const collision =
          circleRectCollision(
            ball,
            brick
          );

        if (!collision) {
          continue;
        }


        ball.x +=
          collision.nx *
          collision.push;

        ball.y +=
          collision.ny *
          collision.push;


        hitBrick(
          ball,
          brick
        );


        // Fire balls pass through
        if (!ball.fire) {

          const dot =
            ball.vx *
              collision.nx +
            ball.vy *
              collision.ny;

          ball.vx -=
            2 *
            dot *
            collision.nx;

          ball.vy -=
            2 *
            dot *
            collision.ny;

          keepBallMovingVertically(
            ball
          );
        }

        break;
      }
    }


    // --------------------------------------------------------
    // TRAIL
    // --------------------------------------------------------

    ball.trail.push({
      x: ball.x,
      y: ball.y
    });

    if (
      ball.trail.length >
      8
    ) {
      ball.trail.shift();
    }
  }


  // ----------------------------------------------------------
  // REMOVE LOST BALLS
  // ----------------------------------------------------------

  balls =
    balls.filter(
      ball =>
        ball.y <
        H + 30
    );


  // ----------------------------------------------------------
  // LIFE LOST
  // ----------------------------------------------------------

  if (
    balls.length === 0
  ) {

    if (
      devMode &&
      (
        devConfig.infiniteLives ||
        devConfig.godMode
      )
    ) {

      resetBall();

      livesEl.textContent =
        devConfig.infiniteLives
          ? "∞"
          : state.lives;

    } else {

      state.lives--;

      livesEl.textContent =
        state.lives;

      if (
        state.lives <= 0
      ) {

        gameOver();

      } else {

        resetBall();
      }
    }
  }


  // ----------------------------------------------------------
  // RELEASE BALL
  // ----------------------------------------------------------

  // Space / W / ArrowUp handled in keydown.


  // ----------------------------------------------------------
  // BONUSES
  // ----------------------------------------------------------

  for (
    const bonus
    of bonuses
  ) {

    bonus.y +=
      bonus.vy *
      timeScale;

    bonus.ang +=
      0.05 *
      timeScale;


    const left =
      platform.x -
      platform.w / 2;

    const right =
      platform.x +
      platform.w / 2;


    if (
      bonus.y +
        bonus.r >=
        platform.y &&
      bonus.y -
        bonus.r <=
        platform.y +
        platform.h &&
      bonus.x >= left &&
      bonus.x <= right
    ) {

      applyBonus(
        bonus.type
      );

      state.score += 150;

      updateScore();

      showBuff(
        bonus.label,
        bonus.color
      );

      sfx("bonus");

      bonus.y =
        H + 100;
    }
  }


  bonuses =
    bonuses.filter(
      bonus =>
        bonus.y <
        H + 40
    );


  // ----------------------------------------------------------
  // PARTICLES
  // ----------------------------------------------------------

  for (const particle of particles) {

    particle.x +=
      particle.vx *
      timeScale;

    particle.y +=
      particle.vy *
      timeScale;

    particle.vy +=
      0.05 *
      timeScale;

    particle.life -=
      0.025 *
      timeScale;
  }


  particles =
    particles.filter(
      particle =>
        particle.life > 0
    );


  // ----------------------------------------------------------
  // STARS
  // ----------------------------------------------------------

  for (const star of stars) {

    star.tw +=
      star.speed *
      timeScale;
  }


  // ----------------------------------------------------------
  // LEVEL COMPLETE
  // ----------------------------------------------------------

  const remaining =
    bricks.some(
      brick =>
        brick.alive
    );

  if (
    !remaining &&
    state.running
  ) {

    state.level++;

    levelEl.textContent =
      state.level;

    buildLevel(
      state.level
    );

    resetBall();

    sfx("level");
  }


  updateScore();
}


// ============================================================
// DRAW
// ============================================================

function draw() {

  // ----------------------------------------------------------
  // BACKGROUND
  // ----------------------------------------------------------

  const gradient =
    ctx.createRadialGradient(
      W / 2,
      H / 2,
      50,
      W / 2,
      H / 2,
      600
    );

  gradient.addColorStop(
    0,
    "#111d38"
  );

  gradient.addColorStop(
    1,
    "#03050b"
  );

  ctx.fillStyle =
    gradient;

  ctx.fillRect(
    0,
    0,
    W,
    H
  );


  // ----------------------------------------------------------
  // STARS
  // ----------------------------------------------------------

  for (const star of stars) {

    const alpha =
      star.a +
      Math.sin(star.tw) *
        0.2;

    ctx.globalAlpha =
      Math.max(
        0.05,
        alpha
      );

    ctx.fillStyle =
      "#ffffff";

    ctx.beginPath();

    ctx.arc(
      star.x,
      star.y,
      star.r,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  ctx.globalAlpha = 1;


  // ----------------------------------------------------------
  // BRICKS
  // ----------------------------------------------------------

  for (const brick of bricks) {

    if (!brick.alive) {
      continue;
    }

    drawBrick(
      brick
    );
  }


  // ----------------------------------------------------------
  // BONUSES
  // ----------------------------------------------------------

  for (
    const bonus
    of bonuses
  ) {

    drawBonus(
      bonus
    );
  }


  // ----------------------------------------------------------
  // BALLS
  // ----------------------------------------------------------

  for (const ball of balls) {

    drawBall(
      ball
    );
  }


  // ----------------------------------------------------------
  // PLATFORM
  // ----------------------------------------------------------

  drawPlatform();


  // ----------------------------------------------------------
  // PARTICLES
  // ----------------------------------------------------------

  for (const particle of particles) {

    ctx.globalAlpha =
      particle.life;

    ctx.fillStyle =
      particle.color;

    ctx.beginPath();

    ctx.arc(
      particle.x,
      particle.y,
      particle.size,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  ctx.globalAlpha = 1;


  // ----------------------------------------------------------
  // DEVELOPER HITBOXES
  // ----------------------------------------------------------

  if (
    devMode &&
    devConfig.showHitboxes
  ) {

    ctx.save();

    ctx.lineWidth = 1;


    // Platform

    ctx.strokeStyle =
      "#00ff88";

    ctx.strokeRect(
      platform.x -
        platform.w / 2,
      platform.y,
      platform.w,
      platform.h
    );


    // Bricks

    ctx.strokeStyle =
      "#ffcc00";

    for (const brick of bricks) {

      if (!brick.alive) {
        continue;
      }

      ctx.strokeRect(
        brick.x,
        brick.y,
        brick.w,
        brick.h
      );
    }


    // Balls

    ctx.strokeStyle =
      "#ff3366";

    for (const ball of balls) {

      ctx.beginPath();

      ctx.arc(
        ball.x,
        ball.y,
        ball.r,
        0,
        Math.PI * 2
      );

      ctx.stroke();
    }

    ctx.restore();
  }
}


// ============================================================
// DRAW BRICK
// ============================================================

function drawBrick(
  brick
) {

  const color =
    brick.color;


  // Glow

  ctx.save();

  ctx.shadowBlur = 16;

  ctx.shadowColor =
    color;

  ctx.fillStyle =
    color;

  ctx.globalAlpha = 0.35;

  ctx.fillRect(
    brick.x,
    brick.y,
    brick.w,
    brick.h
  );

  ctx.restore();


  // Main brick

  const gradient =
    ctx.createLinearGradient(
      brick.x,
      brick.y,
      brick.x,
      brick.y +
        brick.h
    );

  gradient.addColorStop(
    0,
    color
  );

  gradient.addColorStop(
    1,
    "#111827"
  );

  ctx.fillStyle =
    gradient;

  ctx.fillRect(
    brick.x,
    brick.y,
    brick.w,
    brick.h
  );


  // Border

  ctx.strokeStyle =
    color;

  ctx.lineWidth = 1;

  ctx.strokeRect(
    brick.x + 0.5,
    brick.y + 0.5,
    brick.w - 1,
    brick.h - 1
  );


  // Highlight

  ctx.fillStyle =
    "rgba(255,255,255,0.2)";

  ctx.fillRect(
    brick.x + 3,
    brick.y + 3,
    brick.w - 6,
    3
  );


  // Damage cracks

  if (
    brick.maxHp >= 2 &&
    brick.hp <
      brick.maxHp
  ) {

    ctx.strokeStyle =
      "rgba(255,255,255,0.55)";

    ctx.lineWidth = 1;

    ctx.beginPath();

    ctx.moveTo(
      brick.x + 12,
      brick.y + 4
    );

    ctx.lineTo(
      brick.x + 22,
      brick.y + 11
    );

    ctx.lineTo(
      brick.x + 17,
      brick.y + 18
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      brick.x + 40,
      brick.y + 4
    );

    ctx.lineTo(
      brick.x + 34,
      brick.y + 12
    );

    ctx.lineTo(
      brick.x + 48,
      brick.y + 18
    );

    ctx.stroke();
  }
}


// ============================================================
// DRAW BONUS
// ============================================================

function drawBonus(
  bonus
) {

  ctx.save();

  ctx.translate(
    bonus.x,
    bonus.y
  );

  ctx.rotate(
    bonus.ang
  );


  ctx.shadowBlur = 18;

  ctx.shadowColor =
    bonus.color;

  ctx.fillStyle =
    bonus.color;

  ctx.beginPath();

  ctx.moveTo(
    0,
    -bonus.r
  );

  ctx.lineTo(
    bonus.r,
    0
  );

  ctx.lineTo(
    0,
    bonus.r
  );

  ctx.lineTo(
    -bonus.r,
    0
  );

  ctx.closePath();

  ctx.fill();


  ctx.fillStyle =
    "#ffffff";

  ctx.globalAlpha =
    0.8;

  ctx.beginPath();

  ctx.arc(
    0,
    0,
    4,
    0,
    Math.PI * 2
  );

  ctx.fill();


  ctx.restore();
}


// ============================================================
// DRAW BALL
// ============================================================

function drawBall(
  ball
) {

  // Trail

  if (
    ball.trail &&
    ball.trail.length > 1
  ) {

    for (
      let i = 0;
      i <
      ball.trail.length;
      i++
    ) {

      const point =
        ball.trail[i];

      const alpha =
        i /
        ball.trail.length;

      ctx.globalAlpha =
        alpha * 0.35;

      ctx.fillStyle =
        ball.fire
          ? "#ff7b22"
          : "#7ad7ff";

      ctx.beginPath();

      ctx.arc(
        point.x,
        point.y,
        ball.r *
          alpha,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }


  // Ball

  const gradient =
    ctx.createRadialGradient(
      ball.x - 2,
      ball.y - 2,
      1,
      ball.x,
      ball.y,
      ball.r * 2
    );

  if (ball.fire) {

    gradient.addColorStop(
      0,
      "#ffffff"
    );

    gradient.addColorStop(
      0.3,
      "#fff36b"
    );

    gradient.addColorStop(
      0.7,
      "#ff8a25"
    );

    gradient.addColorStop(
      1,
      "#ff3b00"
    );

  } else {

    gradient.addColorStop(
      0,
      "#ffffff"
    );

    gradient.addColorStop(
      0.35,
      "#a9ecff"
    );

    gradient.addColorStop(
      0.75,
      "#4db9ff"
    );

    gradient.addColorStop(
      1,
      "#246cff"
    );
  }


  ctx.save();

  ctx.shadowBlur =
    ball.fire
      ? 24
      : 16;

  ctx.shadowColor =
    ball.fire
      ? "#ff5a00"
      : "#55cfff";

  ctx.fillStyle =
    gradient;

  ctx.beginPath();

  ctx.arc(
    ball.x,
    ball.y,
    ball.r,
    0,
    Math.PI * 2
  );

  ctx.fill();


  // Fire tail

  if (ball.fire) {

    ctx.globalAlpha = 0.65;

    ctx.fillStyle =
      "#ffb000";

    ctx.beginPath();

    ctx.moveTo(
      ball.x -
        ball.vx * 1.5,
      ball.y -
        ball.vy * 1.5
    );

    ctx.lineTo(
      ball.x -
        ball.vx * 0.4 +
        ball.vy * 0.35,
      ball.y -
        ball.vy * 0.4 -
        ball.vx * 0.35
    );

    ctx.lineTo(
      ball.x -
        ball.vx * 0.4 -
        ball.vy * 0.35,
      ball.y -
        ball.vy * 0.4 +
        ball.vx * 0.35
    );

    ctx.closePath();

    ctx.fill();
  }

  ctx.restore();

  ctx.globalAlpha = 1;
}


// ============================================================
// DRAW PLATFORM
// ============================================================

function drawPlatform() {

  const x =
    platform.x -
    platform.w / 2;

  const y =
    platform.y;


  ctx.save();

  ctx.shadowBlur = 18;

  ctx.shadowColor =
    "#4da6ff";


  const gradient =
    ctx.createLinearGradient(
      x,
      y,
      x,
      y + platform.h
    );

  gradient.addColorStop(
    0,
    "#8ee7ff"
  );

  gradient.addColorStop(
    0.45,
    "#438dff"
  );

  gradient.addColorStop(
    1,
    "#1e4dcb"
  );

  ctx.fillStyle =
    gradient;

  ctx.beginPath();

  ctx.roundRect(
    x,
    y,
    platform.w,
    platform.h,
    7
  );

  ctx.fill();


  ctx.fillStyle =
    "rgba(255,255,255,0.35)";

  ctx.fillRect(
    x + 8,
    y + 3,
    platform.w - 16,
    2
  );


  if (powers.big) {

    ctx.strokeStyle =
      "#6fffd0";

    ctx.lineWidth = 2;

    ctx.strokeRect(
      x - 2,
      y - 2,
      platform.w + 4,
      platform.h + 4
    );
  }


  ctx.restore();
}


// ============================================================
// SCORE
// ============================================================

function updateScore() {

  scoreEl.textContent =
    state.score;

  const best =
    Number(
      localStorage.getItem(
        "neonBreakoutBest"
      ) || 0
    );

  if (
    state.score >
    best
  ) {

    localStorage.setItem(
      "neonBreakoutBest",
      state.score
    );
  }

  bestEl.textContent =
    Math.max(
      best,
      state.score
    );
}


// ============================================================
// START GAME
// ============================================================

function startGame(
  mode = "player",
  level = 1
) {

  initAudio();

  devMode =
    mode === "developer";


  state.running = true;

  state.score = 0;

  state.level =
    Math.max(
      1,
      Math.floor(
        Number(level) || 1
      )
    );


  if (
    devMode &&
    devConfig.infiniteLives
  ) {

    state.lives =
      Infinity;

  } else {

    state.lives = 3;
  }


  balls.length = 0;
  bricks.length = 0;
  bonuses.length = 0;
  particles.length = 0;

  powers = {};


  platform.w =
    platform.baseW;

  platform.x =
    W / 2;

  platform.fire =
    false;

  platform.fireTimer =
    0;


  buildLevel(
    state.level
  );

  resetBall();


  overlay.classList.add(
    "hidden"
  );

  devPanel.classList.toggle(
    "hidden",
    !devMode
  );


  updateScore();

  levelEl.textContent =
    state.level;


  livesEl.textContent =
    devMode &&
    devConfig.infiniteLives
      ? "∞"
      : state.lives;


  if (devMode) {

    devLevelInput.value =
      state.level;
  }
}


// ============================================================
// DEVELOPER LEVEL LOADER
// ============================================================

function loadDeveloperLevel(
  level
) {

  if (!devMode) {
    return;
  }


  level =
    Math.max(
      1,
      Math.min(
        9999,
        Math.floor(
          Number(level) || 1
        )
      )
    );


  state.running = true;

  state.level =
    level;


  balls.length = 0;
  bricks.length = 0;
  bonuses.length = 0;
  particles.length = 0;

  powers = {};


  platform.w =
    platform.baseW;

  platform.x =
    W / 2;


  buildLevel(
    level
  );

  resetBall();


  devLevelInput.value =
    level;

  levelEl.textContent =
    level;


  livesEl.textContent =
    devConfig.infiniteLives
      ? "∞"
      : state.lives;


  overlay.classList.add(
    "hidden"
  );
}


// ============================================================
// GAME OVER
// ============================================================

function gameOver() {

  state.running = false;

  sfx("gameover");

  overlayTitle.textContent =
    "GAME OVER";

  overlaySubtitle.textContent =
    `Ты дошёл до уровня ${state.level}`;

  overlayHint.textContent =
    `Счёт: ${state.score}`;

  startBtn.textContent =
    "🔄 Играть снова";

  developerBtn.textContent =
    "🛠 Developer";

  devPanel.classList.add(
    "hidden"
  );

  overlay.classList.remove(
    "hidden"
  );
}


// ============================================================
// START BUTTON
// ============================================================

startBtn.addEventListener(
  "click",
  () => {

    overlayTitle.textContent =
      "NEON BREAKOUT";

    overlaySubtitle.textContent =
      "Разбей все блоки и доберись до следующего уровня";

    overlayHint.textContent =
      "Управление: ← → / A D / мышь / касание";

    startBtn.textContent =
      "🎮 Играть";

    startGame(
      "player",
      1
    );
  }
);


// ============================================================
// DEVELOPER BUTTON
// ============================================================

developerBtn.addEventListener(
  "click",
  () => {

    startGame(
      "developer",
      1
    );
  }
);


// ============================================================
// DEVELOPER CONTROLS
// ============================================================

devLoadLevel.addEventListener(
  "click",
  () => {

    loadDeveloperLevel(
      devLevelInput.value
    );
  }
);


devPrevLevel.addEventListener(
  "click",
  () => {

    loadDeveloperLevel(
      state.level - 1
    );
  }
);


devNextLevel.addEventListener(
  "click",
  () => {

    loadDeveloperLevel(
      state.level + 1
    );
  }
);


devRestart.addEventListener(
  "click",
  () => {

    loadDeveloperLevel(
      state.level
    );
  }
);


devSkip.addEventListener(
  "click",
  () => {

    loadDeveloperLevel(
      state.level + 1
    );
  }
);


devInfiniteLives.addEventListener(
  "change",
  () => {

    devConfig.infiniteLives =
      devInfiniteLives.checked;


    if (devMode) {

      livesEl.textContent =
        devConfig.infiniteLives
          ? "∞"
          : state.lives;
    }
  }
);


devGodMode.addEventListener(
  "change",
  () => {

    devConfig.godMode =
      devGodMode.checked;
  }
);


devHitboxes.addEventListener(
  "change",
  () => {

    devConfig.showHitboxes =
      devHitboxes.checked;
  }
);


devSlowMotion.addEventListener(
  "change",
  () => {

    devConfig.slowMotion =
      devSlowMotion.checked;
  }
);


devBossFrequency.addEventListener(
  "change",
  () => {

    const value =
      devBossFrequency.value;


    devConfig.bossFrequency =
      value === "random"
        ? "random"
        : Number(value);
  }
);


devExit.addEventListener(
  "click",
  () => {

    devMode = false;

    devPanel.classList.add(
      "hidden"
    );

    overlayTitle.textContent =
      "NEON BREAKOUT";

    overlaySubtitle.textContent =
      "Разбей все блоки и доберись до следующего уровня";

    overlayHint.textContent =
      "Управление: ← → / A D / мышь / касание";

    startBtn.textContent =
      "🎮 Играть";

    startGame(
      "player",
      1
    );
  }
);


// ============================================================
// KEYBOARD
// ============================================================

window.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "ArrowLeft" ||
      event.key.toLowerCase() === "a"
    ) {

      keys.left = true;

      event.preventDefault();
    }


    if (
      event.key === "ArrowRight" ||
      event.key.toLowerCase() === "d"
    ) {

      keys.right = true;

      event.preventDefault();
    }


    if (
      event.code === "Space"
    ) {

      event.preventDefault();

      if (
        !state.running
      ) {

        startGame(
          "player",
          1
        );

        return;
      }

      releaseStuck();
    }


    if (
      event.key === "ArrowUp" ||
      event.key.toLowerCase() === "w"
    ) {

      releaseStuck();
    }
  }
);


window.addEventListener(
  "keyup",
  event => {

    if (
      event.key === "ArrowLeft" ||
      event.key.toLowerCase() === "a"
    ) {

      keys.left = false;
    }


    if (
      event.key === "ArrowRight" ||
      event.key.toLowerCase() === "d"
    ) {

      keys.right = false;
    }
  }
);


// ============================================================
// MOUSE
// ============================================================

canvas.addEventListener(
  "mousemove",
  event => {

    const rect =
      canvas.getBoundingClientRect();


    mouseX =
      (
        (event.clientX -
          rect.left) /
        rect.width
      ) * W;
  }
);


canvas.addEventListener(
  "click",
  () => {

    if (state.running) {

      releaseStuck();
    }
  }
);


// ============================================================
// TOUCH
// ============================================================

canvas.addEventListener(
  "touchstart",
  event => {

    initAudio();

    releaseStuck();

    event.preventDefault();

  },
  {
    passive: false
  }
);


canvas.addEventListener(
  "touchmove",
  event => {

    const touch =
      event.touches[0];

    if (!touch) {
      return;
    }

    const rect =
      canvas.getBoundingClientRect();


    mouseX =
      (
        (touch.clientX -
          rect.left) /
        rect.width
      ) * W;


    event.preventDefault();

  },
  {
    passive: false
  }
);


// ============================================================
// MUTE
// ============================================================

muteBtn.addEventListener(
  "click",
  () => {

    muted =
      !muted;

    muteBtn.textContent =
      muted
        ? "🔇"
        : "🔊";
  }
);


// ============================================================
// RESIZE
// ============================================================

function fitCanvas() {

  const maxWidth =
    Math.min(
      window.innerWidth,
      800
    );

  canvas.style.width =
    `${maxWidth}px`;

  canvas.style.height =
    `${maxWidth * 0.75}px`;
}


window.addEventListener(
  "resize",
  fitCanvas
);

fitCanvas();


// ============================================================
// INITIAL STATE
// ============================================================

levelEl.textContent = "1";
livesEl.textContent = "3";

updateScore();


// ============================================================
// GAME LOOP
// ============================================================

function loop() {

  update();

  draw();

  requestAnimationFrame(
    loop
  );
}

loop();
