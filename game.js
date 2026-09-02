
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const livesEl = document.getElementById("lives");
const bestEl = document.getElementById("best");
const muteBtn = document.getElementById("muteBtn");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlaySubtitle = document.getElementById("overlaySubtitle");
const startBtn = document.getElementById("startBtn");
const developerBtn = document.getElementById("developerBtn");

const devPanel = document.getElementById("devPanel");
const devLevelInput = document.getElementById("devLevelInput");
const devLoadLevel = document.getElementById("devLoadLevel");
const devPrevLevel = document.getElementById("devPrevLevel");
const devNextLevel = document.getElementById("devNextLevel");
const devRestart = document.getElementById("devRestart");
const devSkip = document.getElementById("devSkip");
const devInfiniteLives = document.getElementById("devInfiniteLives");
const devGodMode = document.getElementById("devGodMode");
const devHitboxes = document.getElementById("devHitboxes");
const devSlowMotion = document.getElementById("devSlowMotion");
const devBossFrequency = document.getElementById("devBossFrequency");
const devExit = document.getElementById("devExit");

const buffsWrap = document.getElementById("buffsWrap");

const W = canvas.width;
const H = canvas.height;

const state = {
    running: false,
    score: 0,
    level: 1,
    lives: 3,
    best: Number(localStorage.getItem("breakoutBest") || 0),
    muted: false,
    devMode: false,
    bossActive: false,
    bossDefeated: false
};

const devConfig = {
    infiniteLives: true,
    godMode: false,
    showHitboxes: false,
    slowMotion: false,
    bossFrequency: 5
};

let platform;
let balls = [];
let bricks = [];
let bonuses = [];
let particles = [];
let stars = [];

let activePowers = {
    big: 0,
    fire: 0,
    multi: 0,
    slow: 0
};

let boss = null;

let mouseX = W / 2;
let keys = {};
let audioCtx = null;

const COLORS = {
    bg: "#050712",
    white: "#ffffff",
    cyan: "#47f5ff",
    blue: "#4d7cff",
    purple: "#a855f7",
    pink: "#ff4fd8",
    green: "#35ff9a",
    yellow: "#ffe66d",
    orange: "#ff9f43",
    red: "#ff4b5c"
};

/* =========================================================
   AUDIO
========================================================= */

function beep(freq = 440, duration = 0.05, type = "sine", volume = 0.035) {
    if (state.muted) return;

    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.value = volume;

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            audioCtx.currentTime + duration
        );
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

/* =========================================================
   HELPERS
========================================================= */

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function rand(min, max) {
    return Math.random() * (max - min) + min;
}

function distance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

function circleRectCollision(ball, rect) {
    const closestX = clamp(ball.x, rect.x, rect.x + rect.w);
    const closestY = clamp(ball.y, rect.y, rect.y + rect.h);

    const dx = ball.x - closestX;
    const dy = ball.y - closestY;

    return dx * dx + dy * dy <= ball.r * ball.r;
}

function rectCollision(a, b) {
    return (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
    );
}

/* =========================================================
   STARS
========================================================= */

function createStars() {
    stars = [];

    for (let i = 0; i < 110; i++) {
        stars.push({
            x: Math.random() * W,
            y: Math.random() * H,
            r: Math.random() * 1.5 + 0.2,
            speed: Math.random() * 0.35 + 0.05,
            alpha: Math.random() * 0.7 + 0.2
        });
    }
}

function updateStars(dt) {
    for (const s of stars) {
        s.y += s.speed * dt;

        if (s.y > H) {
            s.y = -2;
            s.x = Math.random() * W;
        }
    }
}

function drawStars() {
    for (const s of stars) {
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;
}

/* =========================================================
   PARTICLES
========================================================= */

function spawnParticles(x, y, color, count = 8, power = 2) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * power + 0.5;

        particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            decay: rand(0.015, 0.035),
            size: rand(1, 4),
            color
        });
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.015 * dt;
        p.life -= p.decay * dt;

        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles() {
    for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;
}

/* =========================================================
   PATTERNS
========================================================= */

