import type { Variable, VariableType } from '../../types/types';

export interface VariableMarker {
  start: number;
  end: number;
  type: VariableType;
  id: string;
  full: string;
}

export function findVariableMarkers(text: string): VariableMarker[] {
  const markers: VariableMarker[] = [];
  const regex = /\{\{(\w+):([^{}]+)\}\}/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    markers.push({
      start: match.index,
      end: match.index + match[0].length,
      type: match[1] as VariableType,
      id: match[2],
      full: match[0],
    });
  }
  return markers;
}

export function extractContent(element: HTMLElement): string {
  if (element.nodeType === Node.TEXT_NODE) {
    return (element.textContent || '').replace(/\u200B/g, '');
  }
  
  if (element.classList?.contains('variable-chip')) {
    return element.dataset.marker || '';
  }
  
  if (element.tagName === 'BR') {
    return '\n';
  }
  
  let result = '';
  const isBlock = element.tagName === 'DIV' || element.tagName === 'P';
  
  for (const child of element.childNodes) {
    result += extractContent(child as HTMLElement);
  }
  
  if (isBlock && result && !result.endsWith('\n')) {
    result += '\n';
  }
  
  return result;
}

export function getTextBeforeCursor(editor: HTMLElement, selection: Selection): string {
  if (selection.rangeCount === 0) return '';
  const range = selection.getRangeAt(0);
  const endNode = range.startContainer;
  const endOffset = range.startOffset;
  
  let result = '';
  let found = false;
  
  function traverse(node: Node) {
    if (found) return;
    
    if (node === endNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        result += (node.textContent || '').slice(0, endOffset).replace(/\u200B/g, '');
        found = true;
        return;
      } else {
        const children = node.childNodes;
        for (let i = 0; i < endOffset; i++) {
          traverse(children[i]);
          if (found) return;
        }
        found = true;
        return;
      }
    }
    
    if (node.nodeType === Node.TEXT_NODE) {
      result += (node.textContent || '').replace(/\u200B/g, '');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.classList.contains('variable-chip')) {
        if (el.contains(endNode)) {
           found = true;
           return;
        }
        result += el.dataset.marker || '';
      } else if (el.tagName === 'BR') {
        result += '\n';
      } else if (el.tagName === 'DIV' || el.tagName === 'P') {
        for (const child of Array.from(el.childNodes)) {
          traverse(child);
          if (found) return;
        }
        if (result && !result.endsWith('\n')) {
          result += '\n';
        }
      } else {
        for (const child of Array.from(el.childNodes)) {
          traverse(child);
          if (found) return;
        }
      }
    }
  }
  
  traverse(editor);
  return result;
}

export function getCursorOffset(editor: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  if (!editor.contains(selection.anchorNode)) return null;
  
  return getTextBeforeCursor(editor, selection).length;
}

export function setCursorPosition(root: HTMLElement, targetOffset: number) {
  let currentOffset = 0;
  let found = false;
  
  function traverse(node: Node) {
    if (found) return;
    
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      const cleanText = text.replace(/\u200B/g, '');
      const len = cleanText.length;
      
      if (currentOffset + len >= targetOffset) {
        const remaining = targetOffset - currentOffset;
        let index = 0;
        let cleanIndex = 0;
        while (cleanIndex < remaining && index < text.length) {
           if (text[index] !== '\u200B') {
             cleanIndex++;
           }
           index++;
        }
        
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        found = true;
        return;
      }
      currentOffset += len;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.classList.contains('variable-chip')) {
        const len = (el.dataset.marker || '').length;
        currentOffset += len;
      } else if (el.tagName === 'BR') {
        currentOffset += 1;
      } else {
         const isBlock = el.tagName === 'DIV' || el.tagName === 'P';
         
         for (const child of Array.from(node.childNodes)) {
            traverse(child);
            if (found) return;
         }
         
         if (isBlock && currentOffset < targetOffset) {
            currentOffset += 1;
         }
      }
    }
  }
  
  traverse(root);
}

export function getChipLabel(type: VariableType, _id: string, variable?: Variable): string {
  switch (type) {
    case 'file_base64':
    case 'file_dataurl':
      return variable?.data ? (variable.name || 'file') : 'Select file...';
    case 'base64':
      // Show the entered text (truncated if too long), or prompt to enter
      if (variable?.data) {
        const text = variable.data;
        return text.length > 12 ? text.slice(0, 12) + '…' : text;
      }
      return 'Enter text...';
    default: return variable?.name || type;
  }
}

export function getChipIconSvg(type: VariableType): string {
  const cls = 'w-3 h-3';
  switch (type) {
    case 'file_base64':
    case 'file_dataurl':
      return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    case 'base64': return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`;
    case 'timestamp': return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    case 'uuid': return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M9 5H1"/></svg>`;
    case 'random_string': return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l14.2-12.6c.8-1.1 2-1.7 3.3-1.7H22"/><path d="M2 6h1.4c1.3 0 2.5.6 3.3 1.7l14.2 12.6c.8 1.1 2 1.7 3.3 1.7H22"/></svg>`;
    default: return '';
  }
}

export function createChip(
  type: VariableType, 
  id: string, 
  marker: string, 
  variables: Variable[]
): HTMLSpanElement {
  const variable = variables.find(v => v.type === type && v.id === id);
  const needsConfig = type === 'file_base64' || type === 'file_dataurl' || type === 'base64';
  const isConfigured = variable && variable.data;
  
  const chip = document.createElement('span');
  chip.contentEditable = 'false';
  chip.className = `variable-chip inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-xs font-medium align-baseline select-none ${
    needsConfig && !isConfigured 
      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
      : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
  } ${needsConfig ? 'cursor-pointer hover:bg-blue-500/30' : ''}`;
  chip.dataset.marker = marker;
  chip.dataset.variableType = type;
  chip.dataset.variableId = id;
  
  const iconSpan = document.createElement('span');
  iconSpan.className = 'chip-icon';
  iconSpan.innerHTML = getChipIconSvg(type);
  chip.appendChild(iconSpan);
  
  const label = document.createElement('span');
  label.className = 'chip-label';
  label.textContent = getChipLabel(type, id, variable);
  chip.appendChild(label);
  
  return chip;
}
