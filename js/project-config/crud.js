// ============ PROJECT CRUD OPERATIONS ============
// Dependencies: config.js (supabaseClient), storage-keys.js, supabase-utils.js, data-layer.js, ui-utils.js
// Shared state: currentProject, isDirty (from main.js)

/* DEPRECATED — now using window.dataLayer.loadProjects()
async function getProjects() { ... }
*/

async function saveProjectToSupabase(project) {
    try {
        // Single table approach: project + contractors + crews all in one row
        const projectData = toSupabaseProject(project);

        // Add user_id from localStorage
        const userId = getStorageItem(STORAGE_KEYS.USER_ID);
        if (userId) {
            projectData.user_id = userId;
        }

        const { error } = await supabaseClient
            .from('projects')
            .upsert(projectData, { onConflict: 'id' });

        if (error) {
            console.error('Error saving project:', error);
            throw new Error('Failed to save project');
        }

        return true;
    } catch (error) {
        console.error('Error in saveProjectToSupabase:', error);
        throw error;
    }
}

async function deleteProjectFromSupabase(projectId) {
    try {
        // Delete the project - contractors cascade automatically
        const { error } = await supabaseClient
            .from('projects')
            .delete()
            .eq('id', projectId);

        if (error) {
            console.error('Error deleting project:', error);
            throw new Error('Failed to delete project');
        }

        return true;
    } catch (error) {
        console.error('Error in deleteProjectFromSupabase:', error);
        throw error;
    }
}

function createNewProject() {
    currentProject = {
        id: generateId(),
        projectName: '',
        logoThumbnail: null,
        logoUrl: null,
        noabProjectNo: '',
        cnoSolicitationNo: 'N/A',
        location: '',
        engineer: '',
        primeContractor: '',
        noticeToProceed: '',
        reportDate: '',
        contractDuration: '',
        expectedCompletion: '',
        defaultStartTime: '06:00',
        defaultEndTime: '16:00',
        weatherDays: 0,
        contractDayNo: '',
        contractors: []
    };
    populateForm();
    showProjectForm();
}

async function loadProject(projectId) {
    try {
        var project = null;

        // LOCAL-FIRST: Try IndexedDB first for faster loading
        try {
            project = await window.idb.getProject(projectId);
            if (project) {
                console.log('[loadProject] Found in IndexedDB:', projectId);
            }
        } catch (idbError) {
            console.warn('[loadProject] IndexedDB error:', idbError);
        }

        // Fall back to getProjects() if not found in IndexedDB
        if (!project) {
            console.log('[loadProject] Not in IndexedDB, falling back to getProjects()');
            var projects = await window.dataLayer.loadProjects();
            project = projects.find(function(p) { return p.id === projectId; });
        }

        if (project) {
            currentProject = JSON.parse(JSON.stringify(project)); // Deep copy
            populateForm();
            showProjectForm();
        }
    } catch (error) {
        console.error('Error loading project:', error);
        showToast('Failed to load project', 'error');
    }
}

async function saveProject() {
    if (!currentProject) return;

    // Validate required fields
    var name = document.getElementById('projectName').value.trim();
    if (!name) {
        showToast('Project name is required', 'error');
        document.getElementById('projectName').focus();
        return;
    }

    // Update current project from form
    currentProject.projectName = name;
    // Logo fields are set by handleLogoSelect/removeLogo, preserve them
    currentProject.logoThumbnail = currentProject.logoThumbnail || null;
    currentProject.logoUrl = currentProject.logoUrl || null;
    currentProject.noabProjectNo = document.getElementById('noabProjectNo').value.trim();
    currentProject.cnoSolicitationNo = document.getElementById('cnoSolicitationNo').value.trim() || 'N/A';
    currentProject.location = document.getElementById('location').value.trim();
    currentProject.engineer = document.getElementById('engineer').value.trim();
    currentProject.primeContractor = document.getElementById('primeContractor').value.trim();
    currentProject.noticeToProceed = document.getElementById('noticeToProceed').value;
    currentProject.reportDate = document.getElementById('reportDate').value;
    currentProject.contractDuration = parseInt(document.getElementById('contractDuration').value) || null;
    currentProject.expectedCompletion = document.getElementById('expectedCompletion').value;
    currentProject.defaultStartTime = document.getElementById('defaultStartTime').value || '06:00';
    currentProject.defaultEndTime = document.getElementById('defaultEndTime').value || '16:00';
    currentProject.weatherDays = parseInt(document.getElementById('weatherDays').value) || 0;
    currentProject.contractDayNo = parseInt(document.getElementById('contractDayNo').value) || '';

    // Ensure user_id is set for IndexedDB filtering
    var userId = getStorageItem(STORAGE_KEYS.USER_ID);
    if (userId && !currentProject.user_id) {
        currentProject.user_id = userId;
    }

    // Ensure created_at is set for sorting
    if (!currentProject.created_at) {
        currentProject.created_at = new Date().toISOString();
    }

    // LOCAL-FIRST: Save to IndexedDB first
    try {
        await window.idb.saveProject(currentProject);
        console.log('[saveProject] Saved to IndexedDB:', currentProject.id);
    } catch (idbError) {
        console.error('[saveProject] IndexedDB save failed:', idbError);
        // Continue to try Supabase anyway
    }

    // Then sync to Supabase (backup)
    try {
        await saveProjectToSupabase(currentProject);
        console.log('[saveProject] Synced to Supabase:', currentProject.id);
        clearDirty();
        showToast('Project saved successfully');
    } catch (supabaseError) {
        // Offline or Supabase error - local save succeeded, warn user
        console.warn('[saveProject] Supabase sync failed (offline?):', supabaseError);
        clearDirty();
        showToast('Project saved locally (offline)', 'warning');
    }

    // Navigate to projects.html after save
    setTimeout(function() {
        window.location.href = 'projects.html';
    }, 800);
}

