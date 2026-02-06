// ============================================================================
// FieldVoice Pro - Construction Calculator (calc.js)
//
// Tabs: Feet-Inch | Area/Volume | Converter
// All calculations offline, no dependencies.
// ============================================================================

var calcState = {
    activeTab: 'feetinch',
    areaMode: 'area' // 'area' or 'volume'
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
    var fractions = ['0','1/16','1/8','3/16','1/4','5/16','3/8','7/16','1/2','9/16','5/8','11/16','3/4','13/16','7/8','15/16'];
    var opts = '';
    for (var i = 0; i < fractions.length; i++) {
        opts += '<option value="' + fractions[i] + '">' + fractions[i] + '</option>';
    }

    return '<div class="bg-white rounded-lg border border-slate-200 p-4 mb-4">' +
        '<div class="flex items-center justify-between mb-3">' +
            '<p class="text-xs text-slate-500 font-bold uppercase tracking-wider">Feet &amp; Inches Input</p>' +
            '<button onclick="clearFeetInch()" class="text-xs text-slate-400 font-bold"><i class="fas fa-undo mr-1"></i>Clear</button>' +
        '</div>' +
        '<div class="flex gap-2 mb-3">' +
            '<div class="flex-1"><label class="text-xs text-slate-500 uppercase mb-1 block">Feet</label>' +
            '<input type="number" id="calcFeet" oninput="calcFeetInch()" placeholder="0" class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold" style="min-height:44px;"></div>' +
            '<div class="flex-1"><label class="text-xs text-slate-500 uppercase mb-1 block">Inches</label>' +
            '<input type="number" id="calcInches" oninput="calcFeetInch()" placeholder="0" class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold" style="min-height:44px;"></div>' +
            '<div class="flex-1"><label class="text-xs text-slate-500 uppercase mb-1 block">Fraction</label>' +
            '<select id="calcFraction" onchange="calcFeetInch()" class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold" style="min-height:44px;">' + opts + '</select></div>' +
        '</div>' +
        '<div id="feetInchResults" class="space-y-2"></div>' +
    '</div>' +
    '<div class="bg-white rounded-lg border border-slate-200 p-4">' +
        '<div class="flex items-center justify-between mb-3">' +
            '<p class="text-xs text-slate-500 font-bold uppercase tracking-wider">Decimal Feet Input</p>' +
            '<button onclick="clearDecFeet()" class="text-xs text-slate-400 font-bold"><i class="fas fa-undo mr-1"></i>Clear</button>' +
        '</div>' +
        '<div class="mb-3"><label class="text-xs text-slate-500 uppercase mb-1 block">Decimal Feet</label>' +
        '<input type="number" id="calcDecFeet" oninput="calcDecimalFeet()" placeholder="0.000" step="0.001" class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold" style="min-height:44px;"></div>' +
        '<div id="decFeetResults" class="space-y-2"></div>' +
    '</div>';
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

    var el = document.getElementById('feetInchResults');
    if (!el) return;
    el.innerHTML = resultRow('Decimal Feet', decFeet.toFixed(4) + ' ft') +
        resultRow('Decimal Inches', totalInches.toFixed(4) + '"') +
        resultRow('Meters', meters.toFixed(4) + ' m') +
        resultRow('Centimeters', cm.toFixed(2) + ' cm');
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

    var el = document.getElementById('decFeetResults');
    if (!el) return;
    el.innerHTML = resultRow('Feet-Inches', display) +
        resultRow('Decimal Inches', totalInches.toFixed(4) + '"') +
        resultRow('Meters', meters.toFixed(4) + ' m') +
        resultRow('Centimeters', (meters * 100).toFixed(2) + ' cm');
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
    // Simplify
    var num = sixteenths;
    var den = 16;
    while (num % 2 === 0 && den > 1) { num /= 2; den /= 2; }
    return num + '/' + den;
}

function resultRow(label, value) {
    return '<div class="flex justify-between items-center py-2 border-b border-slate-100">' +
        '<span class="text-xs text-slate-500 uppercase">' + label + '</span>' +
        '<span class="text-xl font-bold text-slate-800">' + value + '</span></div>';
}

// ============ AREA/VOLUME TAB ============

