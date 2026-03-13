import type { HierarchicalAgent } from './types';

export const getAgentHierarchy = (): HierarchicalAgent => ({
  id: 'main',
  name: 'Jos',
  emoji: '\uD83E\uDDE0',
  avatar: '/avatars/jos.png',
  role: 'Mission Control',
  status: 'working',
  model: {
    primary: 'anthropic/claude-sonnet-4-5',
    fallbacks: ['anthropic/claude-sonnet-4-6', 'anthropic/claude-haiku-4-5', 'openai-codex/gpt-5.3-codex'],
  },
  currentTask: {
    title: 'Coordinating all agents',
    progress: 100,
    eta: 'Always on',
  },
  children: [
    {
      id: 'boeboesh',
      name: 'Boeboesh',
      emoji: '\uD83D\uDEE0\uFE0F',
      avatar: '/avatars/boeboesh.png',
      role: 'Coding & Build',
      status: 'working',
      model: {
        primary: 'anthropic/claude-opus-4-6',
        fallbacks: ['anthropic/claude-sonnet-4-6', 'anthropic/claude-sonnet-4-5', 'openai-codex/gpt-5.3-codex'],
      },
      currentTask: {
        title: 'Dashboard Expansion',
        progress: 65,
        eta: '~2 hours',
      },
    },
    {
      id: 'rover',
      name: 'Rover',
      emoji: '\uD83D\uDCC8',
      avatar: '/avatars/rover.png',
      role: 'Trading & Analysis',
      status: 'working',
      model: {
        primary: 'anthropic/claude-sonnet-4-5',
        fallbacks: ['anthropic/claude-sonnet-4-6', 'anthropic/claude-haiku-4-5', 'openai-codex/gpt-5.3-codex'],
      },
      currentTask: {
        title: 'Scalping Strategy',
        progress: 100,
      },
    },
    {
      id: 'jean-claude',
      name: 'Jean-Claude',
      emoji: '\uD83C\uDF77',
      avatar: '/avatars/jean-claude.png',
      role: 'Wijn Expert',
      status: 'idle',
      model: {
        primary: 'anthropic/claude-sonnet-4-5',
        fallbacks: ['anthropic/claude-sonnet-4-6', 'anthropic/claude-haiku-4-5', 'openai-codex/gpt-5.3-codex'],
      },
    },
    {
      id: 'julio',
      name: 'Julio',
      emoji: '\uD83C\uDFAC',
      avatar: '/avatars/julio.png',
      role: 'Presentaties',
      status: 'idle',
      model: {
        primary: 'anthropic/claude-opus-4-6',
        fallbacks: ['anthropic/claude-sonnet-4-6', 'anthropic/claude-sonnet-4-5', 'openai-codex/gpt-5.3-codex'],
      },
    },
    {
      id: 'arne',
      name: 'Arne',
      emoji: '\uD83D\uDCF8',
      avatar: '/avatars/arne.png',
      role: 'Foto & Video',
      status: 'idle',
      model: {
        primary: 'anthropic/claude-sonnet-4-5',
        fallbacks: ['anthropic/claude-sonnet-4-6', 'anthropic/claude-haiku-4-5', 'openai-codex/gpt-5.3-codex'],
      },
    },
    {
      id: 'guido',
      name: 'Guido',
      emoji: '\uD83D\uDCCA',
      avatar: '/avatars/guido.png',
      role: 'Boekhouding',
      status: 'idle',
      model: {
        primary: 'anthropic/claude-sonnet-4-5',
        fallbacks: ['anthropic/claude-sonnet-4-6', 'anthropic/claude-haiku-4-5', 'openai-codex/gpt-5.3-codex'],
      },
    },
    {
      id: 'bavo',
      name: 'Bavo',
      emoji: '\uD83D\uDCF0',
      avatar: '/avatars/bavo.png',
      role: 'Nieuws & Content',
      status: 'idle',
      model: {
        primary: 'anthropic/claude-sonnet-4-5',
        fallbacks: ['anthropic/claude-sonnet-4-6', 'openai-codex/gpt-5.3-codex', 'anthropic/claude-haiku-4-5'],
      },
    },
  ],
});
