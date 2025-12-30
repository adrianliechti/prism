import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { File, Clock, Hash, Shuffle, Sparkles, Check, Eye } from 'lucide-react';
import type { Variable, VariableType } from '../types/types';
import { resolveVariables } from '../utils/variables';

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  variables: Variable[];
  onVariablesChange: (variables: Variable[]) => void;
}

interface VariableTypeOption {
  type: VariableType;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const variableTypes: VariableTypeOption[] = [
  { type: 'file_base64', label: 'File (Base64)', description: 'Select a file to encode', icon: <File className="w-3.5 h-3.5" /> },
  { type: 'file_dataurl', label: 'File (Data URL)', description: 'File as data:... URL', icon: <File className="w-3.5 h-3.5" /> },
  { type: 'base64', label: 'Text (Base64)', description: 'Text to encode', icon: <Hash className="w-3.5 h-3.5" /> },
  { type: 'timestamp', label: 'Timestamp', description: 'Unix timestamp', icon: <Clock className="w-3.5 h-3.5" /> },
  { type: 'uuid', label: 'UUID', description: 'Random UUID', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { type: 'random_string', label: 'Random String', description: '16-char random', icon: <Shuffle className="w-3.5 h-3.5" /> },
];

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// Find variable markers in format {{type:id}}
interface VariableMarker {
  start: number;
  end: number;
  type: VariableType;
  id: string;
  full: string;
}

function findVariableMarkers(text: string): VariableMarker[] {
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

// Extract text content from contenteditable
function extractContent(element: HTMLElement): string {
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

// Get text content up to the cursor position
function getTextBeforeCursor(editor: HTMLElement, selection: Selection): string {
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
      }
      found = true;
      return;
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
        if (result && !result.endsWith('\n')) {
          result += '\n';
        }
        for (const child of el.childNodes) {
          traverse(child);
          if (found) return;
        }
      } else {
        for (const child of el.childNodes) {
          traverse(child);
          if (found) return;
        }
      }
    }
  }
  
  traverse(editor);
  return result;
}

