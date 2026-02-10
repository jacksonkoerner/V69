/**
 * sync-manager.js
 * Real-time entry backup and offline sync for FieldVoice Pro v6
 *
 * Dependencies: storage-keys.js, supabase-utils.js, config.js
 *
 * @module sync-manager
 */

// ============ AUTO-SYNC DISABLED ============
// Per spec: User controls when data goes to/from cloud via explicit buttons.
// No automatic Supabase sync. Set to true to re-enable auto-backup (not recommended).
const AUTO_SYNC_ENABLED = false;

// ============ CONSTANTS ============
const DEBOUNCE_MS = 2000;  // 2 second debounce for entry backup
const RETRY_DELAY_MS = 5000;  // 5 seconds between retry attempts
const MAX_RETRIES = 3;

// ============ STATE ============
let entryBackupTimers = {};  // reportId -> timeout
let isProcessingQueue = false;
let onlineListener = null;

// ============ ENTRY BACKUP ============

/**
 * Queue an entry for backup to Supabase (debounced)
 * Call this whenever an entry is created/updated
 * @param {string} reportId - The report ID
 * @param {Object} entry - The entry object from localStorage
 */
function queueEntryBackup(reportId, entry) {
    // AUTO-SYNC DISABLED: User controls sync via explicit buttons only
    if (!AUTO_SYNC_ENABLED) {
        console.log('[SYNC] Auto-backup disabled - skipping queue for:', reportId);
        return;
    }

    // Clear existing timer for this report
    if (entryBackupTimers[reportId]) {
        clearTimeout(entryBackupTimers[reportId]);
    }

    // Set new debounced timer
    entryBackupTimers[reportId] = setTimeout(() => {
        backupEntry(reportId, entry);
    }, DEBOUNCE_MS);
}

/**
 * Immediately backup an entry to Supabase
 * @param {string} reportId - The report ID
 * @param {Object} entry - The entry object
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function backupEntry(reportId, entry) {
    if (!navigator.onLine) {
        // Queue for later
        addToSyncQueue({
            type: 'ENTRY_BACKUP',
            reportId,
            entry,
            timestamp: new Date().toISOString()
        });
        console.log('[SYNC] Offline - entry queued for backup');
        return { success: false, error: 'offline' };
    }

    // report_entries table removed — backup disabled
    console.log('[SYNC] Entry backup disabled (table removed):', entry?.id);
    return { success: false, error: 'report_entries table removed' };
}

/**
 * Backup all entries for a report (batch operation)
 * @param {string} reportId - The report ID
 * @param {Array} entries - Array of entry objects
 * @returns {Promise<{success: boolean, backed: number, failed: number}>}
 */
async function backupAllEntries(reportId, entries) {
    if (!navigator.onLine) {
        entries.forEach(entry => {
            addToSyncQueue({
                type: 'ENTRY_BACKUP',
                reportId,
                entry,
                timestamp: new Date().toISOString()
            });
        });
        return { success: false, backed: 0, failed: entries.length };
    }

    // report_entries table removed — batch backup disabled
    console.log('[SYNC] Batch entry backup disabled (table removed)');
    return { success: false, backed: 0, failed: entries.length };
}

/**
 * Mark an entry as deleted (soft delete in Supabase)
 * @param {string} reportId - The report ID
 * @param {string} localId - The entry's local_id
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteEntry(reportId, localId) {
    if (!navigator.onLine) {
        addToSyncQueue({
            type: 'ENTRY_DELETE',
            reportId,
            localId,
            timestamp: new Date().toISOString()
        });
        return { success: false, error: 'offline' };
    }

    // report_entries table removed — delete disabled
    console.log('[SYNC] Entry delete disabled (table removed)');
    return { success: false, error: 'report_entries table removed' };
}

// ============ REPORT SYNC ============

/**
 * Create or update a report in Supabase
 * @param {Object} report - The report object from localStorage
 * @param {string} projectId - The project ID
 * @returns {Promise<{success: boolean, reportId?: string, error?: string}>}
 */
async function syncReport(report, projectId) {
    if (!navigator.onLine) {
        addToSyncQueue({
            type: 'REPORT_SYNC',
            report,
            projectId,
            timestamp: new Date().toISOString()
        });
        return { success: false, error: 'offline' };
    }

    // Sync manager disabled — reports are saved directly by page code
    console.log('[SYNC] Report sync disabled (managed by page code)');
    return { success: false, error: 'sync disabled' };
}

