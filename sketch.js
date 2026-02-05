let video;
let currentSong = null;
let fft;
let amplitude;
let canvas;

// Album Metadata
const albumTracks = [
    { file: 'Vicious Delicious.mp3', title: 'VICIOUS DELICIOUS', visualMode: 'SPORES' },
    { file: 'Becoming Insane.mp3', title: 'BECOMING INSANE', visualMode: 'MYCELIUM' },
    { file: 'Artillery.mp3', title: 'ARTILLERY', visualMode: 'GLITCH' },
    { file: 'Suliman.mp3', title: 'SULIMAN', visualMode: 'SHARDS' },
    { file: 'Change The Formality.mp3', title: 'CHANGE THE FORMALITY', visualMode: 'SPORES' },
    { file: 'Before.mp3', title: 'BEFORE', visualMode: 'GLITCH' },
    { file: 'In Front Of Me.mp3', title: 'IN FRONT OF ME', visualMode: 'MYCELIUM' },
    { file: 'Eat It Raw [fqeqA6BT-nY].mp3', title: 'EAT IT RAW', visualMode: 'SHARDS' },
    { file: 'Forgive Me [U_PWczAwirg].mp3', title: 'FORGIVE ME', visualMode: 'GLITCH' },
    { file: 'Special Place.mp3', title: 'SPECIAL PLACE', visualMode: 'MYCELIUM' }
];

let songObjects = {}; // Map filename -> p5.SoundFile

// Config
const COLS = 160;
const ROWS = 120;
// ... (Constants kept same, simplified for brevity in replacement if needed, but I'll keeping context)

let particles = [];
let stars = [];
let pulses = []; // For expanding rings
let overloadParticles = []; // For extra burst particles

let prevPixels = [];
let handPose;
let hands = [];
let digitImages = []; // Sprite Textures for Numbers

// Hand Interaction Globals
window.dwellTimer = 0;
let lastHoveredElement = null;
let hasClicked = false;
const DWELL_THRESHOLD = 45; // ~0.75s (Slower Selection)
let graceTimer = 0; // Grace period for losing target


function preload() {
    // Load HandPose
    handPose = ml5.handPose();

    // Load All Album Tracks
    // Note: We use the filename as the key
    for (let track of albumTracks) {
        songObjects[track.file] = loadSound(track.file);
    }
}

function setup() {
    // Switch to WEBGL 
    canvas = createCanvas(windowWidth, windowHeight, WEBGL);
    canvas.parent('canvas-container');

    noStroke();

    // Camera Setup 
    video = createCapture(VIDEO);
    video.size(640, 480);
    video.hide();
    window.video = video;

    // Start Hand Detection
    handPose.detectStart(video, gotHands);

    // Setup Audio Analysis
    fft = new p5.FFT(0.8, 16);
    amplitude = new p5.Amplitude();
    amplitude.setInput();

    // Initialize Particle Grid - REMOVED for performance (unused)
    // initParticles();

    // Initialize Starfield
    for (let i = 0; i < 300; i++) {
        stars.push({
            x: random(-width, width),
            y: random(-height, height),
            z: random(-1000, -200)
        });
    }

    // Generate Digit Textures (0-9) for Matrix Rain
    // We pre-render white text so we can tint it later in HSB
    for (let i = 0; i < 10; i++) {
        let pg = createGraphics(32, 32);
        pg.pixelDensity(1); // Keep it crisp
        pg.textAlign(CENTER, CENTER);
        pg.textSize(24);
        pg.textFont('VT323, monospace'); // Fallback ensures something renders
        pg.fill(255);
        pg.noStroke();
        pg.text(String(i), 16, 16);
        digitImages.push(pg);
    }

    // UI Event Listeners (Dynamic Generation)
    setupUI();

    // --- HAND OVERLAY SETUP ---
    window.handCanvas = document.getElementById('hand-canvas');
    window.handCtx = window.handCanvas.getContext('2d');
    window.handCanvas.width = windowWidth;
    window.handCanvas.height = windowHeight;
}

// ... (Keep existing helper functions like gotHands, initParticles, draw, Particle class)
// I will not replace the whole file, just the top section and setupUI
// WAIT: The user wants me to replace specific parts. 
// I will target the top of the file up to `setup` and then `setupUI` at the bottom.

// ... (Skipping to setupUI replacement)


function gotHands(results) {
    hands = results;
}

function initParticles() {
    // Legacy grid removed for performance
}

