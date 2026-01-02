import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { File, Clock, Hash, Shuffle, Sparkles, Check, Eye } from 'lucide-react';
import type { Variable, VariableType } from '../types/types';
import { resolveVariables } from '../utils/variables';
import { useEditor } from './editor';

interface XmlEditorProps {
  value: string;
  onChange: (value: string) => void;
  variables: Variable[];
  onVariablesChange: (variables: Variable[]) => void;
  placeholder?: string;
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

// Simple XML validation
function validateXml(xml: string): { valid: boolean; error?: string } {
  if (!xml.trim()) return { valid: true };
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const errorNode = doc.querySelector('parsererror');
    
    if (errorNode) {
      // Extract error message
      const errorText = errorNode.textContent || 'Invalid XML';
      // Clean up the error message
      const match = errorText.match(/error[^:]*:\s*(.+)/i);
      return { valid: false, error: match ? match[1].trim() : errorText.split('\n')[0] };
    }
    
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Invalid XML' };
  }
}

// Format XML with indentation
function formatXml(xml: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) {
      return xml; // Return as-is if invalid
    }
    
    const serializer = new XMLSerializer();
    const result = serializer.serializeToString(doc);
    
    // Basic pretty-print
    let formatted = '';
    let indent = 0;
    const lines = result.replace(/></g, '>\n<').split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Decrease indent for closing tags
      if (trimmed.startsWith('</')) {
        indent = Math.max(0, indent - 1);
      }
      
      formatted += '  '.repeat(indent) + trimmed + '\n';
      
      // Increase indent for opening tags (not self-closing)
      if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.startsWith('<?') && !trimmed.endsWith('/>')) {
        indent++;
      }
    }
    
    return formatted.trim();
  } catch {
    return xml;
  }
}

export function XmlEditor({ value, onChange, variables, onVariablesChange, placeholder }: XmlEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const {
    handleInput,
    handlePaste,
    handleKeyDown,
    insertVariable,
    showTypeMenu,
    setShowTypeMenu,
    typeMenuPosition,
    buildDOM
  } = useEditor({
    editorRef,
    value,
    onChange,
    variables,
    onVariablesChange,
    indentTriggers: ['>', '{', '['], // XML uses > for tag opening
  });

  // Popover state
  const [activePopover, setActivePopover] = useState<{
    variableKey: string;
    rect: DOMRect;
  } | null>(null);
  const [popoverInput, setPopoverInput] = useState('');
  
  // Track previous validity for auto-format
  const wasInvalidRef = useRef(false);
  const autoFormatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // XML validity (with variable placeholders replaced)
  const xmlValidity = useMemo(() => {
    if (!value.trim()) return { valid: true, empty: true };
    // Replace variable markers with placeholder text for validation
    let temp = value;
    temp = temp.replace(/\{\{[^{}]+\}\}/g, 'PLACEHOLDER');
    const result = validateXml(temp);
    return { ...result, empty: false };
  }, [value]);

  // State for showing raw preview
  const [showRaw, setShowRaw] = useState(false);

  // Resolve variables to get raw XML
  const resolvedXml = useMemo(() => {
    return resolveVariables(value, variables, {
      missingDataPlaceholder: '[no data]',
    });
  }, [value, variables]);

  // Auto-format when XML becomes valid after being invalid
  useEffect(() => {
    if (autoFormatTimeoutRef.current) {
      clearTimeout(autoFormatTimeoutRef.current);
      autoFormatTimeoutRef.current = null;
    }
    
    if (xmlValidity.valid && !xmlValidity.empty && wasInvalidRef.current) {
      autoFormatTimeoutRef.current = setTimeout(() => {
        // Preserve variable markers during formatting
        const placeholders: Map<string, string> = new Map();
        let content = value;
        let index = 0;
        
        content = content.replace(/\{\{[^{}]+\}\}/g, (match) => {
          const ph = `__VAR_${index++}__`;
          placeholders.set(ph, match);
          return ph;
        });
        
        let formatted = formatXml(content);
        
        placeholders.forEach((original, ph) => {
          formatted = formatted.replace(ph, original);
        });
        
        if (formatted !== value) {
          onChange(formatted);
        }
      }, 500);
    }
    
    wasInvalidRef.current = !xmlValidity.valid;
    
    return () => {
      if (autoFormatTimeoutRef.current) {
        clearTimeout(autoFormatTimeoutRef.current);
      }
    };
  }, [xmlValidity.valid, xmlValidity.empty, value, onChange]);

  // Initial build and rebuild when switching back from raw mode
  useEffect(() => {
    if (!showRaw) {
      buildDOM();
    }
  }, [showRaw, buildDOM]);

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
    const id = insertVariable(type);
    if (id && (type === 'file_base64' || type === 'file_dataurl')) {
      setTimeout(() => openFilePicker(type, id), 0);
    }
  }, [insertVariable, openFilePicker]);

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
  }, [setShowTypeMenu]);

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
          {resolvedXml}
        </pre>
      ) : (
        <div className="flex-1 min-h-0 relative">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onClick={handleClick}
            className="h-full p-3 font-mono text-sm text-zinc-100 outline-none overflow-y-auto whitespace-pre-wrap wrap-break-word"
          />
          {!value && placeholder && (
            <div className="absolute top-3 left-3 font-mono text-sm text-zinc-500 pointer-events-none whitespace-pre-wrap">
              {placeholder}
            </div>
          )}
        </div>
      )}
      
      {/* Status bar */}
      <div className="flex items-center justify-end gap-2 px-3 py-1.5 text-xs shrink-0">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className={`transition-colors flex items-center gap-1 ${showRaw ? 'text-blue-400 hover:text-blue-300' : 'text-zinc-500 hover:text-zinc-300'}`}
          title={showRaw ? "Show editor" : "Show resolved XML"}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        {xmlValidity.valid ? (
          <span className="text-emerald-500">Valid XML</span>
        ) : (
          <span className="text-red-400" title={xmlValidity.error}>Invalid XML</span>
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