// ============ PROJECT DELETION ============

/**
 * Show the delete project confirmation modal
 */
function showDeleteProjectModal() {
    if (!currentProject) return;

    // Set project name in modal
    var projectName = currentProject.projectName || 'Unnamed Project';
    document.getElementById('deleteProjectName').textContent = '"' + projectName + '"';

    // Show modal
    document.getElementById('deleteProjectModal').classList.remove('hidden');
}

/**
 * Close the delete project modal
 */
function closeDeleteProjectModal() {
    document.getElementById('deleteProjectModal').classList.add('hidden');
    // Reset button state
    var btn = document.getElementById('confirmDeleteProjectBtn');
    var icon = document.getElementById('deleteProjectBtnIcon');
    var text = document.getElementById('deleteProjectBtnText');
    btn.disabled = false;
    icon.className = 'fas fa-trash-alt';
    text.textContent = 'Delete';
}

/**
 * Confirm and execute project deletion
 * Order: Check offline -> Delete from Supabase -> Delete from IndexedDB
 */
async function confirmDeleteProject() {
    // MUST be first check - block deletion when offline
    if (!navigator.onLine) {
        showToast('Cannot delete project while offline. Please connect to the internet and try again.', 'error');
        closeDeleteProjectModal();
        return;
    }

    if (!currentProject) {
        closeDeleteProjectModal();
        return;
    }

    var projectId = currentProject.id;

    // Show loading state
    var btn = document.getElementById('confirmDeleteProjectBtn');
    var icon = document.getElementById('deleteProjectBtnIcon');
    var text = document.getElementById('deleteProjectBtnText');
    btn.disabled = true;
    icon.className = 'fas fa-spinner spin-animation';
    text.textContent = 'Deleting...';

    try {
        // 2. Delete from Supabase (single table — contractors are JSONB, no separate delete needed)
        var result = await supabaseClient
            .from('projects')
            .delete()
            .eq('id', projectId);

        if (result.error) {
            console.error('[deleteProject] Failed to delete project from Supabase:', result.error);
            throw new Error('Failed to delete project');
        }
        console.log('[deleteProject] Deleted project from Supabase:', projectId);

        // 3. Supabase succeeded - now delete from IndexedDB
        try {
            await window.idb.deleteProject(projectId);
            console.log('[deleteProject] Deleted from IndexedDB:', projectId);
        } catch (idbError) {
            // Log but don't fail - Supabase deletion was successful
            console.warn('[deleteProject] IndexedDB delete failed (non-critical):', idbError);
        }

        // 4. Clear from localStorage if cached there
        try {
            var cachedProjects = getStorageItem(STORAGE_KEYS.PROJECTS);
            if (cachedProjects && cachedProjects[projectId]) {
                delete cachedProjects[projectId];
                setStorageItem(STORAGE_KEYS.PROJECTS, cachedProjects);
                console.log('[deleteProject] Cleared from localStorage cache');
            }
        } catch (lsError) {
            console.warn('[deleteProject] localStorage cleanup failed (non-critical):', lsError);
        }

        // 5. Clear active project if it was deleted
        if (getActiveProjectId() === projectId) {
            removeStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
            console.log('[deleteProject] Cleared active project ID');
        }

        // 6. Success - close modal and redirect
        closeDeleteProjectModal();
        showToast('Project deleted successfully');
        currentProject = null;

        // Navigate to projects list
        setTimeout(function() {
            window.location.href = 'projects.html';
        }, 800);

    } catch (error) {
        console.error('[deleteProject] Deletion failed:', error);
        closeDeleteProjectModal();
        showToast(error.message || 'Failed to delete project. Please try again.', 'error');
    }
}

/**
 * Legacy deleteProject function (for backwards compatibility)
 * @deprecated Use showDeleteProjectModal() instead
 */
function deleteProject(projectId) {
    // Set currentProject if not already set (for calls from other pages)
    if (!currentProject || currentProject.id !== projectId) {
        console.warn('[deleteProject] Called with projectId directly - use showDeleteProjectModal() instead');
    }
    showDeleteProjectModal();
}