function draw() {
    clear(); // Transparent background so UI (Z-index 2000) shows through Canvas (Z-index 1)

    // Clear Overlay Canvas
    if (window.handCtx) {
        window.handCtx.clearRect(0, 0, width, height);
    }

    // Audio Analysis
    fft.analyze();
    let bass = fft.getEnergy("bass");

    // --- WEBGL Setup ---
    push();
    translate(-width / 2, -height / 2);

    // --- INTERACTION LOGIC (Chaos Control) ---
    if (!window.smoothSpread) window.smoothSpread = 0;

    // CHAOS FACTOR: Driven by Hand Spread (Openness) from previous frame
    // Closed Hand (<50) -> Low Chaos (0.5)
    // Open Hand (>200) -> High Chaos (3.0)
    let chaos = map(window.smoothSpread, 20, 200, 0.5, 3.0, true);

    // --- A. BACKGROUND PARTICLES (Organic Cloud) ---
    // User Request: "Less organized, more random. Not a square."

    // Map Bass to Shake
    let shake = map(bass, 0, 255, 0, 20) * chaos;

    // EXPANSION LOGIC:
    // Hand Spread determines Cloud Radius.
    let expansion = map(window.smoothSpread, 20, 200, 0.0, 1.2, true);

    // Center calc
    let cx = width / 2;
    let cy = height / 2;

    // Max Radius for visibility mask
    let cloudRadius = map(expansion, 0, 1.2, 100, width * 0.8);

    // Initialize/Re-init with POLAR Coordinates (Circle) if needed
    if (!window.bgDust || window.bgDust.length !== 20000) {
        window.bgDust = [];
        for (let i = 0; i < 20000; i++) {
            // Polar Random Distribution
            // sqrt(random) * R ensures uniform distribution in circle (no dense center cluster)
            // But user wants "Organic", maybe slight center cluster is good?
            // Let's stick to uniform circle first to avoid "square" look.
            let angle = random(TWO_PI);
            let r = sqrt(random()) * (width); // Large enough to cover corners if expanded

            window.bgDust.push({
                // Store relative polar coords to preserve structure during expansion
                angle: angle,
                baseR: r,
                digit: floor(random(10)), // Permanent digit for Matrix effect (Mycelium)
                // Drifting offsets
                offX: random(1000),
                offY: random(1000),

                // PHYSICS PROPS
                vx: 0,
                vy: 0,
                dx: 0, // Displacement X
                dy: 0  // Displacement Y
            });
        }
    }

    // --- PHYSICS & INTERACTION ---
    // Prepare Active Hands Data
    let activeHands = [];
    let isInteracting = false;
    let hX = width / 2, hY = height / 2; // Default center (for color logic fallback)

    if (hands.length > 0) {
        isInteracting = true;

        hands.forEach((hand, index) => {
            let indexTip = hand.keypoints[8];
            let targetHX = map(indexTip.x, 0, 640, width, 0);
            let targetHY = map(indexTip.y, 0, 480, 0, height);

            // Per-hand Velocity Tracking (using global storage based on index)
            if (!window.handVelocities) window.handVelocities = {};
            if (!window.handVelocities[index]) window.handVelocities[index] = { x: targetHX, y: targetHY };

            let prev = window.handVelocities[index];
            let vX = targetHX - prev.x;
            let vY = targetHY - prev.y;

            // Update storage
            window.handVelocities[index] = { x: targetHX, y: targetHY };

            // Calculate Pinch State (Thumb vs Index)
            let thumb = hand.keypoints[4];
            let indexFinger = hand.keypoints[8];
            // Normalize coords or use raw? keypoints usually normalized 0-1 if mediaPipe? 
            // Wait, previous code mapped them manually.
            let tX = map(thumb.x, 0, 640, width, 0);
            let tY = map(thumb.y, 0, 480, 0, height);
            let iX = map(indexFinger.x, 0, 640, width, 0);
            let iY = map(indexFinger.y, 0, 480, 0, height);

            let pDist = dist(tX, tY, iX, iY);
            let isPinching = (pDist < 60);

            activeHands.push({ x: targetHX, y: targetHY, vx: vX, vy: vY, isPinching: isPinching, pinchDist: pDist });

            // Should hX/hY follow first hand for color shift? Yes.
            if (index === 0) { hX = targetHX; hY = targetHY; }
        });
    } else {
        window.handVelocities = {}; // Reset
    }

    // COLOR LOGIC using hX...
    push();
    colorMode(HSB, 360, 100, 100, 100);

    let centroid = fft.getCentroid();
    let volume = amplitude.getLevel();

    let baseHue;
    if (volume < 0.05) {
        baseHue = (frameCount * 0.5) % 360;
    } else {
        baseHue = map(centroid, 500, 4000, 0, 260, true);
    }

    // Interaction Color Shift
    if (isInteracting) {
        let handColorShift = map(hX, 0, width, -60, 60);
        baseHue = (baseHue + handColorShift + 360) % 360;
    }

    // --- VISUAL RENDERING SWITCH ---

    // Performance Optimization:
    // 'MYCELIUM' (Flow Field) can handle HIGH density.
    let renderCount = window.bgDust.length;
    let isFlowMode = (window.currentVisualMode === 'MYCELIUM');

    if (isFlowMode) {
        renderCount = 8000; // OPTIMIZED: 8k for max FPS (was 10k/15k)
    } else if (window.currentVisualMode === 'SHARDS') {
        renderCount = 4500; // OPTIMIZED: 4.5k for silky smooth 60fps
    } else {
        renderCount = 8000; // INCREASED: Spores density doubled
    }

    imageMode(CENTER);
    rectMode(CENTER);

    // Flow Field Settings
    let noiseScale = 0.005;
    let flowForce = 0.5;

    for (let i = 0; i < renderCount; i++) {
        let p = window.bgDust[i];

        let px, py;

        if (isFlowMode) {
            // --- FLOW FIELD BEHAVIOR ---
            if (p.flowX === undefined) {
                p.flowX = cx + cos(p.angle) * p.baseR;
                p.flowY = cy + sin(p.angle) * p.baseR;
            }

            // Flow Vector (Perlin Noise)
            let nVal = noise(p.flowX * noiseScale, p.flowY * noiseScale, frameCount * 0.002);
            let flowAngle = nVal * TWO_PI * 2;

            // Apply Flow
            p.vx += cos(flowAngle) * 0.1;
            p.vy += sin(flowAngle) * 0.1;

            // Update
            p.flowX += p.vx;
            p.flowY += p.vy;

            // Interaction
            // Interaction: FLUID DRAG (Push/Pull with Hand Velocity)
            // Interaction: FLUID DRAG (Optimized DistSq)
            if (activeHands.length > 0) {
                let dragRadSq = 250 * 250;

                for (let h = 0; h < activeHands.length; h++) {
                    let hand = activeHands[h];
                    let dx = p.flowX - hand.x;
                    let dy = p.flowY - hand.y;
                    let dSq = dx * dx + dy * dy;

                    if (dSq < dragRadSq) {
                        // Influence Falloff (Linear approx)
                        // Using (1 - dSq/R^2) matches quadratic falloff naturally
                        let influence = 1.0 - (dSq / dragRadSq);
                        if (influence < 0) influence = 0;

                        // "Grab" / "Push"
                        p.vx += hand.vx * influence * 0.2;
                        p.vy += hand.vy * influence * 0.2;

                        // Turbulence
                        p.vx += random(-0.5, 0.5) * influence * 0.1;
                        p.vy += random(-0.5, 0.5) * influence * 0.1;
                    }
                }
            }

            p.vx *= 0.96;
            p.vy *= 0.96;

            // Screen Wrap
            if (p.flowX < 0) p.flowX = width;
            if (p.flowX > width) p.flowX = 0;
            if (p.flowY < 0) p.flowY = height;
            if (p.flowY > height) p.flowY = 0;

            px = p.flowX;
            py = p.flowY;

        } else if (window.currentVisualMode === 'GLITCH') {
            // --- DIGITAL GRID PHYSICS (GLITCH) ---

            // 1. Grid Definition (Deterministic based on index)
            let columns = 80;
            let spacing = width / columns;
            let rows = ceil(renderCount / columns);

            let col = i % columns;
            let row = floor(i / columns);

            // Grid Home (Centered)
            let gridW = columns * spacing;
            let gridH = rows * spacing;
            let startX = (width - gridW) / 2;
            let startY = (height - gridH) / 2;

            let tx = startX + col * spacing;
            let ty = startY + row * spacing;

            // 2. Physics: Spring to Grid (Velocity-based)
            let springK = 0.02; // Snap strength (Loose for explosion)
            // Initialize if needed
            if (p.glX === undefined) { p.glX = tx; p.glY = ty; }

            let ax = (tx - p.glX) * springK;
            let ay = (ty - p.glY) * springK;

            p.vx += ax;
            p.vy += ay;

            // 3. Interaction: Repel + Throw
            if (activeHands.length > 0) {
                for (let h = 0; h < activeHands.length; h++) {
                    let hand = activeHands[h];
                    let d = dist(p.glX, p.glY, hand.x, hand.y); // Check actual pos

                    if (d < 250) {
                        // Repel (Explosion)
                        // If Hand is OPEN (not pinched), MASSIVE BLAST
                        let forceVal = 4.0;
                        if (hand.isPinching === false) {
                            forceVal = 50.0; // SUPER BLAST
                        }

                        let force = map(d, 0, 250, forceVal, 0);
                        let ang = atan2(p.glY - hand.y, p.glX - hand.x);

                        // Scatter + Bias
                        if (random(1) < 0.5) p.vx += cos(ang) * force * 2;
                        else p.vy += sin(ang) * force * 2;

                        // THROW (Velocity Transfer)
                        let throwF = map(d, 0, 250, 0.8, 0);
                        p.vx += hand.vx * throwF;
                        p.vy += hand.vy * throwF;
                    }
                }
            }

            // Glitch Jitter (Random Teleport)
            if (bass > 200 && random(1) < 0.01) {
                p.vx += random(-20, 20);
            }

            // Friction/Damping
            p.vx *= 0.85;
            p.vy *= 0.85;

            // Update
            p.glX += p.vx;
            p.glY += p.vy;

            px = p.glX;
            py = p.glY;

        } else if (window.currentVisualMode === 'SHARDS') {
            // --- PSYCHEDELIC FORCE FIELD (SHARDS) ---

            // 1. GLOBAL SHAPE MANAGER (State Machine)
            if (!window.shardsSymmetry) window.shardsSymmetry = 6;
            if (window.shardsEquation === undefined) window.shardsEquation = 0; // 0=Rose, 1=Star, 2=Harmonics
            if (window.lastBeatFrame === undefined) window.lastBeatFrame = 0;

            // BEAT DRIVEN MORPHING (User Request)
            // Change Shape only on strong beats, Hand only Breaks
            if (bass > 225 && frameCount - window.lastBeatFrame > 30) { // 30 frames (0.5s) cooldown
                // 1. Pick new Symmetry
                let options = [3, 4, 5, 6, 7, 8, 9, 10, 12, 16];
                let newSym = random(options);
                while (newSym === window.shardsSymmetry) newSym = random(options);
                window.shardsSymmetry = newSym;

                // 2. Pick new Math Equation
                let eqOptions = [0, 1, 2, 3, 4, 5];
                window.shardsEquation = random(eqOptions);

                window.lastBeatFrame = frameCount;
            }

            // Pulse on Beat (Size only)
            let pulse = map(bass, 0, 255, 1.0, 1.6);
            if (bass > 225) pulse = 2.0; // Extra pop on change

            // NEW: PINCH-TO-ZOOM (SMOOTHED)
            if (window.smoothHandScale === undefined) window.smoothHandScale = 1.0;

            let targetScale = 1.0;
            if (activeHands.length > 0) {
                let h = activeHands[0];
                if (h.pinchDist !== undefined) {
                    // Map Gap to Size
                    targetScale = map(h.pinchDist, 20, 200, 0.6, 3.5, true);
                }
            }
            // LERP for buttery smooth zoom (removes hand jitter)
            window.smoothHandScale = lerp(window.smoothHandScale, targetScale, 0.1);
            let handScale = window.smoothHandScale;

            // Determine active symmetry
            let symmetry = window.shardsSymmetry;
            // If bass is HUGE, maybe force a temporary complex shape?
            // User asked for HAND to drive change. Let's respect that primarily.
            // But maybe double symmetry on drop?
            if (bass > 220) symmetry *= 2;

            // 2. PARTICLE LOOP
            // The loop for particles is outside this block, so we need to ensure 'p' is defined for each iteration.
            // The original structure had the loop *around* the mode checks.
            // This means the SHARDS logic needs to operate on 'p' which is already defined by the outer loop.

            // SAFE INITIALIZATION
            if (p.px === undefined || isNaN(p.px)) {
                let ang = random(TWO_PI);
                let rad = random(50, 200);
                p.px = cx + cos(ang) * rad;
                p.py = cy + sin(ang) * rad;
                p.vx = 0; p.vy = 0;
            }

            // KALEIDOSCOPE INIT
            if (p.streamId === undefined || p.index === undefined) {
                p.streamId = floor(random(12));
                p.index = i;
            }

            // A. TARGET CALCULATION
            let myLayer = p.streamId % 3; // 3 Layers
            let myAngle = (i * 0.01) % TWO_PI; // Distribute around circle
            // Add rotation
            myAngle += frameCount * 0.003 * (myLayer % 2 == 0 ? 1 : -1);

            // --- NEW: EXTENDED MATH EQUATIONS SELECTOR (6 TYPES) ---
            let wave = 0;
            let time = frameCount * 0.02;
            let theta = myAngle * symmetry + time;

            switch (window.shardsEquation) {
                case 0: // TYPE 0: SOFT ROSE (Classic Flower)
                    wave = sin(theta);
                    break;
                case 1: // TYPE 1: SHARP STAR (Spiky / Thorns)
                    // Using higher power makes it square-ish/spiky
                    let s = sin(theta);
                    wave = (s > 0 ? 1 : -1) * pow(abs(s), 0.3);
                    break;
                case 2: // TYPE 2: HARMONICS (Complex / Mechanical)
                    // Adds a second frequency
                    wave = sin(theta) + 0.5 * sin(theta * 2.0);
                    wave *= 0.7; // Normalize amplitude slightly
                    break;
                case 3: // TYPE 3: ORGANIC NOISE (Amoeba / Liquid)
                    // Use polar noise
                    let nx = cos(theta);
                    let ny = sin(theta);
                    // Map noise to -1 to 1
                    wave = map(noise(nx + time, ny + time), 0, 1, -1.5, 1.5);
                    break;
                case 4: // TYPE 4: SPIRAL GALAXY
                    // Phase shift depends on radius (layer)
                    wave = sin(theta + (myLayer * PI / 2));
                    break;
                case 5: // TYPE 5: GEOMETRIC CROSS / SQUARE
                    // Formula: 1 / (|sin| + |cos|) creates squares/diamonds
                    // We invert it for star-like crosses
                    let v = abs(sin(theta / 2)) + abs(cos(theta / 2));
                    wave = (1.0 / v) - 1.0; // Normalized-ish
                    if (wave > 1.5) wave = 1.5; // Cap spikes
                    break;
                default:
                    wave = sin(theta);
            }

            // Rose Curve Formula
            let shapeR = 150 + (50 * myLayer);

            // APPLY HAND SCALE globally to the shape size
            let targetR = (shapeR + (wave * 50 * pulse)) * handScale;

            let tx = cx + cos(myAngle) * targetR;
            let ty = cy + sin(myAngle) * targetR;

            // B. INTERACTION (SMEAR / DISTORT - NO SHATTER)
            if (activeHands.length > 0) {
                for (let h = 0; h < activeHands.length; h++) {
                    let hand = activeHands[h];
                    let hdx = p.px - hand.x;
                    let hdy = p.py - hand.y;
                    let distSq = hdx * hdx + hdy * hdy;

                    if (distSq < 22500) { // 150px radius
                        // FLUID SMEAR (Follow Hand Velocity)
                        // If moving, drag particles with us
                        let dragFactor = 0.25;
                        p.vx += hand.vx * dragFactor;
                        p.vy += hand.vy * dragFactor;

                        // GENTLE WARP (Push away slightly to see through hand)
                        // This creates a "bubble" around hand but keeps shape structure
                        let dist = sqrt(distSq);
                        let pushForce = map(dist, 0, 150, 1.5, 0);
                        let ang = atan2(hdy, hdx);
                        p.vx += cos(ang) * pushForce;
                        p.vy += sin(ang) * pushForce;
                    }
                }
            }

            // C. PHYSICS UPDATE (ALWAYS ELASTIC)
            // MAGNETISM (Return to Shape)
            // Always active so it "heals" immediately after distortion
            let pdx = tx - p.px;
            let pdy = ty - p.py;

            // Elastic Snap (Spring constant)
            // Higher = Stiffer shape, Lower = More jelly-like
            let k = 0.08;
            p.vx += pdx * k;
            p.vy += pdy * k;

            // Damping (Friction)
            p.vx *= 0.85;
            p.vy *= 0.85;

            p.px += p.vx;
            p.py += p.vy;

            // Safety
            if (isNaN(p.px)) { p.px = cx; p.vx = 0; }
            if (isNaN(p.py)) { p.py = cy; p.vy = 0; }

            // Hard Bounds
            if (p.px < 0) { p.px = 0; p.vx *= -1; }
            if (p.px > width) { p.px = width; p.vx *= -1; }
            if (p.py < 0) { p.py = 0; p.vy *= -1; }
            if (p.py > height) { p.py = height; p.vy *= -1; }

            p.ffX = p.px;
            p.ffY = p.py;

            px = p.px;
            py = p.py;

            // Render
            let speed = dist(0, 0, p.vx, p.vy);
            let c;
            if (myLayer === 0) c = color(0, 255, 255);
            else if (myLayer === 1) c = color(255, 69, 0);
            else c = color(64, 224, 208);

            stroke(red(c), green(c), blue(c), 180);
            strokeWeight(1.5);
            line(px, py, px - p.vx * 2, py - p.vy * 2);

            if (speed < 1.0) point(px, py);
        } else {
            // --- ORIGINAL PHYSICS (SPORES) ---
            let driftX = map(noise(p.offX + frameCount * 0.005), 0, 1, -5, 5);
            let driftY = map(noise(p.offY + frameCount * 0.005), 0, 1, -5, 5);

            let effectiveR = lerp(0, p.baseR, expansion);
            let homeX = cx + (cos(p.angle) * effectiveR) + driftX;
            let homeY = cy + (sin(p.angle) * effectiveR) + driftY;

            let k = 0.008;
            let springX = -p.dx * k;
            let springY = -p.dy * k;
            p.vx += springX;
            p.vy += springY;

            if (activeHands.length > 0) {
                let currX = homeX + p.dx;
                let currY = homeY + p.dy;
                for (let h = 0; h < activeHands.length; h++) {
                    let hand = activeHands[h];
                    let distToHand = dist(currX, currY, hand.x, hand.y);
                    if (distToHand < 250) {
                        let angle = atan2(currY - hand.y, currX - hand.x);
                        let repForce = map(distToHand, 0, 250, 2, 0);
                        p.vx += cos(angle) * repForce;
                        p.vy += sin(angle) * repForce;
                        let throwFactor = map(distToHand, 0, 250, 2.0, 0);
                        p.vx += hand.vx * throwFactor;
                        p.vy += hand.vy * throwFactor;
                    }
                }
            }

            p.vx *= 0.92;
            p.vy *= 0.92;
            p.dx += p.vx;
            p.dy += p.vy;

            let currX = homeX + p.dx;
            let currY = homeY + p.dy;
            if (currX < 0) p.vx += 0.5;
            if (currX > width) p.vx -= 0.5;
            if (currY < 0) p.vy += 0.5;
            if (currY > height) p.vy -= 0.5;

            px = homeX + p.dx;
            py = homeY + p.dy;
        }

        // Visibility
        // Force visible for flow mode (always on screen), conditional for circle
        let finalAlpha = 100;
        let pColor;

        if (isFlowMode) {
            // Always visible, varying alpha
            let beatAlpha = map(bass, 0, 255, 30, 80); // higher base alpha
            finalAlpha = beatAlpha;
            let variance = 60;
            if (volume > 0.1) variance = 120;
            pColor = (baseHue + map(noise(i), 0, 1, -variance, variance)) % 360;
            if (pColor < 0) pColor += 360;

            // GREEN EXCLUSION (Approx 80-160 is Green)
            if (pColor > 80 && pColor < 160) {
                pColor = (pColor + 180) % 360;
            }

            // Render
            noStroke();
            fill(pColor, 60, 100, finalAlpha * 0.8); // Higher opacity
            ellipse(px, py, 3, 3); // Larger dots (3px)

        } else if (window.currentVisualMode === 'GLITCH') {
            // --- GLITCH RENDER ---
            // Always visible (Grid covers screen)
            // Calculate alpha based on distance from center for subtle vignette? 
            // Or just full screen grid. Let's do full screen but fade edges slightly.

            let d = dist(px, py, cx, cy);
            // MUCH Lower Alpha to prevent UI blocking
            let alpha = map(d, 0, width / 1.5, 100, 20);
            let beatAlpha = map(bass, 0, 255, 0, 60);

            noStroke();
            noStroke();

            // BEAT REACTIVE COLOR (Dynamic Base)
            // Use baseHue + Bass influence
            let beatShift = map(bass, 0, 255, 0, 60);
            let noiseShift = map(noise(i), 0, 1, -60, 60);
            pColor = (baseHue + beatShift + noiseShift) % 360;
            if (pColor < 0) pColor += 360;

            // YELLOW EXCLUSION (Approx 45-80 is Yellow/Lime)
            // If in yellow range, shift to safe color (Blue/Purple or Red)
            // YELLOW & GREEN EXCLUSION (Covering 45-160)
            // Existing Yellow: 45-85. New Green: 80-160.
            // Combined range: 45 - 160
            if (pColor > 45 && pColor < 160) {
                pColor = (pColor + 180) % 360;
            }

            // Reduced Opacity
            fill(pColor, 90, 90, alpha + beatAlpha);

            // Size variation based on noise
            let size = map(noise(i + frameCount * 0.1), 0, 1, 2, 8);

            rect(px, py, size, size);

            rect(px, py, size, size);

        } else {
            // Original Visibility Check for Circle (SPORES / SHARDS)
            let d = dist(px, py, cx, cy);
            if (d < cloudRadius * 1.5) {
                let edgeFeather = map(d, 0, cloudRadius * 1.2, 100, 0);
                let beatAlpha = map(bass, 0, 255, 0, 50);
                finalAlpha = edgeFeather + beatAlpha;

                let variance = 60;
                if (volume > 0.1) variance = 120;
                // RANDOMIZED COLOR (Noise based on index, not angle)
                let noiseShift = map(noise(i * 0.05), 0, 1, -variance, variance);
                pColor = (baseHue + noiseShift) % 360;
                if (pColor < 0) pColor += 360;

                // GREEN EXCLUSION (Approx 80-160 is Green)
                if (pColor > 80 && pColor < 160) {
                    pColor = (pColor + 180) % 360;
                }

                // Render shapes 
                noTint();
                stroke(pColor, 80, 100, finalAlpha);

                if (false) { // Disabled Old SHARDS Render
                    // Placeholder to keep structure valid if needed, or just remove
                }
                else {
                    // SPORES (Default Points)
                    strokeWeight(3);
                    point(px, py);
                }
            }
        }
    } // End Loop

    // --- HAND GESTURE CLICKS (pinch) ---
    if (isInteracting && hands[0]) {
        let indexTip = hands[0].keypoints[8];
        let thumbTip = hands[0].keypoints[4];

        // 1. Check distance to center (Logo Interaction)
        let dToCenter = dist(indexTip.x, indexTip.y, width / 2, height / 2); // assuming full screen canvas mapping
        // Since hX/hY are already mapped:
        dToCenter = dist(hX, hY, cx, cy);

        // Center Circle is roughly 15vmin. 
        let centerRadius = min(width, height) * 0.15;

        if (dToCenter < centerRadius) {
            // PINCH DISABLED: User finds it inconsistent (triggers instantly).
            // Enforcing Dwell (Circle Fill) only.

            /*
            let tX = map(thumbTip.x, 0, 640, width, 0);
            let tY = map(thumbTip.y, 0, 480, 0, height);
            let pinchDist = dist(hX, hY, tX, tY);
 
            // SHARE COOLDOWN with Dwell Interaction to prevent double-clicks
            if (pinchDist < 50 && (!window.interactionCooldown || window.interactionCooldown === 0)) {
                console.log("Hand Pinch Detected on Logo!");
                let logoEl = document.getElementById('main-logo');
                if (logoEl) logoEl.click();
 
                // Set Global Cooldown (90 frames = ~1.5s)
                window.interactionCooldown = 90;
            }
            */
        }
    }

    pop();

    // --- DIGITAL OVERLOAD (Pulse & Burst) ---
    // Beat Detection for effects
    if (bass > 210) { // Threshold for "Heavy" beat
        // 1. Spawn Pulse Ring - DISABLED (User Request)
        // if (frameCount % 5 === 0) {
        //     pulses.push(new RingPulse());
        // }

        // 2. Spawn Particle Burst - DISABLED (User Request)
        // for (let i = 0; i < 10; i++) {
        //     overloadParticles.push(new OverloadParticle());
        // }
    }

    // Update & Draw Pulses
    for (let i = pulses.length - 1; i >= 0; i--) {
        let p = pulses[i];
        p.update();
        p.show();
        if (p.isDead()) {
            pulses.splice(i, 1);
        }
    }

    // Update & Draw Overload Particles
    push();
    strokeWeight(3);
    for (let i = overloadParticles.length - 1; i >= 0; i--) {
        let op = overloadParticles[i];
        op.update();
        op.show();
        if (op.isDead()) {
            overloadParticles.splice(i, 1);
        }
    }
    pop();

    // --- B. HAND TRACKING (Moved to Overlay) ---
    // User Request: "Hand Skeleton > Buttons > Background"
    // We draw the hand on the Top Canvas (#hand-canvas, Z:6000)

    let handSpread = 0; // Metric for Interaction
    let hasHand = false;

    if (hands.length > 0) {
        hasHand = true;
        // Draw on Overlay
        drawHandOverlay(hands);

        // Calculate spread for "Chaos" param
        let hand = hands[0];
        let kp = hand.keypoints;
        let p1 = kp[4];
        let p2 = kp[20];
        let d = dist(p1.x, p1.y, p2.x, p2.y);
        if (d > handSpread) handSpread = d;
    } else {
        updateHandInteraction(null, null); // Clear cursor state
    }

    // Resume P5 rendering...
    pop();

    // --- C. STATE UPDATE ---

    // Update spread for next frame's chaos calculation
    // Update spread for next frame's chaos calculation
    let targetSpread = hasHand ? handSpread : 100; // Increased to 100 to fill screen (expansion) but not explode

    window.smoothSpread = lerp(window.smoothSpread, targetSpread, 0.1);


    // Volume: Always Max (User request)
    // Optimized: Only set once? Or assumes it might change. 
    // Commenting out frame-by-frame setVolume as it may cause GC pressure.
    // if (currentSong && currentSong.isPlaying()) {
    //     currentSong.setVolume(1.0);
    // }

    // --- UI Overlays ---

    push();
    resetMatrix(); // Existing HUD
    fill(0, 255, 0);
    textSize(24);
    textAlign(LEFT, TOP);
    text("Bass: " + floor(bass), 20, 20);

    if (hasHand) {
        text("Hand Tracks: ON | Chaos: " + nf(map(window.smoothSpread, 20, 200, 0.5, 3.0), 1, 1), 20, 50);
    } else {
        text("Hand Tracks: SEARCHING... (Auto-Pilot)", 20, 50);
    }
    pop();
}