const PATTERNS = {
    DIAMOND: [
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
    ],

    SPIRAL: [
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
    ],

    CROSS: [
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
    ],

    CIRCLE: [
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
    ],

    GALAXY: [
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
    ],

    WINGS: [
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
    ],

    MAZE: [
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
    ],

    ARROW: [
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
    ],

    STAR: [
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
    ],

    CORE: [
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
};

const PATTERN_NAMES = Object.keys(PATTERNS);

function getPatternForLevel(level) {
    const index = (level - 1) % PATTERN_NAMES.length;
    return PATTERNS[PATTERN_NAMES[index]];
}

/* =========================================================
   BRICKS
========================================================= */

function getBrickHP(row, col, level) {
    let hp = 1;

    if (level >= 4) hp = 2;
    if (level >= 8) hp = 3;

    if (level >= 6) {
        const centerDistance = Math.abs(col - 5.5);

        if (centerDistance < 2.5 && row >= 2 && row <= 7) {
            hp = Math.min(3, hp + 1);
        }
    }

    return hp;
}

function createBricks() {
    bricks = [];

    const pattern = getPatternForLevel(state.level);

    const brickW = 54;
    const brickH = 21;
    const gap = 6;

    const totalW = 12 * brickW + 11 * gap;
    const startX = (W - totalW) / 2;
    const startY = 72;

    for (let row = 0; row < pattern.length; row++) {
        for (let col = 0; col < 12; col++) {
            if (pattern[row][col] !== "#") continue;

            const hp = getBrickHP(row, col, state.level);

            bricks.push({
                x: startX + col * (brickW + gap),
                y: startY + row * (brickH + gap),
                w: brickW,
                h: brickH,
                hp,
                maxHp: hp,
                alive: true,
                colorIndex: (row + col + state.level) % 6
            });
        }
    }
}

function getBrickColor(brick) {
    const ratio = brick.hp / brick.maxHp;

    if (ratio <= 0.34) return COLORS.red;
    if (ratio <= 0.67) return COLORS.orange;

    const colors = [
        COLORS.cyan,
        COLORS.blue,
        COLORS.purple,
        COLORS.pink,
        COLORS.green,
        COLORS.yellow
    ];

    return colors[brick.colorIndex % colors.length];
}

function drawBricks() {
    for (const brick of bricks) {
        if (!brick.alive) continue;

        const color = getBrickColor(brick);

        ctx.save();

        ctx.shadowBlur = 12;
        ctx.shadowColor = color;
        ctx.fillStyle = color;

        roundRect(
            ctx,
            brick.x,
            brick.y,
            brick.w,
            brick.h,
            5
        );

        ctx.fill();

        ctx.shadowBlur = 0;

        ctx.fillStyle = "rgba(255,255,255,0.18)";
        roundRect(
            ctx,
            brick.x + 2,
            brick.y + 2,
            brick.w - 4,
            5,
            3
        );
        ctx.fill();

        ctx.restore();

        if (brick.hp > 1) {
            ctx.fillStyle = "rgba(0,0,0,0.35)";
            ctx.font = "bold 10px Arial";
            ctx.textAlign = "center";
            ctx.fillText(
                brick.hp,
                brick.x + brick.w / 2,
                brick.y + brick.h - 5
            );
        }
    }
}

function hitBrick(brick, ball) {
    if (!brick.alive) return;

    brick.hp--;

    spawnParticles(
        ball.x,
        ball.y,
        getBrickColor(brick),
        brick.hp <= 0 ? 12 : 5,
        brick.hp <= 0 ? 3 : 1.5
    );

    beep(
        brick.hp <= 0 ? 500 : 300,
        brick.hp <= 0 ? 0.07 : 0.035,
        "square",
        0.025
    );

    if (brick.hp <= 0) {
        brick.alive = false;

        state.score += 100;

        if (Math.random() < 0.13) {
            spawnBonus(
                brick.x + brick.w / 2,
                brick.y + brick.h / 2
            );
        }
    } else {
        state.score += 25;
    }

    updateHUD();
}

/* =========================================================
   PLATFORM
========================================================= */

function createPlatform() {
    platform = {
        x: W / 2 - 70,
        y: H - 42,
        w: 140,
        h: 13,
        speed: 9
    };
}

function updatePlatform() {
    if (keys.ArrowLeft || keys.a || keys.A) {
        platform.x -= platform.speed;
    }

    if (keys.ArrowRight || keys.d || keys.D) {
        platform.x += platform.speed;
    }

    platform.x = clamp(
        platform.x,
        8,
        W - platform.w - 8
    );

    const target = mouseX - platform.w / 2;

    if (Math.abs(target - platform.x) > 1) {
        platform.x += (target - platform.x) * 0.18;
    }

    platform.x = clamp(
        platform.x,
        8,
        W - platform.w - 8
    );

    if (activePowers.big > 0) {
        platform.w = 190;
    } else {
        platform.w = 140;
    }
}

function drawPlatform() {
    if (!platform) return;

    const color = activePowers.big > 0
        ? COLORS.yellow
        : COLORS.cyan;

    ctx.save();

    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
    ctx.fillStyle = color;

    roundRect(
        ctx,
        platform.x,
        platform.y,
        platform.w,
        platform.h,
        7
    );

    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.7)";

    roundRect(
        ctx,
        platform.x + 10,
        platform.y + 2,
        platform.w - 20,
        3,
        2
    );

    ctx.fill();

    ctx.restore();
}

/* =========================================================
   BALLS
========================================================= */

function createBall(x = W / 2, y = H - 65, angle = -Math.PI / 2) {
    return {
        x,
        y,
        r: 7,
        vx: Math.cos(angle) * 5,
        vy: Math.sin(angle) * 5,
        fire: activePowers.fire > 0,
        stuck: false
    };
}

function resetBalls() {
    balls = [
        createBall(
            W / 2,
            H - 65,
            -Math.PI / 2 + rand(-0.35, 0.35)
        )
    ];
}

function drawBall(ball) {
    let color = COLORS.white;

    if (ball.fire) {
        color = COLORS.orange;
    } else if (activePowers.slow > 0) {
        color = COLORS.cyan;
    }

    ctx.save();

    ctx.shadowBlur = ball.fire ? 25 : 15;
    ctx.shadowColor = color;

    const gradient = ctx.createRadialGradient(
        ball.x - 2,
        ball.y - 2,
        1,
        ball.x,
        ball.y,
        ball.r
    );

    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.45, color);
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = gradient;

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r + (ball.fire ? 2 : 0), 0, Math.PI * 2);
    ctx.fill();

    if (ball.fire) {
        ctx.strokeStyle = "rgba(255,100,20,0.5)";
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(
            ball.x - ball.vx * 2,
            ball.y - ball.vy * 2
        );
        ctx.lineTo(
            ball.x - ball.vx * 7,
            ball.y - ball.vy * 7
        );
        ctx.stroke();
    }

    ctx.restore();
}

