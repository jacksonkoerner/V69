// ============================================================================
// FieldVoice Pro v6 - Original Notes Tab (original-notes.js)
//
// Uses: window.reportState (RS), escapeHtml from ui-utils.js
// ============================================================================

var RS = window.reportState;

function populateOriginalNotes() {
    var report = RS.report;
    if (!report) return;

    var mode = report.aiCaptureMode || report.meta?.captureMode || 'guided';
    document.getElementById('captureModeBadge').textContent =
        mode === 'minimal' || mode === 'freeform' ? 'Quick Notes' : 'Guided';

    var original = report.originalInput;

    if (mode === 'minimal' || mode === 'freeform') {
        document.getElementById('minimalNotesSection').classList.remove('hidden');
        document.getElementById('guidedNotesSection').classList.add('hidden');

        var freeformContent = '';
        if (original?.fieldNotes?.freeform_entries?.length > 0) {
            freeformContent = original.fieldNotes.freeform_entries
                .filter(function(e) { return e.content?.trim(); })
                .sort(function(a, b) { return new Date(a.timestamp || a.created_at || 0) - new Date(b.timestamp || b.created_at || 0); })
                .map(function(e) {
                    var time = e.timestamp || e.created_at;
                    var timeStr = time ? new Date(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
                    return timeStr ? '[' + timeStr + '] ' + e.content : e.content;
                })
                .join('\n\n');
        } else if (original?.fieldNotes?.freeformNotes) {
            freeformContent = original.fieldNotes.freeformNotes;
        } else if (report.fieldNotes?.freeformNotes) {
            freeformContent = report.fieldNotes.freeformNotes;
        }

        document.getElementById('originalFreeformNotes').textContent = freeformContent || 'None';

    } else {
        document.getElementById('minimalNotesSection').classList.add('hidden');
        document.getElementById('guidedNotesSection').classList.remove('hidden');

        var contractors = original?.projectContext?.contractors || [];
        var contractorMap = {};
        contractors.forEach(function(c) {
            contractorMap[c.id] = c.name || c.company || 'Unknown Contractor';
        });

        renderOriginalWorkByContractor(original, contractorMap);
        renderOriginalPersonnelTable(original, contractorMap);
        renderOriginalEquipmentTable(original, contractorMap);

        renderEntriesSection(original, 'issues', 'originalIssues');
        renderEntriesSection(original, 'qaqc', 'originalQaqc');
        renderEntriesSection(original, 'communications', 'originalCommunications');
        renderSafetySection(original);
        renderEntriesSection(original, 'visitors', 'originalVisitors');
    }

    var w = original?.weather || report.overview?.weather || {};
    var weatherHtml = (w.highTemp || w.lowTemp || w.generalCondition)
        ? 'High: ' + escapeHtml(w.highTemp || 'N/A') + ' | Low: ' + escapeHtml(w.lowTemp || 'N/A') + '<br>' + escapeHtml(w.generalCondition || 'N/A') + ' | Site: ' + escapeHtml(w.jobSiteCondition || 'N/A')
        : '<span class="text-slate-400 italic">None</span>';
    document.getElementById('originalWeather').innerHTML = weatherHtml;

    var photos = report.photos || [];
    populateOriginalPhotos(photos);
}

function renderOriginalWorkByContractor(original, contractorMap) {
    var container = document.getElementById('originalWorkByContractor');
    var entries = original?.entries?.filter(function(e) { return e.section?.startsWith('work_') && !e.is_deleted; }) || [];

    if (entries.length === 0) {
        container.innerHTML = '<p class="text-slate-400 italic">None</p>';
        return;
    }

    var contractors = original?.projectContext?.contractors || [];
    var crewMap = {};
    contractors.forEach(function(c) {
        (c.crews || []).forEach(function(crew) {
            crewMap[c.id + '_' + crew.id] = crew.name;
        });
    });

    var grouped = {};
    entries.forEach(function(e) {
        var crewMatch = e.section.match(/^work_(.+?)_crew_(.+)$/);
        var contractorId, crewId;
        if (crewMatch) {
            contractorId = crewMatch[1];
            crewId = crewMatch[2];
        } else {
            contractorId = e.section.replace('work_', '');
            crewId = null;
        }
        var groupKey = contractorId;
        if (!grouped[groupKey]) grouped[groupKey] = { entries: [], crewEntries: {} };
        if (crewId) {
            if (!grouped[groupKey].crewEntries[crewId]) grouped[groupKey].crewEntries[crewId] = [];
            grouped[groupKey].crewEntries[crewId].push(e);
        } else {
            grouped[groupKey].entries.push(e);
        }
    });

    var html = '';
    Object.keys(grouped).forEach(function(contractorId) {
        var contractorName = contractorMap[contractorId] || 'Unknown Contractor';
        var group = grouped[contractorId];

        html += '<div class="bg-slate-800/50 rounded-lg overflow-hidden mb-2">';
        html += '<div class="bg-slate-700/50 px-3 py-2 font-medium text-white text-sm">' + escapeHtml(contractorName) + '</div>';

        if (group.entries.length > 0) {
            var sorted = group.entries.sort(function(a, b) { return new Date(a.timestamp || 0) - new Date(b.timestamp || 0); });
            html += '<table class="w-full text-sm"><tbody>';
            sorted.forEach(function(e) {
                var time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
                html += '<tr class="border-t border-slate-700/50"><td class="px-3 py-2 text-slate-400 whitespace-nowrap w-20">' + time + '</td><td class="px-3 py-2 text-slate-200">' + escapeHtml(e.content || '') + '</td></tr>';
            });
            html += '</tbody></table>';
        }

        Object.keys(group.crewEntries).forEach(function(crewId) {
            var crewName = crewMap[contractorId + '_' + crewId] || ('Crew ' + crewId.substring(0, 6));
            var crewEntriesSorted = group.crewEntries[crewId].sort(function(a, b) { return new Date(a.timestamp || 0) - new Date(b.timestamp || 0); });
            html += '<div class="bg-slate-700/30 px-3 py-1 text-xs text-slate-300 font-medium border-t border-slate-700/50"><i class="fas fa-users mr-1 text-slate-400"></i>' + escapeHtml(crewName) + '</div>';
            html += '<table class="w-full text-sm"><tbody>';
            crewEntriesSorted.forEach(function(e) {
                var time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
                html += '<tr class="border-t border-slate-700/50"><td class="px-3 py-2 text-slate-400 whitespace-nowrap w-20">' + time + '</td><td class="px-3 py-2 text-slate-200">' + escapeHtml(e.content || '') + '</td></tr>';
            });
            html += '</tbody></table>';
        });

        html += '</div>';
    });

    container.innerHTML = html;
}

function renderOriginalPersonnelTable(original, contractorMap) {
    var container = document.getElementById('originalPersonnelSection');
    var operations = original?.operations || [];

    if (operations.length === 0) {
        container.innerHTML = '<p class="text-slate-400 italic">None</p>';
        return;
    }

    var html = '<table class="w-full text-sm bg-slate-800/50 rounded-lg overflow-hidden"><thead class="bg-slate-700/50"><tr>' +
        '<th class="px-3 py-2 text-left text-slate-300 font-medium">Contractor</th>' +
        '<th class="px-2 py-2 text-center text-slate-300 font-medium">Supt</th>' +
        '<th class="px-2 py-2 text-center text-slate-300 font-medium">Fore</th>' +
        '<th class="px-2 py-2 text-center text-slate-300 font-medium">Oper</th>' +
        '<th class="px-2 py-2 text-center text-slate-300 font-medium">Labor</th>' +
        '<th class="px-2 py-2 text-center text-slate-300 font-medium">Surv</th>' +
        '<th class="px-2 py-2 text-center text-slate-300 font-medium">Other</th>' +
        '</tr></thead><tbody>';

    var hasAnyPersonnel = false;
    operations.forEach(function(op) {
        var name = contractorMap[op.contractorId] || op.contractorName || 'Unknown';
        var total = (op.superintendents || 0) + (op.foremen || 0) + (op.operators || 0) +
                    (op.laborers || 0) + (op.surveyors || 0) + (op.others || 0);
        if (total === 0) return;

        hasAnyPersonnel = true;
        html += '<tr class="border-t border-slate-700/50">' +
            '<td class="px-3 py-2 text-slate-200">' + escapeHtml(name) + '</td>' +
            '<td class="px-2 py-2 text-center text-slate-300">' + (op.superintendents || 0) + '</td>' +
            '<td class="px-2 py-2 text-center text-slate-300">' + (op.foremen || 0) + '</td>' +
            '<td class="px-2 py-2 text-center text-slate-300">' + (op.operators || 0) + '</td>' +
            '<td class="px-2 py-2 text-center text-slate-300">' + (op.laborers || 0) + '</td>' +
            '<td class="px-2 py-2 text-center text-slate-300">' + (op.surveyors || 0) + '</td>' +
            '<td class="px-2 py-2 text-center text-slate-300">' + (op.others || 0) + '</td></tr>';
    });

    html += '</tbody></table>';

    if (!hasAnyPersonnel) {
        container.innerHTML = '<p class="text-slate-400 italic">None</p>';
    } else {
        container.innerHTML = html;
    }
}

function renderOriginalEquipmentTable(original, contractorMap) {
    var container = document.getElementById('originalEquipmentSection');
    var equipment = original?.equipmentRows || [];

    if (equipment.length === 0) {
        container.innerHTML = '<p class="text-slate-400 italic">None</p>';
        return;
    }

    var html = '<table class="w-full text-sm bg-slate-800/50 rounded-lg overflow-hidden"><thead class="bg-slate-700/50"><tr>' +
        '<th class="px-3 py-2 text-left text-slate-300 font-medium">Contractor</th>' +
        '<th class="px-3 py-2 text-left text-slate-300 font-medium">Type</th>' +
        '<th class="px-2 py-2 text-center text-slate-300 font-medium">Qty</th>' +
        '<th class="px-2 py-2 text-center text-slate-300 font-medium">Hours</th>' +
        '</tr></thead><tbody>';

    equipment.forEach(function(eq) {
        var name = contractorMap[eq.contractorId] || eq.contractorName || 'Unspecified';
        html += '<tr class="border-t border-slate-700/50">' +
            '<td class="px-3 py-2 text-slate-200">' + escapeHtml(name) + '</td>' +
            '<td class="px-3 py-2 text-slate-200">' + escapeHtml(eq.type || '') + '</td>' +
            '<td class="px-2 py-2 text-center text-slate-300">' + (eq.qty || 1) + '</td>' +
            '<td class="px-2 py-2 text-center text-slate-300">' + (eq.status || '-') + '</td></tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderEntriesSection(original, sectionName, elementId) {
    var container = document.getElementById(elementId);
    var entries = original?.entries?.filter(function(e) { return e.section === sectionName && !e.is_deleted; }) || [];

    if (entries.length === 0) {
        container.innerHTML = '<p class="text-slate-400 italic">None</p>';
        return;
    }

    var sorted = entries.sort(function(a, b) { return new Date(a.timestamp || 0) - new Date(b.timestamp || 0); });

    var html = '<div class="bg-slate-800/50 rounded-lg overflow-hidden"><table class="w-full text-sm"><tbody>';

    sorted.forEach(function(e, i) {
        var time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
        var borderClass = i > 0 ? 'border-t border-slate-700/50' : '';
        html += '<tr class="' + borderClass + '"><td class="px-3 py-2 text-slate-400 whitespace-nowrap w-20">' + time + '</td><td class="px-3 py-2 text-slate-200">' + escapeHtml(e.content || '') + '</td></tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function renderSafetySection(original) {
    var container = document.getElementById('originalSafety');
    var entries = original?.entries?.filter(function(e) { return e.section === 'safety' && !e.is_deleted; }) || [];
    var safety = original?.safety || {};

    var html = '';

    if (safety.noIncidents) {
        html += '<div class="text-green-400 font-medium mb-2"><i class="fas fa-check-circle mr-2"></i>No Incidents Reported</div>';
    } else if (safety.hasIncidents) {
        html += '<div class="text-red-400 font-medium mb-2"><i class="fas fa-exclamation-triangle mr-2"></i>Incident Reported</div>';
    }

    if (entries.length > 0) {
        var sorted = entries.sort(function(a, b) { return new Date(a.timestamp || 0) - new Date(b.timestamp || 0); });
        html += '<div class="bg-slate-800/50 rounded-lg overflow-hidden"><table class="w-full text-sm"><tbody>';

        sorted.forEach(function(e, i) {
            var time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
            var borderClass = i > 0 ? 'border-t border-slate-700/50' : '';
            html += '<tr class="' + borderClass + '"><td class="px-3 py-2 text-slate-400 whitespace-nowrap w-20">' + time + '</td><td class="px-3 py-2 text-slate-200">' + escapeHtml(e.content || '') + '</td></tr>';
        });

        html += '</tbody></table></div>';
    } else if (!safety.noIncidents && !safety.hasIncidents) {
        html = '<p class="text-slate-400 italic">None</p>';
    }

    container.innerHTML = html;
}

function populateOriginalPhotos(photos) {
    var container = document.getElementById('originalPhotosGrid');
    if (!photos || photos.length === 0) {
        container.innerHTML = '<p class="text-slate-500 col-span-2 text-center py-4">No photos captured</p>';
        return;
    }

    container.innerHTML = photos.map(function(photo, index) {
        return '<div class="bg-white border border-slate-200 rounded overflow-hidden">' +
            '<div class="aspect-square bg-slate-100">' +
            '<img src="' + photo.url + '" class="w-full h-full object-cover" alt="Photo ' + (index + 1) + '">' +
            '</div>' +
            '<div class="p-2">' +
            '<p class="text-xs text-slate-500">' + (photo.date || '') + ' ' + (photo.time || '') + '</p>' +
            '<p class="text-sm text-slate-700 mt-1">' + (escapeHtml(photo.caption) || '<em class="text-slate-400">No caption</em>') + '</p>' +
            '</div></div>';
    }).join('');
}