// --- INTERACTION HELPER ---
function updateHandInteraction(x, y, skipDraw = false) {
    // 1. GLOBAL STATE UPDATES
    if (window.interactionCooldown === undefined) window.interactionCooldown = 0;
    if (window.interactionCooldown > 0) window.interactionCooldown--;

    // 2. CURSOR RENDERING (Always draw unless x is null)
    if (!skipDraw) { // Legacy support if P5 calls it
        if (x !== null) {
            push();
            translate(0, 0, 1);
            noFill();
            stroke(255);
            strokeWeight(3);
            circle(x, y, 20); // Cursor Ring

            // Progress Arc
            if (window.dwellTimer > 0 && window.interactionCooldown === 0) {
                let angle = map(window.dwellTimer, 0, DWELL_THRESHOLD, 0, TWO_PI);
                stroke(0, 255, 0);
                strokeWeight(5);
                arc(x, y, 30, 30, 0, angle);
            }
            pop();
        }
    }

    if (x === null) {
        // If no hand, hard reset everything
        if (lastHoveredElement) {
            lastHoveredElement.dispatchEvent(new Event('mouseleave'));
            lastHoveredElement = null;
        }
        window.dwellTimer = 0;
        graceTimer = 0;
        hasClicked = false;
        return;
    }

    // 3. HIT TESTING
    let el = document.elementFromPoint(x, y);
    let targetBtn = null;

    if (el) {
        function findParent(element, selector) {
            if (element.matches && element.matches(selector)) return element;
            if (element.closest) return element.closest(selector);
            return null;
        }
        let isDanceMode = document.body.classList.contains('dance-mode');

        // Check for Track Buttons (DISABLE if Dance Mode is active)
        let trackBtn = isDanceMode ? null : findParent(el, '.track-text-btn, .track-hitbox');
        // Check for Center Logo
        let logoBtn = findParent(el, '.inner-circle');
        targetBtn = trackBtn || logoBtn;
    }

    let normalizedTarget = targetBtn;

    // 4. STATE TRANSITION WITH GRACE PERIOD
    if (normalizedTarget) {
        // FOUND TARGET
        graceTimer = 0; // Reset grace

        if (normalizedTarget !== lastHoveredElement) {
            // New Target - Check if it's the SAME track (Sibling/Parent check)
            let isSameGroup = false;
            if (lastHoveredElement && normalizedTarget.parentNode && lastHoveredElement.parentNode) {
                if (normalizedTarget.parentNode === lastHoveredElement.parentNode) {
                    isSameGroup = true;
                }
            }

            if (lastHoveredElement) {
                // If switching to sibling, don't fire mouseleave on the logic level? 
                // Actually we should, to swap styles if needed, BUT preserve timer.
                lastHoveredElement.dispatchEvent(new Event('mouseleave'));
            }
            normalizedTarget.dispatchEvent(new Event('mouseenter'));

            lastHoveredElement = normalizedTarget;

            if (!isSameGroup) {
                window.dwellTimer = 0;
                hasClicked = false;
                window.interactionCooldown = 0; // RESET COOLDOWN for new target
            }
            // Else: CONTINUITY! Timer preserved.
        }
    } else {
        // NO TARGET FOUND - CHECK GRACE
        if (lastHoveredElement && graceTimer < 15 && window.dwellTimer > 0) {
            // Grace Period Active: Pretend we are still hovering
            graceTimer++;
            // Don't increment dwell, just hold it? Or increment? 
            // Incrementing might auto-click empty space if user leaves. 
            // Let's just HOLD status (don't clear).
            normalizedTarget = lastHoveredElement; // Persist target
        } else {
            // Grace expired or never started
            if (lastHoveredElement) {
                lastHoveredElement.dispatchEvent(new Event('mouseleave'));
                lastHoveredElement = null;
            }
            window.dwellTimer = 0;
            graceTimer = 0;
            hasClicked = false;
        }
    }

    // 5. DWELL LOGIC
    if (normalizedTarget) {
        // Only progress if not cooling down
        if (!hasClicked && window.interactionCooldown === 0) {
            window.dwellTimer++;
            if (window.dwellTimer > DWELL_THRESHOLD) {
                // CLICK!
                normalizedTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                hasClicked = true;

                // Set Cooldown
                window.interactionCooldown = 90;

                // Visual Feedback (Only if drawing here, but now overlay draws)
                // We rely on visual state change of button or overlay
            }
        }
    } else {
        window.dwellTimer = 0;
    }

    // 6. GLOBAL PAUSE MANAGEMENT
    // If we have a track target (Text or Hitbox), FREEZE EVERYTHING
    let isTrackTarget = false;
    if (normalizedTarget) {
        if (normalizedTarget.classList.contains('track-text-btn') ||
            normalizedTarget.classList.contains('track-hitbox')) {
            isTrackTarget = true;
        }
    }

    if (isTrackTarget) {
        document.body.classList.add('global-pause');
    } else {
        document.body.classList.remove('global-pause');
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    if (window.handCanvas) {
        window.handCanvas.width = windowWidth;
        window.handCanvas.height = windowHeight;
    }
    initParticles();
}

// --- NEW OVERLAY RENDERER (Native Canvas 2D) ---
function drawHandOverlay(handsList) {
    let ctx = window.handCtx;
    if (!ctx) return;

    // Style
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Constants mapping
    let w = ctx.canvas.width;
    let h = ctx.canvas.height;

    // Connections
    let connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [0, 9], [9, 10], [10, 11], [11, 12],
        [0, 13], [13, 14], [14, 15], [15, 16],
        [0, 17], [17, 18], [18, 19], [19, 20]
    ];

    handsList.forEach(hand => {
        let kp = hand.keypoints;

        // --- INSTANT SKELETON (No Decay/Lag) ---
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillStyle = 'rgba(0, 255, 65, 0.9)'; // Matrix Green Joints
        ctx.lineWidth = 2;

        // 1. Draw Bones
        connections.forEach(pair => {
            let a = kp[pair[0]];
            let b = kp[pair[1]];

            // Map Coordinates (Video 640x480 -> Canvas WxH, Mirrored X)
            let ax = map(a.x, 0, 640, w, 0);
            let ay = map(a.y, 0, 480, 0, h);
            let bx = map(b.x, 0, 640, w, 0);
            let by = map(b.y, 0, 480, 0, h);

            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
        });

        // 2. Draw Joints
        kp.forEach(p => {
            let px = map(p.x, 0, 640, w, 0);
            let py = map(p.y, 0, 480, 0, h);

            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
        });


    });

    // 3. Update Cursor Interaction (Logic + Draw)
    // We already calculated hX, hY effectively in the loop at top of draw(), but we need to redraw them here on TOP layer.
    // The previous 'updateHandInteraction' function drew to P5 (WEBGL). We need to change it to draw to Canvas 2D?
    // OR we just reimplement the drawing part here and keep the logic only update.

    // Actually, 'updateHandInteraction' is called in P5 'draw'.
    // If we call it, it draws to P5 canvas (Bottom). User wants Cursor on Top.
    // So we must move the DRAWING part of updateHandInteraction to here, and leave logic elsewhere.

    // Let's grab the Index Tip of the first hand again for logic consistency
    if (handsList.length > 0) {
        let hand = handsList[0];
        let indexTip = hand.keypoints[8];
        let hX = map(indexTip.x, 0, 640, w, 0);
        let hY = map(indexTip.y, 0, 480, 0, h);

        // Pass to logic updater (hit testing)
        // We still need to call this for state (hover/click)
        updateHandInteraction(hX, hY, true); // true = Skip P5 Drawing

        // --- DRAW CURSOR ON OVERLAY ---
        ctx.shadowBlur = 0;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(hX, hY, 10, 0, 2 * Math.PI); // Radius 10 = Diameter 20
        ctx.stroke();

        // Dwell Progress
        if (window.dwellTimer > 0 && (!window.interactionCooldown || window.interactionCooldown === 0)) {
            let progress = window.dwellTimer / DWELL_THRESHOLD;
            let endAngle = progress * 2 * Math.PI;

            ctx.lineWidth = 5;
            ctx.strokeStyle = '#00FF00'; // Green for Interaction
            ctx.beginPath();
            ctx.arc(hX, hY, 15, 0, endAngle); // Radius 15 = Diameter 30
            ctx.stroke();
        }
    } else {
        updateHandInteraction(null, null, true);
    }
}