export function JsonEditor({ value, onChange, variables, onVariablesChange }: JsonEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track if we need to rebuild (when markers change)
  const lastContentRef = useRef<string>('');
  const isInternalChange = useRef(false);
  
  // Track if we should place cursor at end after external change
  const placeCursorAtEndRef = useRef(false);
  
  // Flag to skip variable rebuild (when we just inserted a chip)
  const skipVariableRebuildRef = useRef(false);
  
  // Dropdown state
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [typeMenuPosition, setTypeMenuPosition] = useState({ top: 0, left: 0 });
  
  // Popover state
  const [activePopover, setActivePopover] = useState<{
    variableKey: string;
    rect: DOMRect;
  } | null>(null);
  const [popoverInput, setPopoverInput] = useState('');
  
  // Track previous validity for auto-format
  const wasInvalidRef = useRef(false);
  const autoFormatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // JSON validity
  const jsonValidity = useMemo(() => {
    if (!value.trim()) return { valid: true, empty: true };
    try {
      let temp = value;
      temp = temp.replace(/"\{\{[^{}]+\}\}"/g, '"__var__"');
      temp = temp.replace(/\{\{[^{}]+\}\}/g, 'null');
      JSON.parse(temp);
      return { valid: true, empty: false };
    } catch (err) {
      return { valid: false, empty: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
    }
  }, [value]);

  // State for showing raw JSON preview
  const [showRaw, setShowRaw] = useState(false);

  // Resolve variables to get raw JSON
  const resolvedJson = useMemo(() => {
    return resolveVariables(value, variables, {
      missingDataPlaceholder: '[no data]',
    });
  }, [value, variables]);

  // Auto-format when JSON becomes valid after being invalid
  useEffect(() => {
    // Clear any pending auto-format
    if (autoFormatTimeoutRef.current) {
      clearTimeout(autoFormatTimeoutRef.current);
      autoFormatTimeoutRef.current = null;
    }
    
    if (jsonValidity.valid && !jsonValidity.empty && wasInvalidRef.current) {
      // Debounce the auto-format to avoid formatting while still typing
      autoFormatTimeoutRef.current = setTimeout(() => {
        // Double-check it's still valid before formatting
        try {
          let temp = value;
          temp = temp.replace(/"\{\{[^{}]+\}\}"/g, '"__var__"');
          temp = temp.replace(/\{\{[^{}]+\}\}/g, 'null');
          JSON.parse(temp);
          
          // Format it
          const placeholders: Map<string, string> = new Map();
          let content = value;
          let index = 0;
          
          content = content.replace(/"\{\{[^{}]+\}\}"/g, (match) => {
            const ph = `"__VAR_${index++}__"`;
            placeholders.set(ph, match);
            return ph;
          });
          content = content.replace(/\{\{[^{}]+\}\}/g, (match) => {
            const ph = `"__VAR_${index++}__"`;
            placeholders.set(ph, match);
            return ph;
          });
          
          const parsed = JSON.parse(content);
          let formatted = JSON.stringify(parsed, null, 2);
          
          // Expand empty objects and arrays to multiple lines
          formatted = formatted.replace(/\{\}/g, '{\n}');
          formatted = formatted.replace(/\[\]/g, '[\n]');
          
          placeholders.forEach((original, ph) => {
            formatted = formatted.replace(ph, original);
          });
          
          // Only update if it actually changed
          if (formatted !== value) {
            placeCursorAtEndRef.current = true;
            onChange(formatted);
          }
        } catch {
          // Ignore if it became invalid again
        }
      }, 500); // Wait 500ms after typing stops
    }
    
    wasInvalidRef.current = !jsonValidity.valid;
    
    return () => {
      if (autoFormatTimeoutRef.current) {
        clearTimeout(autoFormatTimeoutRef.current);
      }
    };
  }, [jsonValidity.valid, jsonValidity.empty, value, onChange]);

  // Build DOM from value
  const buildDOM = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const markers = findVariableMarkers(value);
    
    // Clear and rebuild
    editor.innerHTML = '';
    
    let lastIndex = 0;
    
    for (const marker of markers) {
      // Add text before marker
      const textBefore = value.slice(lastIndex, marker.start);
      if (textBefore) {
        appendText(editor, textBefore);
      }
      
      // Add chip
      const chip = createChip(marker.type, marker.id, marker.full);
      editor.appendChild(chip);
      
      // Add zero-width space after chip so cursor can be placed after it
      editor.appendChild(document.createTextNode('\u200B'));
      
      lastIndex = marker.end;
    }
    
    // Add remaining text
    const textAfter = value.slice(lastIndex);
    if (textAfter) {
      appendText(editor, textAfter);
    }
    
    // Ensure there's something to focus
    if (editor.childNodes.length === 0) {
      editor.appendChild(document.createElement('br'));
    }
    
    lastContentRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, variables]);

  // Helper to append text with line breaks
  function appendText(parent: HTMLElement, text: string) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) {
        parent.appendChild(document.createElement('br'));
      }
      if (line) {
        parent.appendChild(document.createTextNode(line));
      }
    });
  }

  // Create a variable chip element
  function createChip(type: VariableType, id: string, marker: string): HTMLSpanElement {
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
    
    // Icon
    const iconSpan = document.createElement('span');
    iconSpan.className = 'chip-icon';
    iconSpan.innerHTML = getChipIconSvg(type);
    chip.appendChild(iconSpan);
    
    // Label
    const label = document.createElement('span');
    label.className = 'chip-label';
    label.textContent = getChipLabel(type, id, variable);
    chip.appendChild(label);
    
    return chip;
  }

  // Initial build and rebuild when switching back from raw mode
  useEffect(() => {
    if (!showRaw) {
      buildDOM();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRaw]);

  // Rebuild when value changes from outside (not from our own edits)
  useEffect(() => {
    if (!isInternalChange.current && value !== lastContentRef.current) {
      buildDOM();
      
      // Place cursor at end if this was an auto-format
      if (placeCursorAtEndRef.current && editorRef.current) {
        placeCursorAtEndRef.current = false;
        const editor = editorRef.current;
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(editor);
        range.collapse(false); // collapse to end
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
    isInternalChange.current = false;
  }, [value, buildDOM]);

  // Rebuild when variables change (to update chip labels/colors)
  // Skip if this is an internal change (e.g. chip just inserted)
  useEffect(() => {
    if (skipVariableRebuildRef.current) {
      skipVariableRebuildRef.current = false;
    } else {
      buildDOM();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variables]);

  // Handle input
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
          // Show menu - use viewport coordinates for fixed positioning
          const rect = range.getBoundingClientRect();
          setTypeMenuPosition({
            top: rect.bottom + 4,
            left: rect.left,
          });
          setShowTypeMenu(true);
        } else {
          // Close menu if user typed something after {{
          setShowTypeMenu(false);
        }
      }
    }
    
    if (content !== lastContentRef.current) {
      lastContentRef.current = content;
      isInternalChange.current = true;
      onChange(content);
      
      // Cleanup: remove variables that are no longer referenced
      const referencedIds = new Set(findVariableMarkers(content).map(m => m.id));
      const filteredVariables = variables.filter(v => referencedIds.has(v.id));
      if (filteredVariables.length !== variables.length) {
        skipVariableRebuildRef.current = true;
        onVariablesChange(filteredVariables);
      }
    }
  }, [onChange, variables, onVariablesChange]);

  // Handle paste - convert to plain text
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // Handle key events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showTypeMenu) {
      if (e.key === 'Escape') {
        setShowTypeMenu(false);
        e.preventDefault();
      }
      return;
    }
    
    // Handle backspace to delete chip when cursor is right after it
    if (e.key === 'Backspace') {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        const offset = range.startOffset;
        
        // Check if we're in a text node with zero-width space right after a chip
        if (node.nodeType === Node.TEXT_NODE && offset === 1 && node.textContent?.charAt(0) === '\u200B') {
          const prevSibling = node.previousSibling;
          if (prevSibling && (prevSibling as HTMLElement).classList?.contains('variable-chip')) {
            e.preventDefault();
            // Remove the chip and the zero-width space
            const chip = prevSibling as HTMLElement;
            const parent = chip.parentNode;
            parent?.removeChild(chip);
            parent?.removeChild(node);
            
            // Trigger input to update content
            const editor = editorRef.current;
            if (editor) {
              const content = extractContent(editor);
              lastContentRef.current = content;
              isInternalChange.current = true;
              onChange(content);
              
              // Cleanup variables
              const referencedIds = new Set(findVariableMarkers(content).map(m => m.id));
              const filteredVariables = variables.filter(v => referencedIds.has(v.id));
              if (filteredVariables.length !== variables.length) {
                skipVariableRebuildRef.current = true;
                onVariablesChange(filteredVariables);
              }
            }
            return;
          }
        }
        
        // Check if cursor is at offset 0 and previous sibling is a chip
        if (offset === 0) {
          let prev = node.previousSibling;
          // Skip zero-width space text nodes
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
            
            // Trigger input to update content
            const editor = editorRef.current;
            if (editor) {
              const content = extractContent(editor);
              lastContentRef.current = content;
              isInternalChange.current = true;
              onChange(content);
              
              // Cleanup variables
              const referencedIds = new Set(findVariableMarkers(content).map(m => m.id));
              const filteredVariables = variables.filter(v => referencedIds.has(v.id));
              if (filteredVariables.length !== variables.length) {
                skipVariableRebuildRef.current = true;
                onVariablesChange(filteredVariables);
              }
            }
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
      
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        document.execCommand('insertText', false, '\n');
        return;
      }
      
      const editor = editorRef.current;
      if (!editor) return;
      
      // Get text before cursor to determine indentation
      const beforeCursor = getTextBeforeCursor(editor, selection);
      
      // Find the current line start and get its indentation
      const lastNewline = beforeCursor.lastIndexOf('\n');
      const currentLine = beforeCursor.slice(lastNewline + 1);
      const indentMatch = currentLine.match(/^(\s*)/);
      let indent = indentMatch ? indentMatch[1] : '';
      
      // Check if we should increase indent (after { or [)
      const trimmedLine = currentLine.trimEnd();
      const lastChar = trimmedLine.slice(-1);
      if (lastChar === '{' || lastChar === '[') {
        indent += '  ';
      }
      
      document.execCommand('insertText', false, '\n' + indent);
    }
  }, [showTypeMenu, variables, onChange, onVariablesChange]);

  // File picker
  const openFilePicker = useCallback((type: VariableType, variableId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        
        // Update variable with file data, use filename as display name
        const existingVar = variables.find(v => v.id === variableId);
        
        if (existingVar) {
          onVariablesChange(variables.map(v => 
            v.id === existingVar.id ? { ...v, data: base64, mimeType: file.type, name: file.name } : v
          ));
        } else {
          onVariablesChange([...variables, { id: variableId, type, name: file.name, data: base64, mimeType: file.type }]);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [variables, onVariablesChange]);

  // Handle chip clicks
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const chip = target.closest('.variable-chip') as HTMLElement;
    
    if (chip) {
      const type = chip.dataset.variableType as VariableType;
      const variableId = chip.dataset.variableId!;
      
      if (type === 'file_base64' || type === 'file_dataurl') {
        // Open file picker directly
        openFilePicker(type, variableId);
        e.preventDefault();
        e.stopPropagation();
      } else if (type === 'base64') {
        const rect = chip.getBoundingClientRect();
        const variable = variables.find(v => v.id === variableId);
        
        setPopoverInput(variable?.data || '');
        setActivePopover({ variableKey: `${type}:${variableId}`, rect });
        e.preventDefault();
        e.stopPropagation();
      }
    } else {
      setActivePopover(null);
    }
  }, [variables, openFilePicker]);

  // Select variable type
  const handleSelectType = useCallback((type: VariableType) => {
    setShowTypeMenu(false);
    
    const editor = editorRef.current;
    if (!editor) return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return;
    
    const textNode = range.startContainer as Text;
    const pos = range.startOffset;
    
    // Remove the {{ we typed
    const text = textNode.textContent || '';
    textNode.textContent = text.slice(0, pos - 2) + text.slice(pos);
    
    // Generate id and marker - use generated id, display name is type label
    const id = generateId();
    const displayName = type === 'file_base64' || type === 'file_dataurl' ? 'file' : type;
    const marker = `{{${type}:${id}}}`;
    
    // Create and insert chip
    const chip = createChip(type, id, marker);
    
    // Position range after removal
    const newPos = pos - 2;
    range.setStart(textNode, newPos);
    range.setEnd(textNode, newPos);
    range.insertNode(chip);
    
    // Add zero-width space after chip for cursor positioning
    const zwsp = document.createTextNode('\u200B');
    chip.after(zwsp);
    
    // Move cursor after the zero-width space
    range.setStart(zwsp, 1);
    range.setEnd(zwsp, 1);
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Add variable
    skipVariableRebuildRef.current = true;
    onVariablesChange([...variables, { id, type, name: displayName }]);
    
    // Update content
    const content = extractContent(editor);
    lastContentRef.current = content;
    isInternalChange.current = true;
    onChange(content);
    
    // For file type, open picker
    if (type === 'file_base64' || type === 'file_dataurl') {
      setTimeout(() => openFilePicker(type, id), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variables, onVariablesChange, onChange]);

  // Save popover
  const handleSavePopover = useCallback(() => {
    if (!activePopover) return;
    
    const [type, variableId] = activePopover.variableKey.split(':') as [VariableType, string];
    const existingVar = variables.find(v => v.id === variableId);
    
    if (existingVar) {
      onVariablesChange(variables.map(v => 
        v.id === existingVar.id 
          ? { ...v, data: popoverInput }
          : v
      ));
    } else {
      onVariablesChange([...variables, {
        id: variableId, type, name: type, data: popoverInput,
      }]);
    }
    
    setActivePopover(null);
    editorRef.current?.focus();
  }, [activePopover, popoverInput, variables, onVariablesChange]);



  // Close menus on escape/outside click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowTypeMenu(false);
        setActivePopover(null);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowTypeMenu(false);
        setActivePopover(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Calculate popover position
  const popoverPosition = useMemo(() => {
    if (!activePopover || !containerRef.current) return { top: 0, left: 0 };
    const containerRect = containerRef.current.getBoundingClientRect();
    return {
      top: activePopover.rect.bottom - containerRect.top + 4,
      left: Math.max(0, activePopover.rect.left - containerRect.left),
    };
  }, [activePopover]);

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-50 max-h-[60vh] relative overflow-hidden">
      {/* Editor or Raw View */}
      {showRaw ? (
        <pre className="flex-1 min-h-0 p-3 font-mono text-sm text-zinc-100 overflow-y-auto whitespace-pre-wrap wrap-break-word">
          {resolvedJson}
        </pre>
      ) : (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          className="flex-1 min-h-0 p-3 font-mono text-sm text-zinc-100 outline-none overflow-y-auto whitespace-pre-wrap wrap-break-word"
        />
      )}
      
      {/* Status bar */}
      <div className="flex items-center justify-end gap-2 px-3 py-1.5 text-xs shrink-0">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className={`transition-colors flex items-center gap-1 ${showRaw ? 'text-blue-400 hover:text-blue-300' : 'text-zinc-500 hover:text-zinc-300'}`}
          title={showRaw ? "Show editor" : "Show resolved JSON"}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        {jsonValidity.valid ? (
          <span className="text-emerald-500">Valid JSON</span>
        ) : (
          <span className="text-red-400" title={jsonValidity.error}>Invalid JSON</span>
        )}
      </div>
      
      {/* Type Menu */}
      {showTypeMenu && (
        <div className="fixed z-50 w-56 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl py-1" style={{ top: typeMenuPosition.top, left: typeMenuPosition.left }}>
          {variableTypes.map((vt) => (
            <button key={vt.type} onClick={() => handleSelectType(vt.type)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-700 transition-colors">
              <span className="text-zinc-400">{vt.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200">{vt.label}</div>
                <div className="text-xs text-zinc-500">{vt.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      
      {/* Popover */}
      {activePopover && (() => {
        const [type] = activePopover.variableKey.split(':') as [VariableType, string];
        
        return (
          <div className="absolute z-50 bg-zinc-800/95 border border-zinc-700/50 rounded shadow-lg p-1.5 w-44" style={popoverPosition}>
            {type === 'base64' ? (
              <div className="flex gap-1">
                <input 
                  type="text"
                  value={popoverInput} 
                  onChange={(e) => setPopoverInput(e.target.value)} 
                  onKeyDown={(e) => e.key === 'Enter' && handleSavePopover()}
                  placeholder="Text to encode..." 
                  className="flex-1 min-w-0 px-1.5 py-0.5 text-xs bg-transparent text-zinc-200 rounded border-none focus:outline-none placeholder:text-zinc-500" 
                  autoFocus 
                />
                <button onClick={handleSavePopover} className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors">
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : null}
          </div>
        );
      })()}
    </div>
  );
}

// Helpers
function getChipLabel(type: VariableType, _id: string, variable?: Variable): string {
  switch (type) {
    case 'file_base64':
    case 'file_dataurl':
      return variable?.data ? (variable.name || 'file') : 'Select file...';
    default: return variable?.name || type;
  }
}

function getChipIconSvg(type: VariableType): string {
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
