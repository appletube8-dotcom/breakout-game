const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const livesEl = document.getElementById("lives");
const bestEl = document.getElementById("best");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlaySubtitle = document.getElementById("overlaySubtitle");

const startBtn = document.getElementById("startBtn");
const developerBtn = document.getElementById("developerBtn");

const devPanel = document.getElementById("devPanel");
const devLevel = document.getElementById("devLevel");
const devLoad = document.getElementById("devLoad");
const devPrev = document.getElementById("devPrev");
const devNext = document.getElementById("devNext");
const devRestart = document.getElementById("devRestart");
const devSkip = document.getElementById("devSkip");

const devInfiniteLives = document.getElementById("devInfiniteLives");
const devGodMode = document.getElementById("devGodMode");
const devHitboxes = document.getElementById("devHitboxes");
const devSlowMotion = document.getElementById("devSlowMotion");
const devBossFrequency = document.getElementById("devBossFrequency");
const devExit = document.getElementById("devExit");

const buffsWrap = document.getElementById("buffsWrap");

canvas.width = 800;
canvas.height = 600;


/* =========================================================
   AUDIO
========================================================= */

let audioCtx = null;
let muted = false;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function beep(freq = 440, duration = 0.05, type = "square", volume = 0.03) {
    if (muted) return;

    try {
        initAudio();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
            0.001,
            audioCtx.currentTime + duration
        );

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}


/* =========================================================
   GAME STATE
========================================================= */

const state = {
    running: false,
    score: 0,
    level: 1,
    lives: 3,
    best: Number(localStorage.getItem("breakoutBest") || 0)
};

bestEl.textContent = state.best;

let devMode = false;

const devConfig = {
    infiniteLives: true,
    godMode: false,
    showHitboxes: false,
    slowMotion: false,
    bossFrequency: 5
};

let currentPattern = null;
let currentPatternName = "";

let levelTransitionLock = false;


/* =========================================================
   COLORS
========================================================= */

const brickColors = [
    "#ff4d6d",
    "#ff9f1c",
    "#ffe66d",
    "#00f5d4",
    "#4dabf7",
    "#9b5de5"
];


/* =========================================================
   PLAYER
========================================================= */

const platform = {
    x: 340,
    y: 550,
    w: 120,
    baseW: 120,
    h: 15,
    speed: 8,
    vx: 0,
    fire: false,
    fireTimer: 0
};


/* =========================================================
   OBJECT ARRAYS
========================================================= */

let balls = [];
let bricks = [];
let bonuses = [];
let particles = [];
let stars = [];


/* =========================================================
   POWER-UPS
========================================================= */

const powers = {
    big: 0,
    fire: 0,
    multi: 0,
    slow: 0
};


/* =========================================================
   INPUT
========================================================= */

const keys = {
    left: false,
    right: false
};

let mouseX = null;

document.addEventListener("keydown", e => {
    if (
        e.code === "ArrowLeft" ||
        e.code === "KeyA"
    ) {
        keys.left = true;
    }

    if (
        e.code === "ArrowRight" ||
        e.code === "KeyD"
    ) {
        keys.right = true;
    }

    if (
        e.code === "Space" ||
        e.code === "ArrowUp" ||
        e.code === "KeyW"
    ) {
        e.preventDefault();

        if (!state.running) {
            if (devMode) {
                startGame("developer", state.level);
            } else {
                startGame("player", state.level);
            }
        }

        balls.forEach(ball => {
            if (ball.stuck) {
                ball.stuck = false;
            }
        });
    }
});

document.addEventListener("keyup", e => {
    if (
        e.code === "ArrowLeft" ||
        e.code === "KeyA"
    ) {
        keys.left = false;
    }

    if (
        e.code === "ArrowRight" ||
        e.code === "KeyD"
    ) {
        keys.right = false;
    }
});

canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();

    mouseX =
        (e.clientX - rect.left) *
        (canvas.width / rect.width);
});

canvas.addEventListener("click", () => {
    initAudio();

    if (!state.running) {
        startGame(devMode ? "developer" : "player", state.level);
    }

    balls.forEach(ball => {
        if (ball.stuck) {
            ball.stuck = false;
        }
    });
});

