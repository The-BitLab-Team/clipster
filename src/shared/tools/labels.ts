import type { TranslationKey } from '../i18n';
import type { KnownToolName, PermissionId, RiskLevel, ToolActivityStatus } from './types';

/** Chaves do i18n para mostrar ferramentas e permissões (balão e Configurações). */

export const TOOL_LABEL_KEYS = {
  getCurrentTime: 'tool.getCurrentTime.label',
  getClipsterVersion: 'tool.getClipsterVersion.label',
  demoDestructiveAction: 'tool.demoDestructiveAction.label',
  demoReadAction: 'tool.demoReadAction.label'
} as const satisfies Record<KnownToolName, TranslationKey>;

export function toolLabelKey(tool: KnownToolName | null): TranslationKey {
  return tool === null ? 'tool.unknown.label' : TOOL_LABEL_KEYS[tool];
}

export const PERMISSION_LABEL_KEYS = {
  'clipboard.read': 'permission.clipboard.read',
  'clipboard.write': 'permission.clipboard.write',
  'filesystem.read': 'permission.filesystem.read',
  'filesystem.write': 'permission.filesystem.write',
  'applications.open': 'permission.applications.open',
  'notifications.send': 'permission.notifications.send',
  'screen.observe': 'permission.screen.observe',
  'network.fetch': 'permission.network.fetch'
} as const satisfies Record<PermissionId, TranslationKey>;

export const RISK_LABEL_KEYS = {
  read: 'balloon.permission.risk.read',
  write: 'balloon.permission.risk.write',
  destructive: 'balloon.permission.risk.destructive'
} as const satisfies Record<RiskLevel, TranslationKey>;

export const ACTIVITY_STATUS_KEYS = {
  awaiting: 'balloon.tool.awaiting',
  running: 'balloon.tool.running',
  done: 'balloon.tool.done',
  denied: 'balloon.tool.denied',
  failed: 'balloon.tool.failed'
} as const satisfies Record<ToolActivityStatus, TranslationKey>;