function renderAreaVolTab() {
    var areaActive = calcState.areaMode === 'area';
    return '<div class="flex gap-2 mb-4">' +
        '<button onclick="setAreaMode(\'area\')" class="flex-1 py-3 rounded-lg font-bold text-sm ' +
            (areaActive ? 'bg-dot-blue text-white' : 'bg-slate-100 text-slate-500') + '" style="min-height:44px;">Area</button>' +
        '<button onclick="setAreaMode(\'volume\')" class="flex-1 py-3 rounded-lg font-bold text-sm ' +
            (!areaActive ? 'bg-dot-blue text-white' : 'bg-slate-100 text-slate-500') + '" style="min-height:44px;">Volume</button>' +
    '</div>' +
    '<div class="bg-white rounded-lg border border-slate-200 p-4 mb-4">' +
        '<div class="flex items-center justify-between mb-3">' +
            '<p class="text-xs text-slate-500 font-bold uppercase tracking-wider">Dimensions</p>' +
            '<button onclick="clearAreaVol()" class="text-xs text-slate-400 font-bold"><i class="fas fa-undo mr-1"></i>Clear</button>' +
        '</div>' +
        '<div class="space-y-3">' +
            dimInput('Length', 'avLength', 'calcAreaVol()') +
            dimInput('Width', 'avWidth', 'calcAreaVol()') +
            (calcState.areaMode === 'volume' ? dimInput('Depth', 'avDepth', 'calcAreaVol()') : '') +
        '</div>' +
    '</div>' +
    '<div id="areaVolResults" class="bg-white rounded-lg border border-slate-200 p-4 mb-4"><p class="text-sm text-slate-400 text-center">Enter dimensions to calculate</p></div>' +
    (calcState.areaMode === 'volume' ?
        '<div class="bg-white rounded-lg border border-slate-200 p-4">' +
            '<p class="text-xs text-slate-500 font-bold uppercase tracking-wider mb-3"><i class="fas fa-cube mr-1"></i> Concrete Calculator</p>' +
            '<div class="space-y-3">' +
                dimInput('Length', 'concLength') +
                dimInput('Width', 'concWidth') +
                '<div><label class="text-xs text-slate-500 uppercase mb-1 block">Depth (inches)</label>' +
                '<input type="number" id="concDepthIn" placeholder="4" class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold" style="min-height:44px;"></div>' +
            '</div>' +
            '<label class="flex items-center gap-2 mt-3 cursor-pointer"><input type="checkbox" id="concWaste" checked class="w-5 h-5 rounded">' +
                '<span class="text-xs text-slate-500">Include 10% waste factor</span></label>' +
            '<button onclick="calcConcrete()" class="w-full py-3 bg-dot-orange text-white font-bold rounded-lg text-sm mt-3" style="min-height:44px;"><i class="fas fa-calculator mr-2"></i>Concrete Yards</button>' +
            '<div id="concreteResults" class="mt-3"></div>' +
        '</div>' : '');
}