canvas.addEventListener("touchstart", e => {
    e.preventDefault();

    initAudio();

    if (!state.running) {
        startGame(devMode ? "developer" : "player", state.level);
    }

    balls.forEach(ball => {
        if (ball.stuck) {
            ball.stuck = false;
        }
    });
}, { passive: false });

canvas.addEventListener("touchmove", e => {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];

    mouseX =
        (touch.clientX - rect.left) *
        (canvas.width / rect.width);
}, { passive: false });


/* =========================================================
   STARS
========================================================= */

function createStars() {
    stars = [];

    for (let i = 0; i < 90; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.5 + 0.3,
            a: Math.random() * 0.7 + 0.2,
            speed: Math.random() * 0.02 + 0.005
        });
    }
}

createStars();


/* =========================================================
   LEVEL PATTERNS
========================================================= */

const PATTERNS = [
    {
        name: "DIAMOND",
        grid: [
            ".....##.....",
            "....####....",
            "...######...",
            "..########..",
            ".##########.",
            "############",
            ".##########.",
            "..########..",
            "...######...",
            "....####...."
        ]
    },

    {
        name: "SPIRAL",
        grid: [
            "############",
            "#..........#",
            "#.########.#",
            "#.#........#",
            "#.#.######.#",
            "#.#.#....#.#",
            "#.#.#.##.#.#",
            "#.#.#....#.#",
            "#.#.######.#",
            "#..........#"
        ]
    },

    {
        name: "CROSS",
        grid: [
            ".....##.....",
            ".....##.....",
            ".....##.....",
            ".....##.....",
            "############",
            "############",
            ".....##.....",
            ".....##.....",
            ".....##.....",
            ".....##....."
        ]
    },

    {
        name: "CIRCLE",
        grid: [
            "....####....",
            "..##....##..",
            ".##......##.",
            "##........##",
            "##........##",
            "##........##",
            ".##......##.",
            "..##....##..",
            "....####....",
            "............"
        ]
    },

    {
        name: "GALAXY",
        grid: [
            "....##......",
            "...####.....",
            "..##..##....",
            ".##....##...",
            "######.#####",
            ".##....##...",
            "..##..##....",
            "...####.....",
            "....##......",
            "....##......"
        ]
    },

    {
        name: "WINGS",
        grid: [
            "##......##..",
            "###....###..",
            "####..####..",
            "#####.#####.",
            "############",
            ".##########.",
            "..########..",
            "...######...",
            "....####....",
            ".....##....."
        ]
    },

    {
        name: "MAZE",
        grid: [
            "############",
            "#......#...#",
            "#####..#.#.#",
            "#......#.#.#",
            "#.######.#.#",
            "#........#.#",
            "#.########.#",
            "#..........#",
            "##########.#",
            "............"
        ]
    },

    {
        name: "ARROW",
        grid: [
            ".....##.....",
            "....####....",
            "...######...",
            "..########..",
            ".##########.",
            "############",
            ".....##.....",
            ".....##.....",
            ".....##.....",
            ".....##....."
        ]
    },

    {
        name: "STAR",
        grid: [
            ".....##.....",
            ".....##.....",
            ".##..##..##.",
            "..########..",
            "############",
            ".##########.",
            "..########..",
            ".##..##..##.",
            "##...##...##",
            ".....##....."
        ]
    },

    {
        name: "CORE",
        grid: [
            "....####....",
            "...######...",
            "..########..",
            ".###....###.",
            "###..##..###",
            "###..##..###",
            ".###....###.",
            "..########..",
            "...######...",
            "....####...."
        ]
    }
];


/* =========================================================
   LEVEL HELPERS
========================================================= */

function getPatternForLevel(level) {
    const index = (level - 1) % PATTERNS.length;
    return PATTERNS[index];
}

function getBrickHP(level, row, col) {
    let hp = 1;

    if (level >= 4) hp = 2;
    if (level >= 8) hp = 3;

    // Central bricks become stronger on higher levels.
    const centerCol = 5.5;
    const centerRow = 4.5;

    const distance =
        Math.abs(col - centerCol) +
        Math.abs(row - centerRow);

    if (level >= 6 && distance < 4) {
        hp++;
    }

    return Math.min(hp, 3);
}

