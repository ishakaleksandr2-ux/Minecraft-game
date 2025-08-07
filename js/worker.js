// Note: We can't use ES modules in workers without a bundler.
// For now, the worker will generate flat chunks.
// A future improvement would be to use a bundler like Webpack to handle worker dependencies.

self.onmessage = function(e) {
    const { chunkX, chunkZ, chunkSize, terrainHeight, noiseScale } = e.data;

    const blocks = new Map();
    for (let x = 0; x < chunkSize; x++) {
        for (let z = 0; z < chunkSize; z++) {
            // Flat world for now
            const height = Math.round(terrainHeight / 2);
            for (let y = 0; y <= height; y++) {
                const blockKey = `${x},${y},${z}`;
                if (y === height) {
                    blocks.set(blockKey, 'grass');
                } else if (y >= height - 3) {
                    blocks.set(blockKey, 'dirt');
                } else {
                    blocks.set(blockKey, 'stone');
                }
            }
        }
    }

    self.postMessage({ chunkX, chunkZ, blocks });
};
