const idb = (() => {
    const DB_NAME = 'IRCTC_Booking_DB';
    const DB_VERSION = 1;
    let db;

    function openDB() {
        return new Promise((resolve, reject) => {
            if (db) {
                return resolve(db);
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject('Error opening database.');
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const tempDb = event.target.result;
                if (!tempDb.objectStoreNames.contains('credentials')) {
                    tempDb.createObjectStore('credentials', { keyPath: 'id', autoIncrement: true });
                }
                if (!tempDb.objectStoreNames.contains('proxies')) {
                    tempDb.createObjectStore('proxies', { keyPath: 'id', autoIncrement: true });
                }
                if (!tempDb.objectStoreNames.contains('bookingGroups')) {
                    tempDb.createObjectStore('bookingGroups', { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }

    async function getStore(storeName, mode) {
        const db = await openDB();
        const transaction = db.transaction(storeName, mode);
        return transaction.objectStore(storeName);
    }

    async function getAll(storeName) {
        const store = await getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function add(storeName, item) {
        const store = await getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.add(item);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function update(storeName, item) {
        const store = await getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.put(item);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function remove(storeName, key) {
        const store = await getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function clearStore(storeName) {
        const store = await getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    return {
        getAll,
        add,
        update,
        delete: remove,
        clear: clearStore,
    };
})();
