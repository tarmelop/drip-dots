/*
    Original project by Okazz:
    https://openprocessing.org/@okazz/2625827
*/
let colors = ['#e6302b', '#fbd400', '#36ad63', '#2B50AA', '#232323', '#f654a9'];
let ctx;
let centerX, centerY;
let bubbles = [];

// ---- Gravity / tilt ----
// gravity.x / gravity.y are in [-1, 1]: the direction drips should fall (screen coords).
let gravity = { x: 0, y: 0 };
let gravityTarget = { x: 0, y: 0 };
let tiltActive = false;   // true once real orientation data arrives
let mouseActive = false;  // true once the mouse has moved over the canvas
let showDebug = true;     // press 'd' to toggle the indicator

window.addEventListener('deviceorientation', (e) => {
	if (e.beta == null || e.gamma == null) return; // no real sensor
	tiltActive = true;
	// gamma: left/right tilt (-90..90), beta: front/back tilt (-180..180)
	let g = Math.max(-90, Math.min(90, e.gamma));
	let b = Math.max(-90, Math.min(90, e.beta));
	gravityTarget.x = Math.sin(g * Math.PI / 180);
	gravityTarget.y = Math.sin(b * Math.PI / 180);
});

// ---- Shake detection ----
const SHAKE_THRESHOLD = 18;   // m/s² of linear acceleration (gravity excluded)
const SHAKE_COOLDOWN = 1200;  // ms between shuffles
let lastShake = 0;
let lastAccel = null;

window.addEventListener('devicemotion', (e) => {
	let mag = 0;
	let a = e.acceleration;
	if (a && a.x != null) {
		mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
	} else if (e.accelerationIncludingGravity && e.accelerationIncludingGravity.x != null) {
		// Fallback: sudden change in acceleration-including-gravity
		let g = e.accelerationIncludingGravity;
		if (lastAccel) {
			let dx = g.x - lastAccel.x, dy = g.y - lastAccel.y, dz = g.z - lastAccel.z;
			mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
		}
		lastAccel = { x: g.x, y: g.y, z: g.z };
	}
	let now = Date.now();
	if (mag > SHAKE_THRESHOLD && now - lastShake > SHAKE_COOLDOWN) {
		lastShake = now;
		shuffleBubbles();
	}
});

// Trajectories to try on desktop with keys 1–5. Shaking uses SHAKE_MODE.
const TRAJECTORIES = {
	'1': 'straight', // straight line from start to end
	'2': 'center',   // every dot passes through the canvas center
	'3': 'arc',      // gentle random curve (the original shake motion)
	'4': 'vortex',   // swirl around the center, one full turn
	'5': 'explode',  // burst outward, then regroup
};
let SHAKE_MODE = 'explode';
let lastMode = '';
let lastModeFrame = -1000;

// Every dot flies to a different grid slot.
function shuffleBubbles(mode = SHAKE_MODE) {
	let slots = bubbles.map((b) => ({ x: b.homeX, y: b.homeY }));
	let perm = shuffle(slots.map((_, i) => i));
	let reordered = new Array(bubbles.length);
	for (let i = 0; i < bubbles.length; i++) {
		let b = bubbles[i];
		let s = slots[perm[i]];
		b.moveTo(s.x, s.y, mode);
		reordered[perm[i]] = b; // keep bubbles[idx] == the dot at grid slot idx
	}
	bubbles = reordered;
	lastMode = mode;
	lastModeFrame = frameCount;
}

function mouseMoved() {
	if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
		mouseActive = true;
	}
}

function updateGravity() {
	if (!tiltActive && mouseActive) {
		// Mouse fallback: direction from canvas center to the mouse
		gravityTarget.x = constrain((mouseX - centerX) / (width / 2), -1, 1);
		gravityTarget.y = constrain((mouseY - centerY) / (height / 2), -1, 1);
	}
	// Smooth out sensor jitter
	gravity.x = lerp(gravity.x, gravityTarget.x, 0.15);
	gravity.y = lerp(gravity.y, gravityTarget.y, 0.15);
}

function gravityStrength() {
	return min(1, sqrt(gravity.x * gravity.x + gravity.y * gravity.y));
}

function drawDebug() {
	let s = gravityStrength();
	push();
	translate(50, 50);
	noFill();
	stroke(0, 0, 70);
	strokeWeight(1);
	circle(0, 0, 60);
	stroke(0, 0, 20);
	strokeWeight(3);
	line(0, 0, gravity.x * 30, gravity.y * 30);
	noStroke();
	fill(0, 0, 30);
	textSize(11);
	textAlign(LEFT, CENTER);
	let src = tiltActive ? 'tilt' : (mouseActive ? 'mouse' : 'random');
	text(src + '  ' + nf(s, 1, 2), 40, 0);
	// Name of the trajectory just used, fading out over ~2 s
	let age = frameCount - lastModeFrame;
	if (lastMode && age < 120) {
		fill(0, 0, 30, map(age, 60, 120, 100, 0, true));
		textSize(13);
		text(lastMode, 40, 18);
	}
	pop();
}

