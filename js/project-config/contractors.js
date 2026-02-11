// ============ CONTRACTOR & CREW MANAGEMENT ============
// Dependencies: ui-utils.js (escapeHtml, generateId, showToast)
// Shared state: currentProject, deleteCallback, draggedItem (from main.js)

function renderContractors() {
    var container = document.getElementById('contractorList');

    if (!currentProject || currentProject.contractors.length === 0) {
        container.innerHTML = '<div class="p-6 text-center">' +
            '<i class="fas fa-hard-hat text-slate-300 text-2xl mb-2"></i>' +
            '<p class="text-sm text-slate-500">No contractors added</p>' +
            '</div>';
        return;
    }

    // Sort: prime contractors first
    var sortedContractors = [].concat(currentProject.contractors).sort(function(a, b) {
        if (a.type === 'prime' && b.type !== 'prime') return -1;
        if (a.type !== 'prime' && b.type === 'prime') return 1;
        return 0;
    });

    container.innerHTML = sortedContractors.map(function(contractor, index) {
        // Ensure crews array exists
        contractor.crews = contractor.crews || [];

        var crewsHtml = contractor.crews.length > 0 ?
            '<div class="mt-2 ml-2 space-y-1">' +
                contractor.crews.map(function(crew, crewIdx) {
                    return '<div class="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded text-xs" data-crew-id="' + crew.id + '">' +
                        '<i class="fas fa-users text-slate-400 text-[10px]"></i>' +
                        '<span class="flex-1 text-slate-700 font-medium">' + escapeHtml(crew.name) + '</span>' +
                        '<button onclick="editCrew(\'' + contractor.id + '\', \'' + crew.id + '\')" class="text-dot-blue hover:text-blue-800 p-0.5" title="Edit Crew">' +
                            '<i class="fas fa-edit text-[10px]"></i>' +
                        '</button>' +
                        '<button onclick="deleteCrew(\'' + contractor.id + '\', \'' + crew.id + '\')" class="text-red-500 hover:text-red-700 p-0.5" title="Delete Crew">' +
                            '<i class="fas fa-trash text-[10px]"></i>' +
                        '</button>' +
                    '</div>';
                }).join('') +
            '</div>'
            : '';

        return '<div class="p-4 flex items-start gap-3" data-contractor-id="' + contractor.id + '" draggable="true">' +
            '<div class="drag-handle w-8 h-8 bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">' +
                '<i class="fas fa-grip-vertical"></i>' +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
                '<div class="flex items-center gap-2">' +
                    '<p class="font-bold text-slate-800">' + escapeHtml(contractor.name) + '</p>' +
                    '<span class="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 font-mono">' + escapeHtml(contractor.abbreviation) + '</span>' +
                '</div>' +
                '<p class="text-xs mt-1">' +
                    '<span class="' + (contractor.type === 'prime' ? 'text-safety-green font-bold' : 'text-slate-500') + '">' + (contractor.type === 'prime' ? 'PRIME' : 'Subcontractor') + '</span>' +
                    (contractor.trades ? ' &bull; ' + escapeHtml(contractor.trades) : '') +
                '</p>' +
                crewsHtml +
                '<button onclick="showAddCrewForm(\'' + contractor.id + '\')" class="mt-2 text-xs text-dot-blue hover:text-blue-800 flex items-center gap-1">' +
                    '<i class="fas fa-plus text-[10px]"></i> Add Crew' +
                '</button>' +
            '</div>' +
            '<div class="flex items-center gap-1 shrink-0">' +
                '<button onclick="editContractor(\'' + contractor.id + '\')" class="w-8 h-8 text-dot-blue hover:bg-dot-blue/10 flex items-center justify-center transition-colors" title="Edit">' +
                    '<i class="fas fa-edit text-sm"></i>' +
                '</button>' +
                '<button onclick="deleteContractor(\'' + contractor.id + '\')" class="w-8 h-8 text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors" title="Delete">' +
                    '<i class="fas fa-trash text-sm"></i>' +
                '</button>' +
            '</div>' +
        '</div>';
    }).join('');

    // Setup drag and drop
    setupContractorDragDrop();
}

function showAddContractorForm() {
    document.getElementById('addContractorForm').classList.remove('hidden');
    document.getElementById('contractorFormTitle').textContent = 'Add New Contractor';
    document.getElementById('editContractorId').value = '';
    document.getElementById('contractorName').value = '';
    document.getElementById('contractorAbbr').value = '';
    document.getElementById('contractorType').value = 'subcontractor';
    document.getElementById('contractorTrades').value = '';
    document.getElementById('addContractorForm').scrollIntoView({ behavior: 'smooth' });
}

function hideAddContractorForm() {
    document.getElementById('addContractorForm').classList.add('hidden');
}

function editContractor(contractorId) {
    var contractor = currentProject.contractors.find(function(c) { return c.id === contractorId; });
    if (!contractor) return;

    document.getElementById('addContractorForm').classList.remove('hidden');
    document.getElementById('contractorFormTitle').textContent = 'Edit Contractor';
    document.getElementById('editContractorId').value = contractorId;
    document.getElementById('contractorName').value = contractor.name;
    document.getElementById('contractorAbbr').value = contractor.abbreviation;
    document.getElementById('contractorType').value = contractor.type;
    document.getElementById('contractorTrades').value = contractor.trades || '';
    document.getElementById('addContractorForm').scrollIntoView({ behavior: 'smooth' });
}

