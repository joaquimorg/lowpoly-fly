import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

// ---------- SCENE SETUP ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color('#A8BCCC'); // Blueish warm sky color
scene.fog = new THREE.Fog('#A8BCCC', 200, 2500);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 100, 0);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    logarithmicDepthBuffer: true,
    powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.autoClear = false; // Add autoClear = false so minimap can overlap
// Softer shadows
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

// ---------- LIGHTING & SUN ----------
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3); // Reduced to make shadows more visible
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight('#FFF3D6', 1.5); // Slightly stronger sun
dirLight.position.set(800, 300, -800); // Initial placeholder before animate

dirLight.castShadow = true;
dirLight.shadow.camera.left = -1000;
dirLight.shadow.camera.right = 1000;
dirLight.shadow.camera.top = 1000;
dirLight.shadow.camera.bottom = -1000;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
// Soft shadow properties
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

// Visual Sun
const sunGeo = new THREE.CircleGeometry(600, 32); // Made much bigger for distance
const sunMat = new THREE.MeshBasicMaterial({ color: '#FFEDB3', fog: false }); // Unaffected by fog so it glows through
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
scene.add(sunMesh);

// ---------- NOISE & TERRAIN GEN ----------
const noise2D = createNoise2D();

function generateHeight(x, z) {
    // Combine octaves of noise for interesting terrain
    const scale1 = 0.0012; // stretch the noise horizontally to make features wider
    const scale2 = 0.004;
    const scale3 = 0.01;

    let y = noise2D(x * scale1, z * scale1) * 150; // lower primary amplitude
    y += noise2D(x * scale2, z * scale2) * 25;     // softer mid details
    y += noise2D(x * scale3, z * scale3) * 10;

    // Flatten the valleys by applying a power curve and absolute
    // A slightly higher power curve makes valleys wider and peaks less frequent
    // A lower final multiplier makes the peaks less high
    y = Math.pow(Math.abs(y * 0.01), 2.8) * Math.sign(y) * 80;

    // Base offset
    y += 50;
    return y;
}

// Map chunks
const CHUNK_WIDTH = 4000;
const CHUNK_DEPTH = 1000;
const SEGMENTS_X = 120;
const SEGMENTS_Z = 40;
const NUM_CHUNKS = 5;

// Low poly material
const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.8,
    metalness: 0.1,
});

const chunks = [];