function createBrick(x, y, w, h, hp, colorIndex) {
    bricks.push({
        x,
        y,
        w,
        h,
        hp,
        maxHp: hp,
        colorIndex: colorIndex % brickColors.length,
        alive: true
    });
}


/* =========================================================
   BUILD LEVEL
========================================================= */

function buildLevel(level) {
    bricks = [];
    bonuses = [];
    particles = [];

    currentPattern = getPatternForLevel(level);
    currentPatternName = currentPattern.name;

    const grid = currentPattern.grid;

    const cols = 12;
    const rows = grid.length;

    const brickW = 54;
    const brickH = 21;
    const gap = 6;

    const totalW =
        cols * brickW +
        (cols - 1) * gap;

    const startX =
        (canvas.width - totalW) / 2;

    const startY = 72;

    for (let row = 0; row < rows; row++) {
        const line = grid[row];

        for (let col = 0; col < cols; col++) {
            if (line[col] !== "#") continue;

            const hp = getBrickHP(level, row, col);

            createBrick(
                startX + col * (brickW + gap),
                startY + row * (brickH + gap),
                brickW,
                brickH,
                hp,
                row + col + level
            );
        }
    }

    resetPlatform();
    resetBalls();

    updateHUD();
}


/* =========================================================
   PLATFORM
========================================================= */

function resetPlatform() {
    platform.baseW = 120;

    if (powers.big > 0) {
        platform.w = 180;
    } else {
        platform.w = platform.baseW;
    }

    platform.x =
        (canvas.width - platform.w) / 2;

    platform.y = 550;
    platform.vx = 0;

    platform.fire = powers.fire > 0;
}


/* =========================================================
   BALLS
========================================================= */

function createBall(x, y, dx, dy, stuck = false) {
    return {
        x,
        y,
        r: 7,
        dx,
        dy,
        speed: 5.5,
        stuck,
        trail: []
    };
}

function resetBalls() {
    balls = [
        createBall(
            platform.x + platform.w / 2,
            platform.y - 10,
            0,
            -5.5,
            true
        )
    ];
}


/* =========================================================
   GAME START
========================================================= */

function startGame(mode = "player", level = 1) {
    initAudio();

    devMode = mode === "developer";

    state.running = true;
    state.level = Math.max(1, Number(level) || 1);

    state.score = 0;

    if (devMode) {
        state.lives =
            devConfig.infiniteLives ||
            devConfig.godMode
                ? Infinity
                : 3;
    } else {
        state.lives = 3;
    }

    powers.big = 0;
    powers.fire = 0;
    powers.multi = 0;
    powers.slow = 0;

    overlay.style.display = "none";
    devPanel.style.display = devMode ? "block" : "none";

    buildLevel(state.level);
    updateBuffs();
}


/* =========================================================
   DEVELOPER LEVEL
========================================================= */

function loadDeveloperLevel(level) {
    if (!devMode) return;

    level = Math.max(1, Math.floor(Number(level) || 1));

    state.level = level;

    if (
        devConfig.infiniteLives ||
        devConfig.godMode
    ) {
        state.lives = Infinity;
    }

    buildLevel(state.level);
    updateHUD();
}

function restartLevel() {
    if (!state.running) return;

    buildLevel(state.level);
}

function skipLevel() {
    if (!state.running) return;

    state.level++;

    buildLevel(state.level);
}


/* =========================================================
   LEVEL COMPLETE
========================================================= */

function checkLevelComplete() {
    if (levelTransitionLock) return;

    const alive = bricks.some(brick => brick.alive);

    if (alive) return;

    levelTransitionLock = true;

    beep(880, 0.12, "sine", 0.05);
    beep(1100, 0.16, "sine", 0.04);

    state.score += 500 + state.level * 50;

    setTimeout(() => {
        state.level++;

        buildLevel(state.level);

        levelTransitionLock = false;
    }, 700);
}


/* =========================================================
   PLAYER DEATH
========================================================= */

function loseBall() {
    if (
        devMode &&
        (
            devConfig.infiniteLives ||
            devConfig.godMode
        )
    ) {
        resetBalls();
        return;
    }

    state.lives--;

    updateHUD();

    if (state.lives <= 0) {
        gameOver();
        return;
    }

    resetBalls();
}