function spawnExtraBalls() {
    if (balls.length >= 6) return;

    const base = balls[0];

    for (let i = 0; i < 2; i++) {
        const angle =
            Math.atan2(base.vy, base.vx) +
            (i === 0 ? -0.35 : 0.35);

        balls.push(
            createBall(base.x, base.y, angle)
        );
    }

    beep(850, 0.12, "sine", 0.04);
}

/* =========================================================
   BONUSES
========================================================= */

const BONUS_TYPES = [
    "big",
    "fire",
    "multi",
    "slow"
];

function spawnBonus(x, y) {
    const type =
        BONUS_TYPES[
            Math.floor(Math.random() * BONUS_TYPES.length)
        ];

    bonuses.push({
        x,
        y,
        w: 25,
        h: 25,
        vy: 2.2,
        type,
        rotation: 0
    });
}

function updateBonuses(dt) {
    for (let i = bonuses.length - 1; i >= 0; i--) {
        const b = bonuses[i];

        b.y += b.vy * dt;
        b.rotation += 0.04 * dt;

        if (rectCollision(b, platform)) {
            activatePower(b.type);

            spawnParticles(
                b.x + b.w / 2,
                b.y + b.h / 2,
                getBonusColor(b.type),
                18,
                3
            );

            bonuses.splice(i, 1);
            continue;
        }

        if (b.y > H + 40) {
            bonuses.splice(i, 1);
        }
    }
}

function getBonusColor(type) {
    if (type === "big") return COLORS.yellow;
    if (type === "fire") return COLORS.orange;
    if (type === "multi") return COLORS.pink;
    if (type === "slow") return COLORS.cyan;

    return COLORS.white;
}

function getBonusLetter(type) {
    if (type === "big") return "B";
    if (type === "fire") return "F";
    if (type === "multi") return "M";
    if (type === "slow") return "S";

    return "?";
}

function drawBonuses() {
    for (const b of bonuses) {
        const color = getBonusColor(b.type);

        ctx.save();

        ctx.translate(
            b.x + b.w / 2,
            b.y + b.h / 2
        );

        ctx.rotate(b.rotation);

        ctx.shadowBlur = 18;
        ctx.shadowColor = color;

        ctx.fillStyle = color;

        roundRect(
            ctx,
            -b.w / 2,
            -b.h / 2,
            b.w,
            b.h,
            7
        );

        ctx.fill();

        ctx.shadowBlur = 0;

        ctx.fillStyle = "#050712";
        ctx.font = "bold 15px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillText(
            getBonusLetter(b.type),
            0,
            1
        );

        ctx.restore();
    }
}

function activatePower(type) {
    if (type === "big") {
        activePowers.big = 900;
    }

    if (type === "fire") {
        activePowers.fire = 900;

        for (const ball of balls) {
            ball.fire = true;
        }
    }

    if (type === "multi") {
        activePowers.multi = 900;
        spawnExtraBalls();
    }

    if (type === "slow") {
        activePowers.slow = 900;
    }

    beep(650, 0.1, "triangle", 0.04);
    updateBuffs();
}

function updatePowers(dt) {
    for (const key of Object.keys(activePowers)) {
        if (activePowers[key] > 0) {
            activePowers[key] -= dt;

            if (activePowers[key] <= 0) {
                activePowers[key] = 0;
            }
        }
    }

    for (const ball of balls) {
        ball.fire = activePowers.fire > 0;
    }

    updateBuffs();
}

function updateBuffs() {
    if (!buffsWrap) return;

    buffsWrap.innerHTML = "";

    const powers = [
        ["big", "B"],
        ["fire", "F"],
        ["multi", "M"],
        ["slow", "S"]
    ];

    for (const [type, letter] of powers) {
        if (activePowers[type] <= 0) continue;

        const div = document.createElement("div");

        div.textContent =
            letter + " " + Math.ceil(activePowers[type] / 60);

        div.style.cssText =
            "display:inline-flex;" +
            "align-items:center;" +
            "justify-content:center;" +
            "margin:3px;" +
            "padding:4px 8px;" +
            "border:1px solid " + getBonusColor(type) + ";" +
            "color:" + getBonusColor(type) + ";" +
            "border-radius:8px;" +
            "font:700 11px Arial;" +
            "box-shadow:0 0 10px " + getBonusColor(type) + ";";

        buffsWrap.appendChild(div);
    }
}
    if (!buffsWrap) return;

    buffsWrap.innerHTML = "";

    const powers = [
        ["big", "B"],
        ["fire", "F"],
        ["multi", "M"],
        ["slow", "S"]
    ];

    for (const [type, letter] of powers) {
        if (activePowers[type] <= 0) continue;

        const div = document.createElement("div");

        div.textContent =
            `${letter} ${Math.ceil(activePowers[type] / 60)}`;

        div.style.cssText = `
            display:inline-flex;
            align-items:center;
            justify-content:center;
            margin:3px;
            padding:4px 8px;
            border:1px solid ${getBonusColor(type)};
            color:${getBonusColor(type)};
            border-radius:8px;
            font:700 11px Arial;
            box-shadow:0 0 10px ${getBonusColor(type)};
        `;

        buffsWrap.appendChild(div);
    }
}

