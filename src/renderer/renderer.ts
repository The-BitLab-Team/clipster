type PersonalityMode = 'helpful' | 'witty';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export {};

declare global {
  interface Window {
    clipster: {
      getMode: () => Promise<PersonalityMode>;
      setMode: (mode: PersonalityMode) => Promise<PersonalityMode>;
      sendMessage: (message: string, history: ChatMessage[]) => Promise<{
        reply: string;
        mode: PersonalityMode;
        displayName: string;
      }>;
      onModeChanged: (callback: (mode: PersonalityMode) => void) => void;
    };
  }
}

const messagesEl = document.getElementById('messages') as HTMLDivElement;
const chatForm = document.getElementById('chatForm') as HTMLFormElement;
const chatInput = document.getElementById('chatInput') as HTMLInputElement;
const modeSwitch = document.getElementById('modeSwitch') as HTMLInputElement;
const modeLabel = document.getElementById('modeLabel') as HTMLSpanElement;

const chatHistory: ChatMessage[] = [];

const appendMessage = (content: string, role: 'user' | 'assistant') => {
  const bubble = document.createElement('div');
  bubble.className = `message ${role}`;
  bubble.textContent = content;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
};

const updateModeUI = (mode: PersonalityMode) => {
  modeSwitch.checked = mode === 'witty';
  modeLabel.textContent = `Modo: ${mode === 'witty' ? 'Witty' : 'Helpful'}`;
};

window.clipster.getMode().then(updateModeUI);
window.clipster.onModeChanged(updateModeUI);

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  appendMessage(text, 'user');
  chatHistory.push({ role: 'user', content: text });
  chatInput.value = '';

  const response = await window.clipster.sendMessage(text, chatHistory);
  appendMessage(response.reply, 'assistant');
  chatHistory.push({ role: 'assistant', content: response.reply });
});

modeSwitch.addEventListener('change', async () => {
  const newMode: PersonalityMode = modeSwitch.checked ? 'witty' : 'helpful';
  await window.clipster.setMode(newMode);
});

// Mensagem inicial
appendMessage('Olá! Eu sou o Clipster. Como posso ajudar hoje?', 'assistant');
