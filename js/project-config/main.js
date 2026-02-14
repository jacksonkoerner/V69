// ============ PROJECT CONFIG - MAIN ============
// Entry point for project-config.html
// Dependencies: crud.js, contractors.js, form.js, document-import.js
// Dependencies: config.js, storage-keys.js, indexeddb-utils.js, data-layer.js,
//               supabase-utils.js, ui-utils.js, media-utils.js

// ============ SHARED STATE ============
var currentProject = null;
var deleteCallback = null;
var selectedFiles = [];
var isLoading = false;
var isDirty = false;
var draggedItem = null;

// ============ DIRTY STATE MANAGEMENT ============
function markDirty() {
    if (!isDirty) {
        isDirty = true;
        updateDirtyBanner();
    }
}

function clearDirty() {
    isDirty = false;
    updateDirtyBanner();
}

function updateDirtyBanner() {
    var banner = document.getElementById('dirtyBanner');
    if (banner) {
        if (isDirty) {
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    }
}

function setupDirtyTracking() {
    // Track all form inputs
    var formInputs = document.querySelectorAll('#projectFormContainer input, #projectFormContainer select');
    formInputs.forEach(function(input) {
        input.addEventListener('input', markDirty);
        input.addEventListener('change', markDirty);
    });

    // Add beforeunload warning
    window.addEventListener('beforeunload', function(e) {
        if (isDirty) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            return e.returnValue;
        }
    });
}

// ============ HELPERS ============
function getActiveProjectId() {
    return getStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
}

function setActiveProjectId(projectId) {
    setStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, projectId);
}

function cancelEdit() {
    currentProject = null;
    window.location.href = 'projects.html';
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize PWA features (moved from inline script)
    if (typeof initPWA === 'function') initPWA();

    // Initialize IndexedDB first for local-first storage
    try {
        await window.idb.initDB();
        console.log('[project-config] IndexedDB initialized');
    } catch (error) {
        console.error('[project-config] Failed to initialize IndexedDB:', error);
    }

    setupDropZone();
    setupLogoDropZone();

    // Check URL for project ID to edit, otherwise create new project
    var urlParams = new URLSearchParams(window.location.search);
    var projectId = urlParams.get('id');

    if (projectId) {
        // Edit existing project
        await loadProject(projectId);
        // Show delete button for existing projects
        var deleteBtn = document.getElementById('deleteProjectBtn');
        if (deleteBtn) {
            deleteBtn.classList.remove('hidden');
        }
    } else {
        // Create new project
        createNewProject();
    }

    // Setup dirty tracking after form is populated
    setupDirtyTracking();
});
