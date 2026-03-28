import React from 'react';
import type { LayoutDirection } from '../layoutEngine';

interface ControlsProps {
  direction: LayoutDirection;
  onDirectionChange: (dir: LayoutDirection) => void;
  onFitView: () => void;
  onExport: (format: 'png' | 'svg') => void;
  autoFit: boolean;
  onToggleAutoFit: () => void;
}

const buttonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '11px',
  fontFamily: 'var(--vscode-font-family, sans-serif)',
  border: '1px solid var(--vscode-button-border, var(--vscode-contrastBorder, #444))',
  borderRadius: '3px',
  background: 'var(--vscode-button-secondaryBackground, #333)',
  color: 'var(--vscode-button-secondaryForeground, #ccc)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
};

const activeStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'var(--vscode-button-background, #0078d4)',
  color: 'var(--vscode-button-foreground, #fff)',
};

export function FlowControls({ direction, onDirectionChange, onFitView: _onFitView, onExport, autoFit, onToggleAutoFit }: ControlsProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 10,
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap',
      }}
    >
      <button
        style={direction === 'TB' ? activeStyle : buttonStyle}
        onClick={() => onDirectionChange('TB')}
        title="Vertical layout (top to bottom)"
      >
        ↓ Vertical
      </button>
      <button
        style={direction === 'LR' ? activeStyle : buttonStyle}
        onClick={() => onDirectionChange('LR')}
        title="Horizontal layout (left to right)"
      >
        → Horizontal
      </button>
      <button
        style={autoFit ? activeStyle : buttonStyle}
        onClick={onToggleAutoFit}
        title={autoFit ? 'Auto-fit is ON — click to disable' : 'Auto-fit is OFF — click to enable and fit now'}
      >
        {autoFit ? '⊞ Auto-Fit' : '⊞ Fit'}
      </button>
      <button style={buttonStyle} onClick={() => onExport('png')} title="Export as PNG">
        📷 PNG
      </button>
      <button style={buttonStyle} onClick={() => onExport('svg')} title="Export as SVG">
        📐 SVG
      </button>
    </div>
  );
}