function dimInput(label, id, oninputFn) {
    var handler = oninputFn ? ' oninput="' + oninputFn + '"' : '';
    return '<div class="flex gap-2">' +
        '<div class="flex-1"><label class="text-xs text-slate-500 uppercase mb-1 block">' + label + ' (ft)</label>' +
        '<input type="number" id="' + id + 'Ft" placeholder="0"' + handler + ' class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold" style="min-height:44px;"></div>' +
        '<div class="w-20"><label class="text-xs text-slate-500 uppercase mb-1 block">In</label>' +
        '<input type="number" id="' + id + 'In" placeholder="0"' + handler + ' class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold" style="min-height:44px;"></div>' +
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

    if (calcState.areaMode === 'area') {
        var sqft = l * w;
        var sqyd = sqft / 9;
        var acres = sqft / 43560;
        var sqm = sqft * 0.092903;
        el.innerHTML = resultRow('Square Feet', numberFmt(sqft) + ' sq ft') +
            resultRow('Square Yards', numberFmt(sqyd) + ' sq yd') +
            resultRow('Acres', acres.toFixed(4)) +
            resultRow('Square Meters', numberFmt(sqm) + ' sq m');
    } else {
        var d = getDimValue('avDepth');
        var cuft = l * w * d;
        var cuyd = cuft / 27;
        var cum = cuft * 0.0283168;
        el.innerHTML = resultRow('Cubic Feet', numberFmt(cuft) + ' cu ft') +
            resultRow('Cubic Yards', numberFmt(cuyd) + ' cu yd') +
            resultRow('Cubic Meters', numberFmt(cum) + ' cu m');
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
    el.innerHTML = resultRow('Volume', numberFmt(cuft) + ' cu ft') +
        resultRow('Cubic Yards', cuyd.toFixed(2) + ' yd\u00B3') +
        (waste ? resultRow('With 10% Waste', total.toFixed(2) + ' yd\u00B3') : '') +
        '<div class="mt-2 p-3 bg-dot-blue/10 rounded-lg text-center">' +
            '<span class="text-2xl font-bold text-dot-blue">Order: ' + Math.ceil(total * 2) / 2 + ' yd\u00B3</span>' +
            '<p class="text-xs text-slate-500 mt-1">Rounded up to nearest \u00BD yard</p></div>';
}

function numberFmt(n) {
    return n < 10 ? n.toFixed(2) : n < 1000 ? n.toFixed(1) : Math.round(n).toLocaleString();
}

function clearFeetInch() {
    var ids = ['calcFeet', 'calcInches'];
    for (var i = 0; i < ids.length; i++) { var el = document.getElementById(ids[i]); if (el) el.value = ''; }
    var sel = document.getElementById('calcFraction'); if (sel) sel.selectedIndex = 0;
    var res = document.getElementById('feetInchResults'); if (res) res.innerHTML = '';
}

function clearDecFeet() {
    var el = document.getElementById('calcDecFeet'); if (el) el.value = '';
    var res = document.getElementById('decFeetResults'); if (res) res.innerHTML = '';
}

function clearAreaVol() {
    var ids = ['avLengthFt','avLengthIn','avWidthFt','avWidthIn','avDepthFt','avDepthIn'];
    for (var i = 0; i < ids.length; i++) { var el = document.getElementById(ids[i]); if (el) el.value = ''; }
    var res = document.getElementById('areaVolResults');
    if (res) res.innerHTML = '<p class="text-sm text-slate-400 text-center">Enter dimensions to calculate</p>';
}

// ============ CONVERTER TAB ============

var converterPairs = [
    { label: 'Feet \u2194 Meters', from: 'ft', to: 'm', fwd: function(v){return v*0.3048;}, rev: function(v){return v/0.3048;} },
    { label: 'Inches \u2194 Millimeters', from: 'in', to: 'mm', fwd: function(v){return v*25.4;}, rev: function(v){return v/25.4;} },
    { label: 'Sq Feet \u2194 Sq Meters', from: 'sq ft', to: 'sq m', fwd: function(v){return v*0.092903;}, rev: function(v){return v/0.092903;} },
    { label: 'Cu Yards \u2194 Cu Meters', from: 'cu yd', to: 'cu m', fwd: function(v){return v*0.764555;}, rev: function(v){return v/0.764555;} },
    { label: 'Pounds \u2194 Kilograms', from: 'lb', to: 'kg', fwd: function(v){return v*0.453592;}, rev: function(v){return v/0.453592;} },
    { label: 'PSI \u2194 MPa', from: 'psi', to: 'MPa', fwd: function(v){return v*0.00689476;}, rev: function(v){return v/0.00689476;} },
    { label: 'Gallons \u2194 Liters', from: 'gal', to: 'L', fwd: function(v){return v*3.78541;}, rev: function(v){return v/3.78541;} },
    { label: 'Fahrenheit \u2194 Celsius', from: '\u00B0F', to: '\u00B0C', fwd: function(v){return (v-32)*5/9;}, rev: function(v){return v*9/5+32;} }
];

function renderConverterTab() {
    var opts = '';
    for (var i = 0; i < converterPairs.length; i++) {
        opts += '<option value="' + i + '">' + converterPairs[i].label + '</option>';
    }

    return '<div class="bg-white rounded-lg border border-slate-200 p-4">' +
        '<div class="mb-4"><label class="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 block">Conversion</label>' +
        '<select id="convType" onchange="doConvert()" class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold" style="min-height:44px;">' + opts + '</select></div>' +
        '<div class="mb-4"><label class="text-xs text-slate-500 uppercase mb-1 block" id="convFromLabel">Value</label>' +
        '<input type="number" id="convInput" oninput="doConvert()" placeholder="0" step="any" class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold text-lg" style="min-height:44px;"></div>' +
        '<div class="flex items-center justify-center my-3"><button onclick="swapConvert()" class="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400"><i class="fas fa-arrows-rotate"></i></button></div>' +
        '<div id="convResult" class="text-center py-4">' +
            '<p class="text-3xl font-bold text-slate-800">--</p>' +
            '<p class="text-xs text-slate-500 mt-1" id="convToLabel"></p></div>' +
    '</div>';
}

var convReversed = false;

function doConvert() {
    var sel = document.getElementById('convType');
    var input = document.getElementById('convInput');
    var resEl = document.getElementById('convResult');
    if (!sel || !input || !resEl) return;

    var idx = parseInt(sel.value);
    var pair = converterPairs[idx];
    var val = parseFloat(input.value);

    var fromLabel = document.getElementById('convFromLabel');
    var toLabel = document.getElementById('convToLabel');

    var fromUnit = convReversed ? pair.to : pair.from;
    var toUnit = convReversed ? pair.from : pair.to;
    if (fromLabel) fromLabel.textContent = 'Value (' + fromUnit + ')';

    if (isNaN(val)) {
        resEl.innerHTML = '<p class="text-3xl font-bold text-slate-800">--</p><p class="text-xs text-slate-500 mt-1">' + toUnit + '</p>';
        return;
    }

    var result = convReversed ? pair.rev(val) : pair.fwd(val);
    resEl.innerHTML = '<p class="text-3xl font-bold text-slate-800">' + formatConvResult(result) + '</p>' +
        '<p class="text-xs text-slate-500 mt-1">' + toUnit + '</p>';
}

function swapConvert() {
    convReversed = !convReversed;
    doConvert();
}

function formatConvResult(v) {
    if (Math.abs(v) < 0.001 && v !== 0) return v.toExponential(3);
    if (Math.abs(v) < 1) return v.toFixed(4);
    if (Math.abs(v) < 100) return v.toFixed(3);
    if (Math.abs(v) < 10000) return v.toFixed(2);
    return Math.round(v).toLocaleString();
}
