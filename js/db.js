const DB_NAME = 'minecraft-clone';
const DB_VERSION = 1;
const CHUNK_STORE_NAME = 'chunks';

let db;

export function openDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('Database error:', event.target.error);
            reject('Database error');
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(CHUNK_STORE_NAME)) {
                db.createObjectStore(CHUNK_STORE_NAME);
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
    });
}

export async function saveChunk(chunkKey, blocks) {
    const db = await openDB();
    const transaction = db.transaction(CHUNK_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(CHUNK_STORE_NAME);
    store.put(blocks, chunkKey);
    return transaction.complete;
}

export async function loadChunk(chunkKey) {
    const db = await openDB();
    const transaction = db.transaction(CHUNK_STORE_NAME, 'readonly');
    const store = transaction.objectStore(CHUNK_STORE_NAME);
    const request = store.get(chunkKey);
    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            resolve(request.result);
        };
        request.onerror = () => {
            reject(request.error);
        };
    });
}
