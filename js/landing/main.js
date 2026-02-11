// Voice Recording Demo
const demoMicBtn = document.getElementById('demoMicBtn');
const demoMicIcon = document.getElementById('demoMicIcon');
const voiceWaveDemo = document.getElementById('voiceWaveDemo');
const transcriptionOutput = document.getElementById('transcriptionOutput');

const demoText = "Arrived on site at 7:30 AM. ABC Concrete had 6 workers pouring the east abutment. Weather was clear, about 74 degrees. Noticed some minor honeycombing on yesterday's pour that will need patching per DOT specifications.";
let isRecording = false;
let transcriptionIndex = 0;
let transcriptionInterval = null;

demoMicBtn.addEventListener('click', function() {
    if (!isRecording) {
        // Start recording simulation
        isRecording = true;
        demoMicBtn.classList.add('recording');
        demoMicIcon.className = 'fas fa-stop text-white text-3xl';
        voiceWaveDemo.classList.remove('hidden');
        transcriptionOutput.innerHTML = '<span class="typing-cursor"></span>';
        transcriptionIndex = 0;

        transcriptionInterval = setInterval(function() {
            if (transcriptionIndex < demoText.length) {
                const currentText = demoText.substring(0, transcriptionIndex + 1);
                transcriptionOutput.innerHTML = currentText + '<span class="typing-cursor"></span>';
                transcriptionIndex++;
            } else {
                clearInterval(transcriptionInterval);
                transcriptionOutput.innerHTML = demoText;
                stopRecording();
            }
        }, 40);
    } else {
        stopRecording();
    }
});

function stopRecording() {
    isRecording = false;
    demoMicBtn.classList.remove('recording');
    demoMicIcon.className = 'fas fa-microphone text-white text-3xl';
    voiceWaveDemo.classList.add('hidden');
    if (transcriptionInterval) {
        clearInterval(transcriptionInterval);
    }
}

// Weather Sync Demo
const weatherSyncBtn = document.getElementById('weatherSyncBtn');
const weatherItems = document.querySelectorAll('.weather-item');
const weatherTimestamp = document.getElementById('weatherTimestamp');

const weatherData = {
    gps: '29.9934\u00B0 N, 90.2580\u00B0 W',
    temp: '74\u00B0F',
    cond: 'Partly Cloudy',
    wind: '8 mph SW',
    humid: '65%'
};

weatherSyncBtn.addEventListener('click', function() {
    weatherSyncBtn.disabled = true;
    weatherSyncBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Syncing...';

    // Reset all items
    weatherItems.forEach(item => {
        item.classList.remove('visible');
    });
    weatherTimestamp.style.display = 'none';

    // Animate each item
    setTimeout(() => {
        document.getElementById('weatherGps').classList.add('visible');
        document.getElementById('weatherGpsValue').textContent = weatherData.gps;
    }, 500);

    setTimeout(() => {
        document.getElementById('weatherTemp').classList.add('visible');
        document.getElementById('weatherTempValue').textContent = weatherData.temp;
    }, 900);

    setTimeout(() => {
        document.getElementById('weatherCond').classList.add('visible');
        document.getElementById('weatherCondValue').textContent = weatherData.cond;
    }, 1300);

    setTimeout(() => {
        document.getElementById('weatherWind').classList.add('visible');
        document.getElementById('weatherWindValue').textContent = weatherData.wind;
    }, 1700);

    setTimeout(() => {
        document.getElementById('weatherHumid').classList.add('visible');
        document.getElementById('weatherHumidValue').textContent = weatherData.humid;
    }, 2100);

    setTimeout(() => {
        const now = new Date();
        document.getElementById('weatherTime').textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        weatherTimestamp.style.display = 'flex';
        weatherSyncBtn.disabled = false;
        weatherSyncBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Sync Weather Data';
    }, 2500);
});

// Report Mode Toggle
const quickModeBtn = document.getElementById('quickModeBtn');
const fullModeBtn = document.getElementById('fullModeBtn');
const quickSections = document.querySelectorAll('.quick-section');
const fullSections = document.querySelectorAll('.full-section');

quickModeBtn.addEventListener('click', function() {
    quickModeBtn.className = 'px-6 py-3 bg-fv-green text-white font-bold rounded-lg';
    fullModeBtn.className = 'px-6 py-3 bg-slate-200 text-slate-600 font-bold rounded-lg';

    fullSections.forEach(section => {
        section.classList.add('opacity-50');
        const badge = section.querySelector('.mt-3');
        if (badge) {
            badge.innerHTML = '<i class="fas fa-lock mr-1"></i>Full Mode';
            badge.className = 'mt-3 text-xs text-slate-400 font-medium';
        }
    });
});

fullModeBtn.addEventListener('click', function() {
    fullModeBtn.className = 'px-6 py-3 bg-fv-blue text-white font-bold rounded-lg';
    quickModeBtn.className = 'px-6 py-3 bg-slate-200 text-slate-600 font-bold rounded-lg';

    fullSections.forEach(section => {
        section.classList.remove('opacity-50');
        const badge = section.querySelector('.mt-3');
        if (badge) {
            badge.innerHTML = '<i class="fas fa-microphone mr-1"></i>Voice Input';
            badge.className = 'mt-3 text-xs text-fv-orange font-medium';
        }
    });
});

// FAQ Toggle
function toggleFaq(button) {
    const faqItem = button.closest('.faq-item');
    const isOpen = faqItem.classList.contains('open');

    // Close all FAQs
    document.querySelectorAll('.faq-item').forEach(item => {
        item.classList.remove('open');
    });

    // Open clicked one if it wasn't already open
    if (!isOpen) {
        faqItem.classList.add('open');
    }
}

// Scroll Reveal Animation
function revealOnScroll() {
    const reveals = document.querySelectorAll('.scroll-reveal');

    reveals.forEach(element => {
        const windowHeight = window.innerHeight;
        const elementTop = element.getBoundingClientRect().top;
        const revealPoint = 150;

        if (elementTop < windowHeight - revealPoint) {
            element.classList.add('revealed');
        }
    });
}

window.addEventListener('scroll', revealOnScroll);
window.addEventListener('load', revealOnScroll);

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});