/* =========================================================
   BOSS ENGINE
========================================================= */

function shouldSpawnBoss(level) {
    if (level < 1) return false;

    const frequency = devConfig.bossFrequency;

    if (frequency === "random") {
        return Math.random() < 0.22;
    }

    return level % Number(frequency) === 0;
}

function createCageBoss() {
    state.bossActive = true;
    state.bossDefeated = false;

    boss = {
        type: "cage",

        x: 105,
        y: 90,
        w: W - 210,
        h: 310,

        maxHp: 35 + state.level * 3,
        hp: 35 + state.level * 3,

        phase: 0,
        rotation: 0,
        pulse: 0,

        moveTime: 0,
        openingTime: 0,

        opening: 0.5,
        openingSpeed: 0.004,

        segments: [],

        shield: true,
        shieldTimer: 0,

        hitFlash: 0,

        defeated: false
    };

    createCageSegments();

    bricks = [];
    bonuses = [];

    resetBalls();

    for (const ball of balls) {
        ball.vx *= 1.05;
        ball.vy *= 1.05;
    }

    beep(110, 0.35, "sawtooth", 0.06);
}

function createCageSegments() {
    if (!boss) return;

    boss.segments = [];

    const thickness = 12;
    const gapSize = 100;

    const topY = boss.y;
    const bottomY = boss.y + boss.h;

    const leftX = boss.x;
    const rightX = boss.x + boss.w;

    boss.segments.push({
        side: "top",
        x: leftX,
        y: topY,
        w: boss.w * 0.5 - gapSize / 2,
        h: thickness
    });

    boss.segments.push({
        side: "top",
        x: leftX + boss.w * 0.5 + gapSize / 2,
        y: topY,
        w: boss.w * 0.5 - gapSize / 2,
        h: thickness
    });

    boss.segments.push({
        side: "bottom",
        x: leftX,
        y: bottomY - thickness,
        w: boss.w * 0.5 - gapSize / 2,
        h: thickness
    });

    boss.segments.push({
        side: "bottom",
        x: leftX + boss.w * 0.5 + gapSize / 2,
        y: bottomY - thickness,
        w: boss.w * 0.5 - gapSize / 2,
        h: thickness
    });

    boss.segments.push({
        side: "left",
        x: leftX,
        y: topY,
        w: thickness,
        h: boss.h * 0.5 - gapSize / 2
    });

    boss.segments.push({
        side: "left",
        x: leftX,
        y: topY + boss.h * 0.5 + gapSize / 2,
        w: thickness,
        h: boss.h * 0.5 - gapSize / 2
    });

    boss.segments.push({
        side: "right",
        x: rightX - thickness,
        y: topY,
        w: thickness,
        h: boss.h * 0.5 - gapSize / 2
    });

    boss.segments.push({
        side: "right",
        x: rightX - thickness,
        y: topY + boss.h * 0.5 + gapSize / 2,
        w: thickness,
        h: boss.h * 0.5 - gapSize / 2
    });
}

function updateCageBoss(dt) {
    if (!boss || boss.defeated) return;

    boss.moveTime += dt;
    boss.openingTime += dt;
    boss.rotation += 0.0025 * dt;
    boss.pulse += 0.035 * dt;

    boss.shieldTimer += dt;

    if (boss.shieldTimer > 360) {
        boss.shieldTimer = 0;
        boss.shield = !boss.shield;

        beep(
            boss.shield ? 180 : 500,
            0.12,
            "sine",
            0.025
        );
    }

    if (boss.hitFlash > 0) {
        boss.hitFlash -= dt;
    }

    /*
       Slowly moves the cage vertically.
       This makes the boss arena itself dynamic.
    */

    const movement =
        Math.sin(boss.moveTime * 0.012) * 12;

    boss.y = 88 + movement;

    createCageSegments();
}

function getBossCore() {
    if (!boss) return null;

    return {
        x: boss.x + boss.w / 2,
        y: boss.y + boss.h / 2,
        r: 58
    };
}

function damageBoss(amount = 1) {
    if (!boss || boss.defeated) return;

    if (boss.shield) {
        spawnParticles(
            boss.x + boss.w / 2,
            boss.y + boss.h / 2,
            COLORS.blue,
            4,
            2
        );

        beep(170, 0.04, "square", 0.02);
        return;
    }

    boss.hp -= amount;
    boss.hitFlash = 8;

    state.score += 40;

    spawnParticles(
        boss.x + boss.w / 2,
        boss.y + boss.h / 2,
        COLORS.pink,
        6,
        2
    );

    beep(420, 0.04, "square", 0.025);

    if (boss.hp <= 0) {
        defeatBoss();
    }
}

function defeatBoss() {
    if (!boss || boss.defeated) return;

    boss.defeated = true;
    state.bossDefeated = true;

    state.score += 1500 + state.level * 100;

    for (let i = 0; i < 100; i++) {
        spawnParticles(
            boss.x + rand(0, boss.w),
            boss.y + rand(0, boss.h),
            [
                COLORS.cyan,
                COLORS.purple,
                COLORS.pink,
                COLORS.yellow,
                COLORS.white
            ][i % 5],
            1,
            6
        );
    }

    beep(90, 0.35, "sawtooth", 0.07);
    beep(280, 0.25, "triangle", 0.05);
    beep(600, 0.18, "sine", 0.04);

    setTimeout(() => {
        if (state.running) {
            nextLevel();
        }
    }, 1000);
}