// Particle Class
class Particle {
    constructor(x, y, z, u, v) {
        this.homeX = x;
        this.homeY = y;
        this.homeZ = z;

        this.u = u; // texture coordinate
        this.v = v;

        this.pos = createVector(x, y, z);
        this.vel = createVector(0, 0, 0);
        this.acc = createVector(0, 0, 0);

        this.color = [255, 255, 255];
        this.prevBrightness = 0;
    }
}

// --- Sound Logic ---
// --- Digital Overload Classes ---

class RingPulse {
    constructor() {
        this.x = width / 2;
        this.y = height / 2;
        this.r = 0;
        this.alpha = 255;
        this.speed = 15; // Fast expansion
    }

    update() {
        this.r += this.speed;
        this.alpha -= 8; // Fade out
    }

    show() {
        stroke(0, 255, 100, this.alpha);
        strokeWeight(3);

        // Draw as ring of particles
        let circumference = TWO_PI * this.r;
        if (circumference <= 0) return;

        // Density: roughly 1 particle every 15 pixels
        let particleCount = floor(circumference / 15);

        for (let i = 0; i < particleCount; i++) {
            let angle = (TWO_PI / particleCount) * i;
            let px = this.x + cos(angle) * this.r;
            let py = this.y + sin(angle) * this.r;
            point(px, py);
        }
    }

