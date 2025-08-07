import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.179.1/three.module.min.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.179.1/examples/jsm/controls/PointerLockControls.js';
import { createNoise2D } from 'https://cdn.jsdelivr.net/npm/simplex-noise@4.0.3/dist/esm/simplex-noise.js';

// Minecraft Clone - Core JavaScript

// Scene
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// Renderer
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// World generation parameters
const chunkSize = 16;
const terrainHeight = 16;
const noiseScale = 0.1;

// Create noise function
const noise2D = createNoise2D();

// Texture loading
const textureLoader = new THREE.TextureLoader();
const grassTopTexture = textureLoader.load('https://raw.githubusercontent.com/ianklatzco/mc.js/master/textures/grass.png');
const grassSideTexture = textureLoader.load('https://raw.githubusercontent.com/ianklatzco/mc.js/master/textures/grass_side.png');
const dirtTexture = textureLoader.load('https://raw.githubusercontent.com/ianklatzco/mc.js/master/textures/dirt.png');
const stoneTexture = textureLoader.load('https://raw.githubusercontent.com/ianklatzco/mc.js/master/textures/stone.png');
const sandTexture = textureLoader.load('https://raw.githubusercontent.com/ianklatzco/mc.js/master/textures/sand.png');
const woodTexture = textureLoader.load('https://raw.githubusercontent.com/ianklatzco/mc.js/master/textures/oak_log.png');
const leavesTexture = textureLoader.load('https://raw.githubusercontent.com/ianklatzco/mc.js/master/textures/oak_leaves.png');
const coalOreTexture = textureLoader.load('https://raw.githubusercontent.com/ianklatzco/mc.js/master/textures/coal_ore.png');
const ironOreTexture = textureLoader.load('https://raw.githubusercontent.com/ianklatzco/mc.js/master/textures/iron_ore.png');
const oakPlanksTexture = textureLoader.load('https://raw.githubusercontent.com/ianklatzco/mc.js/master/textures/oak_planks.png');


// Materials
const grassMaterial = [
    new THREE.MeshLambertMaterial({ map: grassSideTexture }), // right
    new THREE.MeshLambertMaterial({ map: grassSideTexture }), // left
    new THREE.MeshLambertMaterial({ map: grassTopTexture }),  // top
    new THREE.MeshLambertMaterial({ map: dirtTexture }),      // bottom
    new THREE.MeshLambertMaterial({ map: grassSideTexture }), // front
    new THREE.MeshLambertMaterial({ map: grassSideTexture }), // back
];
const dirtMaterial = new THREE.MeshLambertMaterial({ map: dirtTexture });
const stoneMaterial = new THREE.MeshLambertMaterial({ map: stoneTexture });
const sandMaterial = new THREE.MeshLambertMaterial({ map: sandTexture });
const woodMaterial = new THREE.MeshLambertMaterial({ map: woodTexture });
const leavesMaterial = new THREE.MeshLambertMaterial({ map: leavesTexture, transparent: true });
const coalOreMaterial = new THREE.MeshLambertMaterial({ map: coalOreTexture });
const ironOreMaterial = new THREE.MeshLambertMaterial({ map: ironOreTexture });
const oakPlanksMaterial = new THREE.MeshLambertMaterial({ map: oakPlanksTexture });


// Crafting
const craftingGrid = [null, null, null, null, null, null, null, null, null];
const recipes = [
    {
        shape: [
            [null, null, null],
            [null, 'wood', null],
            [null, null, null]
        ],
        result: { type: 'oak_planks', count: 4 }
    }
];

// Biome noise
const biomeNoise = createNoise2D();
const biomeScale = 0.02;

// Chunk-based world storage
const chunks = new Map();

class Chunk {
    constructor(chunkX, chunkZ) {
        this.chunkX = chunkX;
        this.chunkZ = chunkZ;
        this.blocks = new Map();
        this.meshes = {};
    }