function ballHitsCage(ball) {
    if (!boss || boss.defeated) return false;

    for (const segment of boss.segments) {
        if (!circleRectCollision(ball, segment)) continue;

        const centerX = segment.x + segment.w / 2;
        const centerY = segment.y + segment.h / 2;

        if (segment.w > segment.h) {
            ball.vy *= -1;

            if (ball.y < centerY) {
                ball.y = segment.y - ball.r - 1;
            } else {
                ball.y = segment.y + segment.h + ball.r + 1;
            }
        } else {
            ball.vx *= -1;

            if (ball.x < centerX) {
                ball.x = segment.x - ball.r - 1;
            } else {
                ball.x = segment.x + segment.w + ball.r + 1;
            }
        }

        spawnParticles(
            ball.x,
            ball.y,
            COLORS.cyan,
            5,
            1.5
        );

        beep(280, 0.035, "square", 0.02);

        return true;
    }

    return false;
}

function ballHitsBossCore(ball) {
    const core = getBossCore();

    if (!core || boss.defeated) return false;

    const d = distance(
        ball.x,
        ball.y,
        core.x,
        core.y
    );

    if (d <= ball.r + core.r) {
        damageBoss(ball.fire ? 2 : 1);

        /*
          Push ball away from the core so it doesn't get trapped.
        */

        const nx = (ball.x - core.x) || 0.01;
        const ny = (ball.y - core.y) || 0.01;
        const len = Math.hypot(nx, ny);

        ball.x = core.x + (nx / len) * (core.r + ball.r + 2);
        ball.y = core.y + (ny / len) * (core.r + ball.r + 2);

        const speed = Math.max(
            5,
            Math.hypot(ball.vx, ball.vy)
        );

        ball.vx = (nx / len) * speed;
        ball.vy = (ny / len) * speed;

        return true;
    }

    return false;
}

function drawBoss() {
    if (!boss || boss.defeated) return;

    ctx.save();

    const core = getBossCore();

    /*
       Outer cage glow
    */

    ctx.strokeStyle = boss.shield
        ? "rgba(77,124,255,0.45)"
        : "rgba(255,79,216,0.5)";

    ctx.lineWidth = 3;
    ctx.shadowBlur = 22;
    ctx.shadowColor = boss.shield
        ? COLORS.blue
        : COLORS.pink;

    ctx.strokeRect(
        boss.x,
        boss.y,
        boss.w,
        boss.h
    );

    ctx.shadowBlur = 0;

    /*
       Cage segments
    */

    for (const segment of boss.segments) {
        ctx.fillStyle = boss.shield
            ? COLORS.blue
            : COLORS.pink;

        ctx.shadowBlur = 15;
        ctx.shadowColor = boss.shield
            ? COLORS.blue
            : COLORS.pink;

        roundRect(
            ctx,
            segment.x,
            segment.y,
            segment.w,
            segment.h,
            4
        );

        ctx.fill();
    }

    /*
       Central core
    */

    const pulse =
        1 + Math.sin(boss.pulse) * 0.08;

    ctx.translate(core.x, core.y);
    ctx.rotate(boss.rotation);

    ctx.shadowBlur = 35;
    ctx.shadowColor = boss.shield
        ? COLORS.blue
        : COLORS.pink;

    ctx.strokeStyle = boss.shield
        ? COLORS.blue
        : COLORS.pink;

    ctx.lineWidth = 5;

    ctx.beginPath();

    for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const radius = (i % 2 === 0 ? 47 : 30) * pulse;

        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.closePath();
    ctx.stroke();

    ctx.rotate(-boss.rotation);

    const gradient = ctx.createRadialGradient(
        0,
        0,
        2,
        0,
        0,
        42
    );

    gradient.addColorStop(
        0,
        boss.shield
            ? "#ffffff"
            : "#ffb8ed"
    );

    gradient.addColorStop(
        0.3,
        boss.shield
            ? COLORS.blue
            : COLORS.pink
    );

    gradient.addColorStop(
        1,
        "rgba(0,0,0,0)"
    );

    ctx.fillStyle = gradient;

    ctx.beginPath();
    ctx.arc(
        0,
        0,
        43 * pulse,
        0,
        Math.PI * 2
    );
    ctx.fill();

    ctx.restore();

    /*
       Boss HP bar
    */

    const barW = 420;
    const barH = 14;
    const barX = (W - barW) / 2;
    const barY = 48;

    ctx.save();

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(
        ctx,
        barX,
        barY,
        barW,
        barH,
        7
    );
    ctx.fill();

    const hpRatio = clamp(
        boss.hp / boss.maxHp,
        0,
        1
    );

    ctx.fillStyle = boss.shield
        ? COLORS.blue
        : COLORS.pink;

    ctx.shadowBlur = 14;
    ctx.shadowColor = boss.shield
        ? COLORS.blue
        : COLORS.pink;

    roundRect(
        ctx,
        barX,
        barY,
        barW * hpRatio,
        barH,
        7
    );

    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";

    ctx.fillText(
        `CAGE  ${Math.max(0, Math.ceil(boss.hp))}/${boss.maxHp}`,
        W / 2,
        barY - 8
    );

    ctx.restore();
}

/* =========================================================
   BALL PHYSICS
========================================================= */