function updateChunkGeometry(geometry, chunkWorldZ) {
    // Convert standard Indexed BufferGeometry to NonIndexed 
    // to ensure distinct faces for flatShading on custom normals in all Three versions
    const positionAttribute = geometry.attributes.position;

    // Add color attribute if it doesn't exist
    if (!geometry.attributes.color) {
        const colors = new Float32Array(positionAttribute.count * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const colorAttribute = geometry.attributes.color;

    const baseColor = new THREE.Color('#D4DC55');
    const snowColor = new THREE.Color('#FFFFFF');

    for (let i = 0; i < positionAttribute.count; i++) {
        // local coordinates
        const lx = positionAttribute.getX(i);
        const ly = positionAttribute.getY(i);

        // world mapping (because of rotation on X axis by -PI/2)
        const worldX = lx;
        const worldZ = chunkWorldZ - ly;

        const height = generateHeight(worldX, worldZ);

        // update local Z which acts as height after rotation
        positionAttribute.setZ(i, height);

        // color based on height
        let t = (height - 90) / 40; // Begins turning white at height 90, solid snow at 130+
        t = Math.max(0, Math.min(1, t)); // clamp

        const finalColor = baseColor.clone().lerp(snowColor, t);
        colorAttribute.setXYZ(i, finalColor.r, finalColor.g, finalColor.b);
    }

    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
}

function createChunk(index) {
    // Create non-indexed geometry for pure flat shading
    const baseGeom = new THREE.PlaneGeometry(CHUNK_WIDTH, CHUNK_DEPTH, SEGMENTS_X, SEGMENTS_Z);
    const geometry = baseGeom.toNonIndexed();

    const chunkZBase = -index * CHUNK_DEPTH;

    updateChunkGeometry(geometry, chunkZBase);

    const mesh = new THREE.Mesh(geometry, terrainMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = chunkZBase;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.frustumCulled = false; // Prevent culling issues with modified vertices

    scene.add(mesh);

    return { mesh, geometry, index };
}

// Generate initial chunks
for (let i = -1; i < NUM_CHUNKS - 1; i++) {
    chunks.push(createChunk(i));
}

// ---------- CLOUDS SETUP ----------
// Simple floating low-poly clouds
const clouds = [];
const cloudGeo = new THREE.IcosahedronGeometry(30, 0); // low poly
const cloudMat = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    flatShading: true,
    roughness: 1.0,
    emissive: '#444444', // make them brighter white
});

for (let i = 0; i < 30; i++) {
    const mesh = new THREE.Mesh(cloudGeo, cloudMat);
    // Random scale for variety
    mesh.scale.set(
        1 + Math.random(),
        0.5 + Math.random() * 0.5,
        1 + Math.random()
    );
    mesh.position.set(
        (Math.random() - 0.5) * 2000,
        500 + Math.random() * 300, // Make clouds much higher in the sky
        -(Math.random() * 4000)
    );
    scene.add(mesh);
    clouds.push(mesh);
}


// ---------- WATER SETUP ----------
const waterLevel = 45; // Height where water appears
const waterGeo = new THREE.PlaneGeometry(10000, 10000);
const waterMat = new THREE.MeshStandardMaterial({
    color: '#4DA6FF', // Bright blue water color
    transparent: true,
    opacity: 0.7,     // Semi-transparent
    roughness: 0.55,  // Increased for a softer, more dispersed sun reflection
    metalness: 0.05,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
});
const waterMesh = new THREE.Mesh(waterGeo, waterMat);
waterMesh.rotation.x = -Math.PI / 2;
waterMesh.position.y = waterLevel;
waterMesh.frustumCulled = false;
scene.add(waterMesh);


// ---------- AIRCRAFT MODEL ----------
// Low-poly single-engine prop plane, built from primitives.
const planeGroup = new THREE.Group();

const bodyMat = new THREE.MeshStandardMaterial({ color: '#E8E8EC', flatShading: true, roughness: 0.6, metalness: 0.2 });
const accentMat = new THREE.MeshStandardMaterial({ color: '#C0392B', flatShading: true, roughness: 0.6, metalness: 0.2 });
const glassMat = new THREE.MeshStandardMaterial({ color: '#2C3E50', flatShading: true, roughness: 0.2, metalness: 0.4 });
const propMat = new THREE.MeshStandardMaterial({ color: '#33373B', flatShading: true, roughness: 0.8 });

// Fuselage (nose points toward -Z, the direction of travel)
const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.1, 13, 8), bodyMat);
fuselage.rotation.x = Math.PI / 2;
planeGroup.add(fuselage);

// Nose cone
const nose = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3, 8), accentMat);
nose.rotation.x = -Math.PI / 2;
nose.position.z = -7.8;
planeGroup.add(nose);

// Canopy
const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), glassMat);
canopy.scale.set(1, 0.7, 1.6);
canopy.position.set(0, 1.1, -1.5);
planeGroup.add(canopy);

// Main wing
const wing = new THREE.Mesh(new THREE.BoxGeometry(22, 0.5, 4.2), bodyMat);
wing.position.set(0, 0.2, -1);
planeGroup.add(wing);
const wingStripe = new THREE.Mesh(new THREE.BoxGeometry(22, 0.52, 1), accentMat);
wingStripe.position.set(0, 0.21, 0.4);
planeGroup.add(wingStripe);

// Tailplane + fin
const tailWing = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 2.4), bodyMat);
tailWing.position.set(0, 0.4, 6);
planeGroup.add(tailWing);
const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 2.6), accentMat);
tailFin.position.set(0, 1.9, 6.2);
planeGroup.add(tailFin);

// Fixed landing gear
const gearMat = propMat;
for (const gx of [-2.6, 2.6]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.2, 5), gearMat);
    strut.position.set(gx, -1.4, -1);
    planeGroup.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 8), gearMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(gx, -2.4, -1);
    planeGroup.add(wheel);
}

// Propeller (spins around Z)
const propeller = new THREE.Group();
const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8, 0.5), propMat);
propeller.add(blade);
const blade2 = blade.clone();
blade2.rotation.z = Math.PI / 2;
propeller.add(blade2);
const hub = new THREE.Mesh(new THREE.SphereGeometry(0.6, 6, 6), accentMat);
propeller.add(hub);
propeller.position.z = -9.3;
planeGroup.add(propeller);
// Faint spinning disc to suggest motion blur
const propDisc = new THREE.Mesh(
    new THREE.CircleGeometry(4, 16),
    new THREE.MeshBasicMaterial({ color: '#bfc4c8', transparent: true, opacity: 0.12, side: THREE.DoubleSide })
);
propDisc.position.z = -9.4;
planeGroup.add(propDisc);

