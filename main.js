import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

// ---------- SCENE SETUP ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color('#A8BCCC'); // Blueish warm sky color
scene.fog = new THREE.Fog('#A8BCCC', 200, 2500);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 100, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
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


// ---------- MINIMAP SETUP ----------
const minimapCamera = new THREE.OrthographicCamera(-1000, 1000, 1000, -1000, 100, 4000);
minimapCamera.position.y = 1500;
minimapCamera.rotation.x = -Math.PI / 2;

// ---------- FLIGHT PHYSICS ----------
let cameraZ = 200;
let cameraX = 0;
const speed = 110; // Reduced flight speed for calmer flight

let roll = 0;
let pitch = 0;
let yaw = 0;
let currentVelX = 0; // Added persistent horizontal velocity

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1);
    const time = clock.getElapsedTime();

    // 1. Move plane forward continuously
    cameraZ -= speed * delta;

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

    // Soft bounds to keep plane inside the terrain mesh (CHUNK_WIDTH/2 = 2000)
    // We gently bounce it back if it tries to fly further than +-1200 from center
    if (cameraX > 1200) avoidanceForce -= (cameraX - 1200) * 1.5;
    if (cameraX < -1200) avoidanceForce += (-1200 - cameraX) * 1.5;

    // Small ambient wander so the flight isn't entirely straight in a flat valley
    let wanderVel = Math.sin(time * 0.5) * 15;

    let targetVelX = wanderVel + avoidanceForce;

    // Interpolate horizontal speed extremely smoothly (sluggish movement)
    currentVelX += (targetVelX - currentVelX) * 0.4 * delta;
    cameraX += currentVelX * delta;

    // 3. Vertical Terrain Avoidance 
    const hBelow = generateHeight(cameraX, cameraZ);

    // Look ahead for climbing, sample several points to catch upcoming sharp cliffs
    let maxHAhead = hBelow;
    for (let i = 1; i <= 3; i++) {
        const dz = cameraZ - (i * 250);
        const h = generateHeight(cameraX, dz);
        if (h > maxHAhead) maxHAhead = h;
    }

    // We want to fly safely above the ground
    let idealY = Math.max(hBelow + 80, maxHAhead + 100);
    idealY = Math.max(idealY, 150); // Minimum flight altitude

    // Smoothly interpolate camera Y towards the ideal Y (slow vertical climb)
    camera.position.y += (idealY - camera.position.y) * 0.5 * delta;
    camera.position.x = cameraX;
    camera.position.z = cameraZ;

    // 4. Calculate realistic plane rotations
    // Bank (Roll) naturally maps to horizontal velocity now
    const targetRoll = -currentVelX * 0.005; // Bank softly
    // Restrict maximum roll so it doesn't look acrobatic
    const clampedRoll = Math.max(-0.25, Math.min(0.25, targetRoll));
    roll += (clampedRoll - roll) * 0.8 * delta;

    // Pitch depending on vertical velocity
    const velY = (idealY - camera.position.y);
    const targetPitch = velY * 0.003;
    // Restrict pitch so the plane doesn't point sharply up
    const clampedPitch = Math.max(-0.2, Math.min(0.2, targetPitch));
    pitch += (clampedPitch - pitch) * 0.8 * delta;

    // Yaw to slightly face the direction of movement
    const targetYaw = -currentVelX * 0.001;
    yaw += (targetYaw - yaw) * 0.8 * delta;

    camera.rotation.set(pitch, yaw, roll, 'YXZ'); // Order matters for flight

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

    const minimapSize = 200;
    const padding = 25; // Matching CSS bottom/right
    const mapX = window.innerWidth - minimapSize - padding;
    const mapY = padding; // WebGL viewport coordinates start from bottom-left

    renderer.setViewport(mapX, mapY, minimapSize, minimapSize);
    renderer.setScissor(mapX, mapY, minimapSize, minimapSize);
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
}

// Window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start loop
animate();