function updateBalls(dt) {
    const speedMultiplier =
        activePowers.slow > 0 ? 0.58 : 1;

    for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i];

        ball.x += ball.vx * speedMultiplier * dt;
        ball.y += ball.vy * speedMultiplier * dt;

        /*
           Side walls
        */

        if (ball.x - ball.r <= 0) {
            ball.x = ball.r;
            ball.vx = Math.abs(ball.vx);

            beep(220, 0.025, "square", 0.012);
        }

        if (ball.x + ball.r >= W) {
            ball.x = W - ball.r;
            ball.vx = -Math.abs(ball.vx);

            beep(220, 0.025, "square", 0.012);
        }

        /*
           Top wall
        */

        if (ball.y - ball.r <= 0) {
            ball.y = ball.r;
            ball.vy = Math.abs(ball.vy);

            beep(250, 0.025, "square", 0.012);
        }

        /*
           Boss collision
        */

        if (state.bossActive && boss && !boss.defeated) {
            ballHitsCage(ball);
            ballHitsBossCore(ball);
        } else {
            /*
               Normal bricks
            */

            for (const brick of bricks) {
                if (!brick.alive) continue;

                if (!circleRectCollision(ball, brick)) {
                    continue;
                }

                const prevX =
                    ball.x - ball.vx * speedMultiplier * dt;

                const prevY =
                    ball.y - ball.vy * speedMultiplier * dt;

                const hitHorizontal =
                    prevY + ball.r <= brick.y ||
                    prevY - ball.r >= brick.y + brick.h;

                const hitVertical =
                    prevX + ball.r <= brick.x ||
                    prevX - ball.r >= brick.x + brick.w;

                if (hitHorizontal) {
                    ball.vy *= -1;
                } else if (hitVertical) {
                    ball.vx *= -1;
                } else {
                    ball.vy *= -1;
                }

                if (ball.fire) {
                    /*
                       Fire ball punches through the brick
                       but still gives normal score.
                    */
                    hitBrick(brick, ball);
                } else {
                    hitBrick(brick, ball);
                }

                break;
            }
        }

        /*
           Platform
        */

        if (
            ball.vy > 0 &&
            circleRectCollision(
                ball,
                platform
            )
        ) {
            ball.y =
                platform.y -
                ball.r -
                1;

            const hitPosition =
                (ball.x -
                    (platform.x + platform.w / 2)) /
                (platform.w / 2);

            const angle =
                hitPosition * 1.15 -
                Math.PI / 2;

            const speed = Math.max(
                5.1,
                Math.hypot(ball.vx, ball.vy) * 1.01
            );

            ball.vx = Math.cos(angle) * speed;
            ball.vy = Math.sin(angle) * speed;

            if (ball.vy > -1) {
                ball.vy = -1.5;
            }

            spawnParticles(
                ball.x,
                platform.y,
                activePowers.fire > 0
                    ? COLORS.orange
                    : COLORS.cyan,
                5,
                1.5
            );

            beep(320, 0.035, "triangle", 0.018);
        }

        /*
           Ball lost
        */

        if (ball.y - ball.r > H) {
            balls.splice(i, 1);
        }
    }

    if (
        balls.length === 0 &&
        state.running &&
        !state.bossDefeated
    ) {
        loseLife();
    }
}

/* =========================================================
   LEVEL ENGINE
========================================================= */

function isLevelComplete() {
    if (state.bossActive) {
        return boss && boss.defeated;
    }

    return bricks.every(b => !b.alive);
}

function nextLevel() {
    state.level++;

    state.bossActive = false;
    state.bossDefeated = false;
    boss = null;

    bonuses = [];
    activePowers = {
        big: 0,
        fire: 0,
        multi: 0,
        slow: 0
    };

    if (shouldSpawnBoss(state.level)) {
        createCageBoss();
    } else {
        createBricks();
        resetBalls();
    }

    updateHUD();

    beep(720, 0.08, "triangle", 0.035);
}

function loadLevel(level) {
    level = Math.max(1, Number(level) || 1);

    state.level = level;
    state.bossActive = false;
    state.bossDefeated = false;

    boss = null;

    bonuses = [];
    activePowers = {
        big: 0,
        fire: 0,
        multi: 0,
        slow: 0
    };

    if (shouldSpawnBoss(level)) {
        createCageBoss();
    } else {
        createBricks();
        resetBalls();
    }

    updateHUD();

    if (devLevelInput) {
        devLevelInput.value = level;
    }
}

function restartLevel() {
    state.bossActive = false;
    state.bossDefeated = false;

    boss = null;

    bonuses = [];

    activePowers = {
        big: 0,
        fire: 0,
        multi: 0,
        slow: 0
    };

    if (shouldSpawnBoss(state.level)) {
        createCageBoss();
    } else {
        createBricks();
        resetBalls();
    }

    state.running = true;

    updateHUD();
}

/* =========================================================
   LIVES / GAME FLOW
========================================================= */

