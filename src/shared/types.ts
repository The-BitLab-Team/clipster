export type PersonalityMode = 'helpful' | 'witty';

export interface PersonalityProfile {
  id: PersonalityMode;
  displayName: string;
  tone: string;
  systemPrompt: string;
  exampleGreetings: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