    rebuildMeshes() {
        Object.values(this.meshes).forEach(mesh => mesh && scene.remove(mesh));
        this.meshes.grass = this.createInstancedMesh('grass', grassMaterial);
        this.meshes.dirt = this.createInstancedMesh('dirt', dirtMaterial);
        this.meshes.stone = this.createInstancedMesh('stone', stoneMaterial);
        this.meshes.sand = this.createInstancedMesh('sand', sandMaterial);
        this.meshes.wood = this.createInstancedMesh('wood', woodMaterial);
        this.meshes.leaves = this.createInstancedMesh('leaves', leavesMaterial);
        this.meshes.coal_ore = this.createInstancedMesh('coal_ore', coalOreMaterial);
        this.meshes.iron_ore = this.createInstancedMesh('iron_ore', ironOreMaterial);
    }

    createInstancedMesh(blockType, material) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const blocks = [];
        for (const [key, type] of this.blocks) {
            if (type === blockType) {
                const [x, y, z] = key.split(',').map(Number);
                blocks.push({ x, y, z });
            }
        }

        const count = blocks.length;
        if (count === 0) return null;
        const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
        instancedMesh.name = blockType;
        scene.add(instancedMesh);

        const matrix = new THREE.Matrix4();
        blocks.forEach((block, i) => {
            matrix.setPosition(this.chunkX * chunkSize + block.x, block.y, this.chunkZ * chunkSize + block.z);
            instancedMesh.setMatrixAt(i, matrix);
        });
        instancedMesh.instanceMatrix.needsUpdate = true;
        return instancedMesh;
    }
}

import { openDB, saveChunk, loadChunk } from './db.js';

// Chunk loading/unloading
const chunkWorker = new Worker('js/worker.js');
let lastPlayerChunk = { x: null, z: null };

chunkWorker.onmessage = function(e) {
    const { chunkX, chunkZ, blocks } = e.data;
    const chunk = new Chunk(chunkX, chunkZ);
    chunk.blocks = blocks;
    chunks.set(`${chunkX},${chunkZ}`, chunk);
    chunk.rebuildMeshes();
};

async function updateChunks() {
    const player = controls.getObject();
    const currentChunkX = Math.floor(player.position.x / chunkSize);
    const currentChunkZ = Math.floor(player.position.z / chunkSize);

    if (lastPlayerChunk.x !== currentChunkX || lastPlayerChunk.z !== currentChunkZ) {
        lastPlayerChunk.x = currentChunkX;
        lastPlayerChunk.z = currentChunkZ;

        // Load new chunks
        for (let x = currentChunkX - renderDistance; x <= currentChunkX + renderDistance; x++) {
            for (let z = currentChunkZ - renderDistance; z <= currentChunkZ + renderDistance; z++) {
                const chunkKey = `${x},${z}`;
                if (!chunks.has(chunkKey)) {
                    chunks.set(chunkKey, 'loading'); // placeholder to prevent multiple requests
                    loadChunk(chunkKey).then(blocks => {
                        if (blocks) {
                            const chunk = new Chunk(x, z);
                            chunk.blocks = blocks;
                            chunks.set(chunkKey, chunk);
                            chunk.rebuildMeshes();
                        } else {
                            chunkWorker.postMessage({
                                chunkX: x,
                                chunkZ: z,
                                chunkSize,
                                terrainHeight,
                        noiseScale,
                        biomeScale,
                        seed: 'my-seed' // a fixed seed for now
                            });
                        }
                    });
                }
            }
        }

        // Unload old chunks
        for (const [key, chunk] of chunks.entries()) {
            const [x, z] = key.split(',').map(Number);
            const dx = Math.abs(x - currentChunkX);
            const dz = Math.abs(z - currentChunkZ);
            if (dx > renderDistance || dz > renderDistance) {
                if (chunk !== 'loading') {
                    saveChunk(key, chunk.blocks);
                    Object.values(chunk.meshes).forEach(mesh => mesh && scene.remove(mesh));
                }
                chunks.delete(key);
            }
        }
    }
}