    isDead() {
        return this.alpha <= 0;
    }
}

class OverloadParticle {
    constructor() {
        this.x = width / 2;
        this.y = height / 2;

        // Random direction outwards
        let angle = random(TWO_PI);
        let speed = random(5, 15);

        this.vx = cos(angle) * speed;
        this.vy = sin(angle) * speed;

        this.alpha = 255;
        this.life = 255;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= 5;
    }

    show() {
        stroke(200, 255, 255, this.alpha); // Bright whitish-cyan
        point(this.x, this.y);
    }

    isDead() {
        return this.alpha <= 0;
    }
}

// --- Sound Logic ---
// --- Sound Logic ---
function setupUI() {
    const svgContainer = document.getElementById('track-list-svg');
    const trackNameDisplay = document.querySelector('.track-name');
    const svgNS = "http://www.w3.org/2000/svg";
    const xlinkNS = "http://www.w3.org/1999/xlink";

    // Clear existing
    svgContainer.innerHTML = '';

    // Create Defs
    let defs = document.createElementNS(svgNS, 'defs');
    svgContainer.appendChild(defs);

    // --- CONFIG: 3 Concentric Rings ---
    const ringConfig = [
        { radius: 140, speedClass: 'rotate-cw-slow', count: 3, startIndex: 0 },
        { radius: 180, speedClass: 'rotate-ccw-med', count: 4, startIndex: 3 },
        { radius: 220, speedClass: 'rotate-cw-fast', count: 3, startIndex: 7 }
    ];

    // 1. Create Master Paths & Groups for Grid
    let ringGroups = [];

    ringConfig.forEach((conf, idx) => {
        // A. Define Curve (Full Circle)
        const pathId = `ring-curve-${idx}`;
        let path = document.createElementNS(svgNS, 'path');
        let r = conf.radius;
        path.setAttribute('id', pathId);
        // Start from left (180 deg) so text starts upright-ish? 
        // Or standard top start. M 250, 250 m 0, -r a r,r ...
        // Using standard circle path
        path.setAttribute('d', `M 250, 250 m -${r}, 0 a ${r},${r} 0 1,1 ${r * 2},0 a ${r},${r} 0 1,1 -${r * 2},0`);
        path.setAttribute('fill', 'transparent');
        defs.appendChild(path);

        // B. Create Rotating Group Container
        let g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', `ring-group ${conf.speedClass}`);
        svgContainer.appendChild(g);
        ringGroups.push(g);
    });

    // 2. Place Tracks
    albumTracks.forEach((track, i) => {
        // Find which ring this track belongs to
        let ringIdx = 0;
        if (i >= 3 && i < 7) ringIdx = 1;
        if (i >= 7) ringIdx = 2;

        const config = ringConfig[ringIdx];
        const group = ringGroups[ringIdx];
        const pathId = `ring-curve-${ringIdx}`;

        // Calculate Angle WITHIN this ring
        // e.g. Ring 0 has 3 tracks. i=0 -> 0, i=1 -> 1.
        let indexInRing = i - config.startIndex;
        let angleStep = 360 / config.count;
        let angle = indexInRing * angleStep;

        // DEDICATED HITBOX (Invisible Arc)
        // We calculate angular width based on character count estimate (approx) or just a fixed generous arc.
        // Approx: 18px font size, monospace-ish. 
        // Let's use a generous approximation: Length * 12px
        // AGGRESSIVE EXPANSION: Multiplier 24 (was 14)
        let estimatedTextLen = track.title.length * 24;

        // Arc Angle in Radians
        let desiredAngle = estimatedTextLen / config.radius;

        // CLAMP ANGLE to prevent neighbor overlap
        let availableSector = (TWO_PI / config.count);
        let maxSafeAngle = availableSector * 0.85; // Leave 15% gap
        let arcLenAngle = Math.min(desiredAngle, maxSafeAngle);

        // Start from -90 deg (Top) minus half width
        let startAngleH = -PI / 2 - arcLenAngle / 2;
        let endAngleH = -PI / 2 + arcLenAngle / 2;

        // Create Path Data
        function describeArc(x, y, radius, startAngle, endAngle) {
            var start = { x: x + radius * Math.cos(endAngle), y: y + radius * Math.sin(endAngle) };
            var end = { x: x + radius * Math.cos(startAngle), y: y + radius * Math.sin(startAngle) };
            var largeArcFlag = endAngle - startAngle <= PI ? "0" : "1";
            var d = [
                "M", start.x, start.y,
                "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
            ].join(" ");
            return d;
        }

        let hitboxPath = document.createElementNS(svgNS, 'path');
        // Align Hitbox Center: Text is usually offset. 
        // We move circle OUT slightly (+5px) to center on text height.
        // FIXED COORDINATES: Center at 250,250 (SVG Center)
        hitboxPath.setAttribute('d', describeArc(250, 250, config.radius + 5, startAngleH, endAngleH));
        // HIDDEN HITBOX (Interactive but invisible)
        hitboxPath.setAttribute('stroke', 'rgba(255, 255, 255, 0.001)');
        hitboxPath.setAttribute('stroke-width', '40'); // Max Safe Width
        hitboxPath.setAttribute('fill', 'none');
        hitboxPath.setAttribute('class', 'track-hitbox'); // Class for hit testing logic
        hitboxPath.style.cursor = 'pointer';
        hitboxPath.style.pointerEvents = 'all'; // Critical

        // Create Text Item Group (to rotate to position)
        let itemGroup = document.createElementNS(svgNS, 'g');
        itemGroup.setAttribute('transform', `rotate(${angle}, 250, 250)`);

        // Add Hitbox BEFORE text (visually behind)
        itemGroup.appendChild(hitboxPath);

        let text = document.createElementNS(svgNS, 'text');
        text.setAttribute('class', 'track-text-btn');

        let textPath = document.createElementNS(svgNS, 'textPath');
        textPath.setAttributeNS(xlinkNS, 'href', `#${pathId}`);
        textPath.setAttribute('startOffset', '25%'); // Top alignment (since path starts left)
        textPath.setAttribute('text-anchor', 'middle');
        textPath.style.fontSize = '18px';
        textPath.style.letterSpacing = '2px';
        textPath.textContent = track.title;

        // Interactions (Apply to BOTH Text AND Hitbox)
        [text, hitboxPath].forEach(el => {
            el.addEventListener('click', () => {
                let song = songObjects[track.file];
                if (song) {
                    playTrack(song, track.title, trackNameDisplay, text, track.visualMode);
                    userStartAudio();
                }
            });

            el.addEventListener('mouseenter', () => {
                if (!text.classList.contains('active-track')) {
                    // text.classList.add('hover-active'); // Optional visual feedback
                }
                text.style.textShadow = "0 0 10px var(--matrix-green), 0 0 20px var(--matrix-green)";
                text.style.opacity = "1";

                cursor('pointer');
                // GLOBAL PAUSE (Unified with Hand Cursor)
                document.body.classList.add('global-pause');
            });

            el.addEventListener('mouseleave', () => {
                // Simplified: Remove inline overrides.
                // If .active-track class is present, CSS handles the glow.
                // If not, it returns to default.
                text.style.textShadow = "";
                text.style.opacity = "";

                cursor('default');
                // RESUME GLOBAL PAUSE
                document.body.classList.remove('global-pause');
            });
        });

        text.appendChild(textPath);
        itemGroup.appendChild(text);
        group.appendChild(itemGroup);
    });


    // --- DANCE MODE TRIGGER (CORRECT PLACEMENT) ---
    const logo = document.getElementById('inner-circle');
    const centerLabel = document.querySelector('.center-label');
    const vinylContainer = document.querySelector('.vinyl-container');

    function toggleDanceMode(e) {
        e.stopPropagation();
        document.body.classList.toggle('dance-mode'); // Toggle on BODY for global state (JS & CSS)
        console.log('Dance Mode Toggled (Body Class)');
    }

    if (logo) {
        logo.addEventListener('click', toggleDanceMode);
        logo.addEventListener('mouseenter', () => logo.classList.add('hover-active'));
        logo.addEventListener('mouseleave', () => logo.classList.remove('hover-active'));
    }
    if (centerLabel) centerLabel.addEventListener('click', toggleDanceMode);
}