planeGroup.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
planeGroup.position.set(0, 150, 0);
scene.add(planeGroup);

// ---------- MINIMAP SETUP ----------
const minimapCamera = new THREE.OrthographicCamera(-1000, 1000, 1000, -1000, 100, 4000);
minimapCamera.position.y = 1500;
minimapCamera.rotation.x = -Math.PI / 2;

// ---------- FLIGHT PHYSICS ----------
let cameraZ = 200;   // plane world Z (nose points toward -Z)
let cameraX = 0;      // plane world X
let planeY = 150;     // plane world Y
let cruiseAlt = 150;  // altitude the autopilot holds; only changes to clear terrain

const CRUISE_SPEED = 105; // target airspeed in level flight
let airspeed = CRUISE_SPEED;

let roll = 0;
let pitch = 0;
let yaw = 0;
let currentVelX = 0; // Added persistent horizontal velocity

let propSpin = 0;

// Chase camera starts behind and above the aircraft
camera.position.set(0, planeY + 11, cameraZ + 36);

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1);
    const time = clock.getElapsedTime();

    // 1. Airspeed dynamics: engine seeks cruise, gravity trades altitude for speed.
    //    Climbing (nose up, pitch > 0) bleeds energy; diving builds it.
    const gravityAccel = Math.sin(pitch) * 140;
    const engineAccel = (CRUISE_SPEED - airspeed) * 0.6;
    airspeed += (engineAccel - gravityAccel) * delta;
    airspeed = Math.max(45, Math.min(230, airspeed));

    // Move plane forward along its heading
    cameraZ -= airspeed * Math.cos(yaw) * delta;
    cameraX += -airspeed * Math.sin(yaw) * delta;

    // 2. Horizontal Flight & Dodge Logic
    // Look ahead to evaluate terrain obstacles by sampling several distances
    const scanWidth = 450; // Wider scan for lower paths
    let avgHCenter = 0, avgHLeft = 0, avgHRight = 0;
    const samples = 4;
    for (let i = 1; i <= samples; i++) {
        const checkZ = cameraZ - (i * 350); // check up to 1400 units ahead
        avgHCenter += generateHeight(cameraX, checkZ);
        avgHLeft += generateHeight(cameraX - scanWidth, checkZ);
        avgHRight += generateHeight(cameraX + scanWidth, checkZ);
    }
    avgHCenter /= samples;
    avgHLeft /= samples;
    avgHRight /= samples;

    let avoidanceForce = 0; // Target horizontal velocity

    // If a mountain is detected ahead, decide smoothly to dodge earlier
    if (avgHCenter > 65) {
        if (avgHLeft < avgHRight) {
            avoidanceForce -= Math.pow(Math.max(0, avgHCenter - 55), 1.2) * 1.5;
        } else {
            avoidanceForce += Math.pow(Math.max(0, avgHCenter - 55), 1.2) * 1.5;
        }
    }

    // Push away from lateral mountain walls closing in very gently
    if (avgHLeft > 90) avoidanceForce += (avgHLeft - 80) * 0.8;
    if (avgHRight > 90) avoidanceForce -= (avgHRight - 80) * 0.8;

    // --- Map edge containment ---------------------------------------------
    // The terrain mesh is CHUNK_WIDTH wide (half = 2000). Keep the plane well
    // inside it: an ever-firmer push back past SOFT_EDGE, and a hard wall at
    // HARD_EDGE that the plane can never cross.
    const MAP_HALF = CHUNK_WIDTH / 2;  // 2000
    const SOFT_EDGE = MAP_HALF - 950;  // 1050 — start easing back here (lots of room)
    const HARD_EDGE = MAP_HALF - 250;  // 1750 — absolute limit

    let edgeFactor = 0; // 0 = safe, 1 = at the hard wall
    if (Math.abs(cameraX) > SOFT_EDGE) {
        edgeFactor = Math.min(1, (Math.abs(cameraX) - SOFT_EDGE) / (HARD_EDGE - SOFT_EDGE));
        // Gentle, capped nudge back toward the centre — eases in with edgeFactor².
        avoidanceForce -= Math.sign(cameraX) * edgeFactor * edgeFactor * 80;
    }

    // Small ambient wander so the flight isn't entirely straight in a flat valley,
    // faded out as we approach the edge.
    let wanderVel = Math.sin(time * 0.5) * 15 * (1 - edgeFactor);

    // Suppress steering/wander that pushes further toward the edge we're near.
    let steer = userSteer;
    if (edgeFactor > 0) {
        const outward = cameraX > 0 ? 1 : -1;
        if (Math.sign(steer) === outward) steer *= (1 - edgeFactor);
        if (Math.sign(wanderVel) === outward) wanderVel *= (1 - edgeFactor);
    }

    // Combine autopilot (avoidance) with user steering
    let targetVelX = wanderVel + avoidanceForce + steer;

    // Interpolate horizontal speed smoothly. Stays sluggish in open air; only
    // firms up as we near the edge so the turn-back doesn't feel abrupt.
    const velLerp = Math.min(1, (0.5 + 1.6 * edgeFactor) * delta);
    currentVelX += (targetVelX - currentVelX) * velLerp;
    cameraX += currentVelX * delta;

    // Hard wall: never leave the meshed terrain.
    if (cameraX > HARD_EDGE) { cameraX = HARD_EDGE; if (currentVelX > 0) currentVelX = 0; }
    if (cameraX < -HARD_EDGE) { cameraX = -HARD_EDGE; if (currentVelX < 0) currentVelX = 0; }

    // 3. Vertical guidance — hold altitude; only climb/descend when terrain forces it.
    const hBelow = generateHeight(cameraX, cameraZ);

    // Scan the path ahead (along the heading the plane is actually steering toward)
    // for the highest ground it will have to cross.
    let maxHAhead = hBelow;
    const lateralDrift = THREE.MathUtils.clamp(currentVelX * 2.5, -320, 320);
    for (let i = 1; i <= 6; i++) {
        const dz = cameraZ - (i * 260);              // up to ~1560 units ahead
        const dx = cameraX + lateralDrift * (i / 6); // account for where steering is taking us
        const h = generateHeight(dx, dz);
        if (h > maxHAhead) maxHAhead = h;
    }

    const CLEARANCE = 105;          // how far above ground we insist on being
    const floorAlt = hBelow + 70;   // never get closer than this to the ground right under us

    // Can the plane realistically dodge instead of climb? Only if there's a clear
    // lateral gap: at least one side markedly lower than the obstacle ahead.
    const dodgeable = Math.min(avgHLeft, avgHRight) < avgHCenter - 35 &&
                      Math.min(avgHLeft, avgHRight) + CLEARANCE < cruiseAlt + 20;

    const neededAlt = maxHAhead + CLEARANCE;
    if (neededAlt > cruiseAlt && !dodgeable) {
        // Obstacle we can't sidestep — pull up, fairly promptly.
        cruiseAlt += (neededAlt - cruiseAlt) * 1.6 * delta;
    } else if (neededAlt > cruiseAlt && dodgeable) {
        // We'll go around it: only a mild bump if the peak is really tall.
        const softTarget = Math.min(neededAlt, cruiseAlt + 45);
        cruiseAlt += (softTarget - cruiseAlt) * 0.4 * delta;
    } else if (cruiseAlt - neededAlt > 90 && cruiseAlt - floorAlt > 60) {
        // Terrain has dropped well away and we're higher than needed — sink back
        // toward a comfortable cruising height, but very slowly (no bobbing).
        const relaxTarget = Math.max(neededAlt, floorAlt, 150);
        cruiseAlt += (relaxTarget - cruiseAlt) * 0.12 * delta;
    }
    // otherwise: hold altitude (dead-band) — this is the common case over rough ground.

    cruiseAlt = Math.max(cruiseAlt, floorAlt, 150);

    // Atmospheric turbulence — attitude buffeting only; keep it off the altitude.
    const turbP = noise2D(time * 0.55, 17.2) * 0.04;
    const turbR = noise2D(time * 0.73, 91.6) * 0.055;
    const turbY = noise2D(time * 0.37, 133.7) * 1.1; // barely-there vertical breathing

    // Track the held altitude smoothly ("heavy" vertical response)
    const prevY = planeY;
    planeY += (cruiseAlt + turbY - planeY) * 0.9 * delta;
    const climbRate = (planeY - prevY) / Math.max(delta, 0.0001);

    // 4. Realistic airframe attitude — smooth, gentle responses.
    // Bank into the turn (roll follows lateral velocity), coordinated.
    const targetRoll = THREE.MathUtils.clamp(-currentVelX * 0.007, -0.38, 0.38) + turbR;
    roll += (targetRoll - roll) * 1.8 * delta;

    // Pitch follows climb/descent rate — nose points where the plane is going.
    const targetPitch = THREE.MathUtils.clamp(climbRate * 0.0035, -0.22, 0.26) + turbP;
    pitch += (targetPitch - pitch) * 1.8 * delta;

    // Yaw slowly aligns the nose with the flight path (adverse-yaw feel).
    const targetYaw = -currentVelX * 0.0014;
    yaw += (targetYaw - yaw) * 1.3 * delta;

    // Position + orient the visible aircraft
    planeGroup.position.set(cameraX, planeY, cameraZ);
    planeGroup.rotation.set(pitch, yaw, roll, 'YXZ');

    // Spinning propeller (rate scales with airspeed), plus a shimmering disc.
    propSpin += airspeed * 0.14 * delta * 60;
    propeller.rotation.z = propSpin;
    propDisc.material.opacity = 0.06 + Math.min(0.14, airspeed / 1600);

    // 4b. Spring-lag chase camera sitting behind and above the tail.
    const camBack = 52, camUp = 15;
    const desiredX = cameraX + Math.sin(yaw) * camBack;
    const desiredZ = cameraZ + Math.cos(yaw) * camBack;
    const desiredY = planeY + camUp + Math.sin(pitch) * -14;
    const camLerp = 1 - Math.pow(0.0009, delta);
    camera.position.x += (desiredX - camera.position.x) * camLerp;
    camera.position.y += (desiredY - camera.position.y) * camLerp;
    camera.position.z += (desiredZ - camera.position.z) * camLerp;
    camera.lookAt(cameraX - Math.sin(yaw) * 12, planeY + 3, cameraZ - Math.cos(yaw) * 12);
    camera.rotateZ(roll * 0.35); // let the horizon tilt slightly with the bank

    // Speed sensation: FOV widens as the plane accelerates.
    const targetFov = 55 + (airspeed - CRUISE_SPEED) * 0.09;
    camera.fov += (targetFov - camera.fov) * 0.04;
    camera.updateProjectionMatrix();

    // 5. Chunk Recycling
    for (const chunk of chunks) {
        // If chunk is completely behind camera (plus some margin)
        if (chunk.mesh.position.z > cameraZ + (CHUNK_DEPTH * 0.6)) {
            // Find the furthest chunk index
            let minIndex = chunk.index;
            for (const c of chunks) {
                if (c.index > minIndex) minIndex = c.index;
            }
            // Place it ahead
            chunk.index = minIndex + 1;
            const newZBase = -chunk.index * CHUNK_DEPTH;
            chunk.mesh.position.z = newZBase;

            // Regenerate the height map geometry based on new world position
            updateChunkGeometry(chunk.geometry, newZBase);
        }
    }

    // 6. Cloud Recycling
    for (const cloud of clouds) {
        if (cloud.position.z > cameraZ + 200) {
            cloud.position.z -= 4000; // Push back to the horizon
            cloud.position.x = cameraX + (Math.random() - 0.5) * 2000;
        }
    }

    // 7. Update Sun & Light Position to cast shadows and stay in the sky
    const sunOffsetX = 2500;
    const sunOffsetY = 1400; // Much higher in the sky
    const sunOffsetZ = -6000; // Extremely far ahead so perspective makes it look static

    // To prevent "shadow swimming" (shadows crawling as camera moves),
    // we snap the light's target to the shadow map's texel resolution.
    // Shadow camera width is exactly 2000 (from -1000 to 1000). Map size is 2048.
    const shadowMapWidth = 2000;
    const texelSize = shadowMapWidth / 2048;
    const snappedX = Math.round(cameraX / texelSize) * texelSize;
    const snappedZ = Math.round(cameraZ / texelSize) * texelSize;

    // The directional light comes from the sun's direction but stays closer for crisp shadows
    dirLight.position.x = snappedX + (sunOffsetX * 0.2);
    dirLight.position.y = sunOffsetY * 0.2;
    dirLight.position.z = snappedZ + (sunOffsetZ * 0.2);
    dirLight.target.position.set(snappedX, 0, snappedZ);
    dirLight.target.updateMatrixWorld();

    // The visual sun sphere stays glued to the horizon
    sunMesh.position.x = cameraX + sunOffsetX;
    sunMesh.position.y = sunOffsetY;
    sunMesh.position.z = cameraZ + sunOffsetZ;
    sunMesh.lookAt(camera.position);

    // Ensure water moves exactly under the camera to appear infinite
    waterMesh.position.z = cameraZ;
    waterMesh.position.x = cameraX;

    // --- 1. Render Main Scene ---
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissorTest(true);
    renderer.clear();
    renderer.render(scene, camera);

    // --- 2. Render Minimap ---
    minimapCamera.position.x = cameraX;
    minimapCamera.position.z = cameraZ - 800; // Look ahead to avoid empty recycled spots

    const minimapScale = window.innerWidth <= 768 ? 120 : 180;
    const padding = window.innerWidth <= 768 ? 15 : 20;
    const mapX = window.innerWidth - minimapScale - padding;
    const mapY = padding;

    renderer.setViewport(mapX, mapY, minimapScale, minimapScale);
    renderer.setScissor(mapX, mapY, minimapScale, minimapScale);
    renderer.setScissorTest(true);

    // Clear everything so minimap respects its own drawing stack
    renderer.clear();

    // Momentarily disable fog so minimap is perfectly clear
    const oldFog = scene.fog;
    scene.fog = null;

    renderer.render(scene, minimapCamera);

    // Restore fog
    scene.fog = oldFog;

    // --- 3. Update HTML Minimap Blip ---
    const blipWrapper = document.getElementById('minimap-blip-wrapper');
    if (blipWrapper) {
        // We negate yaw because HTML rotation is clockwise (positive), 
        // while 3D space Yaw is standard Math (positive counter-clockwise)
        blipWrapper.style.transform = `rotate(${-yaw}rad)`;
    }

    // --- 4. Instrument readout ---
    if (instrumentEl) {
        const alt = Math.round((planeY - generateHeight(cameraX, cameraZ)) * 3.3); // "feet" AGL
        const kts = Math.round(airspeed * 0.9);
        instrumentEl.textContent = `SPD ${kts} kt   ·   ALT ${alt} ft AGL`;
    }
}

