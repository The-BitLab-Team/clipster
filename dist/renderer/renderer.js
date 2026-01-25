"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const messagesEl = document.getElementById('messages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const modeSwitch = document.getElementById('modeSwitch');
const modeLabel = document.getElementById('modeLabel');
const chatHistory = [];
const appendMessage = (content, role) => {
    const bubble = document.createElement('div');
    bubble.className = `message ${role}`;
    bubble.textContent = content;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
};
const updateModeUI = (mode) => {
    modeSwitch.checked = mode === 'witty';
    modeLabel.textContent = `Modo: ${mode === 'witty' ? 'Witty' : 'Helpful'}`;
};
window.clipster.getMode().then(updateModeUI);
window.clipster.onModeChanged(updateModeUI);
chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text)
        return;
    appendMessage(text, 'user');
    chatHistory.push({ role: 'user', content: text });
    chatInput.value = '';
    const response = await window.clipster.sendMessage(text, chatHistory);
    appendMessage(response.reply, 'assistant');
    chatHistory.push({ role: 'assistant', content: response.reply });
});
modeSwitch.addEventListener('change', async () => {
    const newMode = modeSwitch.checked ? 'witty' : 'helpful';
    await window.clipster.setMode(newMode);
});
// Mensagem inicial
appendMessage('Olá! Eu sou o Clipster. Como posso ajudar hoje?', 'assistant');
