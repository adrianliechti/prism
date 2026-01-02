import { useState, useRef, useCallback, useEffect } from 'react';
import type { Variable, VariableType } from '../../types/types';
import { 
  findVariableMarkers, 
  extractContent, 
  getCursorOffset, 
  setCursorPosition, 
  createChip,
  getTextBeforeCursor
} from './editorUtils';

export interface UseEditorProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  value: string;
  onChange: (value: string) => void;
  variables: Variable[];
  onVariablesChange: (variables: Variable[]) => void;
  /** Characters that trigger auto-indent on Enter (e.g., '{', '[', '<') */
  indentTriggers?: string[];
}

export function useEditor({
  editorRef,
  value,
  onChange,
  variables,
  onVariablesChange,
  indentTriggers = ['{', '['],
}: UseEditorProps) {
  const lastContentRef = useRef('');
  const isInternalChange = useRef(false);
  const skipVariableRebuildRef = useRef(false);
  
  // Helper to sync content and cleanup orphaned variables
  const syncContent = useCallback((editor: HTMLElement) => {
    const content = extractContent(editor);
    lastContentRef.current = content;
    isInternalChange.current = true;
    onChange(content);
    
    const referencedIds = new Set(findVariableMarkers(content).map(m => m.id));
    const filteredVariables = variables.filter(v => referencedIds.has(v.id));
    if (filteredVariables.length !== variables.length) {
      skipVariableRebuildRef.current = true;
      onVariablesChange(filteredVariables);
    }
  }, [onChange, variables, onVariablesChange]);
  
  // Menu state
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [typeMenuPosition, setTypeMenuPosition] = useState({ top: 0, left: 0 });

  // Helper to append text with line breaks
  const appendText = useCallback((parent: HTMLElement, text: string) => {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) {
        parent.appendChild(document.createElement('br'));
      }
      if (line) {
        parent.appendChild(document.createTextNode(line));
      }
    });
  }, []);

  // Build DOM from value
  const buildDOM = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const cursorOffset = getCursorOffset(editor);
    const markers = findVariableMarkers(value);
    
    editor.innerHTML = '';
    
    let lastIndex = 0;
    
    for (const marker of markers) {
      const textBefore = value.slice(lastIndex, marker.start);
      if (textBefore) {
        appendText(editor, textBefore);
      }
      
      const chip = createChip(marker.type, marker.id, marker.full, variables);
      editor.appendChild(chip);
      editor.appendChild(document.createTextNode('\u200B'));
      
      lastIndex = marker.end;
    }
    
    const textAfter = value.slice(lastIndex);
    if (textAfter) {
      appendText(editor, textAfter);
    }
    
    if (editor.childNodes.length === 0) {
      editor.appendChild(document.createElement('br'));
    }
    
    lastContentRef.current = value;
    
    if (cursorOffset !== null) {
      setCursorPosition(editor, cursorOffset);
    }
  }, [value, variables, appendText, editorRef]);

  // Rebuild when value changes from outside
  useEffect(() => {
    if (!isInternalChange.current && value !== lastContentRef.current) {
      buildDOM();
    }
    isInternalChange.current = false;
  }, [value, buildDOM]);

  // Rebuild when variables change
  useEffect(() => {
    if (skipVariableRebuildRef.current) {
      skipVariableRebuildRef.current = false;
    } else {
      buildDOM();
    }
  }, [variables, buildDOM]);

  const handleInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const content = extractContent(editor);
    
    // Check for {{ trigger
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        const text = range.startContainer.textContent || '';
        const pos = range.startOffset;
        
        if (pos >= 2 && text.slice(pos - 2, pos) === '{{') {
          const rect = range.getBoundingClientRect();
          setTypeMenuPosition({
            top: rect.bottom + 4,
            left: rect.left,
          });
          setShowTypeMenu(true);
        } else {
          setShowTypeMenu(false);
        }
      }
    }
    
    if (content !== lastContentRef.current) {
      syncContent(editor);
    }
  }, [syncContent, editorRef]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showTypeMenu) {
      if (e.key === 'Escape') {
        setShowTypeMenu(false);
        e.preventDefault();
      }
      return;
    }
    
    // Handle backspace to delete chip
    if (e.key === 'Backspace') {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        const offset = range.startOffset;
        
        if (node.nodeType === Node.TEXT_NODE && offset === 1 && node.textContent?.charAt(0) === '\u200B') {
          const prevSibling = node.previousSibling;
          if (prevSibling && (prevSibling as HTMLElement).classList?.contains('variable-chip')) {
            e.preventDefault();
            const chip = prevSibling as HTMLElement;
            const parent = chip.parentNode;
            parent?.removeChild(chip);
            parent?.removeChild(node);
            
            const editor = editorRef.current;
            if (editor) syncContent(editor);
            return;
          }
        }
        
        if (offset === 0) {
          let prev = node.previousSibling;
          if (prev?.nodeType === Node.TEXT_NODE && prev.textContent === '\u200B') {
            prev = prev.previousSibling;
          }
          if (prev && (prev as HTMLElement).classList?.contains('variable-chip')) {
            e.preventDefault();
            const chip = prev as HTMLElement;
            const zwsp = chip.nextSibling;
            const parent = chip.parentNode;
            parent?.removeChild(chip);
            if (zwsp?.nodeType === Node.TEXT_NODE && zwsp.textContent === '\u200B') {
              parent?.removeChild(zwsp);
            }
            
            const editor = editorRef.current;
            if (editor) syncContent(editor);
            return;
          }
        }
      }
    }
    
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
    }
    
    if (e.key === 'Enter') {
      e.preventDefault();
      
      const editor = editorRef.current;
      const selection = window.getSelection();
      
      let indent = '';
      if (editor && selection && selection.rangeCount > 0) {
        const beforeCursor = getTextBeforeCursor(editor, selection);
        const lastNewline = beforeCursor.lastIndexOf('\n');
        const currentLine = beforeCursor.slice(lastNewline + 1);
        const indentMatch = currentLine.match(/^(\s*)/);
        indent = indentMatch ? indentMatch[1] : '';
        
        const trimmedLine = currentLine.trimEnd();
        const lastChar = trimmedLine.slice(-1);
        if (indentTriggers.includes(lastChar)) {
          indent += '  ';
        }
      }
      
      const br = document.createElement('br');
      const range = selection?.getRangeAt(0);
      if (range) {
        range.deleteContents();
        range.insertNode(br);
        
        range.setStartAfter(br);
        range.setEndAfter(br);
        selection?.removeAllRanges();
        selection?.addRange(range);
        
        if (indent) {
          document.execCommand('insertText', false, indent);
        }
      }
    }
  }, [showTypeMenu, syncContent, editorRef, indentTriggers]);

  // Insert variable
  const insertVariable = useCallback((type: VariableType) => {
    setShowTypeMenu(false);
    
    const editor = editorRef.current;
    if (!editor) return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return;
    
    const textNode = range.startContainer as Text;
    const pos = range.startOffset;
    
    const text = textNode.textContent || '';
    textNode.textContent = text.slice(0, pos - 2) + text.slice(pos);
    
    const id = Math.random().toString(36).substring(2, 9);
    const displayName = type === 'file_base64' || type === 'file_dataurl' ? 'file' : type;
    const marker = `{{${type}:${id}}}`;
    
    const chip = createChip(type, id, marker, variables);
    
    const newPos = pos - 2;
    range.setStart(textNode, newPos);
    range.setEnd(textNode, newPos);
    range.insertNode(chip);
    
    const zwsp = document.createTextNode('\u200B');
    chip.after(zwsp);
    
    range.setStart(zwsp, 1);
    range.setEnd(zwsp, 1);
    selection.removeAllRanges();
    selection.addRange(range);
    
    skipVariableRebuildRef.current = true;
    onVariablesChange([...variables, { id, type, name: displayName }]);
    
    const content = extractContent(editor);
    lastContentRef.current = content;
    isInternalChange.current = true;
    onChange(content);
    
    return id;
  }, [variables, onVariablesChange, onChange, editorRef]);

  return {
    handleInput,
    handlePaste,
    handleKeyDown,
    insertVariable,
    showTypeMenu,
    setShowTypeMenu,
    typeMenuPosition,
    buildDOM
  };
}