// Initial chunk loading
const renderDistance = 2; // in chunks
updateChunks(); // initial load

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040); // soft white light
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

// Controls
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');

const controls = new PointerLockControls(camera, document.body);

instructions.addEventListener('click', () => {
    controls.lock();
});

controls.addEventListener('lock', () => {
    instructions.style.display = 'none';
    blocker.style.display = 'none';
});

controls.addEventListener('unlock', () => {
    blocker.style.display = 'block';
    instructions.style.display = '';
});

scene.add(controls.getObject());

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();

const onKeyDown = (event) => {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = true;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = true;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = true;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = true;
            break;
        case 'Space':
            if (canJump === true) velocity.y += 350;
            canJump = false;
            break;
    }

    // Hotbar selection
    if (event.code.startsWith('Digit')) {
        const digit = parseInt(event.code.slice(5));
        if (digit >= 1 && digit <= 9) {
            selectedSlot = digit - 1;
            updateHotbar();
        }
    }

    if (event.code === 'KeyE') {
        const inventoryScreen = document.getElementById('inventory-screen');
        inventoryScreen.classList.toggle('hidden');
        if (inventoryScreen.classList.contains('hidden')) {
            controls.lock();
        } else {
            controls.unlock();
        }
    }
};

const onKeyUp = (event) => {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = false;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = false;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = false;
            break;
    }
};

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);



// Set initial player position
controls.getObject().position.set(0, terrainHeight + 5, 0);

// Highlight cube
const highlightGeometry = new THREE.BoxGeometry(1.01, 1.01, 1.01);
const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.5 });
const highlightCube = new THREE.Mesh(highlightGeometry, highlightMaterial);
scene.add(highlightCube);

const raycaster = new THREE.Raycaster();

function worldToChunkCoords(pos) {
    const chunkX = Math.floor(pos.x / chunkSize);
    const chunkZ = Math.floor(pos.z / chunkSize);
    const localX = ((pos.x % chunkSize) + chunkSize) % chunkSize;
    const localY = pos.y;
    const localZ = ((pos.z % chunkSize) + chunkSize) % chunkSize;
    return { chunkX, chunkZ, localX, localY, localZ };
}

window.addEventListener('mousedown', (event) => {
    if (!controls.isLocked) return;

    if (highlightCube.visible) {
        const pos = highlightCube.position.clone().floor();
        const { chunkX, chunkZ, localX, localY, localZ } = worldToChunkCoords(pos);
        const chunkKey = `${chunkX},${chunkZ}`;
        const chunk = chunks.get(chunkKey);
        if (!chunk) return;

        const blockKey = `${localX},${localY},${localZ}`;

        if (event.button === 0) { // Left click to break
            if (chunk.blocks.has(blockKey)) {
                const blockType = chunk.blocks.get(blockKey);
                let material;
                if (blockType === 'grass') material = grassMaterial;
                if (blockType === 'dirt') material = dirtMaterial;
                if (blockType === 'stone') material = stoneMaterial;
                createBlockBreakParticles(highlightCube.position, material);

                chunk.blocks.delete(blockKey);
                chunk.rebuildMeshes();
                saveChunk(chunkKey, chunk.blocks);

                // Add block to inventory
                let added = false;
                for (let i = 0; i < 9; i++) {
                    const item = inventory[i];
                    if (item && item.type === blockType && item.count < 64) {
                        item.count++;
                        added = true;
                        break;
                    }
                }
                if (!added) {
                    for (let i = 0; i < 9; i++) {
                        if (!inventory[i]) {
                            inventory[i] = { type: blockType, count: 1 };
                            added = true;
                            break;
                        }
                    }
                }
                updateHotbar();
            }
        } else if (event.button === 2) { // Right click to place
            const selectedItem = inventory[selectedSlot];
            if (selectedItem && selectedItem.count > 0) {
                const intersect = raycaster.intersectObjects(scene.children.filter(c => c.isInstancedMesh))[0];
                if (intersect) {
                    const newBlockPos = intersect.point.addScaledVector(intersect.face.normal, 0.5).floor();
                    const { chunkX, chunkZ, localX, localY, localZ } = worldToChunkCoords(newBlockPos);
                    const chunkKey = `${chunkX},${chunkZ}`;
                    const chunk = chunks.get(chunkKey);
                    if (!chunk) return;

                    const newBlockKey = `${localX},${localY},${localZ}`;
                    if (!chunk.blocks.has(newBlockKey)) {
                        chunk.blocks.set(newBlockKey, selectedItem.type);
                        selectedItem.count--;
                        if (selectedItem.count === 0) {
                            inventory[selectedSlot] = null;
                        }
                        updateHotbar();
                        chunk.rebuildMeshes();
                        saveChunk(chunkKey, chunk.blocks);
                    }
                }
            }
        }
    }
});

