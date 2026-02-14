/**
 * IndexedDB Utilities for FieldVoice Pro
 * Generic helpers for local-first storage
 */

(function() {
    'use strict';

    const DB_NAME = 'fieldvoice-pro';
    const DB_VERSION = 6; // v6: add cachedArchives store

    let db = null;
    const IDB_OPEN_TIMEOUT_MS = 3000; // 3s timeout for indexedDB.open()

    /**
     * Opens/creates the IndexedDB database.
     * Includes a timeout to prevent indefinite hangs on iOS PWA (known Safari bug
     * where indexedDB.open() never fires onsuccess/onerror after bfcache restore
     * or app switch).
     * @returns {Promise<IDBDatabase>} The database instance
     */
    function initDB() {
        return new Promise((resolve, reject) => {
            if (db) {
                // Validate existing connection — iOS may close it during bfcache.
                // Reading objectStoreNames alone isn't sufficient — a closed
                // connection may still have the property but fail on transaction().
                // Try opening a readonly transaction on a known store as a health check.
                try {
                    var _tx = db.transaction(['projects'], 'readonly');
                    _tx.abort(); // clean up — we only needed to verify it doesn't throw
                    resolve(db);
                    return;
                } catch (e) {
                    console.warn('[IDB] Stale connection detected, reopening...', e.message);
                    db = null;
                    // Fall through to reopen
                }
            }

            var settled = false;

            // Timeout: reject if IndexedDB doesn't respond
            var timer = setTimeout(function() {
                if (!settled) {
                    settled = true;
                    console.error('[IDB] indexedDB.open() timed out after ' + IDB_OPEN_TIMEOUT_MS + 'ms');
                    reject(new Error('IndexedDB open timed out'));
                }
            }, IDB_OPEN_TIMEOUT_MS);

            var request;
            try {
                request = indexedDB.open(DB_NAME, DB_VERSION);
            } catch (e) {
                clearTimeout(timer);
                console.error('[IDB] indexedDB.open() threw:', e);
                reject(e);
                return;
            }

            request.onerror = (event) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                db = event.target.result;

                // Listen for unexpected close (iOS can close IDB connections)
                db.onclose = function() {
                    console.warn('[IDB] Database connection closed unexpectedly');
                    db = null;
                };

                console.log('IndexedDB initialized successfully');
                resolve(db);
            };

            // Handle blocked event (another connection prevents upgrade)
            request.onblocked = function() {
                console.warn('[IDB] Database open blocked by another connection');
                // Don't settle here — wait for timeout or eventual success
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;

                // Create projects store
                if (!database.objectStoreNames.contains('projects')) {
                    database.createObjectStore('projects', { keyPath: 'id' });
                    console.log('Created projects object store');
                }

                // Create userProfile store
                if (!database.objectStoreNames.contains('userProfile')) {
                    database.createObjectStore('userProfile', { keyPath: 'deviceId' });
                    console.log('Created userProfile object store');
                }

                // Create photos store (v2)
                if (!database.objectStoreNames.contains('photos')) {
                    const photosStore = database.createObjectStore('photos', { keyPath: 'id' });
                    photosStore.createIndex('reportId', 'reportId', { unique: false });
                    photosStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                    console.log('Created photos object store');
                }

                // Remove dead archives store (v3)
                if (database.objectStoreNames.contains('archives')) {
                    database.deleteObjectStore('archives');
                    console.log('Deleted archives object store');
                }

                // Create currentReports store (v4)
                if (!database.objectStoreNames.contains('currentReports')) {
                    const crStore = database.createObjectStore('currentReports', { keyPath: 'id' });
                    crStore.createIndex('project_id', 'project_id', { unique: false });
                    crStore.createIndex('status', 'status', { unique: false });
                    console.log('Created currentReports object store');
                }

                // Create draftData store (v5)
                if (!database.objectStoreNames.contains('draftData')) {
                    database.createObjectStore('draftData', { keyPath: 'reportId' });
                    console.log('Created draftData object store');
                }

                // Create cachedArchives store (v6)
                if (!database.objectStoreNames.contains('cachedArchives')) {
                    database.createObjectStore('cachedArchives', { keyPath: 'key' });
                    console.log('Created cachedArchives object store');
                }
            };
        });
    }

    /**
     * Ensures the database is initialized and the connection is healthy.
     * Always delegates to initDB() which validates existing connections
     * and reopens if stale (iOS bfcache fix).
     * @returns {Promise<IDBDatabase>} The database instance
     */
    function ensureDB() {
        return initDB();
    }

    // ============================================
    // PROJECTS STORE
    // ============================================

    /**
     * Upserts a single project object (with nested contractors)
     * @param {Object} project - The project object to save
     * @returns {Promise<void>}
     */
    function saveProject(project) {
        return ensureDB().then((database) => {
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(['projects'], 'readwrite');
                const store = transaction.objectStore('projects');
                const request = store.put(project);

                request.onsuccess = () => {
                    resolve();
                };

                request.onerror = (event) => {
                    console.error('Error saving project:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Returns a single project by ID
     * @param {string} id - The project ID
     * @returns {Promise<Object|undefined>} The project object or undefined if not found
     */
    function getProject(id) {
        return ensureDB().then((database) => {
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(['projects'], 'readonly');
                const store = transaction.objectStore('projects');
                const request = store.get(id);

                request.onsuccess = (event) => {
                    resolve(event.target.result);
                };

                request.onerror = (event) => {
                    console.error('Error getting project:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Returns all projects as an array
     * @returns {Promise<Array>} Array of all project objects
     */
    function getAllProjects() {
        return ensureDB().then((database) => {
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(['projects'], 'readonly');
                const store = transaction.objectStore('projects');
                const request = store.getAll();

                request.onsuccess = (event) => {
                    resolve(event.target.result || []);
                };

                request.onerror = (event) => {
                    console.error('Error getting all projects:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Deletes a project by ID
     * @param {string} id - The project ID to delete
     * @returns {Promise<void>}
     */
    function deleteProject(id) {
        return ensureDB().then((database) => {
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(['projects'], 'readwrite');
                const store = transaction.objectStore('projects');
                const request = store.delete(id);

                request.onsuccess = () => {
                    resolve();
                };

                request.onerror = (event) => {
                    console.error('Error deleting project:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    // ============================================
    // USER PROFILE STORE
    // ============================================

    /**
     * Upserts a user profile
     * @param {Object} profile - The user profile object (must include deviceId)
     * @returns {Promise<void>}
     */
    function saveUserProfile(profile) {
        return ensureDB().then((database) => {
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(['userProfile'], 'readwrite');
                const store = transaction.objectStore('userProfile');
                const request = store.put(profile);

                request.onsuccess = () => {
                    resolve();
                };

                request.onerror = (event) => {
                    console.error('Error saving user profile:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Returns a user profile by deviceId
     * @param {string} deviceId - The device ID
     * @returns {Promise<Object|undefined>} The profile object or undefined if not found
     */
    function getUserProfile(deviceId) {
        return ensureDB().then((database) => {
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(['userProfile'], 'readonly');
                const store = transaction.objectStore('userProfile');
                const request = store.get(deviceId);

                request.onsuccess = (event) => {
                    resolve(event.target.result);
                };

                request.onerror = (event) => {
                    console.error('Error getting user profile:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    // ============================================
    // PHOTOS STORE
    // ============================================

    /**
     * Saves a photo to IndexedDB
     * @param {Object} photo - Photo object (must include id, reportId)
     * @returns {Promise<void>}
     */
    function savePhoto(photo) {
        return ensureDB().then((database) => {
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(['photos'], 'readwrite');
                const store = transaction.objectStore('photos');
                const request = store.put(photo);

                request.onsuccess = () => {
                    resolve();
                };

                request.onerror = (event) => {
                    console.error('Error saving photo:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Gets a photo by ID
     * @param {string} id - The photo ID
     * @returns {Promise<Object|undefined>}
     */
    function getPhoto(id) {
        return ensureDB().then((database) => {
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(['photos'], 'readonly');
                const store = transaction.objectStore('photos');
                const request = store.get(id);

                request.onsuccess = (event) => {
                    resolve(event.target.result);
                };

                request.onerror = (event) => {
                    console.error('Error getting photo:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Gets all photos for a report
     * @param {string} reportId - The report ID
     * @returns {Promise<Array>}
     */
    function getPhotosByReportId(reportId) {
        return ensureDB().then((database) => {
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(['photos'], 'readonly');
                const store = transaction.objectStore('photos');
                const index = store.index('reportId');
                const request = index.getAll(reportId);

                request.onsuccess = (event) => {
                    resolve(event.target.result || []);
                };

                request.onerror = (event) => {
                    console.error('Error getting photos by reportId:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Gets all photos with a specific sync status
     * @param {string} syncStatus - The sync status ('pending', 'synced', 'failed')
     * @returns {Promise<Array>}
     */
    function getPhotosBySyncStatus(syncStatus) {
        return ensureDB().then((database) => {
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(['photos'], 'readonly');
                const store = transaction.objectStore('photos');
                const index = store.index('syncStatus');
                const request = index.getAll(syncStatus);

                request.onsuccess = (event) => {
                    resolve(event.target.result || []);
                };

                request.onerror = (event) => {
                    console.error('Error getting photos by syncStatus:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Deletes a photo by ID
     * @param {string} id - The photo ID
     * @returns {Promise<void>}
     */
    function deletePhoto(id) {
        return ensureDB().then((database) => {
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(['photos'], 'readwrite');
                const store = transaction.objectStore('photos');
                const request = store.delete(id);

                request.onsuccess = () => {
                    resolve();
                };

                request.onerror = (event) => {
                    console.error('Error deleting photo:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Deletes all photos for a report
     * @param {string} reportId - The report ID
     * @returns {Promise<void>}
     */
    function deletePhotosByReportId(reportId) {
        return ensureDB().then((database) => {
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(['photos'], 'readwrite');
                const store = transaction.objectStore('photos');
                const index = store.index('reportId');
                const request = index.openCursor(reportId);

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };

                request.onerror = (event) => {
                    console.error('Error deleting photos by reportId:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    // ============================================
    // CURRENT REPORTS STORE (v4)
    // ============================================

    /**
     * Gets all current reports from IndexedDB
     * @returns {Promise<Object>} Map of report id → report object
     */
    function getAllCurrentReports() {
        return ensureDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                if (!database.objectStoreNames.contains('currentReports')) {
                    resolve({});
                    return;
                }
                var transaction = database.transaction(['currentReports'], 'readonly');
                var store = transaction.objectStore('currentReports');
                var request = store.getAll();

                request.onsuccess = function(event) {
                    var arr = event.target.result || [];
                    var map = {};
                    arr.forEach(function(r) { map[r.id] = r; });
                    resolve(map);
                };

                request.onerror = function(event) {
                    console.error('Error getting all current reports:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Saves a single current report to IndexedDB
     * @param {Object} report - Report object (must have id)
     * @returns {Promise<void>}
     */
    function saveCurrentReportIDB(report) {
        return ensureDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                if (!database.objectStoreNames.contains('currentReports')) {
                    resolve();
                    return;
                }
                var transaction = database.transaction(['currentReports'], 'readwrite');
                var store = transaction.objectStore('currentReports');
                var request = store.put(report);

                request.onsuccess = function() { resolve(); };
                request.onerror = function(event) {
                    console.error('Error saving current report to IDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Deletes a single current report from IndexedDB
     * @param {string} reportId - The report UUID
     * @returns {Promise<void>}
     */
    function deleteCurrentReportIDB(reportId) {
        return ensureDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                if (!database.objectStoreNames.contains('currentReports')) {
                    resolve();
                    return;
                }
                var transaction = database.transaction(['currentReports'], 'readwrite');
                var store = transaction.objectStore('currentReports');
                var request = store.delete(reportId);

                request.onsuccess = function() { resolve(); };
                request.onerror = function(event) {
                    console.error('Error deleting current report from IDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Replaces all current reports in IndexedDB (bulk sync)
     * @param {Object} reportsMap - Map of report id → report object
     * @returns {Promise<void>}
     */
    function replaceAllCurrentReports(reportsMap) {
        return ensureDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                if (!database.objectStoreNames.contains('currentReports')) {
                    resolve();
                    return;
                }
                var transaction = database.transaction(['currentReports'], 'readwrite');
                var store = transaction.objectStore('currentReports');
                store.clear();

                var reports = Object.values(reportsMap || {});
                reports.forEach(function(r) { store.put(r); });

                transaction.oncomplete = function() { resolve(); };
                transaction.onerror = function(event) {
                    console.error('Error replacing current reports in IDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    // ============================================
    // DRAFT DATA STORE (v5)
    // ============================================

    /**
     * Saves draft data for a report to IndexedDB
     * @param {string} reportId - The report UUID
     * @param {Object} data - The draft data object
     * @returns {Promise<void>}
     */
    function saveDraftDataIDB(reportId, data) {
        return ensureDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                if (!database.objectStoreNames.contains('draftData')) {
                    resolve();
                    return;
                }
                var transaction = database.transaction(['draftData'], 'readwrite');
                var store = transaction.objectStore('draftData');
                var record = Object.assign({}, data, { reportId: reportId, _idbSavedAt: new Date().toISOString() });
                var request = store.put(record);

                request.onsuccess = function() { resolve(); };
                request.onerror = function(event) {
                    console.error('Error saving draft data to IDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Gets draft data for a report from IndexedDB
     * @param {string} reportId - The report UUID
     * @returns {Promise<Object|undefined>}
     */
    function getDraftDataIDB(reportId) {
        return ensureDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                if (!database.objectStoreNames.contains('draftData')) {
                    resolve(undefined);
                    return;
                }
                var transaction = database.transaction(['draftData'], 'readonly');
                var store = transaction.objectStore('draftData');
                var request = store.get(reportId);

                request.onsuccess = function(event) {
                    resolve(event.target.result);
                };
                request.onerror = function(event) {
                    console.error('Error getting draft data from IDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Deletes draft data for a report from IndexedDB
     * @param {string} reportId - The report UUID
     * @returns {Promise<void>}
     */
    function deleteDraftDataIDB(reportId) {
        return ensureDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                if (!database.objectStoreNames.contains('draftData')) {
                    resolve();
                    return;
                }
                var transaction = database.transaction(['draftData'], 'readwrite');
                var store = transaction.objectStore('draftData');
                var request = store.delete(reportId);

                request.onsuccess = function() { resolve(); };
                request.onerror = function(event) {
                    console.error('Error deleting draft data from IDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    // ============================================
    // CACHED ARCHIVES STORE (v6)
    // ============================================

    /**
     * Saves data to the cachedArchives store
     * @param {string} key - Cache key (e.g. 'reports', 'projects')
     * @param {*} data - Data to cache
     * @returns {Promise<void>}
     */
    function saveCachedArchive(key, data) {
        return ensureDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                if (!database.objectStoreNames.contains('cachedArchives')) {
                    resolve();
                    return;
                }
                var transaction = database.transaction(['cachedArchives'], 'readwrite');
                var store = transaction.objectStore('cachedArchives');
                var request = store.put({ key: key, data: data, cachedAt: new Date().toISOString() });

                request.onsuccess = function() { resolve(); };
                request.onerror = function(event) {
                    console.error('Error saving cached archive:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Gets data from the cachedArchives store
     * @param {string} key - Cache key
     * @returns {Promise<*>} The cached data, or undefined
     */
    function getCachedArchive(key) {
        return ensureDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                if (!database.objectStoreNames.contains('cachedArchives')) {
                    resolve(undefined);
                    return;
                }
                var transaction = database.transaction(['cachedArchives'], 'readonly');
                var store = transaction.objectStore('cachedArchives');
                var request = store.get(key);

                request.onsuccess = function(event) {
                    var result = event.target.result;
                    resolve(result ? result.data : undefined);
                };
                request.onerror = function(event) {
                    console.error('Error getting cached archive:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    // ============================================
    // GENERAL
    // ============================================

    /**
     * Clears all records from a store
     * @param {string} storeName - The name of the object store to clear
     * @returns {Promise<void>}
     */
    function clearStore(storeName) {
        return ensureDB().then((database) => {
            return new Promise((resolve, reject) => {
                if (!database.objectStoreNames.contains(storeName)) {
                    console.error('Store not found:', storeName);
                    reject(new Error(`Store not found: ${storeName}`));
                    return;
                }

                const transaction = database.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.clear();

                request.onsuccess = () => {
                    console.log(`Cleared store: ${storeName}`);
                    resolve();
                };

                request.onerror = (event) => {
                    console.error('Error clearing store:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    /**
     * Reset the cached database connection.
     * Call on bfcache restore (pageshow with persisted=true) or when
     * IDB operations fail with InvalidStateError. Forces the next
     * ensureDB() call to open a fresh connection.
     */
    function resetDB() {
        if (db) {
            try { db.close(); } catch (e) { /* already closed */ }
            db = null;
            console.log('[IDB] Database connection reset');
        }
    }

    // Export to window.idb
    window.idb = {
        // Setup
        initDB,
        resetDB,

        // Projects store
        saveProject,
        getProject,
        getAllProjects,
        deleteProject,

        // User profile store
        saveUserProfile,
        getUserProfile,

        // Photos store
        savePhoto,
        getPhoto,
        getPhotosByReportId,
        getPhotosBySyncStatus,
        deletePhoto,
        deletePhotosByReportId,

        // Current reports store
        getAllCurrentReports,
        saveCurrentReportIDB,
        deleteCurrentReportIDB,
        replaceAllCurrentReports,

        // Draft data store
        saveDraftDataIDB,
        getDraftDataIDB,
        deleteDraftDataIDB,

        // Cached archives store
        saveCachedArchive,
        getCachedArchive,

        // General
        clearStore
    };

})();