/**
 * Sync raw capture data to Supabase
 * @param {Object} captureData - Raw capture object
 * @param {string} reportId - The Supabase report ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function syncRawCapture(captureData, reportId) {
    if (!navigator.onLine) {
        addToSyncQueue({
            type: 'RAW_CAPTURE_SYNC',
            captureData,
            reportId,
            timestamp: new Date().toISOString()
        });
        return { success: false, error: 'offline' };
    }

    // report_raw_capture table removed — sync disabled
    console.log('[SYNC] Raw capture sync disabled (table removed)');
    return { success: false, error: 'report_raw_capture table removed' };
}

// ============ OFFLINE QUEUE PROCESSING ============

/**
 * Process all pending operations in the sync queue
 * Call this when coming back online
 */
async function processOfflineQueue() {
    if (isProcessingQueue) {
        console.log('[SYNC] Already processing queue');
        return;
    }

    if (!navigator.onLine) {
        console.log('[SYNC] Still offline, skipping queue processing');
        return;
    }

    const queue = getSyncQueue();
    if (queue.length === 0) {
        console.log('[SYNC] Queue empty');
        return;
    }

    isProcessingQueue = true;
    console.log('[SYNC] Processing', queue.length, 'queued operations');

    const failedOps = [];

    for (const op of queue) {
        let result;

        switch (op.type) {
            case 'ENTRY_BACKUP':
                result = await backupEntry(op.reportId, op.entry);
                break;
            case 'ENTRY_DELETE':
                result = await deleteEntry(op.reportId, op.localId);
                break;
            case 'REPORT_SYNC':
                result = await syncReport(op.report, op.projectId);
                break;
            case 'RAW_CAPTURE_SYNC':
                result = await syncRawCapture(op.captureData, op.reportId);
                break;
            default:
                console.warn('[SYNC] Unknown operation type:', op.type);
                result = { success: true }; // Skip unknown ops
        }

        if (!result.success && result.error !== 'offline') {
            // Real failure, might retry
            op.retries = (op.retries || 0) + 1;
            if (op.retries < MAX_RETRIES) {
                failedOps.push(op);
            } else {
                console.error('[SYNC] Operation failed after max retries:', op);
            }
        }
    }

    // Clear queue and re-add failed ops
    clearSyncQueue();
    failedOps.forEach(op => addToSyncQueue(op));

    isProcessingQueue = false;
    console.log('[SYNC] Queue processing complete.', failedOps.length, 'operations remaining');
}

// ============ CONNECTIVITY MONITORING ============

/**
 * Initialize sync manager - call on page load
 * Sets up online/offline listeners
 */
function initSyncManager() {
    // AUTO-SYNC DISABLED: User controls sync via explicit buttons only
    if (!AUTO_SYNC_ENABLED) {
        console.log('[SYNC] Auto-sync disabled - sync manager not initialized');
        return;
    }

    // Process queue when coming online
    onlineListener = () => {
        console.log('[SYNC] Back online - processing queue');
        setTimeout(processOfflineQueue, 1000); // Small delay to let connection stabilize
    };

    window.addEventListener('online', onlineListener);

    // Process queue on init if online
    if (navigator.onLine) {
        processOfflineQueue();
    }

    console.log('[SYNC] Sync manager initialized');
}

/**
 * Cleanup sync manager - call on page unload if needed
 */
function destroySyncManager() {
    if (onlineListener) {
        window.removeEventListener('online', onlineListener);
        onlineListener = null;
    }

    // Clear any pending timers
    Object.values(entryBackupTimers).forEach(clearTimeout);
    entryBackupTimers = {};
}

// ============ HELPERS ============

/**
 * Get current user ID from Supabase auth or localStorage
 * @returns {Promise<string>}
 */
async function getCurrentUserId() {
    // Try Supabase auth first
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) return user.id;

    // Fall back to stored profile
    const profile = getStorageItem(STORAGE_KEYS.USER_PROFILE);
    if (profile && profile.id) return profile.id;

    // Last resort - device ID
    return getDeviceId();
}

/**
 * Get pending sync count for UI display
 * @returns {number}
 */
function getPendingSyncCount() {
    return getSyncQueue().length;
}

// ============ EXPOSE GLOBALLY ============
if (typeof window !== 'undefined') {
    window.queueEntryBackup = queueEntryBackup;
    window.backupEntry = backupEntry;
    window.backupAllEntries = backupAllEntries;
    window.deleteEntry = deleteEntry;
    window.syncReport = syncReport;
    window.syncRawCapture = syncRawCapture;
    window.processOfflineQueue = processOfflineQueue;
    window.initSyncManager = initSyncManager;
    window.destroySyncManager = destroySyncManager;
    window.getPendingSyncCount = getPendingSyncCount;
}
