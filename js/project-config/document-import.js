// ============ DOCUMENT IMPORT & EXTRACTION ============
// Dependencies: ui-utils.js (escapeHtml, showToast, generateId)
// Shared state: selectedFiles (from main.js)

var EXTRACT_WEBHOOK_URL = 'https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-project-extractor';

function setupDropZone() {
    var dropZone = document.getElementById('dropZone');
    if (!dropZone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function(eventName) {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(function(eventName) {
        dropZone.addEventListener(eventName, function() { dropZone.classList.add('drag-active'); }, false);
    });

    ['dragleave', 'drop'].forEach(function(eventName) {
        dropZone.addEventListener(eventName, function() { dropZone.classList.remove('drag-active'); }, false);
    });

    dropZone.addEventListener('drop', handleFileDrop, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleFileDrop(e) {
    var dt = e.dataTransfer;
    var files = dt.files;
    handleFiles(files);
}

function handleFileSelect(e) {
    var files = e.target.files;
    handleFiles(files);
}

function handleFiles(files) {
    var validExtensions = ['.pdf', '.docx'];
    var newFiles = Array.from(files).filter(function(file) {
        var ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!validExtensions.includes(ext)) {
            showToast('Invalid file type: ' + file.name + '. Only PDF and DOCX allowed.', 'error');
            return false;
        }
        // Check for duplicates
        if (selectedFiles.some(function(f) { return f.name === file.name && f.size === file.size; })) {
            showToast('File already added: ' + file.name, 'warning');
            return false;
        }
        return true;
    });

    selectedFiles = selectedFiles.concat(newFiles);
    renderFileList();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(filename) {
    var ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
        return '<i class="fas fa-file-pdf text-red-500"></i>';
    } else if (ext === 'docx' || ext === 'doc') {
        return '<i class="fas fa-file-word text-blue-500"></i>';
    }
    return '<i class="fas fa-file text-slate-400"></i>';
}

function renderFileList() {
    var listContainer = document.getElementById('selectedFilesList');
    var filesContainer = document.getElementById('filesContainer');
    var extractBtn = document.getElementById('extractBtn');

    if (selectedFiles.length === 0) {
        listContainer.classList.add('hidden');
        extractBtn.classList.add('hidden');
        return;
    }

    listContainer.classList.remove('hidden');
    extractBtn.classList.remove('hidden');

    filesContainer.innerHTML = selectedFiles.map(function(file, index) {
        return '<div class="file-item flex items-center gap-3 bg-white p-3 rounded border border-slate-200">' +
            '<span class="text-lg">' + getFileIcon(file.name) + '</span>' +
            '<div class="flex-1 min-w-0">' +
                '<p class="text-sm font-medium text-slate-800 truncate">' + escapeHtml(file.name) + '</p>' +
                '<p class="text-xs text-slate-500">' + formatFileSize(file.size) + '</p>' +
            '</div>' +
            '<button onclick="removeFile(' + index + ')" class="w-8 h-8 text-red-500 hover:bg-red-50 flex items-center justify-center rounded transition-colors" title="Remove file">' +
                '<i class="fas fa-times"></i>' +
            '</button>' +
        '</div>';
    }).join('');
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    renderFileList();
}

function clearSelectedFiles() {
    selectedFiles = [];
    document.getElementById('fileInput').value = '';
    renderFileList();
}

// ============ EXTRACTION ============
async function extractProjectData() {
    if (selectedFiles.length === 0) {
        showToast('Please select at least one file', 'error');
        return;
    }

    // Hide any previous banners
    hideExtractionBanners();

    // Show loading state
    setExtractButtonLoading(true);

    try {
        var formData = new FormData();
        selectedFiles.forEach(function(file) {
            formData.append('documents', file);
        });

        var response = await fetch(EXTRACT_WEBHOOK_URL, {
            method: 'POST',
            body: formData
        });

        var result = await response.json();

        if (result.success && result.data) {
            // Populate form with extracted data
            populateFormWithExtractedData(result.data);

            // Show success banner
            document.getElementById('extractionSuccessBanner').classList.remove('hidden');

            // Show extraction notes if any
            if (result.extractionNotes && result.extractionNotes.length > 0) {
                showExtractionNotes(result.extractionNotes);
            }

            // Clear selected files
            clearSelectedFiles();

            // Scroll to top of form
            document.getElementById('projectFormContainer').scrollIntoView({ behavior: 'smooth' });
        } else {
            // Show error banner
            var errorMsg = result.error || 'Failed to extract project data. Please try again.';
            document.getElementById('extractionErrorMessage').textContent = errorMsg;
            document.getElementById('extractionErrorBanner').classList.remove('hidden');
        }
    } catch (error) {
        console.error('Extraction error:', error);
        document.getElementById('extractionErrorMessage').textContent = 'Network error. Please check your connection and try again.';
        document.getElementById('extractionErrorBanner').classList.remove('hidden');
    } finally {
        setExtractButtonLoading(false);
    }
}

function setExtractButtonLoading(loading) {
    var btn = document.getElementById('extractBtn');
    var icon = document.getElementById('extractBtnIcon');
    var text = document.getElementById('extractBtnText');

    if (loading) {
        btn.disabled = true;
        icon.className = 'fas fa-spinner spin-animation';
        text.textContent = 'Extracting...';
    } else {
        btn.disabled = false;
        icon.className = 'fas fa-magic';
        text.textContent = 'Extract Project Data';
    }
}

function hideExtractionBanners() {
    document.getElementById('extractionSuccessBanner').classList.add('hidden');
    document.getElementById('extractionErrorBanner').classList.add('hidden');
}

function showExtractionNotes(notes) {
    var section = document.getElementById('extractionNotesSection');
    var list = document.getElementById('extractionNotesList');

    list.innerHTML = notes.map(function(note) { return '<li>' + escapeHtml(note) + '</li>'; }).join('');
    section.classList.remove('hidden');
}

function toggleExtractionNotes() {
    var content = document.getElementById('extractionNotesContent');
    var icon = document.getElementById('notesToggleIcon');

    content.classList.toggle('hidden');
    icon.style.transform = content.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
}

// ============ FORM POPULATION FROM EXTRACTED DATA ============
function populateFormWithExtractedData(data) {
    if (!currentProject) return;

    // Define field mappings: formFieldId -> dataFieldPath
    var fieldMappings = {
        'projectName': 'projectName',
        'noabProjectNo': 'noabProjectNo',
        'cnoSolicitationNo': 'cnoSolicitationNo',
        'location': 'location',
        'engineer': 'engineer',
        'primeContractor': 'primeContractor',
        'noticeToProceed': 'noticeToProceed',
        'reportDate': 'reportDate',
        'contractDuration': 'contractDuration',
        'expectedCompletion': 'expectedCompletion',
        'defaultStartTime': 'defaultStartTime',
        'defaultEndTime': 'defaultEndTime',
        'weatherDays': 'weatherDays',
        'contractDayNo': 'contractDayNo'
    };

    // Track missing fields
    var missingFields = [];

    // Populate each field
    Object.entries(fieldMappings).forEach(function(entry) {
        var fieldId = entry[0];
        var dataKey = entry[1];
        var input = document.getElementById(fieldId);
        if (!input) return;

        var value = data[dataKey];

        // Clear any previous missing field indicators
        clearMissingFieldIndicator(input);

        if (value === null || value === undefined || value === '') {
            // Mark as missing
            markFieldAsMissing(input);
            missingFields.push(fieldId);
            input.value = '';
        } else {
            input.value = value;
            // Update currentProject
            currentProject[dataKey] = value;
        }
    });

    // Process contractors
    if (data.contractors && Array.isArray(data.contractors)) {
        currentProject.contractors = data.contractors.map(function(contractor) {
            return {
                id: generateId(),
                name: contractor.name || '',
                abbreviation: contractor.abbreviation || generateAbbreviation(contractor.name),
                type: contractor.type || 'subcontractor',
                trades: contractor.trades || '',
                crews: []
            };
        });

        renderContractors();
    }

    // Setup input listeners to clear missing indicators when user types
    setupMissingFieldListeners();

    // Mark form as dirty after extraction
    markDirty();
}

function generateAbbreviation(name) {
    if (!name) return '';
    // Take first letter of each word, max 4 characters
    var words = name.split(/\s+/);
    if (words.length === 1) {
        return name.substring(0, 3).toUpperCase();
    }
    return words.map(function(w) { return w[0]; }).join('').substring(0, 4).toUpperCase();
}

function markFieldAsMissing(input) {
    input.classList.add('missing-field');

    // Create missing indicator if it doesn't exist
    var parent = input.parentElement;
    var indicator = parent.querySelector('.missing-indicator');
    if (!indicator) {
        indicator = document.createElement('p');
        indicator.className = 'missing-indicator mt-1';
        indicator.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>Missing - please fill in';
        parent.appendChild(indicator);
    }
}

function clearMissingFieldIndicator(input) {
    input.classList.remove('missing-field');
    var parent = input.parentElement;
    var indicator = parent.querySelector('.missing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function setupMissingFieldListeners() {
    var inputs = document.querySelectorAll('.missing-field');
    inputs.forEach(function(input) {
        // Remove existing listener if any to avoid duplicates
        input.removeEventListener('input', handleMissingFieldInput);
        input.addEventListener('input', handleMissingFieldInput);
    });
}

function handleMissingFieldInput(e) {
    var input = e.target;
    if (input.value.trim() !== '') {
        clearMissingFieldIndicator(input);
    }
}
