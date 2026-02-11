(function() {
    var threads = [
        {
            name: 'Mike Rodriguez',
            bubbles: [
                { from: 'them', text: 'Hey, just got word from the batch plant.' },
                { from: 'them', text: 'Concrete delivery moved to 2pm instead of 11am. Truck had a mechanical issue.' },
                { from: 'you', text: 'Got it, thanks for the heads up. I\'ll adjust the pour schedule.' },
                { from: 'them', text: 'Sounds good. I\'ll make sure the crew knows.' }
            ]
        },
        {
            name: 'James Sullivan',
            bubbles: [
                { from: 'them', text: 'Just uploaded the inspector photos for Section 4.' },
                { from: 'them', text: 'Everything looks good on the rebar spacing. No issues found.' },
                { from: 'you', text: 'Perfect. Did you get the tie-down connections too?' },
                { from: 'them', text: 'Yes, all documented. Check the photo log.' }
            ]
        },
        {
            name: 'Diana Lopez',
            bubbles: [
                { from: 'them', text: 'RFI #247 response is attached.' },
                { from: 'them', text: 'The engineer approved the alternate detail for the drain inlet.' },
                { from: 'you', text: 'Great, I\'ll update the field drawings.' }
            ]
        },
        {
            name: 'Kevin Walsh',
            bubbles: [
                { from: 'you', text: 'How did the drainage test go?' },
                { from: 'them', text: 'All clear on drainage test. Flow rates within spec.' },
                { from: 'them', text: 'No ponding observed after 30 minutes.' },
                { from: 'you', text: 'Excellent. I\'ll note it in today\'s report.' }
            ]
        }
    ];

    window.openMessageThread = function(index) {
        var thread = threads[index];
        if (!thread) return;
        document.getElementById('messagesThreadList').classList.add('hidden');
        document.getElementById('messagesChatView').classList.remove('hidden');
        document.getElementById('messagesChatName').textContent = thread.name;
        var container = document.getElementById('messagesChatBubbles');
        container.innerHTML = '';
        thread.bubbles.forEach(function(b) {
            var div = document.createElement('div');
            div.className = b.from === 'you'
                ? 'flex justify-end'
                : 'flex justify-start';
            var bubble = document.createElement('div');
            bubble.className = b.from === 'you'
                ? 'bg-dot-blue text-white px-4 py-2 rounded-2xl rounded-br-sm max-w-[80%] text-sm'
                : 'bg-slate-100 text-slate-800 px-4 py-2 rounded-2xl rounded-bl-sm max-w-[80%] text-sm';
            bubble.textContent = b.text;
            div.appendChild(bubble);
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    };

    window.closeMessageThread = function() {
        document.getElementById('messagesChatView').classList.add('hidden');
        document.getElementById('messagesThreadList').classList.remove('hidden');
    };

    window.sendMessageChat = function() {
        var input = document.getElementById('messagesChatInput');
        var text = input.value.trim();
        if (!text) return;
        var container = document.getElementById('messagesChatBubbles');
        var div = document.createElement('div');
        div.className = 'flex justify-end';
        var bubble = document.createElement('div');
        bubble.className = 'bg-dot-blue text-white px-4 py-2 rounded-2xl rounded-br-sm max-w-[80%] text-sm';
        bubble.textContent = text;
        div.appendChild(bubble);
        container.appendChild(div);
        input.value = '';
        container.scrollTop = container.scrollHeight;
    };
})();