function createBlockBreakParticles(pos, material) {
    const particleCount = 100;
    const particles = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
        posArray[i * 3 + 0] = pos.x;
        posArray[i * 3 + 1] = pos.y;
        posArray[i * 3 + 2] = pos.z;

        velocities.push(
            (Math.random() - 0.5) * 5,
            (Math.random()) * 5,
            (Math.random() - 0.5) * 5
        );
    }

    particles.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

    const particleMaterial = new THREE.PointsMaterial({
        size: 0.1,
        map: Array.isArray(material) ? material[2].map : material.map, // Use the top texture for grass
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const particleSystem = new THREE.Points(particles, particleMaterial);
    scene.add(particleSystem);

    const initialVelocities = new Float32Array(velocities);

    const clock = new THREE.Clock();
    function updateParticles() {
        const delta = clock.getDelta();
        const positions = particleSystem.geometry.attributes.position.array;
        for (let i = 0; i < particleCount; i++) {
            initialVelocities[i * 3 + 1] -= 9.8 * delta; // gravity
            positions[i * 3 + 0] += initialVelocities[i * 3 + 0] * delta;
            positions[i * 3 + 1] += initialVelocities[i * 3 + 1] * delta;
            positions[i * 3 + 2] += initialVelocities[i * 3 + 2] * delta;
        }
        particleSystem.geometry.attributes.position.needsUpdate = true;
        particleMaterial.opacity -= delta * 0.5;

        if (particleMaterial.opacity <= 0) {
            scene.remove(particleSystem);
            particleSystem.geometry.dispose();
            particleMaterial.map.dispose();
            particleMaterial.dispose();
        } else {
            requestAnimationFrame(updateParticles);
        }
    }
    updateParticles();
}


// Inventory
const hotbar = document.getElementById('hotbar');
const slots = hotbar.children;
const inventory = [
    { type: 'dirt', count: 64 },
    { type: 'stone', count: 64 },
    { type: 'sand', count: 64 },
    null, null, null, null, null, null
];
let selectedSlot = 0;

function updateHotbar() {
    for (let i = 0; i < 9; i++) {
        const slot = slots[i];
        const item = inventory[i];
        if (item) {
            slot.textContent = `${item.type.charAt(0).toUpperCase()}${item.type.slice(1)}\n${item.count}`;
            slot.draggable = true;
        } else {
            slot.textContent = '';
            slot.draggable = false;
        }
        if (i === selectedSlot) {
            slot.classList.add('selected');
        } else {
            slot.classList.remove('selected');
        }
    }
    // For now, player inventory is the same as hotbar
    const playerInventory = document.getElementById('player-inventory');
    playerInventory.innerHTML = '';
    for (let i = 0; i < 9; i++) {
        const slot = document.createElement('div');
        slot.classList.add('slot');
        const item = inventory[i];
        if (item) {
            slot.textContent = `${item.type.charAt(0).toUpperCase()}${item.type.slice(1)}\n${item.count}`;
            slot.draggable = true;
        }
        playerInventory.appendChild(slot);
    }

    const craftingGridEl = document.querySelector('.crafting-grid');
    for (let i = 0; i < 9; i++) {
        const slot = craftingGridEl.children[i];
        const item = craftingGrid[i];
        if (item) {
            slot.textContent = `${item.type.charAt(0).toUpperCase()}${item.type.slice(1)}\n${item.count}`;
            slot.draggable = true;
        } else {
            slot.textContent = '';
            slot.draggable = false;
        }
    }
}

updateHotbar();

const inventoryScreen = document.getElementById('inventory-screen');
let draggedItem = null;

inventoryScreen.addEventListener('dragstart', (event) => {
    if (event.target.classList.contains('slot')) {
        const slotIndex = Array.from(event.target.parentNode.children).indexOf(event.target);
        draggedItem = {
            item: inventory[slotIndex],
            originalIndex: slotIndex
        };
        event.dataTransfer.effectAllowed = 'move';
    }
});

inventoryScreen.addEventListener('dragover', (event) => {
    event.preventDefault();
});

inventoryScreen.addEventListener('drop', (event) => {
    event.preventDefault();
    if (event.target.classList.contains('slot') && draggedItem) {
        const parent = event.target.parentNode;
        const dropIndex = Array.from(parent.children).indexOf(event.target);

        if (parent.classList.contains('crafting-grid')) {
            // Drop into crafting grid
            craftingGrid[dropIndex] = draggedItem.item;
            inventory[draggedItem.originalIndex] = null;
        } else {
            // Swap items in inventory
            const temp = inventory[dropIndex];
            inventory[dropIndex] = draggedItem.item;
            inventory[draggedItem.originalIndex] = temp;
        }

        checkCrafting();
        updateHotbar();
        draggedItem = null;
    }
});

function checkCrafting() {
    const resultSlot = document.querySelector('.slot.result');
    resultSlot.innerHTML = '';

    for (const recipe of recipes) {
        let match = true;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                const item = craftingGrid[i * 3 + j];
                const required = recipe.shape[i][j];
                if ((item && item.type !== required) || (!item && required)) {
                    match = false;
                    break;
                }
            }
            if (!match) break;
        }

        if (match) {
            const item = recipe.result;
            resultSlot.textContent = `${item.type.charAt(0).toUpperCase()}${item.type.slice(1)}\n${item.count}`;
            break;
        }
    }
}