// Lightweight instrument strip
const instrumentEl = document.createElement('div');
instrumentEl.id = 'instruments';
instrumentEl.style.cssText =
    'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);' +
    'font:700 13px/1 Inter,system-ui,sans-serif;letter-spacing:1px;color:#f4f6f8;' +
    'background:rgba(20,28,36,0.42);padding:8px 16px;border-radius:20px;' +
    'backdrop-filter:blur(4px);pointer-events:none;z-index:20;white-space:nowrap';
document.body.appendChild(instrumentEl);

// ---------- INTERACTION & MOBILE ----------
let touchStartX = 0;
let userSteer = 0;
let isTouching = false;

window.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    isTouching = true;
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    const touchX = e.touches[0].clientX;
    const diff = touchX - touchStartX;
    // Normalize steering force based on screen width
    userSteer = (diff / window.innerWidth) * 400;
}, { passive: true });

window.addEventListener('touchend', () => {
    userSteer = 0;
    isTouching = false;
});

// Support for mouse "steering" too
window.addEventListener('mousedown', (e) => {
    touchStartX = e.clientX;
    isTouching = true;
});

window.addEventListener('mousemove', (e) => {
    if (!isTouching) return;
    const diff = e.clientX - touchStartX;
    userSteer = (diff / window.innerWidth) * 400;
});

window.addEventListener('mouseup', () => {
    userSteer = 0;
    isTouching = false;
});

// Third-person view now shows the aircraft, so the crosshair is redundant.
const crosshairEl = document.getElementById('crosshair');
if (crosshairEl) crosshairEl.style.display = 'none';

// Update instructions on mobile
if ('ontouchstart' in window) {
    const p = document.querySelector('#hud p');
    if (p) p.innerText = 'Tap and slide horizontally to steer.';
}

// Window resizing
window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// Fullscreen support
const fsBtn = document.getElementById('fullscreen-btn');
if (fsBtn) {
    fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.warn(`Error attempting to enable full-screen mode: ${err.message}`);
            });
            fsBtn.innerText = '⛶';
        } else {
            document.exitFullscreen();
            fsBtn.innerText = '⟎';
        }
    });
}

// Start loop
animate();
