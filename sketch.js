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
	pop();
}

function keyPressed() {
	if (key === 'd') showDebug = !showDebug;
}

function setup() {
	createCanvas(900, 900);
	rectMode(CENTER);
	colorMode(HSB, 360, 100, 100, 100);
	ctx = drawingContext;
	centerX = width / 2;
	centerY = height / 2;
	let area = width * 0.85;
	let cellCount = 8;
	let cellSize = area / cellCount;
	for (let i = 0; i < cellCount; i++) {
		for (let j = 0; j < cellCount; j++) {
			let x = cellSize * i + (cellSize / 2) + (width - area) / 2;
			let y = cellSize * j + (cellSize / 2) + (height - area) / 2;
			bubbles.push(new Bubble(x, y + cellSize * 0.2, cellSize * 0.4));
		}
	}
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
	}

	show() {
		push();
		translate(this.x, this.y);
		noStroke();
		fill(this.clr);
		circle(0, 0, this.d);


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

	run() {
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