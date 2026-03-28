import type { NodeStatus } from './messages';

// CSS custom properties that adapt to VSCode theme
export const themeColors = {
  background: 'var(--vscode-editor-background)',
  foreground: 'var(--vscode-editor-foreground)',
  border: 'var(--vscode-panel-border)',
  inputBg: 'var(--vscode-input-background)',
  buttonBg: 'var(--vscode-button-background)',
  buttonFg: 'var(--vscode-button-foreground)',
  badgeBg: 'var(--vscode-badge-background)',
  badgeFg: 'var(--vscode-badge-foreground)',
};

export const statusColors: Record<NodeStatus, string> = {
  pending: '#6c757d',
  running: '#0d6efd',
  completed: '#198754',
  failed: '#dc3545',
  waiting: '#ffc107',
  replaying: '#6f42c1',
};

export const statusLabels: Record<NodeStatus, string> = {
  pending: '⏳ Pending',
  running: '🔄 Running',
  completed: '✅ Completed',
  failed: '❌ Failed',
  waiting: '⏸ Waiting',
  replaying: '🔁 Replaying',
};