/* =========================================================
   GAME OVER
========================================================= */

function gameOver() {
    state.running = false;

    if (state.score > state.best) {
        state.best = state.score;
        localStorage.setItem(
            "breakoutBest",
            state.best
        );
    }

    bestEl.textContent = state.best;

    overlayTitle.textContent = "GAME OVER";
    overlaySubtitle.textContent =
        `Score: ${state.score}`;

    startBtn.textContent = "PLAY AGAIN";
    developerBtn.textContent = "DEVELOPER MODE";

    overlay.style.display = "flex";
}


/* =========================================================
   UPDATE PLATFORM
========================================================= */

function updatePlatform(dt) {
    platform.vx = 0;

    if (keys.left) {
        platform.vx = -platform.speed;
    }

    if (keys.right) {
        platform.vx = platform.speed;
    }

    if (mouseX !== null) {
        const target =
            mouseX - platform.w / 2;

        platform.x +=
            (target - platform.x) * 0.18;
    } else {
        platform.x += platform.vx * dt;
    }

    platform.x = Math.max(
        0,
        Math.min(
            canvas.width - platform.w,
            platform.x
        )
    );

    if (powers.big <= 0) {
        platform.w = platform.baseW;
    } else {
        platform.w = 180;
    }
}


/* =========================================================
   BALL UPDATE
========================================================= */

function updateBall(ball, dt) {
    if (ball.stuck) {
        ball.x =
            platform.x +
            platform.w / 2;

        ball.y =
            platform.y -
            ball.r -
            2;

        return;
    }

    ball.trail.push({
        x: ball.x,
        y: ball.y
    });

    if (ball.trail.length > 10) {
        ball.trail.shift();
    }

    ball.x += ball.dx * dt;
    ball.y += ball.dy * dt;

    // Walls
    if (ball.x - ball.r <= 0) {
        ball.x = ball.r;
        ball.dx = Math.abs(ball.dx);
        beep(240, 0.025, "square", 0.02);
    }

    if (ball.x + ball.r >= canvas.width) {
        ball.x = canvas.width - ball.r;
        ball.dx = -Math.abs(ball.dx);
        beep(240, 0.025, "square", 0.02);
    }

    if (ball.y - ball.r <= 0) {
        ball.y = ball.r;
        ball.dy = Math.abs(ball.dy);
        beep(260, 0.025, "square", 0.02);
    }

    // Bottom
    if (ball.y - ball.r > canvas.height) {
        return false;
    }

    // Platform collision
    if (
        ball.dy > 0 &&
        ball.y + ball.r >= platform.y &&
        ball.y - ball.r <= platform.y + platform.h &&
        ball.x >= platform.x &&
        ball.x <= platform.x + platform.w
    ) {
        ball.y =
            platform.y -
            ball.r;

        const hit =
            (
                ball.x -
                (platform.x + platform.w / 2)
            ) /
            (platform.w / 2);

        const angle =
            hit * (Math.PI / 3);

        const speed =
            Math.sqrt(
                ball.dx * ball.dx +
                ball.dy * ball.dy
            );

        ball.dx =
            Math.sin(angle) * speed;

        ball.dy =
            -Math.cos(angle) * speed;

        if (Math.abs(ball.dy) < 2.2) {
            ball.dy =
                ball.dy < 0
                    ? -2.2
                    : 2.2;
        }

        beep(520, 0.035, "square", 0.025);

        if (platform.fire) {
            createParticles(
                ball.x,
                ball.y,
                "#ff7a00",
                8
            );
        }
    }

    // Bricks
    for (const brick of bricks) {
        if (!brick.alive) continue;

        if (
            ball.x + ball.r > brick.x &&
            ball.x - ball.r < brick.x + brick.w &&
            ball.y + ball.r > brick.y &&
            ball.y - ball.r < brick.y + brick.h
        ) {
            handleBrickHit(ball, brick);

            if (!powers.fire) {
                resolveBrickBounce(ball, brick);
            }

            break;
        }
    }

    return true;
}


/* =========================================================
   BRICK COLLISION
========================================================= */

