// src/core/types.js
import { REMINDER_DEFAULTS } from './reminder-preferences.js';

export const PROBLEM_TYPE_MAP = {
  1: '单选题',
  2: '多选题',
  3: '投票题',
  4: '填空题',
  5: '主观题',
};

export const DEFAULT_CONFIG = {
  ...REMINDER_DEFAULTS,
  autoAnswer: false,
  autoAnswerDelay: 3000,
  autoAnswerRandomDelay: 2000,
  keepScreenAwake: false,
  iftex: true,
  ai: {
    provider: 'kimi',
    kimiApiKey: '',
    apiKey: '',
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'kimi-k3',
    visionModel: 'kimi-k3',
    ocrApi: '',
    ocrApiKey: '',
    translateApi: '',
    translateApiKey: '',
    translateModel: '',
    maxTokens: 1000,
  },
  profiles: [
    {
      id: 'default',
      name: 'Kimi',
      baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
      apiKey: '',
      model: 'kimi-k3',
      visionModel: 'kimi-k3',
      temperature: '',
    },
  ],
  activeProfileId: 'default',
  showAllSlides: false,
  maxPresentations: 5,
};
