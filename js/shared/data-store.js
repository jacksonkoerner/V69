(function() {
    'use strict';

    var DB_NAME = 'fieldvoice-pro';
    var DB_VERSION = 7;
    var OPEN_TIMEOUT_MS = 8000;

    var _db = null;
    var _dbPromise = null;
    var _migrationPromise = null;
    var _migrationFlag = 'fvp_migration_v2_idb_data';

    function _validateConnection() {
        if (!_db) return false;
        try {
            var tx = _db.transaction(['projects'], 'readonly');
            tx.abort();
            return true;
        } catch (e) {
            _db = null;
            return false;
        }
    }

    function _closeDbHandle(handle) {
        if (!handle) return;
        try { handle.close(); } catch (e) { /* noop */ }
    }

    function _onUpgradeNeeded(event) {
        var database = event.target.result;

        if (!database.objectStoreNames.contains('projects')) {
            database.createObjectStore('projects', { keyPath: 'id' });
        }

        if (!database.objectStoreNames.contains('userProfile')) {
            database.createObjectStore('userProfile', { keyPath: 'deviceId' });
        }

        if (!database.objectStoreNames.contains('photos')) {
            var photosStore = database.createObjectStore('photos', { keyPath: 'id' });
            photosStore.createIndex('reportId', 'reportId', { unique: false });
            photosStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        }

        if (database.objectStoreNames.contains('archives')) {
            database.deleteObjectStore('archives');
        }

        if (!database.objectStoreNames.contains('currentReports')) {
            var crStore = database.createObjectStore('currentReports', { keyPath: 'id' });
            crStore.createIndex('project_id', 'project_id', { unique: false });
            crStore.createIndex('status', 'status', { unique: false });
        }

        if (!database.objectStoreNames.contains('draftData')) {
            database.createObjectStore('draftData', { keyPath: 'reportId' });
        }

        if (!database.objectStoreNames.contains('cachedArchives')) {
            database.createObjectStore('cachedArchives', { keyPath: 'key' });
        }

        if (!database.objectStoreNames.contains('reportData')) {
            database.createObjectStore('reportData', { keyPath: 'reportId' });
        }
    }

    function _openDB(retriedBlocked) {
        if (_validateConnection()) return Promise.resolve(_db);
        if (_dbPromise) return _dbPromise;

        _dbPromise = new Promise(function(resolve, reject) {
            var settled = false;
            var blockedRetryIssued = false;
            var timer = setTimeout(function() {
                if (settled) return;
                settled = true;
                _dbPromise = null;
                reject(new Error('IndexedDB open timed out (' + OPEN_TIMEOUT_MS + 'ms)'));
            }, OPEN_TIMEOUT_MS);

            var request;
            try {
                request = indexedDB.open(DB_NAME, DB_VERSION);
            } catch (e) {
                clearTimeout(timer);
                settled = true;
                _dbPromise = null;
                reject(e);
                return;
            }

            request.onupgradeneeded = _onUpgradeNeeded;

            request.onblocked = function() {
                console.warn('[data-store] IDB open blocked');
                _closeDbHandle(_db);
                _db = null;
                if (!retriedBlocked && !blockedRetryIssued) {
                    blockedRetryIssued = true;
                    setTimeout(function() {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        _dbPromise = null;
                        _openDB(true).then(resolve).catch(reject);
                    }, 500);
                }
            };

            request.onerror = function(event) {
                clearTimeout(timer);
                if (settled) return;
                settled = true;
                _dbPromise = null;
                reject(event.target.error || new Error('IndexedDB open failed'));
            };

            request.onsuccess = function(event) {
                clearTimeout(timer);
                var dbHandle = event.target.result;

                if (settled) {
                    // CRITICAL: close leaked handle if success fires after timeout/retry settle
                    _closeDbHandle(dbHandle);
                    return;
                }

                settled = true;
                _db = dbHandle;
                _dbPromise = null;

                _db.onclose = function() {
                    _db = null;
                    _dbPromise = null;
                };

                _db.onversionchange = function() {
                    _closeDbHandle(_db);
                    _db = null;
                    _dbPromise = null;
                };

                resolve(_db);
            };
        });

        return _dbPromise;
    }

    function _tx(storeName, mode, operation) {
        return _openDB(false).then(function(db) {
            return new Promise(function(resolve, reject) {
                if (!db.objectStoreNames.contains(storeName)) {
                    reject(new Error('Store not found: ' + storeName));
                    return;
                }

                var transaction = db.transaction([storeName], mode || 'readonly');
                var store = transaction.objectStore(storeName);
                var request;

                try {
                    request = operation(store, transaction);
                } catch (e) {
                    reject(e);
                    return;
                }

                if (!request) {
                    transaction.oncomplete = function() { resolve(); };
                    transaction.onerror = function(event) { reject(event.target.error || new Error('Transaction failed')); };
                    return;
                }

                request.onsuccess = function(event) {
                    resolve(event.target.result);
                };
                request.onerror = function(event) {
                    reject(event.target.error || new Error('Request failed'));
                };
            });
        });
    }

    function _normalizeReportDate(report) {
        if (!report) return report;
        if (!report.reportDate && report.report_date) report.reportDate = report.report_date;
        if (!report.report_date && report.reportDate) report.report_date = report.reportDate;
        return report;
    }

    function _ensureLegacyMigration() {
        if (_migrationPromise) return _migrationPromise;

        _migrationPromise = _openDB(false).then(function(db) {
            if (localStorage.getItem(_migrationFlag) === 'true') return;

            var legacyReportsRaw = localStorage.getItem('fvp_current_reports');
            var legacyReports = {};
            if (legacyReportsRaw) {
                try {
                    legacyReports = JSON.parse(legacyReportsRaw) || {};
                } catch (e) {
                    legacyReports = {};
                }
            }

            var reportDataPairs = [];
            try {
                for (var i = 0; i < localStorage.length; i++) {
                    var key = localStorage.key(i);
                    if (!key || key.indexOf('fvp_report_') !== 0) continue;
                    var reportId = key.substring('fvp_report_'.length);
                    if (!reportId) continue;
                    var raw = localStorage.getItem(key);
                    if (!raw) continue;
                    try {
                        reportDataPairs.push({
                            reportId: reportId,
                            value: JSON.parse(raw)
                        });
                    } catch (e) {
                        // skip malformed payload
                    }
                }
            } catch (e) {
                console.warn('[data-store] Legacy key scan failed:', e && e.message ? e.message : e);
            }

            var writes = [];

            var reportIds = Object.keys(legacyReports);
            if (reportIds.length > 0) {
                writes.push(new Promise(function(resolve) {
                    try {
                        var tx = db.transaction(['currentReports'], 'readwrite');
                        var store = tx.objectStore('currentReports');
                        for (var j = 0; j < reportIds.length; j++) {
                            var id = reportIds[j];
                            var report = legacyReports[id];
                            if (!report || !report.id) report = Object.assign({}, report || {}, { id: id });
                            _normalizeReportDate(report);
                            store.put(report);
                        }
                        tx.oncomplete = function() { resolve(); };
                        tx.onerror = function() { resolve(); };
                    } catch (e) {
                        resolve();
                    }
                }));
            }

            if (reportDataPairs.length > 0) {
                writes.push(new Promise(function(resolve) {
                    try {
                        var tx = db.transaction(['reportData'], 'readwrite');
                        var store = tx.objectStore('reportData');
                        for (var k = 0; k < reportDataPairs.length; k++) {
                            store.put({ reportId: reportDataPairs[k].reportId, data: reportDataPairs[k].value });
                        }
                        tx.oncomplete = function() { resolve(); };
                        tx.onerror = function() { resolve(); };
                    } catch (e) {
                        resolve();
                    }
                }));
            }

            return Promise.all(writes).then(function() {
                localStorage.setItem(_migrationFlag, 'true');
                if (legacyReportsRaw) localStorage.removeItem('fvp_current_reports');
                for (var m = 0; m < reportDataPairs.length; m++) {
                    localStorage.removeItem('fvp_report_' + reportDataPairs[m].reportId);
                }
            });
        }).catch(function(err) {
            console.warn('[data-store] Legacy migration failed:', err && err.message ? err.message : err);
        });

        return _migrationPromise;
    }

    function init() {
        return _openDB(false).then(function() {
            return _ensureLegacyMigration();
        });
    }

    function reset() {
        _closeDbHandle(_db);
        _db = null;
        _dbPromise = null;
        return Promise.resolve();
    }

    function closeAll() {
        return reset();
    }

    // Reports
    function getReport(id) {
        if (!id) return Promise.resolve(null);
        return _tx('currentReports', 'readonly', function(store) {
            return store.get(id);
        }).then(function(report) {
            return _normalizeReportDate(report || null);
        });
    }

    function getAllReports() {
        return _tx('currentReports', 'readonly', function(store) {
            return store.getAll();
        }).then(function(rows) {
            var map = new Map();
            var list = rows || [];
            for (var i = 0; i < list.length; i++) {
                var report = _normalizeReportDate(list[i]);
                if (report && report.id) map.set(report.id, report);
            }
            return map;
        });
    }

    function saveReport(report) {
        if (!report || !report.id) return Promise.resolve(false);
        _normalizeReportDate(report);
        return _tx('currentReports', 'readwrite', function(store) {
            return store.put(report);
        }).then(function() { return true; });
    }

    function deleteReport(id) {
        if (!id) return Promise.resolve();
        return _tx('currentReports', 'readwrite', function(store) {
            return store.delete(id);
        }).then(function() { return; });
    }

    function replaceAllReports(map) {
        return _openDB(false).then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(['currentReports'], 'readwrite');
                var store = tx.objectStore('currentReports');
                store.clear();

                if (map && typeof map.forEach === 'function') {
                    map.forEach(function(report, id) {
                        if (!report || !id) return;
                        if (!report.id) report.id = id;
                        _normalizeReportDate(report);
                        store.put(report);
                    });
                } else if (map && typeof map === 'object') {
                    var ids = Object.keys(map);
                    for (var i = 0; i < ids.length; i++) {
                        var id = ids[i];
                        var report = map[id];
                        if (!report) continue;
                        if (!report.id) report.id = id;
                        _normalizeReportDate(report);
                        store.put(report);
                    }
                }

                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(event) { reject(event.target.error || new Error('replaceAllReports failed')); };
            });
        });
    }

    // Report Data
    function getReportData(id) {
        if (!id) return Promise.resolve(null);
        return _tx('reportData', 'readonly', function(store) {
            return store.get(id);
        }).then(function(row) {
            if (!row) return null;
            return row.data || row;
        });
    }

    function saveReportData(id, data) {
        if (!id) return Promise.resolve(false);
        return _tx('reportData', 'readwrite', function(store) {
            return store.put({ reportId: id, data: data });
        }).then(function() { return true; });
    }

    function deleteReportData(id) {
        if (!id) return Promise.resolve();
        return _tx('reportData', 'readwrite', function(store) {
            return store.delete(id);
        }).then(function() { return; });
    }

    // Draft Data
    function getDraftData(id) {
        if (!id) return Promise.resolve(null);
        return _tx('draftData', 'readonly', function(store) {
            return store.get(id);
        }).then(function(row) {
            if (!row) return null;
            return row.data || row;
        });
    }

    function saveDraftData(id, data) {
        if (!id) return Promise.resolve(false);
        return _tx('draftData', 'readwrite', function(store) {
            return store.put({ reportId: id, data: data });
        }).then(function() { return true; });
    }

    function deleteDraftData(id) {
        if (!id) return Promise.resolve();
        return _tx('draftData', 'readwrite', function(store) {
            return store.delete(id);
        }).then(function() { return; });
    }

    // Projects
    function getProject(id) {
        if (!id) return Promise.resolve(null);
        return _tx('projects', 'readonly', function(store) {
            return store.get(id);
        });
    }

    function getAllProjects() {
        return _tx('projects', 'readonly', function(store) {
            return store.getAll();
        }).then(function(rows) { return rows || []; });
    }

    function saveProject(project) {
        if (!project || !project.id) return Promise.resolve(false);
        return _tx('projects', 'readwrite', function(store) {
            return store.put(project);
        }).then(function() { return true; });
    }

    function deleteProject(id) {
        if (!id) return Promise.resolve();
        return _tx('projects', 'readwrite', function(store) {
            return store.delete(id);
        }).then(function() { return; });
    }

    // Photos
    function getPhotosByReportId(id) {
        if (!id) return Promise.resolve([]);
        return _openDB(false).then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(['photos'], 'readonly');
                var store = tx.objectStore('photos');
                if (!store.indexNames.contains('reportId')) {
                    resolve([]);
                    return;
                }
                var req = store.index('reportId').getAll(id);
                req.onsuccess = function(event) { resolve(event.target.result || []); };
                req.onerror = function(event) { reject(event.target.error || new Error('getPhotosByReportId failed')); };
            });
        });
    }

    function savePhoto(photo) {
        if (!photo || !photo.id) return Promise.resolve(false);
        return _tx('photos', 'readwrite', function(store) {
            return store.put(photo);
        }).then(function() { return true; });
    }

    function deletePhoto(id) {
        if (!id) return Promise.resolve();
        return _tx('photos', 'readwrite', function(store) {
            return store.delete(id);
        }).then(function() { return; });
    }

    function deletePhotosByReportId(id) {
        if (!id) return Promise.resolve();
        return _openDB(false).then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(['photos'], 'readwrite');
                var store = tx.objectStore('photos');
                if (!store.indexNames.contains('reportId')) {
                    resolve();
                    return;
                }

                var req = store.index('reportId').openCursor(id);
                req.onsuccess = function(event) {
                    var cursor = event.target.result;
                    if (!cursor) return;
                    cursor.delete();
                    cursor.continue();
                };
                req.onerror = function(event) {
                    reject(event.target.error || new Error('deletePhotosByReportId cursor failed'));
                };
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(event) { reject(event.target.error || new Error('deletePhotosByReportId tx failed')); };
            });
        });
    }

    // User profile
    function getUserProfile(deviceId) {
        if (!deviceId) return Promise.resolve(null);
        return _tx('userProfile', 'readonly', function(store) {
            return store.get(deviceId);
        });
    }

    function saveUserProfile(profile) {
        if (!profile || !profile.deviceId) return Promise.resolve(false);
        return _tx('userProfile', 'readwrite', function(store) {
            return store.put(profile);
        }).then(function() { return true; });
    }

    // Cached archives
    function getCachedArchive(key) {
        if (!key) return Promise.resolve(null);
        return _tx('cachedArchives', 'readonly', function(store) {
            return store.get(key);
        }).then(function(row) {
            if (!row) return null;
            return row.data || row;
        });
    }

    function saveCachedArchive(key, data) {
        if (!key) return Promise.resolve(false);
        return _tx('cachedArchives', 'readwrite', function(store) {
            return store.put({ key: key, data: data, savedAt: Date.now() });
        }).then(function() { return true; });
    }

    function clearStore(name) {
        if (!name) return Promise.reject(new Error('Store name required'));
        return _tx(name, 'readwrite', function(store) {
            return store.clear();
        }).then(function() { return; });
    }

    window.dataStore = {
        init: init,
        reset: reset,
        closeAll: closeAll,

        getReport: getReport,
        getAllReports: getAllReports,
        saveReport: saveReport,
        deleteReport: deleteReport,
        replaceAllReports: replaceAllReports,

        getReportData: getReportData,
        saveReportData: saveReportData,
        deleteReportData: deleteReportData,

        getDraftData: getDraftData,
        saveDraftData: saveDraftData,
        deleteDraftData: deleteDraftData,

        getProject: getProject,
        getAllProjects: getAllProjects,
        saveProject: saveProject,
        deleteProject: deleteProject,

        getPhotosByReportId: getPhotosByReportId,
        savePhoto: savePhoto,
        deletePhoto: deletePhoto,
        deletePhotosByReportId: deletePhotosByReportId,

        getUserProfile: getUserProfile,
        saveUserProfile: saveUserProfile,

        getCachedArchive: getCachedArchive,
        saveCachedArchive: saveCachedArchive,

        clearStore: clearStore,

        /**
         * Sync local IDB reports with Supabase cloud truth.
         * - Reports in cloud but not local → add to IDB
         * - Reports in local but not cloud → remove from IDB
         * - Reports in both but cloud is newer → update IDB
         * - Respects deleted blocklist in localStorage
         * @returns {Promise<{added:number, updated:number, removed:number, total:number}>}
         */
        syncReportsFromCloud: function syncReportsFromCloud() {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) {
                console.warn('[data-store] syncReportsFromCloud: no supabaseClient');
                return Promise.resolve({ added: 0, updated: 0, removed: 0, total: 0 });
            }

            var userId = (typeof getStorageItem === 'function' && typeof STORAGE_KEYS !== 'undefined')
                ? getStorageItem(STORAGE_KEYS.USER_ID)
                : null;
            if (!userId) {
                console.warn('[data-store] syncReportsFromCloud: no userId');
                return Promise.resolve({ added: 0, updated: 0, removed: 0, total: 0 });
            }

            return supabaseClient
                .from('reports')
                .select('id,status,project_id,report_date,created_at,updated_at,submitted_at')
                .eq('user_id', userId)
                .neq('status', 'deleted')
                .then(function(result) {
                        if (result.error) {
                            console.warn('[data-store] syncReportsFromCloud query failed:', result.error.message);
                            return { added: 0, updated: 0, removed: 0, total: 0 };
                        }

                        var cloudReports = result.data || [];
                        console.log('[data-store] syncReportsFromCloud: Supabase returned ' + cloudReports.length + ' reports');

                        // Build cloud map
                        var cloudMap = {};
                        for (var i = 0; i < cloudReports.length; i++) {
                            cloudMap[cloudReports[i].id] = cloudReports[i];
                        }

                        // Get current local reports from IDB
                        return getAllReports().then(function(localMap) {
                            var added = 0, updated = 0, removed = 0;
                            var finalReports = {};

                            // Process cloud reports: add/update local
                            // Supabase is the source of truth — if it's there, show it.
                            // Deletion should remove from Supabase, not just blocklist locally.
                            for (var cid in cloudMap) {
                                var cloud = cloudMap[cid];
                                var local = localMap.get(cid);

                                if (!local) {
                                    // Cloud has it, local doesn't → add
                                    finalReports[cid] = {
                                        id: cloud.id,
                                        status: cloud.status,
                                        project_id: cloud.project_id,
                                        date: cloud.report_date,
                                        report_date: cloud.report_date,
                                        created_at: cloud.created_at,
                                        updated_at: cloud.updated_at,
                                        submitted_at: cloud.submitted_at
                                    };
                                    added++;
                                } else {
                                    // Both have it — check if cloud is newer
                                    var cloudTime = new Date(cloud.updated_at || 0).getTime();
                                    var localTime = typeof local.updated_at === 'number'
                                        ? local.updated_at
                                        : new Date(local.updated_at || 0).getTime();

                                    if (cloudTime > localTime) {
                                        // Cloud is newer → merge cloud fields into local
                                        finalReports[cid] = Object.assign({}, local, {
                                            status: cloud.status,
                                            project_id: cloud.project_id,
                                            date: cloud.report_date,
                                            report_date: cloud.report_date,
                                            updated_at: cloud.updated_at,
                                            submitted_at: cloud.submitted_at
                                        });
                                        updated++;
                                    } else {
                                        // Local is same or newer — keep local
                                        finalReports[cid] = local;
                                    }
                                }
                            }

                            // Check local reports not in cloud → remove
                            localMap.forEach(function(value, key) {
                                if (!cloudMap[key]) {
                                    removed++;
                                    // Don't add to finalReports (effectively removes it)
                                } else if (!finalReports[key]) {
                                    // Already handled above, but defensive
                                    finalReports[key] = value;
                                }
                            });

                            // Write reconciled set to IDB
                            return replaceAllReports(finalReports).then(function() {
                                var total = Object.keys(finalReports).length;
                                if (added > 0 || updated > 0 || removed > 0) {
                                    console.log('[data-store] Cloud sync: added=' + added +
                                        ' updated=' + updated + ' removed=' + removed +
                                        ' total=' + total);
                                }
                                return { added: added, updated: updated, removed: removed, total: total };
                            });
                        });
                    }).catch(function(err) {
                        console.warn('[data-store] syncReportsFromCloud failed:', err && err.message ? err.message : err);
                        return { added: 0, updated: 0, removed: 0, total: 0 };
                    });
        }
    };
})();
