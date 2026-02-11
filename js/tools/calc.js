// ============================================================================
// FieldVoice Pro - Construction Calculator (calc.js)
//
// Tabs: Feet-Inch | Area/Volume | Converter
// All calculations offline, no dependencies.
// ============================================================================

var calcState = {
    activeTab: 'feetinch',
    areaMode: 'area', // 'area' or 'volume'
    feetInchReversed: false // false = ft-in→decimal, true = decimal→ft-in
};

function openCalc() {
    var overlay = document.getElementById('calcOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.add('hidden');
    var panel = document.getElementById('emergencyPanel');
    if (panel) panel.classList.add('hidden');
    calcState.activeTab = 'feetinch';
    renderCalcUI();
}

function closeCalc() {
    var overlay = document.getElementById('calcOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.remove('hidden');
}

function switchCalcTab(tab) {
    calcState.activeTab = tab;
    renderCalcUI();
}

function renderCalcUI() {
    var content = document.getElementById('calcContent');
    if (!content) return;

    // Tab bar
    var tabs = [
        { id: 'feetinch', label: 'Feet-Inch' },
        { id: 'areavol', label: 'Area/Volume' },
        { id: 'converter', label: 'Converter' }
    ];
    var html = '<div class="flex border-b border-slate-200 shrink-0">';
    for (var i = 0; i < tabs.length; i++) {
        var active = tabs[i].id === calcState.activeTab;
        html += '<button onclick="switchCalcTab(\'' + tabs[i].id + '\')" class="flex-1 py-3 text-xs font-bold uppercase tracking-wider ' +
            (active ? 'text-dot-blue border-b-2 border-dot-blue bg-white' : 'text-slate-400 bg-slate-50') + '">' +
            tabs[i].label + '</button>';
    }
    html += '</div>';

    // Tab content
    html += '<div class="flex-1 overflow-y-auto p-4">';
    if (calcState.activeTab === 'feetinch') html += renderFeetInchTab();
    else if (calcState.activeTab === 'areavol') html += renderAreaVolTab();
    else if (calcState.activeTab === 'converter') html += renderConverterTab();
    html += '</div>';

    content.innerHTML = html;
}

// ============ FEET-INCH TAB ============

function renderFeetInchTab() {
    var reversed = calcState.feetInchReversed;
    var fractions = ['0','1/16','1/8','3/16','1/4','5/16','3/8','7/16','1/2','9/16','5/8','11/16','3/4','13/16','7/8','15/16'];
    var opts = '';
    for (var i = 0; i < fractions.length; i++) {
        opts += '<option value="' + fractions[i] + '">' + fractions[i] + '</option>';
    }

    // Mode selector buttons (Converter-style)
    var html = '<div class="grid grid-cols-2 gap-2 mb-4">' +
        '<button onclick="toggleFeetInchMode(false)" class="flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ' +
            (!reversed ? 'border-dot-blue bg-dot-blue/10' : 'border-slate-200 bg-white active:bg-slate-50') + '" style="min-height:52px;">' +
            '<i class="fas fa-ruler text-lg ' + (!reversed ? 'text-dot-blue' : 'text-slate-400') + '"></i>' +
            '<div>' +
                '<p class="text-sm font-bold ' + (!reversed ? 'text-dot-blue' : 'text-slate-700') + '">Feet-Inches</p>' +
                '<p class="text-[10px] ' + (!reversed ? 'text-dot-blue/70' : 'text-slate-400') + '">To Decimal</p>' +
            '</div>' +
        '</button>' +
        '<button onclick="toggleFeetInchMode(true)" class="flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ' +
            (reversed ? 'border-dot-blue bg-dot-blue/10' : 'border-slate-200 bg-white active:bg-slate-50') + '" style="min-height:52px;">' +
            '<i class="fas fa-arrows-rotate text-lg ' + (reversed ? 'text-dot-blue' : 'text-slate-400') + '"></i>' +
            '<div>' +
                '<p class="text-sm font-bold ' + (reversed ? 'text-dot-blue' : 'text-slate-700') + '">Decimal Feet</p>' +
                '<p class="text-[10px] ' + (reversed ? 'text-dot-blue/70' : 'text-slate-400') + '">To Feet-Inches</p>' +
            '</div>' +
        '</button>' +
    '</div>';

    // Input card
    html += '<div class="bg-white rounded-lg border border-slate-200 p-4">';
    html += '<div class="flex items-center justify-between mb-3">' +
        '<p class="text-xs text-slate-500 font-bold uppercase tracking-wider">' +
            (reversed ? 'Decimal Feet \u2192 Feet-Inches' : 'Feet-Inches \u2192 Decimal') + '</p>' +
        '<button onclick="clearFeetInch()" class="text-xs text-slate-400 font-bold"><i class="fas fa-undo mr-1"></i>Clear</button>' +
    '</div>';

    if (!reversed) {
        // Feet + Inches + Fraction input
        html += '<div class="flex gap-2 mb-3">' +
            '<div class="flex-1"><label class="text-xs text-slate-500 uppercase mb-1 block">Feet</label>' +
            '<input type="number" id="calcFeet" oninput="calcFeetInch()" placeholder="0" class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold text-lg" style="min-height:52px;"></div>' +
            '<div class="flex-1"><label class="text-xs text-slate-500 uppercase mb-1 block">Inches</label>' +
            '<input type="number" id="calcInches" oninput="calcFeetInch()" placeholder="0" class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold text-lg" style="min-height:52px;"></div>' +
            '<div class="flex-1"><label class="text-xs text-slate-500 uppercase mb-1 block">Fraction</label>' +
            '<select id="calcFraction" onchange="calcFeetInch()" class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold text-lg" style="min-height:52px;">' + opts + '</select></div>' +
        '</div>';
    } else {
        // Single decimal feet input
        html += '<div class="mb-3">' +
            '<input type="number" id="calcDecFeet" oninput="calcDecimalFeet()" placeholder="Enter decimal feet" step="any" ' +
            'class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold text-lg" style="min-height:52px;">' +
        '</div>';
    }

    // Result display (Converter-style centered)
    html += '<div id="feetInchResult" class="text-center py-4 bg-slate-50 rounded-lg">' +
        '<p class="text-3xl font-bold text-slate-300">--</p>' +
        '<p class="text-sm text-slate-400 mt-1 font-medium">' + (reversed ? 'feet-inches' : 'decimal feet') + '</p>' +
    '</div>';

    // Secondary results
    html += '<div id="feetInchSecondary" class="mt-3 space-y-1"></div>';

    html += '</div>';
    return html;
}

function toggleFeetInchMode(reversed) {
    calcState.feetInchReversed = reversed;
    renderCalcUI();
    setTimeout(function() {
        var input = document.getElementById(reversed ? 'calcDecFeet' : 'calcFeet');
        if (input) input.focus();
    }, 50);
}

function calcFeetInch() {
    var ft = parseFloat(document.getElementById('calcFeet').value) || 0;
    var inc = parseFloat(document.getElementById('calcInches').value) || 0;
    var fracStr = document.getElementById('calcFraction').value;
    var frac = parseFraction(fracStr);

    var totalInches = (ft * 12) + inc + frac;
    var decFeet = totalInches / 12;
    var meters = decFeet * 0.3048;
    var cm = meters * 100;

    var resEl = document.getElementById('feetInchResult');
    var secEl = document.getElementById('feetInchSecondary');
    if (!resEl) return;

    if (ft === 0 && inc === 0 && frac === 0) {
        resEl.innerHTML = '<p class="text-3xl font-bold text-slate-300">--</p>' +
            '<p class="text-sm text-slate-400 mt-1 font-medium">decimal feet</p>';
        if (secEl) secEl.innerHTML = '';
        return;
    }

    resEl.innerHTML = '<p class="text-3xl font-bold text-dot-blue">' + decFeet.toFixed(4) + ' ft</p>' +
        '<p class="text-sm text-slate-500 mt-1 font-medium">decimal feet</p>';

    if (secEl) {
        secEl.innerHTML = resultRow('Decimal Inches', totalInches.toFixed(4) + '"') +
            resultRow('Meters', meters.toFixed(4) + ' m') +
            resultRow('Centimeters', cm.toFixed(2) + ' cm');
    }
}

function calcDecimalFeet() {
    var dec = parseFloat(document.getElementById('calcDecFeet').value) || 0;
    var totalInches = dec * 12;
    var wholeFeet = Math.floor(dec);
    var remInches = totalInches - (wholeFeet * 12);
    var wholeInches = Math.floor(remInches);
    var fracInches = remInches - wholeInches;

    var fracStr = toNearestFraction(fracInches);
    var display = wholeFeet + "' " + wholeInches;
    if (fracStr !== '0') display += '-' + fracStr;
    display += '"';

    var meters = dec * 0.3048;

    var resEl = document.getElementById('feetInchResult');
    var secEl = document.getElementById('feetInchSecondary');
    if (!resEl) return;

    var input = document.getElementById('calcDecFeet');
    if (!input || input.value.trim() === '') {
        resEl.innerHTML = '<p class="text-3xl font-bold text-slate-300">--</p>' +
            '<p class="text-sm text-slate-400 mt-1 font-medium">feet-inches</p>';
        if (secEl) secEl.innerHTML = '';
        return;
    }

    resEl.innerHTML = '<p class="text-3xl font-bold text-dot-blue">' + display + '</p>' +
        '<p class="text-sm text-slate-500 mt-1 font-medium">feet-inches</p>';

    if (secEl) {
        secEl.innerHTML = resultRow('Decimal Inches', totalInches.toFixed(4) + '"') +
            resultRow('Meters', meters.toFixed(4) + ' m') +
            resultRow('Centimeters', (meters * 100).toFixed(2) + ' cm');
    }
}

function parseFraction(str) {
    if (!str || str === '0') return 0;
    var parts = str.split('/');
    if (parts.length === 2) return parseFloat(parts[0]) / parseFloat(parts[1]);
    return parseFloat(str) || 0;
}

function toNearestFraction(val) {
    var sixteenths = Math.round(val * 16);
    if (sixteenths === 0) return '0';
    if (sixteenths === 16) return '0'; // rolled over
    var num = sixteenths;
    var den = 16;
    while (num % 2 === 0 && den > 1) { num /= 2; den /= 2; }
    return num + '/' + den;
}

function resultRow(label, value) {
    return '<div class="flex justify-between items-center py-2 border-b border-slate-100">' +
        '<span class="text-xs text-slate-500 uppercase">' + label + '</span>' +
        '<span class="text-sm font-bold text-slate-700">' + value + '</span></div>';
}

// ============ AREA/VOLUME TAB ============

function renderAreaVolTab() {
    var areaActive = calcState.areaMode === 'area';

    // Mode selector buttons (Converter-style)
    var html = '<div class="grid grid-cols-2 gap-2 mb-4">' +
        '<button onclick="setAreaMode(\'area\')" class="flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ' +
            (areaActive ? 'border-dot-blue bg-dot-blue/10' : 'border-slate-200 bg-white active:bg-slate-50') + '" style="min-height:52px;">' +
            '<i class="fas fa-vector-square text-lg ' + (areaActive ? 'text-dot-blue' : 'text-slate-400') + '"></i>' +
            '<div>' +
                '<p class="text-sm font-bold ' + (areaActive ? 'text-dot-blue' : 'text-slate-700') + '">Area</p>' +
                '<p class="text-[10px] ' + (areaActive ? 'text-dot-blue/70' : 'text-slate-400') + '">L \u00D7 W</p>' +
            '</div>' +
        '</button>' +
        '<button onclick="setAreaMode(\'volume\')" class="flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ' +
            (!areaActive ? 'border-dot-blue bg-dot-blue/10' : 'border-slate-200 bg-white active:bg-slate-50') + '" style="min-height:52px;">' +
            '<i class="fas fa-cube text-lg ' + (!areaActive ? 'text-dot-blue' : 'text-slate-400') + '"></i>' +
            '<div>' +
                '<p class="text-sm font-bold ' + (!areaActive ? 'text-dot-blue' : 'text-slate-700') + '">Volume</p>' +
                '<p class="text-[10px] ' + (!areaActive ? 'text-dot-blue/70' : 'text-slate-400') + '">L \u00D7 W \u00D7 D</p>' +
            '</div>' +
        '</button>' +
    '</div>';

    // Dimensions card
    html += '<div class="bg-white rounded-lg border border-slate-200 p-4 mb-4">' +
        '<div class="flex items-center justify-between mb-3">' +
            '<p class="text-xs text-slate-500 font-bold uppercase tracking-wider">Dimensions</p>' +
            '<button onclick="clearAreaVol()" class="text-xs text-slate-400 font-bold"><i class="fas fa-undo mr-1"></i>Clear</button>' +
        '</div>' +
        '<div class="space-y-3">' +
            dimInput('Length', 'avLength', 'calcAreaVol()') +
            dimInput('Width', 'avWidth', 'calcAreaVol()') +
            (calcState.areaMode === 'volume' ? dimInput('Depth', 'avDepth', 'calcAreaVol()') : '') +
        '</div>' +
    '</div>';

    // Result display (Converter-style centered)
    html += '<div id="areaVolResults" class="bg-white rounded-lg border border-slate-200 p-4 mb-4">' +
        '<div class="text-center py-4 bg-slate-50 rounded-lg">' +
            '<p class="text-3xl font-bold text-slate-300">--</p>' +
            '<p class="text-sm text-slate-400 mt-1 font-medium">' + (areaActive ? 'square feet' : 'cubic feet') + '</p>' +
        '</div>' +
        '<div id="areaVolSecondary" class="mt-3 space-y-1"></div>' +
    '</div>';

    // Concrete Calculator (Volume mode only)
    if (calcState.areaMode === 'volume') {
        html += '<div class="bg-white rounded-lg border border-slate-200 p-4">' +
            '<p class="text-xs text-slate-500 font-bold uppercase tracking-wider mb-3"><i class="fas fa-cube mr-1"></i> Concrete Calculator</p>' +
            '<div class="space-y-3">' +
                dimInput('Length', 'concLength', 'calcConcrete()') +
                dimInput('Width', 'concWidth', 'calcConcrete()') +
                '<div><label class="text-xs text-slate-500 uppercase mb-1 block">Depth (inches)</label>' +
                '<input type="number" id="concDepthIn" oninput="calcConcrete()" placeholder="4" class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold text-lg" style="min-height:52px;"></div>' +
            '</div>' +
            '<label class="flex items-center gap-2 mt-3 cursor-pointer"><input type="checkbox" id="concWaste" checked onchange="calcConcrete()" class="w-5 h-5 rounded">' +
                '<span class="text-xs text-slate-500">Include 10% waste factor</span></label>' +
            '<div id="concreteResults" class="mt-3">' +
                '<div class="text-center py-4 bg-slate-50 rounded-lg">' +
                    '<p class="text-3xl font-bold text-slate-300">--</p>' +
                    '<p class="text-sm text-slate-400 mt-1 font-medium">cubic yards</p>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    return html;
}

function dimInput(label, id, oninputFn) {
    var handler = oninputFn ? ' oninput="' + oninputFn + '"' : '';
    return '<div class="flex gap-2">' +
        '<div class="flex-1"><label class="text-xs text-slate-500 uppercase mb-1 block">' + label + ' (ft)</label>' +
        '<input type="number" id="' + id + 'Ft" placeholder="0"' + handler + ' class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold text-lg" style="min-height:52px;"></div>' +
        '<div class="w-20"><label class="text-xs text-slate-500 uppercase mb-1 block">In</label>' +
        '<input type="number" id="' + id + 'In" placeholder="0"' + handler + ' class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold text-lg" style="min-height:52px;"></div>' +
    '</div>';
}

function getDimValue(id) {
    var ft = parseFloat(document.getElementById(id + 'Ft').value) || 0;
    var inc = parseFloat(document.getElementById(id + 'In').value) || 0;
    return ft + (inc / 12);
}

function setAreaMode(mode) {
    calcState.areaMode = mode;
    renderCalcUI();
}

function calcAreaVol() {
    var l = getDimValue('avLength');
    var w = getDimValue('avWidth');
    var el = document.getElementById('areaVolResults');
    if (!el) return;

    if (l === 0 && w === 0) {
        el.innerHTML = '<div class="text-center py-4 bg-slate-50 rounded-lg">' +
            '<p class="text-3xl font-bold text-slate-300">--</p>' +
            '<p class="text-sm text-slate-400 mt-1 font-medium">' + (calcState.areaMode === 'area' ? 'square feet' : 'cubic feet') + '</p>' +
        '</div><div id="areaVolSecondary" class="mt-3 space-y-1"></div>';
        return;
    }

    if (calcState.areaMode === 'area') {
        var sqft = l * w;
        var sqyd = sqft / 9;
        var acres = sqft / 43560;
        var sqm = sqft * 0.092903;
        el.innerHTML = '<div class="text-center py-4 bg-slate-50 rounded-lg">' +
            '<p class="text-3xl font-bold text-dot-blue">' + numberFmt(sqft) + ' sq ft</p>' +
            '<p class="text-sm text-slate-500 mt-1 font-medium">square feet</p>' +
        '</div>' +
        '<div id="areaVolSecondary" class="mt-3 space-y-1">' +
            resultRow('Square Yards', numberFmt(sqyd) + ' sq yd') +
            resultRow('Acres', acres.toFixed(4)) +
            resultRow('Square Meters', numberFmt(sqm) + ' sq m') +
        '</div>';
    } else {
        var d = getDimValue('avDepth');
        var cuft = l * w * d;
        var cuyd = cuft / 27;
        var cum = cuft * 0.0283168;
        el.innerHTML = '<div class="text-center py-4 bg-slate-50 rounded-lg">' +
            '<p class="text-3xl font-bold text-dot-blue">' + numberFmt(cuft) + ' cu ft</p>' +
            '<p class="text-sm text-slate-500 mt-1 font-medium">cubic feet</p>' +
        '</div>' +
        '<div id="areaVolSecondary" class="mt-3 space-y-1">' +
            resultRow('Cubic Yards', numberFmt(cuyd) + ' cu yd') +
            resultRow('Cubic Meters', numberFmt(cum) + ' cu m') +
        '</div>';
    }
}

function calcConcrete() {
    var l = getDimValue('concLength');
    var w = getDimValue('concWidth');
    var depthIn = parseFloat(document.getElementById('concDepthIn').value) || 0;
    var depthFt = depthIn / 12;
    var cuft = l * w * depthFt;
    var cuyd = cuft / 27;
    var waste = document.getElementById('concWaste').checked;
    var total = waste ? cuyd * 1.10 : cuyd;

    var el = document.getElementById('concreteResults');
    if (!el) return;

    if (l === 0 && w === 0 && depthIn === 0) {
        el.innerHTML = '<div class="text-center py-4 bg-slate-50 rounded-lg">' +
            '<p class="text-3xl font-bold text-slate-300">--</p>' +
            '<p class="text-sm text-slate-400 mt-1 font-medium">cubic yards</p>' +
        '</div>';
        return;
    }

    var orderYd = Math.ceil(total * 2) / 2;
    el.innerHTML = '<div class="text-center py-4 bg-slate-50 rounded-lg">' +
        '<p class="text-3xl font-bold text-dot-blue">' + orderYd + ' yd\u00B3</p>' +
        '<p class="text-sm text-slate-500 mt-1 font-medium">order quantity (nearest \u00BD yard)</p>' +
    '</div>' +
    '<div class="mt-3 space-y-1">' +
        resultRow('Volume', numberFmt(cuft) + ' cu ft') +
        resultRow('Cubic Yards', cuyd.toFixed(2) + ' yd\u00B3') +
        (waste ? resultRow('With 10% Waste', total.toFixed(2) + ' yd\u00B3') : '') +
    '</div>';
}

function numberFmt(n) {
    return n < 10 ? n.toFixed(2) : n < 1000 ? n.toFixed(1) : Math.round(n).toLocaleString();
}

function clearFeetInch() {
    if (calcState.feetInchReversed) {
        var el = document.getElementById('calcDecFeet'); if (el) { el.value = ''; el.focus(); }
        calcDecimalFeet();
    } else {
        var ids = ['calcFeet', 'calcInches'];
        for (var i = 0; i < ids.length; i++) { var el = document.getElementById(ids[i]); if (el) el.value = ''; }
        var sel = document.getElementById('calcFraction'); if (sel) sel.selectedIndex = 0;
        var resEl = document.getElementById('feetInchResult');
        if (resEl) resEl.innerHTML = '<p class="text-3xl font-bold text-slate-300">--</p>' +
            '<p class="text-sm text-slate-400 mt-1 font-medium">decimal feet</p>';
        var secEl = document.getElementById('feetInchSecondary'); if (secEl) secEl.innerHTML = '';
        var ft = document.getElementById('calcFeet'); if (ft) ft.focus();
    }
}

function clearAreaVol() {
    var ids = ['avLengthFt','avLengthIn','avWidthFt','avWidthIn','avDepthFt','avDepthIn'];
    for (var i = 0; i < ids.length; i++) { var el = document.getElementById(ids[i]); if (el) el.value = ''; }
    var res = document.getElementById('areaVolResults');
    if (res) {
        var unit = calcState.areaMode === 'area' ? 'square feet' : 'cubic feet';
        res.innerHTML = '<div class="text-center py-4 bg-slate-50 rounded-lg">' +
            '<p class="text-3xl font-bold text-slate-300">--</p>' +
            '<p class="text-sm text-slate-400 mt-1 font-medium">' + unit + '</p>' +
        '</div><div id="areaVolSecondary" class="mt-3 space-y-1"></div>';
    }
}

// ============ CONVERTER TAB ============
// Grid-based pair picker with live conversion card.
// All 8 pairs visible as large tappable buttons (44px+).

var converterPairs = [
    { label: 'ft \u2194 m', name: 'Length', icon: 'fa-ruler', from: 'ft', to: 'm', fwd: function(v){return v*0.3048;}, rev: function(v){return v/0.3048;} },
    { label: 'in \u2194 mm', name: 'Inches', icon: 'fa-ruler-horizontal', from: 'in', to: 'mm', fwd: function(v){return v*25.4;}, rev: function(v){return v/25.4;} },
    { label: 'sq ft \u2194 sq m', name: 'Area', icon: 'fa-vector-square', from: 'sq ft', to: 'sq m', fwd: function(v){return v*0.092903;}, rev: function(v){return v/0.092903;} },
    { label: 'cu yd \u2194 cu m', name: 'Volume', icon: 'fa-cube', from: 'cu yd', to: 'cu m', fwd: function(v){return v*0.764555;}, rev: function(v){return v/0.764555;} },
    { label: 'lb \u2194 kg', name: 'Weight', icon: 'fa-weight-hanging', from: 'lb', to: 'kg', fwd: function(v){return v*0.453592;}, rev: function(v){return v/0.453592;} },
    { label: 'PSI \u2194 MPa', name: 'Pressure', icon: 'fa-gauge-high', from: 'psi', to: 'MPa', fwd: function(v){return v*0.00689476;}, rev: function(v){return v/0.00689476;} },
    { label: 'gal \u2194 L', name: 'Liquid', icon: 'fa-droplet', from: 'gal', to: 'L', fwd: function(v){return v*3.78541;}, rev: function(v){return v/3.78541;} },
    { label: '\u00B0F \u2194 \u00B0C', name: 'Temp', icon: 'fa-temperature-half', from: '\u00B0F', to: '\u00B0C', fwd: function(v){return (v-32)*5/9;}, rev: function(v){return v*9/5+32;} }
];

var convSelectedIdx = -1;
var convReversed = false;

function renderConverterTab() {
    // 2×4 grid of all conversion pairs
    var html = '<div class="grid grid-cols-2 gap-2 mb-4">';
    for (var i = 0; i < converterPairs.length; i++) {
        var p = converterPairs[i];
        var sel = i === convSelectedIdx;
        html += '<button onclick="selectConvPair(' + i + ')" class="flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ' +
            (sel ? 'border-dot-blue bg-dot-blue/10' : 'border-slate-200 bg-white active:bg-slate-50') + '" style="min-height:52px;">' +
            '<i class="fas ' + p.icon + ' text-lg ' + (sel ? 'text-dot-blue' : 'text-slate-400') + '"></i>' +
            '<div>' +
                '<p class="text-sm font-bold ' + (sel ? 'text-dot-blue' : 'text-slate-700') + '">' + p.label + '</p>' +
                '<p class="text-[10px] ' + (sel ? 'text-dot-blue/70' : 'text-slate-400') + '">' + p.name + '</p>' +
            '</div>' +
        '</button>';
    }
    html += '</div>';

    // Conversion card (shown when a pair is selected)
    if (convSelectedIdx >= 0) {
        var pair = converterPairs[convSelectedIdx];
        var fromUnit = convReversed ? pair.to : pair.from;
        var toUnit = convReversed ? pair.from : pair.to;

        html += '<div class="bg-white rounded-lg border border-slate-200 p-4">' +
            '<div class="flex items-center justify-between mb-3">' +
                '<p class="text-xs text-slate-500 font-bold uppercase tracking-wider">' + fromUnit + ' \u2192 ' + toUnit + '</p>' +
                '<button onclick="clearConv()" class="text-xs text-slate-400 font-bold"><i class="fas fa-undo mr-1"></i>Clear</button>' +
            '</div>' +
            '<div class="flex items-center gap-2 mb-3">' +
                '<div class="flex-1">' +
                    '<input type="number" id="convInput" oninput="doConvert()" placeholder="Enter ' + fromUnit + '" step="any" ' +
                    'class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold text-lg" style="min-height:44px;">' +
                '</div>' +
                '<button onclick="swapConvert()" class="w-11 h-11 min-w-[44px] min-h-[44px] bg-dot-blue rounded-full flex items-center justify-center text-white shadow-sm active:bg-dot-navy">' +
                    '<i class="fas fa-arrows-rotate"></i></button>' +
            '</div>' +
            '<div id="convResult" class="text-center py-4 bg-slate-50 rounded-lg">' +
                '<p class="text-3xl font-bold text-slate-300">--</p>' +
                '<p class="text-sm text-slate-400 mt-1 font-medium">' + toUnit + '</p>' +
            '</div>' +
        '</div>';
    } else {
        html += '<div class="text-center py-8">' +
            '<i class="fas fa-arrow-pointer text-2xl text-slate-300 mb-2 block"></i>' +
            '<p class="text-sm text-slate-400">Tap a conversion above</p>' +
        '</div>';
    }

    return html;
}

function selectConvPair(idx) {
    if (idx === convSelectedIdx) return;
    convSelectedIdx = idx;
    convReversed = false;
    renderCalcUI();
    setTimeout(function() {
        var input = document.getElementById('convInput');
        if (input) input.focus();
    }, 50);
}

function doConvert() {
    if (convSelectedIdx < 0) return;
    var input = document.getElementById('convInput');
    var resEl = document.getElementById('convResult');
    if (!input || !resEl) return;

    var pair = converterPairs[convSelectedIdx];
    var val = parseFloat(input.value);
    var toUnit = convReversed ? pair.from : pair.to;

    if (isNaN(val) || input.value.trim() === '') {
        resEl.innerHTML = '<p class="text-3xl font-bold text-slate-300">--</p>' +
            '<p class="text-sm text-slate-400 mt-1 font-medium">' + toUnit + '</p>';
        return;
    }

    var result = convReversed ? pair.rev(val) : pair.fwd(val);
    resEl.innerHTML = '<p class="text-3xl font-bold text-dot-blue">' + formatConvResult(result) + '</p>' +
        '<p class="text-sm text-slate-500 mt-1 font-medium">' + toUnit + '</p>';
}

function swapConvert() {
    var input = document.getElementById('convInput');
    var savedVal = input ? input.value : '';
    convReversed = !convReversed;
    renderCalcUI();
    setTimeout(function() {
        var inp = document.getElementById('convInput');
        if (inp) {
            inp.value = savedVal;
            inp.focus();
            doConvert();
        }
    }, 50);
}

function clearConv() {
    var input = document.getElementById('convInput');
    if (input) { input.value = ''; input.focus(); }
    doConvert();
}

function formatConvResult(v) {
    if (Math.abs(v) < 0.001 && v !== 0) return v.toExponential(3);
    if (Math.abs(v) < 1) return v.toFixed(4);
    if (Math.abs(v) < 100) return v.toFixed(3);
    if (Math.abs(v) < 10000) return v.toFixed(2);
    return Math.round(v).toLocaleString();
}