function playTrack(song, name, displayElement, activeElement, visualMode) {
    if (currentSong) {
        if (currentSong === song) {
            // Toggle
            if (currentSong.isPlaying()) {
                currentSong.pause();
                if (displayElement) {
                    displayElement.innerHTML = name + '<br><span style="font-size: 0.8em; color: gray;">[PAUSED]</span>';
                }
                if (activeElement) activeElement.classList.remove('active-track');
                return;
            } else {
                currentSong.loop(); // Loop by default
                if (displayElement) {
                    displayElement.innerHTML = name + '<br><span style="font-size: 0.8em; color: var(--matrix-green);">[PLAYING]</span>';
                }
                if (activeElement) activeElement.classList.add('active-track');
                return;
            }
        } else {
            currentSong.stop(); // Stop previous
        }
    }

    // New Song
    // Clear all previous active states first (since we are switching songs)
    document.querySelectorAll('.track-text-btn').forEach(el => {
        el.classList.remove('active-track');
        el.style.textShadow = ''; // Clear inline
        el.style.opacity = '';    // Clear inline
    });

    currentSong = song;
    currentSong.loop();

    // SET VISUAL MODE (Randomize on Track Change)
    const modes = ['SPORES', 'MYCELIUM', 'GLITCH', 'SHARDS'];
    let nextMode = random(modes);

    // Ensure change
    let attempts = 0;
    while (nextMode === window.currentVisualMode && attempts < 10) {
        nextMode = random(modes);
        attempts++;
    }

    window.currentVisualMode = nextMode;
    console.log("Auto-Switched Visual Mode to:", window.currentVisualMode);

    if (displayElement) {
        displayElement.innerHTML = name + '<br><span style="font-size: 0.8em; color: var(--matrix-green);">[PLAYING]</span><br><span style="font-size: 0.6em; color: white;">MODE: ' + window.currentVisualMode + '</span>';
    }
    if (activeElement) activeElement.classList.add('active-track');

    // Link Amplitude
    amplitude.setInput(currentSong);
}
