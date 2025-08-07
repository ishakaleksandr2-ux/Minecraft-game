importScripts('https://cdn.jsdelivr.net/npm/simplex-noise@2.4.0/simplex-noise.js');

self.onmessage = function(e) {
    const { chunkX, chunkZ, chunkSize, terrainHeight, noiseScale, biomeScale, seed } = e.data;

    const simplex = new SimplexNoise(seed);
    const biomeSimplex = new SimplexNoise(seed + 1);
    const oreSimplex = new SimplexNoise(seed + 2);

    const blocks = new Map();
    for (let x = 0; x < chunkSize; x++) {
        for (let z = 0; z < chunkSize; z++) {
            const worldX = chunkX * chunkSize + x;
            const worldZ = chunkZ * chunkSize + z;

            const biomeValue = biomeSimplex.noise2D(worldX * biomeScale, worldZ * biomeScale);

            let terrainNoise = simplex.noise2D(worldX * noiseScale, worldZ * noiseScale);
            let height;
            let topBlock = 'grass';
            let underBlock = 'dirt';

            if (biomeValue > 0.5) { // Mountains
                terrainNoise = simplex.noise2D(worldX * noiseScale * 2, worldZ * noiseScale * 2) * 0.5 + simplex.noise2D(worldX * noiseScale * 8, worldZ * noiseScale * 8) * 0.25;
                height = Math.round((terrainNoise + 1) / 2 * terrainHeight * 2);
                topBlock = 'stone';
                underBlock = 'stone';
            } else if (biomeValue > 0) { // Forest
                height = Math.round((terrainNoise + 1) / 2 * terrainHeight);
                // Trees will be added later
            } else { // Desert
                height = Math.round((terrainNoise + 1) / 2 * (terrainHeight / 2));
                topBlock = 'sand';
                underBlock = 'sand';
            }

            for (let y = 0; y <= height; y++) {
                const blockKey = `${x},${y},${z}`;
                if (y === height) {
                    blocks.set(blockKey, topBlock);
                } else if (y < height) {
                    const oreNoise = oreSimplex.noise3D(worldX * 0.1, y * 0.1, worldZ * 0.1);
                    if (oreNoise > 0.8) {
                        blocks.set(blockKey, 'coal_ore');
                    } else if (oreNoise > 0.9) {
                        blocks.set(blockKey, 'iron_ore');
                    } else {
                        blocks.set(blockKey, underBlock);
                    }
                }
            }

            // Tree generation
            if (topBlock === 'grass' && Math.random() < 0.02) {
                const treeHeight = Math.floor(Math.random() * 3) + 4;
                for (let i = 1; i <= treeHeight; i++) {
                    blocks.set(`${x},${height + i},${z}`, 'wood');
                }
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dy = -2; dy <= 2; dy++) {
                        for (let dz = -2; dz <= 2; dz++) {
                            if (dx * dx + dy * dy + dz * dz < 6) {
                                const key = `${x + dx},${height + treeHeight + dy},${z + dz}`;
                                if (!blocks.has(key)) {
                                    blocks.set(key, 'leaves');
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    self.postMessage({ chunkX, chunkZ, blocks });
};