const resultSlot = document.querySelector('.slot.result');
resultSlot.addEventListener('click', () => {
    const resultText = resultSlot.textContent.trim();
    if (resultText) {
        const [type, count] = resultText.split('\n');
        const item = { type: type.toLowerCase(), count: parseInt(count) };

        // Add to inventory
        let added = false;
        for (let i = 0; i < 9; i++) {
            if (!inventory[i]) {
                inventory[i] = item;
                added = true;
                break;
            }
        }

        if (added) {
            // Consume crafting grid items
            for (let i = 0; i < 9; i++) {
                if (craftingGrid[i]) {
                    craftingGrid[i].count--;
                    if (craftingGrid[i].count === 0) {
                        craftingGrid[i] = null;
                    }
                }
            }
            checkCrafting();
            updateHotbar();
        }
    }
});

class Mob {
    constructor(x, y, z) {
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 1), new THREE.MeshLambertMaterial({ color: 0xffaaff }));
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xffaaff }));
        head.position.set(-0.75, 0.25, 0);
        const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 0.25), new THREE.MeshLambertMaterial({ color: 0xffaaff }));
        leg1.position.set(-0.5, -0.625, 0.25);
        const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 0.25), new THREE.MeshLambertMaterial({ color: 0xffaaff }));
        leg2.position.set(0.5, -0.625, 0.25);
        const leg3 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 0.25), new THREE.MeshLambertMaterial({ color: 0xffaaff }));
        leg3.position.set(-0.5, -0.625, -0.25);
        const leg4 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 0.25), new THREE.MeshLambertMaterial({ color: 0xffaaff }));
        leg4.position.set(0.5, -0.625, -0.25);

        this.group = new THREE.Group();
        this.group.add(body, head, leg1, leg2, leg3, leg4);
        this.group.position.set(x, y, z);
        scene.add(this.group);
    }

    update(delta) {
        // Simple wandering AI
        this.group.rotation.y += Math.random() * 0.1 - 0.05;
        this.group.position.x += Math.sin(this.group.rotation.y) * delta;
        this.group.position.z += Math.cos(this.group.rotation.y) * delta;
    }
}

