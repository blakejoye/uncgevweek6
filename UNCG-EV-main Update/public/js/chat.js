
document.addEventListener('DOMContentLoaded', function () {
    const socket = new WebSocket('ws://localhost:3000');

    socket.addEventListener('open', function () {
        console.log('Connected to WebSocket server.');
    });

    socket.addEventListener('message', function (event) {
        const messages = document.getElementById('messages');

        const messageContainer = document.createElement('div');
        messageContainer.classList.add('message', 'received');

        const timestamp = new Date().toLocaleString();
        messageContainer.innerHTML = `
            <div>${event.data}</div>
            <span class="timestamp">${timestamp}</span>
        `;

        messages.appendChild(messageContainer);
        messages.scrollTop = messages.scrollHeight;
    });

    document.getElementById('send-button').addEventListener('click', function () {
        const input = document.getElementById('message-input');
        const messageText = input.value;

        if (messageText.trim() === '') return;

        if (socket.readyState === WebSocket.OPEN) {
            socket.send(messageText);
            input.value = '';
        } else {
            alert("WebSocket not connected.");
        }
    });

    document.getElementById('clear-button').addEventListener('click', function () {
        document.getElementById('messages').innerHTML = '';
    });

    document.getElementById('message-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            document.getElementById('send-button').click();
        }
    });
});