function loseLife() {
    if (!state.running) return;

    if (
        devConfig.infiniteLives ||
        devConfig.godMode
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

    beep(130, 0.15, "sawtooth", 0.04);
}

function gameOver() {
    state.running = false;

    if (state.score > state.best) {
        state.best = state.score;
        localStorage.setItem(
            "breakoutBest",
            state.best
        );
    }

    updateHUD();

    showOverlay(
        "GAME OVER",
        `Score: ${state.score}`,
        "RESTART"
    );
}

function startGame() {
    state.score = 0;
    state.level = 1;
    state.lives =
        devConfig.infiniteLives ||
        devConfig.godMode
            ? Infinity
            : 3;

    state.running = true;

    state.bossActive = false;
    state.bossDefeated = false;

    boss = null;

    activePowers = {
        big: 0,
        fire: 0,
        multi: 0,
        slow: 0
    };

    bonuses = [];
    particles = [];

    createPlatform();

    if (shouldSpawnBoss(state.level)) {
        createCageBoss();
    } else {
        createBricks();
        resetBalls();
    }

    hideOverlay();
    updateHUD();
}

function skipLevel() {
    state.score += 250;

    nextLevel();
}

function showOverlay(title, subtitle, buttonText) {
    if (!overlay) return;

    overlayTitle.textContent = title;
    overlaySubtitle.textContent = subtitle;

    if (startBtn) {
        startBtn.textContent = buttonText;
    }

    overlay.style.display = "flex";
}

function hideOverlay() {
    if (overlay) {
        overlay.style.display = "none";
    }
}

/* =========================================================
   HUD
========================================================= */

function updateHUD() {
    if (scoreEl) {
        scoreEl.textContent = state.score;
    }

    if (levelEl) {
        levelEl.textContent = state.level;
    }

    if (livesEl) {
        livesEl.textContent =
            state.lives === Infinity
                ? "∞"
                : state.lives;
    }

    if (bestEl) {
        bestEl.textContent = state.best;
    }
}

/* =========================================================
   DEV MODE
========================================================= */

function updateDevUI() {
    if (devInfiniteLives) {
        devInfiniteLives.checked =
            devConfig.infiniteLives;
    }

    if (devGodMode) {
        devGodMode.checked =
            devConfig.godMode;
    }

    if (devHitboxes) {
        devHitboxes.checked =
            devConfig.showHitboxes;
    }

    if (devSlowMotion) {
        devSlowMotion.checked =
            devConfig.slowMotion;
    }

    if (devBossFrequency) {
        devBossFrequency.value =
            String(devConfig.bossFrequency);
    }

    if (devLevelInput) {
        devLevelInput.value =
            state.level;
    }
}

function openDeveloperMode() {
    state.devMode = true;

    if (devPanel) {
        devPanel.style.display = "block";
    }

    hideOverlay();
    updateDevUI();
}

function closeDeveloperMode() {
    state.devMode = false;

    if (devPanel) {
        devPanel.style.display = "none";
    }

    showOverlay(
        "BREAKOUT",
        "Ready?",
        "START"
    );
}

function toggleInfiniteLives() {
    devConfig.infiniteLives =
        !!devInfiniteLives.checked;

    if (
        devConfig.infiniteLives ||
        devConfig.godMode
    ) {
        state.lives = Infinity;
    } else if (state.lives === Infinity) {
        state.lives = 3;
    }

    updateHUD();
}

function toggleGodMode() {
    devConfig.godMode =
        !!devGodMode.checked;

    if (devConfig.godMode) {
        state.lives = Infinity;
    } else if (!devConfig.infiniteLives) {
        state.lives = 3;
    }

    updateHUD();
}

function setBossFrequency(value) {
    if (value === "random") {
        devConfig.bossFrequency = "random";
    } else {
        devConfig.bossFrequency =
            Number(value) || 5;
    }
}

/* =========================================================
   HITBOXES
========================================================= */

function drawHitboxes() {
    if (!devConfig.showHitboxes) return;

    ctx.save();

    ctx.lineWidth = 1;
    ctx.strokeStyle = "#ffffff";

    if (platform) {
        ctx.strokeRect(
            platform.x,
            platform.y,
            platform.w,
            platform.h
        );
    }

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

    for (const brick of bricks) {
        if (!brick.alive) continue;

        ctx.strokeRect(
            brick.x,
            brick.y,
            brick.w,
            brick.h
        );
    }

    if (boss && !boss.defeated) {
        for (const segment of boss.segments) {
            ctx.strokeRect(
                segment.x,
                segment.y,
                segment.w,
                segment.h
            );
        }

        const core = getBossCore();

        ctx.beginPath();
        ctx.arc(
            core.x,
            core.y,
            core.r,
            0,
            Math.PI * 2
        );
        ctx.stroke();
    }

    ctx.restore();
}

/* =========================================================
   DRAW
========================================================= */

function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(
        r,
        w / 2,
        h / 2
    );

    ctx.beginPath();

    ctx.moveTo(x + radius, y);
    ctx.arcTo(
        x + w,
        y,
        x + w,
        y + h,
        radius
    );

    ctx.arcTo(
        x + w,
        y + h,
        x,
        y + h,
        radius
    );

    ctx.arcTo(
        x,
        y + h,
        x,
        y,
        radius
    );

    ctx.arcTo(
        x,
        y,
        x + w,
        y,
        radius
    );

    ctx.closePath();
}

function drawBackground() {
    const gradient = ctx.createLinearGradient(
        0,
        0,
        0,
        H
    );

    gradient.addColorStop(
        0,
        "#050712"
    );

    gradient.addColorStop(
        1,
        "#090d1c"
    );

    ctx.fillStyle = gradient;
    ctx.fillRect(
        0,
        0,
        W,
        H
    );

    drawStars();

    /*
       Subtle grid
    */

    ctx.save();

    ctx.globalAlpha = 0.035;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;

    for (let x = 0; x < W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
    }

    for (let y = 0; y < H; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }

    ctx.restore();
}

