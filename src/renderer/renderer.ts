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
let currentMode: PersonalityMode = 'helpful';

const appendMessage = (content: string, role: 'user' | 'assistant') => {
  const bubble = document.createElement('div');
  bubble.className = `message ${role}`;
  bubble.textContent = content;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
};

const updateModeUI = (mode: PersonalityMode) => {
  currentMode = mode;
  modeSwitch.checked = mode === 'witty';
  modeLabel.textContent = `Modo: ${mode === 'witty' ? 'Witty' : 'Helpful'}`;
};

const generateLocalReply = (mode: PersonalityMode, text: string) => {
  const input = text.toLowerCase();
  const isQuestion = input.includes('?') || input.startsWith('como') || input.startsWith('o que');
  const isError = input.includes('erro') || input.includes('falha') || input.includes('bug');
  const isSetup = input.includes('instalar') || input.includes('configurar') || input.includes('setup');

  if (mode === 'witty') {
    if (isError) return 'Isso parece um erro clássico. Envie a mensagem exata e os passos, e eu resolvo sem drama.';
    if (isSetup) return 'Setup detectado. Diga o ambiente e o objetivo. Vou economizar seu tempo.';
    if (isQuestion) return 'Conta o contexto em 2 frases e eu devolvo um plano curto e útil.';
    return 'Entendi. Mais detalhes ajudam a evitar suposições (e sarcasmo extra).';
  }

  if (isError) return 'Sinto muito pelo erro. Compartilhe a mensagem exata e os passos para reproduzir.';
  if (isSetup) return 'Claro! Diga seu ambiente e o que deseja configurar.';
  if (isQuestion) return 'Para ajudar melhor, descreva o contexto e o objetivo final.';
  return 'Obrigado pela mensagem! Pode dar mais detalhes sobre o objetivo?';
};

const safeSendMessage = async (text: string) => {
  try {
    if (!window.clipster) {
      return {
        reply: generateLocalReply(currentMode, text),
        mode: currentMode,
        displayName: 'Clipster (Local)'
      };
    }
    return await window.clipster.sendMessage(text, chatHistory);
  } catch {
    return {
      reply: generateLocalReply(currentMode, text),
      mode: currentMode,
      displayName: 'Clipster (Fallback)'
    };
  }
};

if (window.clipster) {
  window.clipster.getMode().then(updateModeUI);
  window.clipster.onModeChanged(updateModeUI);
} else {
  updateModeUI(currentMode);
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  appendMessage(text, 'user');
  chatHistory.push({ role: 'user', content: text });
  chatInput.value = '';

  const response = await safeSendMessage(text);
  appendMessage(response.reply, 'assistant');
  chatHistory.push({ role: 'assistant', content: response.reply });
});

modeSwitch.addEventListener('change', async () => {
  const newMode: PersonalityMode = modeSwitch.checked ? 'witty' : 'helpful';
  updateModeUI(newMode);
  if (window.clipster) {
    await window.clipster.setMode(newMode);
  }
});

// Mensagem inicial
appendMessage('Olá! Eu sou o Clipster. Como posso ajudar hoje?', 'assistant');