function resolveBrickBounce(ball, brick) {
    const overlapLeft =
        ball.x + ball.r - brick.x;

    const overlapRight =
        brick.x + brick.w -
        (ball.x - ball.r);

    const overlapTop =
        ball.y + ball.r - brick.y;

    const overlapBottom =
        brick.y + brick.h -
        (ball.y - ball.r);

    const minHorizontal =
        Math.min(
            overlapLeft,
            overlapRight
        );

    const minVertical =
        Math.min(
            overlapTop,
            overlapBottom
        );

    if (minHorizontal < minVertical) {
        ball.dx *= -1;
    } else {
        ball.dy *= -1;
    }
}


/* =========================================================
   BRICK HIT
========================================================= */

function handleBrickHit(ball, brick) {
    brick.hp--;

    state.score +=
        brick.hp <= 0
            ? 25
            : 10;

    if (brick.hp <= 0) {
        brick.alive = false;

        createParticles(
            brick.x + brick.w / 2,
            brick.y + brick.h / 2,
            brickColors[brick.colorIndex],
            12
        );

        beep(
            300 + brick.colorIndex * 70,
            0.04,
            "square",
            0.025
        );

        maybeDropBonus(
            brick.x + brick.w / 2,
            brick.y + brick.h / 2
        );
    } else {
        createParticles(
            brick.x + brick.w / 2,
            brick.y + brick.h / 2,
            brickColors[brick.colorIndex],
            4
        );

        beep(
            180 + brick.hp * 80,
            0.025,
            "square",
            0.02
        );
    }

    // Fireball punches through bricks.
    if (powers.fire > 0) {
        ball.dy *= 0.995;
    }
}


/* =========================================================
   BONUS DROPS
========================================================= */

function maybeDropBonus(x, y) {
    const chance = 0.13;

    if (Math.random() > chance) return;

    const types = [
        "big",
        "fire",
        "multi",
        "slow"
    ];

    const type =
        types[
            Math.floor(
                Math.random() *
                types.length
            )
        ];

    bonuses.push({
        x,
        y,
        w: 22,
        h: 22,
        vy: 2.2,
        type,
        rotation: 0
    });
}


/* =========================================================
   BONUS UPDATE
========================================================= */

function updateBonuses(dt) {
    for (let i = bonuses.length - 1; i >= 0; i--) {
        const bonus = bonuses[i];

        bonus.y += bonus.vy * dt;
        bonus.rotation += 0.04 * dt;

        if (
            bonus.y + bonus.h >= platform.y &&
            bonus.y <= platform.y + platform.h &&
            bonus.x + bonus.w >= platform.x &&
            bonus.x <= platform.x + platform.w
        ) {
            activatePower(bonus.type);

            createParticles(
                bonus.x + bonus.w / 2,
                bonus.y + bonus.h / 2,
                "#ffffff",
                15
            );

            bonuses.splice(i, 1);
            continue;
        }

        if (bonus.y > canvas.height + 40) {
            bonuses.splice(i, 1);
        }
    }
}


/* =========================================================
   ACTIVATE POWER
========================================================= */

function activatePower(type) {
    powers[type] =
        Math.max(
            powers[type] || 0,
            600
        );

    if (type === "big") {
        platform.w = 180;
    }

    if (type === "fire") {
        platform.fire = true;
    }

    if (type === "multi") {
        if (balls.length < 5) {
            const source = balls[0];

            if (source) {
                balls.push(
                    createBall(
                        source.x,
                        source.y,
                        -4.5,
                        -5,
                        false
                    )
                );

                balls.push(
                    createBall(
                        source.x,
                        source.y,
                        4.5,
                        -5,
                        false
                    )
                );
            }
        }
    }

    if (type === "slow") {
        // Timer handled by power state.
    }

    beep(900, 0.08, "sine", 0.04);

    updateBuffs();
}


/* =========================================================
   POWER TIMERS
========================================================= */

function updatePowers(dt) {
    let changed = false;

    for (const key of Object.keys(powers)) {
        if (powers[key] > 0) {
            powers[key] -= dt;
            changed = true;

            if (powers[key] <= 0) {
                powers[key] = 0;

                if (key === "big") {
                    platform.w = platform.baseW;
                }

                if (key === "fire") {
                    platform.fire = false;
                }
            }
        }
    }

    if (changed) {
        updateBuffs();
    }
}


