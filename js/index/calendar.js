(function() {
    var panel = document.getElementById('calendarPanel');
    var grid = document.getElementById('calendarGrid');
    var rendered = false;
    var origToggle = window.togglePanel;
    // Render calendar on first open
    var observer = new MutationObserver(function() {
        if (!panel.classList.contains('hidden') && !rendered) {
            rendered = true;
            renderCalendarGrid();
        }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });

    function renderCalendarGrid() {
        var now = new Date();
        var year = now.getFullYear();
        var month = now.getMonth();
        var today = now.getDate();
        var firstDay = new Date(year, month, 1).getDay();
        var daysInMonth = new Date(year, month + 1, 0).getDate();
        var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

        var html = '<p class="text-sm font-bold text-slate-800 text-center mb-3">' + monthNames[month] + ' ' + year + '</p>';
        html += '<div class="grid grid-cols-7 gap-1 text-center">';
        var days = ['Su','Mo','Tu','We','Th','Fr','Sa'];
        for (var d = 0; d < 7; d++) {
            html += '<div class="text-[10px] text-slate-400 font-bold py-1">' + days[d] + '</div>';
        }
        for (var i = 0; i < firstDay; i++) {
            html += '<div></div>';
        }
        for (var day = 1; day <= daysInMonth; day++) {
            var isToday = day === today;
            html += '<div class="py-1.5 text-xs font-medium rounded ' +
                (isToday ? 'bg-dot-orange text-white font-bold' : 'text-slate-600') + '">' + day + '</div>';
        }
        html += '</div>';
        grid.innerHTML = html;
    }
})();