function saveContractor() {
    var name = document.getElementById('contractorName').value.trim();
    var abbr = document.getElementById('contractorAbbr').value.trim().toUpperCase();
    var type = document.getElementById('contractorType').value;
    var trades = document.getElementById('contractorTrades').value.trim();
    var editId = document.getElementById('editContractorId').value;

    if (!name || !abbr) {
        showToast('Name and abbreviation are required', 'error');
        return;
    }

    if (editId) {
        // Edit existing
        var contractor = currentProject.contractors.find(function(c) { return c.id === editId; });
        if (contractor) {
            contractor.name = name;
            contractor.abbreviation = abbr;
            contractor.type = type;
            contractor.trades = trades;
        }
    } else {
        // Add new
        currentProject.contractors.push({
            id: generateId(),
            name: name,
            abbreviation: abbr,
            type: type,
            trades: trades,
            crews: []
        });
    }

    hideAddContractorForm();
    renderContractors();
    markDirty();
    showToast(editId ? 'Contractor updated' : 'Contractor added');
}

function deleteContractor(contractorId) {
    showDeleteModal('Delete this contractor?', function() {
        currentProject.contractors = currentProject.contractors.filter(function(c) { return c.id !== contractorId; });
        renderContractors();
        markDirty();
        showToast('Contractor deleted');
    });
}

// ============ CREW MANAGEMENT ============
function showAddCrewForm(contractorId) {
    var form = document.getElementById('addCrewForm');
    form.classList.remove('hidden');
    form.dataset.contractorId = contractorId;
    form.dataset.editCrewId = '';
    document.getElementById('crewFormTitle').textContent = 'Add Crew';
    document.getElementById('crewName').value = '';
    form.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('crewName').focus();
}

function hideAddCrewForm() {
    document.getElementById('addCrewForm').classList.add('hidden');
}

function saveCrew() {
    var form = document.getElementById('addCrewForm');
    var contractorId = form.dataset.contractorId;
    var editCrewId = form.dataset.editCrewId;
    var crewName = document.getElementById('crewName').value.trim();

    if (!crewName) {
        showToast('Crew name is required', 'error');
        return;
    }

    var contractor = currentProject.contractors.find(function(c) { return c.id === contractorId; });
    if (!contractor) return;

    contractor.crews = contractor.crews || [];

    if (editCrewId) {
        // Edit existing crew
        var crew = contractor.crews.find(function(cr) { return cr.id === editCrewId; });
        if (crew) {
            crew.name = crewName;
        }
    } else {
        // Add new crew
        contractor.crews.push({
            id: generateId(),
            contractorId: contractorId,
            name: crewName,
            status: 'active',
            sortOrder: contractor.crews.length
        });
    }

    hideAddCrewForm();
    renderContractors();
    markDirty();
    showToast(editCrewId ? 'Crew updated' : 'Crew added');
}

function editCrew(contractorId, crewId) {
    var contractor = currentProject.contractors.find(function(c) { return c.id === contractorId; });
    if (!contractor) return;
    contractor.crews = contractor.crews || [];
    var crew = contractor.crews.find(function(cr) { return cr.id === crewId; });
    if (!crew) return;

    var form = document.getElementById('addCrewForm');
    form.classList.remove('hidden');
    form.dataset.contractorId = contractorId;
    form.dataset.editCrewId = crewId;
    document.getElementById('crewFormTitle').textContent = 'Edit Crew';
    document.getElementById('crewName').value = crew.name;
    form.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('crewName').focus();
}

function deleteCrew(contractorId, crewId) {
    showDeleteModal('Delete this crew?', function() {
        var contractor = currentProject.contractors.find(function(c) { return c.id === contractorId; });
        if (!contractor) return;
        contractor.crews = (contractor.crews || []).filter(function(cr) { return cr.id !== crewId; });
        renderContractors();
        markDirty();
        showToast('Crew deleted');
    });
}

// ============ DRAG AND DROP ============
function setupContractorDragDrop() {
    var container = document.getElementById('contractorList');
    var items = container.querySelectorAll('[data-contractor-id]');

    items.forEach(function(item) {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleContractorDrop);
        item.addEventListener('dragleave', handleDragLeave);
    });
}

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
}

function handleDragOver(e) {
    e.preventDefault();
    if (this !== draggedItem) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleContractorDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');

    if (this !== draggedItem) {
        var draggedId = draggedItem.getAttribute('data-contractor-id');
        var targetId = this.getAttribute('data-contractor-id');

        var draggedIndex = currentProject.contractors.findIndex(function(c) { return c.id === draggedId; });
        var targetIndex = currentProject.contractors.findIndex(function(c) { return c.id === targetId; });

        if (draggedIndex > -1 && targetIndex > -1) {
            var removed = currentProject.contractors.splice(draggedIndex, 1);
            currentProject.contractors.splice(targetIndex, 0, removed[0]);
            renderContractors();
            markDirty();
        }
    }
}

// ============ GENERIC DELETE MODAL ============
function showDeleteModal(message, callback) {
    document.getElementById('deleteModalMessage').textContent = message;
    document.getElementById('deleteModal').classList.remove('hidden');
    deleteCallback = callback;
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.add('hidden');
    deleteCallback = null;
}

function confirmDelete() {
    if (deleteCallback) {
        deleteCallback();
    }
    closeDeleteModal();
}