function keyPressed() {
	if (key === 'd') showDebug = !showDebug;
	if (key === 's') shuffleBubbles(); // desktop stand-in for shaking
	if (TRAJECTORIES[key]) shuffleBubbles(TRAJECTORIES[key]);
}

function easeInOutCubic(x) {
	return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

const COLS = 8;
let gridKey = '';

function setup() {
	createCanvas(windowWidth, windowHeight);
	pixelDensity(min(2, displayDensity())); // cap for performance on high-DPI phones
	rectMode(CENTER);
	colorMode(HSB, 360, 100, 100, 100);
	ctx = drawingContext;
	buildGrid();
}

// 8 columns across; as many rows as fit vertically.
// On landscape screens the cell size is also capped by height, so at least 8 rows fit.
function buildGrid() {
	centerX = width / 2;
	centerY = height / 2;
	let cellSize = min(width, height) * 0.85 / COLS;
	let marginX = (width - cellSize * COLS) / 2;
	let marginMin = min(width, height) * 0.075; // same edge gap as the original square layout
	let rows = max(1, floor((height - 2 * marginMin) / cellSize));
	let gridH = cellSize * rows;
	let offsetY = (height - gridH) / 2;

	// Skip rebuilding if the grid is unchanged (e.g. mobile address bar showing/hiding
	// only shifts the height slightly) — just re-center vertically.
	let key = COLS + 'x' + rows + '@' + cellSize.toFixed(2);
	let old = bubbles;
	bubbles = [];
	for (let j = 0; j < rows; j++) {
		for (let i = 0; i < COLS; i++) {
			let x = marginX + cellSize * i + cellSize / 2;
			let y = offsetY + cellSize * j + cellSize / 2;
			let idx = j * COLS + i;
			let b;
			if (key === gridKey && old[idx]) {
				b = old[idx];
				b.setHome(x, y + cellSize * 0.2);
			} else {
				b = new Bubble(x, y + cellSize * 0.2, cellSize * 0.4);
				if (old[idx]) b.clr = old[idx].clr; // keep colors stable across resizes
			}
			bubbles.push(b);
		}
	}
	gridKey = key;
}

function windowResized() {
	resizeCanvas(windowWidth, windowHeight);
	buildGrid();
}

function draw() {
	background(255);
	updateGravity();
	for (let b of bubbles) {
		b.run();
	}
	if (showDebug) drawDebug();
}


function aetherLink(x1, y1, d1, x2, y2, d2, dst) {
	let r = dst / 2;

	let r1 = d1 / 2;
	let r2 = d2 / 2;
	let R1 = r1 + r;
	let R2 = r2 + r;

	let dx = x2 - x1;
	let dy = y2 - y1;
	let d = sqrt(dx * dx + dy * dy);

	if (d > R1 + R2) {
		return;
	}

	let dirX = dx / d;
	let dirY = dy / d;

	let a = (R1 * R1 - R2 * R2 + d * d) / (2 * d);
	let underRoot = R1 * R1 - a * a;
	if (underRoot < 0) return;
	let h = sqrt(underRoot);


	let midX = x1 + dirX * a;
	let midY = y1 + dirY * a;

	let perpX = -dirY * h;
	let perpY = dirX * h;

	let cx1 = midX + perpX;
	let cy1 = midY + perpY;

	let cx2 = midX - perpX;
	let cy2 = midY - perpY;

	if (dist(cx1, cy1, cx2, cy2) < r * 2) {
		return;
	}

	let ang1 = atan2(y1 - cy1, x1 - cx1);
	let ang2 = atan2(y2 - cy1, x2 - cx1);
	let ang3 = atan2(y2 - cy2, x2 - cx2);
	let ang4 = atan2(y1 - cy2, x1 - cx2);

	if (ang2 < ang1) {
		ang2 += TAU;
	}
	beginShape();
	for (let i = ang1; i < ang2; i += TAU / 180) {
		vertex(cx1 + r * cos(i), cy1 + r * sin(i));
	}

	if (ang4 < ang3) {
		ang4 += TAU;
	}
	for (let i = ang3; i < ang4; i += TAU / 180) {
		vertex(cx2 + r * cos(i), cy2 + r * sin(i));
	}
	endShape();
}

function easeOutQuint(x) {
	return 1 - Math.pow(1 - x, 5);
}

class Bubble {
	constructor(x, y, d) {
		this.x = x;
		this.y = y;
		this.d = d;
		this.cage = [];
		this.dst = this.d / 2;
		this.clr = random(colors);
		this.homeX = x;
		this.homeY = y;
		this.anim = null;
	}

	show() {
		push();
		translate(this.x, this.y);
		noStroke();
		fill(this.clr);
		circle(0, 0, this.d);

		// While flying to a new slot, show just the plain dot — no drips
		if (this.anim) {
			pop();
			return;
		}

		for (let c of this.cage) {
			c.run();

		}

		for (let c of this.cage) {
			aetherLink(c.x, c.y, c.d, 0, 0, this.d, this.dst);
		}

		for (let i = 0; i < this.cage.length; i++) {
			if (this.cage[i].isDead) {
				this.cage.splice(i, 1);
			}
		}

		if (random() < 0.02) {
			this.addWisp();
		}
		pop();

	}

	addWisp() {
		this.cage.push(new Wisp(0, 0, this.d * random(0.4, 0.9), this.d * random(0.75, 1.25)));
	}

	// Jump straight to a position (used on resize; cancels any shuffle animation)
	setHome(x, y) {
		this.x = this.homeX = x;
		this.y = this.homeY = y;
		this.anim = null;
	}

	// Animate to a new position along the given trajectory (see TRAJECTORIES)
	moveTo(x, y, mode) {
		let sx = this.x, sy = this.y;
		let dx = x - sx, dy = y - sy;
		let len = sqrt(dx * dx + dy * dy) || 1;
		let a = {
			mode: mode,
			sx: sx, sy: sy, ex: x, ey: y,
			t: -int(random(0, 15)),      // small random delay so they don't all move in lockstep
			dur: int(random(45, 75)),
		};
		if (mode === 'arc') {
			// perpendicular bend, proportional to distance
			a.px = -dy / len;
			a.py = dx / len;
			a.bend = len * random(-0.3, 0.3);
		} else if (mode === 'center') {
			// Quadratic Bézier whose midpoint (t=0.5) lands exactly on the canvas center
			a.cx = 2 * centerX - (sx + x) / 2;
			a.cy = 2 * centerY - (sy + y) / 2;
			a.dur = int(random(60, 90));
		} else if (mode === 'vortex') {
			// Polar interpolation around the center, plus one full turn
			a.a0 = atan2(sy - centerY, sx - centerX);
			a.a1 = atan2(y - centerY, x - centerX);
			while (a.a1 < a.a0) a.a1 += TAU;
			a.a1 += TAU;
			a.r0 = dist(sx, sy, centerX, centerY);
			a.r1 = dist(x, y, centerX, centerY);
			a.dur = int(random(80, 110));
		} else if (mode === 'explode') {
			// Bézier control point pushed far outward from the center: burst out, then regroup
			let ox = sx - centerX, oy = sy - centerY;
			let olen = sqrt(ox * ox + oy * oy) || 1;
			let push = max(width, height) * random(0.35, 0.6);
			a.cx = (sx + x) / 2 + (ox / olen) * push;
			a.cy = (sy + y) / 2 + (oy / olen) * push;
			a.dur = int(random(60, 90));
		}
		this.anim = a;
		this.homeX = x;
		this.homeY = y;
		this.cage = []; // drop any drips in progress
	}

	update() {
		let a = this.anim;
		if (!a) return;
		a.t++;
		let n = constrain(a.t / a.dur, 0, 1);
		let e = easeInOutCubic(n);
		if (a.mode === 'arc') {
			let arc = sin(PI * n) * a.bend;
			this.x = lerp(a.sx, a.ex, e) + a.px * arc;
			this.y = lerp(a.sy, a.ey, e) + a.py * arc;
		} else if (a.mode === 'center' || a.mode === 'explode') {
			let u = 1 - e;
			this.x = u * u * a.sx + 2 * u * e * a.cx + e * e * a.ex;
			this.y = u * u * a.sy + 2 * u * e * a.cy + e * e * a.ey;
		} else if (a.mode === 'vortex') {
			let ang = lerp(a.a0, a.a1, e);
			let r = lerp(a.r0, a.r1, e);
			this.x = centerX + r * cos(ang);
			this.y = centerY + r * sin(ang);
		} else { // 'straight'
			this.x = lerp(a.sx, a.ex, e);
			this.y = lerp(a.sy, a.ey, e);
		}
		if (n >= 1) this.setHome(this.homeX, this.homeY); // snap exactly into the slot
	}

	run() {
		this.update();
		this.show();
	}
}

class Wisp {
	constructor(x, y, d, r) {
		this.x = x;
		this.y = y;
		this.d = d;
		this.timer = 0;
		this.endTime = int(random(100, 300));
		// Direction follows gravity: the stronger the tilt, the tighter the spread
		// and the longer the drip. With no tilt it's fully random (original behaviour).
		let s = gravityStrength();
		if (s < 0.05) {
			this.ang = random(TAU);
		} else {
			let spread = lerp(PI / 2, 0.15, s);
			this.ang = atan2(gravity.y, gravity.x) + random(-spread, spread);
		}
		this.r = r * lerp(1, 1.6, s);
		this.originX = this.x;
		this.originY = this.y;
		this.targetX = this.x + this.r * cos(this.ang);
		this.targetY = this.y + this.r * sin(this.ang);
		this.originD = d;
		this.isDead = false;
	}

	show() {
		if (this.isDead == false) {
			circle(this.x, this.y, this.d);
		}
	}

	move() {
		this.timer++;
		if (0 < this.timer && this.timer < this.endTime) {
			let n = norm(this.timer, 0, this.endTime);
			this.x = lerp(this.originX, this.targetX, easeOutQuint(n));
			this.y = lerp(this.originY, this.targetY, easeOutQuint(n));
			this.d = lerp(this.originD, 0, n);
		}
		if (this.timer > this.endTime) {
			this.isDead = true;
		}
	}

	run() {
		this.show();
		this.move();
	}
}