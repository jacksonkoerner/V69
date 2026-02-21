// ============ FORM RENDERING & LOGO MANAGEMENT ============
// Dependencies: ui-utils.js (escapeHtml), media-utils.js (compressImageToThumbnail, uploadLogoToStorage, deleteLogoFromStorage)
// Shared state: currentProject (from main.js)

function populateForm() {
    if (!currentProject) return;

    document.getElementById('projectName').value = currentProject.projectName || '';
    document.getElementById('noabProjectNo').value = currentProject.noabProjectNo || '';
    document.getElementById('cnoSolicitationNo').value = currentProject.cnoSolicitationNo || 'N/A';
    document.getElementById('location').value = currentProject.location || '';
    document.getElementById('engineer').value = currentProject.engineer || '';
    document.getElementById('primeContractor').value = currentProject.primeContractor || '';
    document.getElementById('noticeToProceed').value = currentProject.noticeToProceed || '';
    document.getElementById('reportDate').value = currentProject.reportDate || '';
    document.getElementById('contractDuration').value = currentProject.contractDuration || '';
    document.getElementById('expectedCompletion').value = currentProject.expectedCompletion || '';
    document.getElementById('defaultStartTime').value = currentProject.defaultStartTime || '06:00';
    document.getElementById('defaultEndTime').value = currentProject.defaultEndTime || '16:00';
    document.getElementById('weatherDays').value = currentProject.weatherDays || 0;
    document.getElementById('contractDayNo').value = currentProject.contractDayNo || '';

    // Handle logo preview
    // Priority: logoUrl (full quality) > logoThumbnail (compressed) > logo (legacy)
    var logoUploadZone = document.getElementById('logoUploadZone');
    var logoPreviewArea = document.getElementById('logoPreviewArea');
    var logoPreviewImg = document.getElementById('logoPreviewImg');

    var logoSrc = currentProject.logoUrl || currentProject.logoThumbnail || currentProject.logo;
    if (logoSrc) {
        logoPreviewImg.src = logoSrc;
        logoUploadZone.classList.add('hidden');
        logoPreviewArea.classList.remove('hidden');
    } else {
        logoUploadZone.classList.remove('hidden');
        logoPreviewArea.classList.add('hidden');
        logoPreviewImg.src = '';
    }

    renderContractors();
}

function showProjectForm() {
    // Scroll to top of form
    document.getElementById('projectFormContainer').scrollIntoView({ behavior: 'smooth' });
}

// ============ LOGO UPLOAD ============
async function handleLogoSelect(event) {
    var file = event.target.files[0];
    if (!file) return;

    // Validate it's an image
    var validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/gif'];
    if (!validTypes.includes(file.type)) {
        showToast('Please select a valid image file (PNG, JPG, SVG, GIF)', 'error');
        event.target.value = '';
        return;
    }

    try {
        // 1. Compress image for local storage (thumbnail)
        var thumbnailBase64 = await compressImageToThumbnail(file);
        currentProject.logoThumbnail = thumbnailBase64;

        // Show preview immediately with thumbnail
        var logoUploadZone = document.getElementById('logoUploadZone');
        var logoPreviewArea = document.getElementById('logoPreviewArea');
        var logoPreviewImg = document.getElementById('logoPreviewImg');

        logoPreviewImg.src = thumbnailBase64;
        logoUploadZone.classList.add('hidden');
        logoPreviewArea.classList.remove('hidden');

        // 2. Upload original to Supabase Storage (async, non-blocking)
        var logoResult = await uploadLogoToStorage(file, currentProject.id);
        if (logoResult) {
            currentProject.logoUrl = logoResult.signedUrl;
            currentProject.logoPath = logoResult.storagePath;
            showToast('Logo uploaded');
        } else {
            // Upload failed (offline) - still works with thumbnail
            currentProject.logoUrl = null;
            currentProject.logoPath = null;
            showToast('Logo saved locally (will sync when online)', 'warning');
        }

        // Clear old logo field if it exists
        delete currentProject.logo;

        markDirty();
    } catch (err) {
        console.error('[LOGO] Error processing logo:', err);
        showToast('Error processing logo', 'error');
    }

    // Clear the input so the same file can be selected again
    event.target.value = '';
}

async function removeLogo() {
    if (!currentProject) return;

    // Delete from Supabase Storage (async, non-blocking)
    deleteLogoFromStorage(currentProject.id);

    // Clear logo fields
    currentProject.logoThumbnail = null;
    currentProject.logoUrl = null;
    currentProject.logoPath = null;
    delete currentProject.logo; // Clean up old field if present

    var logoUploadZone = document.getElementById('logoUploadZone');
    var logoPreviewArea = document.getElementById('logoPreviewArea');
    var logoPreviewImg = document.getElementById('logoPreviewImg');

    logoPreviewImg.src = '';
    logoPreviewArea.classList.add('hidden');
    logoUploadZone.classList.remove('hidden');

    // Clear the file input
    document.getElementById('logoInput').value = '';

    markDirty();
    showToast('Logo removed');
}

function setupLogoDropZone() {
    var logoDropZone = document.getElementById('logoUploadZone');
    if (!logoDropZone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function(eventName) {
        logoDropZone.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(function(eventName) {
        logoDropZone.addEventListener(eventName, function() { logoDropZone.classList.add('drag-active'); }, false);
    });

    ['dragleave', 'drop'].forEach(function(eventName) {
        logoDropZone.addEventListener(eventName, function() { logoDropZone.classList.remove('drag-active'); }, false);
    });

    logoDropZone.addEventListener('drop', handleLogoDrop, false);
}

function handleLogoDrop(e) {
    var dt = e.dataTransfer;
    var files = dt.files;

    if (files.length > 0) {
        // Create a fake event to reuse handleLogoSelect
        var fakeEvent = {
            target: {
                files: files,
                value: ''
            }
        };
        handleLogoSelect(fakeEvent);
    }
}