const mobs = [];
for (let i = 0; i < 5; i++) {
    mobs.push(new Mob(Math.random() * 16, terrainHeight + 2, Math.random() * 16));
}


// Animation loop
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (controls.isLocked === true) {
        updateChunks();

        mobs.forEach(mob => mob.update(delta));

        // Raycasting for block highlighting
        raycaster.setFromCamera({ x: 0, y: 0 }, camera);
        const intersects = raycaster.intersectObjects(scene.children.filter(c => c.isInstancedMesh));
        if (intersects.length > 0) {
            const intersect = intersects[0];
            const p = intersect.point.addScaledVector(intersect.face.normal, -0.5).floor();
            highlightCube.position.set(p.x + 0.5, p.y + 0.5, p.z + 0.5);
            highlightCube.visible = true;
        } else {
            highlightCube.visible = false;
        }

        const player = controls.getObject();

        // Gravity
        velocity.y -= 9.8 * 20.0 * delta; // gravity

        // Movement damping
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize(); // this ensures consistent movements in all directions

        if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;

        // Collision detection and response
        const oldPosition = player.position.clone();

        // Y-axis movement and collision
        player.position.y += velocity.y * delta;
        const playerFeetPos = player.position.clone();
        playerFeetPos.y -= 1.8;
        const { chunkX: feetChunkX, chunkZ: feetChunkZ, localX: feetLocalX, localY: feetLocalY, localZ: feetLocalZ } = worldToChunkCoords(playerFeetPos);
        const feetChunk = chunks.get(`${feetChunkX},${feetChunkZ}`);
        if (feetChunk && feetChunk.blocks.has(`${Math.floor(feetLocalX)},${Math.floor(feetLocalY)},${Math.floor(feetLocalZ)}`)) {
            velocity.y = 0;
            player.position.y = oldPosition.y;
            canJump = true;
        }

        // X-axis movement and collision
        controls.moveRight(-velocity.x * delta);
        const playerHeadPos = player.position.clone();
        playerHeadPos.y -= 0.8;
        const { chunkX: headChunkX, chunkZ: headChunkZ, localX: headLocalX, localY: headLocalY, localZ: headLocalZ } = worldToChunkCoords(playerHeadPos);
        const headChunk = chunks.get(`${headChunkX},${headChunkZ}`);
        if ((feetChunk && feetChunk.blocks.has(`${Math.floor(feetLocalX)},${Math.floor(feetLocalY)},${Math.floor(feetLocalZ)}`)) || (headChunk && headChunk.blocks.has(`${Math.floor(headLocalX)},${Math.floor(headLocalY)},${Math.floor(headLocalZ)}`))) {
            player.position.x = oldPosition.x;
        }

        // Z-axis movement and collision
        controls.moveForward(-velocity.z * delta);
        if ((feetChunk && feetChunk.blocks.has(`${Math.floor(feetLocalX)},${Math.floor(feetLocalY)},${Math.floor(feetLocalZ)}`)) || (headChunk && headChunk.blocks.has(`${Math.floor(headLocalX)},${Math.floor(headLocalY)},${Math.floor(headLocalZ)}`))) {
            player.position.z = oldPosition.z;
        }

        if (player.position.y < -50) { // respawn if falls out of world
            velocity.y = 0;
            player.position.x = lastPlayerChunk.x * chunkSize + chunkSize / 2;
            player.position.z = lastPlayerChunk.z * chunkSize + chunkSize / 2;
            player.position.y = terrainHeight + 5;
        }
    }

    renderer.render(scene, camera);
}