function drawDevInfo() {
    if (!state.devMode) return;

    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(
        ctx,
        10,
        10,
        210,
        72,
        8
    );
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "11px monospace";
    ctx.textAlign = "left";

    ctx.fillText(
        `DEV MODE`,
        20,
        28
    );

    ctx.fillText(
        `Level: ${state.level}`,
        20,
        45
    );

    ctx.fillText(
        `Boss: ${state.bossActive ? "CAGE" : "NO"}`,
        20,
        60
    );

    ctx.fillText(
        `Balls: ${balls.length}`,
        20,
        75
    );

    ctx.restore();
}

function draw() {
    drawBackground();

    drawBricks();

    if (state.bossActive) {
        drawBoss();
    }

    drawBonuses();

    drawPlatform();

    for (const ball of balls) {
        drawBall(ball);
    }

    drawParticles();

    drawHitboxes();

    drawDevInfo();
}

/* =========================================================
   MAIN LOOP
========================================================= */

let lastTime = performance.now();

function update(now) {
    const rawDt =
        Math.min(
            2,
            (now - lastTime) / 16.6667
        );

    lastTime = now;

    const dt =
        devConfig.slowMotion
            ? rawDt * 0.35
            : rawDt;

    updateStars(dt);
    updateParticles(dt);

    if (state.running) {
        updatePlatform();
        updatePowers(dt);
        updateBonuses(dt);
        updateBalls(dt);

        if (
            state.bossActive &&
            boss &&
            !boss.defeated
        ) {
            updateCageBoss(dt);
        }

        if (
            !state.bossActive &&
            bricks.length > 0 &&
            isLevelComplete()
        ) {
            nextLevel();
        }
    }

    draw();

    requestAnimationFrame(update);
}

/* =========================================================
   INPUT
========================================================= */

window.addEventListener("keydown", e => {
    keys[e.key] = true;

    if (
        e.key === " " &&
        !state.running
    ) {
        startGame();
    }
});

window.addEventListener("keyup", e => {
    keys[e.key] = false;
});

canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();

    mouseX =
        (e.clientX - rect.left) *
        (W / rect.width);
});

canvas.addEventListener(
    "touchmove",
    e => {
        if (!e.touches[0]) return;

        const rect =
            canvas.getBoundingClientRect();

        mouseX =
            (e.touches[0].clientX -
                rect.left) *
            (W / rect.width);

        e.preventDefault();
    },
    { passive: false }
);

canvas.addEventListener("touchstart", e => {
    if (!e.touches[0]) return;

    const rect =
        canvas.getBoundingClientRect();

    mouseX =
        (e.touches[0].clientX -
            rect.left) *
        (W / rect.width);

    if (!state.running) {
        startGame();
    }

    e.preventDefault();
}, { passive: false });

/* =========================================================
   BUTTONS
========================================================= */

if (startBtn) {
    startBtn.addEventListener(
        "click",
        () => {
            startGame();
        }
    );
}

if (developerBtn) {
    developerBtn.addEventListener(
        "click",
        () => {
            openDeveloperMode();
        }
    );
}

if (muteBtn) {
    muteBtn.addEventListener(
        "click",
        () => {
            state.muted = !state.muted;

            muteBtn.textContent =
                state.muted
                    ? "🔇"
                    : "🔊";
        }
    );
}

if (devLoadLevel) {
    devLoadLevel.addEventListener(
        "click",
        () => {
            loadLevel(
                Number(devLevelInput.value)
            );

            state.running = true;
        }
    );
}

if (devPrevLevel) {
    devPrevLevel.addEventListener(
        "click",
        () => {
            loadLevel(
                Math.max(
                    1,
                    state.level - 1
                )
            );

            state.running = true;
        }
    );
}

if (devNextLevel) {
    devNextLevel.addEventListener(
        "click",
        () => {
            loadLevel(
                state.level + 1
            );

            state.running = true;
        }
    );
}

if (devRestart) {
    devRestart.addEventListener(
        "click",
        () => {
            restartLevel();
        }
    );
}

if (devSkip) {
    devSkip.addEventListener(
        "click",
        () => {
            skipLevel();
        }
    );
}

if (devInfiniteLives) {
    devInfiniteLives.addEventListener(
        "change",
        toggleInfiniteLives
    );
}

if (devGodMode) {
    devGodMode.addEventListener(
        "change",
        toggleGodMode
    );
}

if (devHitboxes) {
    devHitboxes.addEventListener(
        "change",
        () => {
            devConfig.showHitboxes =
                devHitboxes.checked;
        }
    );
}

if (devSlowMotion) {
    devSlowMotion.addEventListener(
        "change",
        () => {
            devConfig.slowMotion =
                devSlowMotion.checked;
        }
    );
}

if (devBossFrequency) {
    devBossFrequency.addEventListener(
        "change",
        () => {
            setBossFrequency(
                devBossFrequency.value
            );
        }
    );
}

if (devExit) {
    devExit.addEventListener(
        "click",
        () => {
            closeDeveloperMode();
        }
    );
}

/* =========================================================
   INITIALIZATION
========================================================= */

createStars();
createPlatform();
createBricks();
resetBalls();

updateHUD();
updateDevUI();

showOverlay(
    "BREAKOUT",
    "Neon brick breaker",
    "START"
);

requestAnimationFrame(update);