/* =========================================================
   BUFF UI
========================================================= */

function updateBuffs() {
    if (!buffsWrap) return;

    buffsWrap.innerHTML = "";

    const labels = {
        big: "BIG",
        fire: "FIRE",
        multi: "MULTI",
        slow: "SLOW"
    };

    for (const key of Object.keys(powers)) {
        if (powers[key] <= 0) continue;

        const div = document.createElement("div");

        div.className =
            `buff buff-${key}`;

        div.textContent =
            `${labels[key]} ${Math.ceil(powers[key] / 60)}`;

        buffsWrap.appendChild(div);
    }
}


/* =========================================================
   PARTICLES
========================================================= */

function createParticles(x, y, color, amount = 10) {
    for (let i = 0; i < amount; i++) {
        const angle =
            Math.random() * Math.PI * 2;

        const speed =
            Math.random() * 3 + 1;

        particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            decay:
                Math.random() * 0.03 + 0.015,
            size:
                Math.random() * 3 + 1,
            color
        });
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        p.vx *= 0.98;
        p.vy *= 0.98;

        p.life -= p.decay * dt;

        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}


/* =========================================================
   DRAW BACKGROUND
========================================================= */

function drawBackground(time) {
    ctx.fillStyle = "#050713";
    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    for (const star of stars) {
        const alpha =
            star.a +
            Math.sin(
                time * star.speed
            ) * 0.15;

        ctx.globalAlpha =
            Math.max(0.05, alpha);

        ctx.fillStyle = "#ffffff";

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

    // Subtle level pattern glow.
    const gradient =
        ctx.createRadialGradient(
            canvas.width / 2,
            250,
            20,
            canvas.width / 2,
            250,
            420
        );

    gradient.addColorStop(
        0,
        "rgba(70,100,255,0.08)"
    );

    gradient.addColorStop(
        1,
        "rgba(0,0,0,0)"
    );

    ctx.fillStyle = gradient;

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );
}


/* =========================================================
   DRAW BRICKS
========================================================= */

function drawBricks() {
    for (const brick of bricks) {
        if (!brick.alive) continue;

        const color =
            brickColors[brick.colorIndex];

        ctx.save();

        ctx.shadowBlur = 12;
        ctx.shadowColor = color;

        ctx.fillStyle = color;

        ctx.beginPath();

        if (ctx.roundRect) {
            ctx.roundRect(
                brick.x,
                brick.y,
                brick.w,
                brick.h,
                5
            );
        } else {
            ctx.rect(
                brick.x,
                brick.y,
                brick.w,
                brick.h
            );
        }

        ctx.fill();

        // Inner shine.
        ctx.shadowBlur = 0;

        ctx.fillStyle =
            "rgba(255,255,255,0.22)";

        ctx.fillRect(
            brick.x + 3,
            brick.y + 3,
            brick.w - 6,
            3
        );

        // HP indicator.
        if (brick.maxHp > 1) {
            ctx.fillStyle =
                "rgba(0,0,0,0.35)";

            const barW =
                (brick.w - 8) *
                (brick.hp / brick.maxHp);

            ctx.fillRect(
                brick.x + 4,
                brick.y + brick.h - 5,
                barW,
                2
            );
        }

        ctx.restore();
    }
}


/* =========================================================
   DRAW PLATFORM
========================================================= */

function drawPlatform() {
    const x = platform.x;
    const y = platform.y;
    const w = platform.w;
    const h = platform.h;

    ctx.save();

    ctx.shadowBlur = 20;

    if (platform.fire) {
        ctx.shadowColor = "#ff5a00";
        ctx.fillStyle = "#ff7a00";
    } else {
        ctx.shadowColor = "#00f5ff";
        ctx.fillStyle = "#00d9ff";
    }

    ctx.beginPath();

    if (ctx.roundRect) {
        ctx.roundRect(
            x,
            y,
            w,
            h,
            8
        );
    } else {
        ctx.rect(x, y, w, h);
    }

    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.fillStyle =
        "rgba(255,255,255,0.7)";

    ctx.fillRect(
        x + 8,
        y + 3,
        w - 16,
        3
    );

    ctx.restore();
}


