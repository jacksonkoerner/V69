/**
 * sync-merge.js — Three-way merge engine for live sync
 * Pure functions — no DOM, no global state, no side effects.
 */
(function() {
    'use strict';

    /**
     * Deep-equal comparison (JSON-based, sufficient for our data types).
     */
    function deepEqual(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return a == b;
        return JSON.stringify(a) === JSON.stringify(b);
    }

    /**
     * Deep clone via JSON round-trip.
     */
    function deepClone(obj) {
        if (obj == null) return obj;
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Three-way merge for object sections (field-level).
     * For each key: if local unchanged from base, take remote. If remote unchanged, keep local.
     * If both changed, local wins (active editor keeps their work).
     */
    function mergeObjects(base, local, remote, opts) {
        var protectedFields = (opts && opts.protectedFields) || [];
        base = base || {};
        local = local || {};
        remote = remote || {};
        var merged = deepClone(local);
        var conflicts = [];

        var allKeys = {};
        Object.keys(base).forEach(function(k) { allKeys[k] = true; });
        Object.keys(local).forEach(function(k) { allKeys[k] = true; });
        Object.keys(remote).forEach(function(k) { allKeys[k] = true; });

        Object.keys(allKeys).forEach(function(key) {
            if (protectedFields.indexOf(key) !== -1) {
                // Protected: always preserve local value
                if (local.hasOwnProperty(key)) {
                    merged[key] = deepClone(local[key]);
                } else if (base.hasOwnProperty(key)) {
                    merged[key] = deepClone(base[key]);
                }
                return;
            }

            var bVal = base[key];
            var lVal = local[key];
            var rVal = remote[key];
            var localChanged = !deepEqual(bVal, lVal);
            var remoteChanged = !deepEqual(bVal, rVal);

            if (!localChanged && remoteChanged) {
                merged[key] = deepClone(rVal);
            } else if (localChanged && remoteChanged) {
                if (!deepEqual(lVal, rVal)) {
                    conflicts.push({ key: key, local: lVal, remote: rVal });
                }
                // local wins — already in merged
            }
            // localChanged && !remoteChanged → keep local (already in merged)
            // neither changed → keep local (same as base)
        });

        return { merged: merged, conflicts: conflicts };
    }

    /**
     * Per-section tombstone tracking for deletion resurrection prevention.
     */
    var _syncTombstones = {}; // { sectionKey: Set }

    function getTombstones(sectionKey) {
        if (!_syncTombstones[sectionKey]) {
            _syncTombstones[sectionKey] = new Set();
        }
        return _syncTombstones[sectionKey];
    }

    /**
     * Three-way merge for arrays with stable IDs.
     */
    function mergeArraysById(base, local, remote, idField, sectionKey) {
        base = base || [];
        local = local || [];
        remote = remote || [];

        var baseMap = {};
        base.forEach(function(item) { if (item[idField]) baseMap[item[idField]] = item; });
        var localMap = {};
        local.forEach(function(item) { if (item[idField]) localMap[item[idField]] = item; });
        var remoteMap = {};
        remote.forEach(function(item) { if (item[idField]) remoteMap[item[idField]] = item; });

        var merged = [];
        var seen = {};
        var conflicts = [];

        // Start with local items (preserves local ordering)
        local.forEach(function(lItem) {
            var id = lItem[idField];
            if (!id) { merged.push(lItem); return; }
            seen[id] = true;

            var bItem = baseMap[id];
            var rItem = remoteMap[id];

            if (!rItem) {
                if (bItem) {
                    // Was in base, gone from remote → remote deleted it
                    var localModified = !deepEqual(bItem, lItem);
                    if (localModified) {
                        // Local modified it AND remote deleted it → conflict; keep local
                        merged.push(lItem);
                        conflicts.push({ id: id, type: 'delete-vs-edit', local: lItem });
                    } else {
                        // Honor remote deletion — tombstone it
                        if (sectionKey) getTombstones(sectionKey).add(id);
                    }
                } else {
                    // New in local → keep
                    merged.push(lItem);
                }
            } else {
                var localChanged = !deepEqual(bItem, lItem);
                var remoteChanged = !deepEqual(bItem, rItem);

                if (!localChanged && remoteChanged) {
                    merged.push(deepClone(rItem));
                } else if (localChanged && remoteChanged && !deepEqual(lItem, rItem)) {
                    // Field-level merge within the item
                    var itemMerge = mergeObjects(bItem || {}, lItem, rItem);
                    merged.push(itemMerge.merged);
                    if (itemMerge.conflicts.length > 0) {
                        itemMerge.conflicts.forEach(function(c) { c.itemId = id; });
                        conflicts = conflicts.concat(itemMerge.conflicts);
                    }
                } else {
                    merged.push(lItem);
                }
            }
        });

        // Add remote-only items (new from other device)
        remote.forEach(function(rItem) {
            var id = rItem[idField];
            if (!id || seen[id]) return;
            if (baseMap[id]) {
                // Was in base, in remote, not in local → local deleted → skip
                getTombstones(sectionKey).add(id);  // tombstone local hard-delete
            } else if (sectionKey && getTombstones(sectionKey).has(id)) {
                // Previously tombstoned — skip
            } else {
                // New from remote → add
                merged.push(deepClone(rItem));
            }
        });

        // Prune tombstones — if remote no longer has the item, deletion propagated
        if (sectionKey) {
            var remoteIds = new Set(remote.map(function(r) { return r[idField]; }));
            getTombstones(sectionKey).forEach(function(tombId) {
                if (!remoteIds.has(tombId)) {
                    getTombstones(sectionKey).delete(tombId);
                }
            });
        }

        return { merged: merged, conflicts: conflicts };
    }

    /**
     * Photo-aware merge: union by ID, never overwrite uploading items.
     */
    function mergePhotos(base, local, remote) {
        var mergedMap = {};

        (local || []).forEach(function(p) { mergedMap[p.id] = p; });

        (remote || []).forEach(function(p) {
            if (!mergedMap[p.id]) {
                mergedMap[p.id] = deepClone(p);
            } else if (mergedMap[p.id].uploadStatus === 'uploading') {
                // Don't overwrite in-progress upload
            } else if (p.url && !mergedMap[p.id].url) {
                mergedMap[p.id] = Object.assign({}, mergedMap[p.id], {
                    url: p.url,
                    storagePath: p.storagePath
                });
            }
        });

        return Object.values(mergedMap);
    }

    // Helpers for nested property access
    function getNestedProp(obj, path) {
        return path.split('.').reduce(function(o, k) { return (o || {})[k]; }, obj);
    }

    function setNestedProp(obj, path, value) {
        var keys = path.split('.');
        var last = keys.pop();
        var target = keys.reduce(function(o, k) {
            if (!o[k] || typeof o[k] !== 'object') o[k] = {};
            return o[k];
        }, obj);
        target[last] = value;
    }

    /**
     * Main entry point: three-way section merge.
     * @param {Object} base - Last known-good state
     * @param {Object} local - Current in-memory state
     * @param {Object} remote - Freshly fetched from Supabase
     * @param {string[]} sectionsHint - Which sections the sender changed
     * @param {Object} sectionDefs - Section definitions { name: { type, idField? } }
     * @returns {{ merged: Object, sectionsUpdated: string[], conflicts: Array }}
     */
    function syncMerge(base, local, remote, sectionsHint, sectionDefs) {
        base = base || {};
        local = local || {};
        remote = remote || {};
        sectionDefs = sectionDefs || {};

        var merged = deepClone(local);
        var sectionsUpdated = [];
        var allConflicts = [];

        Object.keys(sectionDefs).forEach(function(sectionKey) {
            var def = sectionDefs[sectionKey];
            var bVal = getNestedProp(base, sectionKey);
            var lVal = getNestedProp(local, sectionKey);
            var rVal = getNestedProp(remote, sectionKey);

            // Quick skip: if remote section equals local, nothing to do
            if (deepEqual(lVal, rVal)) return;

            var result;
            if (def.type === 'object') {
                result = mergeObjects(bVal, lVal, rVal, { protectedFields: def.protectedFields });
            } else if (def.type === 'array' && def.idField) {
                result = mergeArraysById(bVal, lVal, rVal, def.idField, sectionKey);
            } else if (def.type === 'photos') {
                result = { merged: mergePhotos(bVal, lVal, rVal), conflicts: [] };
            } else {
                // Scalar or array without ID — last-write-wins (remote wins if local unchanged)
                var localChanged = !deepEqual(bVal, lVal);
                if (!localChanged) {
                    result = { merged: deepClone(rVal), conflicts: [] };
                } else {
                    result = { merged: lVal, conflicts: deepEqual(lVal, rVal) ? [] : [{ key: sectionKey, local: lVal, remote: rVal }] };
                }
            }

            if (!deepEqual(lVal, result.merged)) {
                setNestedProp(merged, sectionKey, result.merged);
                sectionsUpdated.push(sectionKey);
            }
            if (result.conflicts && result.conflicts.length > 0) {
                result.conflicts.forEach(function(c) { c.section = sectionKey; });
                allConflicts = allConflicts.concat(result.conflicts);
            }
        });

        return { merged: merged, sectionsUpdated: sectionsUpdated, conflicts: allConflicts };
    }

    // Expose
    window.syncMerge = syncMerge;
    window.syncMergeUtils = {
        mergeObjects: mergeObjects,
        mergeArraysById: mergeArraysById,
        mergePhotos: mergePhotos,
        deepEqual: deepEqual,
        deepClone: deepClone,
        getTombstones: getTombstones,
        clearAllTombstones: function() { _syncTombstones = {}; }
    };
})();