/* =========================================================
   DRAW BALL
========================================================= */

function drawBall(ball) {
    // Trail
    for (let i = 0; i < ball.trail.length; i++) {
        const point =
            ball.trail[i];

        const alpha =
            i / ball.trail.length * 0.25;

        ctx.fillStyle =
            `rgba(100,220,255,${alpha})`;

        ctx.beginPath();

        ctx.arc(
            point.x,
            point.y,
            ball.r * 0.6,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }

    ctx.save();

    if (powers.fire > 0) {
        ctx.shadowColor = "#ff5a00";
        ctx.shadowBlur = 25;

        const gradient =
            ctx.createRadialGradient(
                ball.x - 2,
                ball.y - 2,
                1,
                ball.x,
                ball.y,
                ball.r * 2
            );

        gradient.addColorStop(
            0,
            "#fff6a0"
        );

        gradient.addColorStop(
            0.35,
            "#ffb000"
        );

        gradient.addColorStop(
            1,
            "#ff3300"
        );

        ctx.fillStyle = gradient;
    } else {
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 15;

        ctx.fillStyle = "#ffffff";
    }

    ctx.beginPath();

    ctx.arc(
        ball.x,
        ball.y,
        ball.r,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
}


/* =========================================================
   DRAW BONUSES
========================================================= */

function drawBonuses() {
    for (const bonus of bonuses) {
        const colors = {
            big: "#00f5d4",
            fire: "#ff5a00",
            multi: "#9b5de5",
            slow: "#4dabf7"
        };

        const symbols = {
            big: "B",
            fire: "F",
            multi: "M",
            slow: "S"
        };

        const color =
            colors[bonus.type];

        ctx.save();

        ctx.translate(
            bonus.x + bonus.w / 2,
            bonus.y + bonus.h / 2
        );

        ctx.rotate(
            bonus.rotation
        );

        ctx.shadowBlur = 18;
        ctx.shadowColor = color;

        ctx.fillStyle = color;

        ctx.beginPath();
        ctx.arc(
            0,
            0,
            10,
            0,
            Math.PI * 2
        );
        ctx.fill();

        ctx.shadowBlur = 0;

        ctx.fillStyle = "#07101c";

        ctx.font =
            "bold 12px Arial";

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillText(
            symbols[bonus.type],
            0,
            1
        );

        ctx.restore();
    }
}


/* =========================================================
   DRAW PARTICLES
========================================================= */

function drawParticles() {
    for (const p of particles) {
        ctx.globalAlpha =
            Math.max(0, p.life);

        ctx.fillStyle = p.color;

        ctx.beginPath();

        ctx.arc(
            p.x,
            p.y,
            p.size,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }

    ctx.globalAlpha = 1;
}


/* =========================================================
   DEVELOPER OVERLAY
========================================================= */

function drawDeveloperInfo() {
    if (!devMode) return;

    ctx.save();

    ctx.fillStyle =
        "rgba(0,0,0,0.55)";

    ctx.fillRect(
        10,
        10,
        210,
        48
    );

    ctx.font =
        "bold 12px Arial";

    ctx.fillStyle =
        "#00ffcc";

    ctx.fillText(
        `DEV • LEVEL ${state.level}`,
        20,
        29
    );

    ctx.fillStyle =
        "#ffffff";

    ctx.fillText(
        currentPatternName,
        20,
        47
    );

    ctx.restore();
}


/* =========================================================
   HITBOXES
========================================================= */

function drawHitboxes() {
    if (!devMode || !devConfig.showHitboxes) {
        return;
    }

    ctx.save();

    ctx.lineWidth = 1;

    ctx.strokeStyle =
        "rgba(0,255,0,0.8)";

    ctx.strokeRect(
        platform.x,
        platform.y,
        platform.w,
        platform.h
    );

    ctx.strokeStyle =
        "rgba(255,0,0,0.8)";

    for (const brick of bricks) {
        if (!brick.alive) continue;

        ctx.strokeRect(
            brick.x,
            brick.y,
            brick.w,
            brick.h
        );
    }

    ctx.strokeStyle =
        "rgba(255,255,0,0.9)";

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


/* =========================================================
   HUD
========================================================= */

function updateHUD() {
    scoreEl.textContent =
        state.score;

    levelEl.textContent =
        state.level;

    livesEl.textContent =
        state.lives === Infinity
            ? "∞"
            : state.lives;

    bestEl.textContent =
        state.best;
}


/* =========================================================
   MAIN UPDATE
========================================================= */

let lastTime = performance.now();

function update(time) {
    const rawDt =
        Math.min(
            2,
            (time - lastTime) / 16.6667
        );

    lastTime = time;

    const timeScale =
        devMode &&
        devConfig.slowMotion
            ? 0.35
            : powers.slow > 0
                ? 0.55
                : 1;

    const dt =
        rawDt * timeScale;

    if (state.running) {
        updatePlatform(dt);
        updatePowers(dt);
        updateBonuses(dt);
        updateParticles(dt);

        for (
            let i = balls.length - 1;
            i >= 0;
            i--
        ) {
            const alive =
                updateBall(
                    balls[i],
                    dt
                );

            if (!alive) {
                balls.splice(i, 1);
            }
        }

        if (balls.length === 0) {
            loseBall();
        }

        checkLevelComplete();
        updateHUD();
    }

    draw(time);

    requestAnimationFrame(update);
}


/* =========================================================
   MAIN DRAW
========================================================= */

function draw(time) {
    drawBackground(time);

    drawBricks();
    drawBonuses();
    drawParticles();
    drawPlatform();

    for (const ball of balls) {
        drawBall(ball);
    }

    drawDeveloperInfo();
    drawHitboxes();
}


/* =========================================================
   UI EVENTS
========================================================= */

startBtn.addEventListener("click", () => {
    startGame("player", 1);
});

developerBtn.addEventListener("click", () => {
    startGame("developer", 1);
});

devLoad.addEventListener("click", () => {
    loadDeveloperLevel(
        Number(devLevel.value)
    );
});

devPrev.addEventListener("click", () => {
    loadDeveloperLevel(
        Math.max(
            1,
            state.level - 1
        )
    );

    devLevel.value =
        state.level;
});

devNext.addEventListener("click", () => {
    loadDeveloperLevel(
        state.level + 1
    );

    devLevel.value =
        state.level;
});

devRestart.addEventListener("click", () => {
    restartLevel();
});

devSkip.addEventListener("click", () => {
    skipLevel();

    devLevel.value =
        state.level;
});


/* =========================================================
   DEV SETTINGS
========================================================= */

devInfiniteLives.addEventListener(
    "change",
    () => {
        devConfig.infiniteLives =
            devInfiniteLives.checked;

        if (
            devConfig.infiniteLives ||
            devConfig.godMode
        ) {
            state.lives = Infinity;
        } else if (
            state.lives === Infinity
        ) {
            state.lives = 3;
        }

        updateHUD();
    }
);

devGodMode.addEventListener(
    "change",
    () => {
        devConfig.godMode =
            devGodMode.checked;

        if (
            devConfig.godMode ||
            devConfig.infiniteLives
        ) {
            state.lives = Infinity;
        } else if (
            state.lives === Infinity
        ) {
            state.lives = 3;
        }

        updateHUD();
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

        if (value === "random") {
            devConfig.bossFrequency =
                "random";
        } else {
            devConfig.bossFrequency =
                Number(value);
        }
    }
);

devExit.addEventListener(
    "click",
    () => {
        devMode = false;

        devPanel.style.display =
            "none";

        startGame("player", 1);
    }
);


/* =========================================================
   MUTE
========================================================= */

const muteBtn =
    document.getElementById("muteBtn");

if (muteBtn) {
    muteBtn.addEventListener(
        "click",
        () => {
            muted = !muted;

            muteBtn.textContent =
                muted
                    ? "🔇"
                    : "🔊";
        }
    );
}


/* =========================================================
   START
========================================================= */

updateHUD();

overlayTitle.textContent =
    "BREAKOUT";

overlaySubtitle.textContent =
    "Break the wall. Survive the levels.";

startBtn.textContent =
    "PLAY";

developerBtn.textContent =
    "DEVELOPER MODE";

requestAnimationFrame(update);
