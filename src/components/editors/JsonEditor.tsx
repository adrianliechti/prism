import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { File, Clock, Hash, Shuffle, Sparkles, Check, Eye } from 'lucide-react';
import type { Variable, VariableType } from '../../types/types';
import { resolveVariables } from '../../utils/variables';
import { useEditor } from './useEditor';

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  variables: Variable[];
  onVariablesChange: (variables: Variable[]) => void;
  placeholder?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
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

export function JsonEditor({ value, onChange, variables, onVariablesChange, placeholder, action }: JsonEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Use the hook
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
    indentTriggers: ['{', '['],
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
    if (autoFormatTimeoutRef.current) {
      clearTimeout(autoFormatTimeoutRef.current);
      autoFormatTimeoutRef.current = null;
    }
    
    if (jsonValidity.valid && !jsonValidity.empty && wasInvalidRef.current) {
      autoFormatTimeoutRef.current = setTimeout(() => {
        try {
          let temp = value;
          temp = temp.replace(/"\{\{[^{}]+\}\}"/g, '"__var__"');
          temp = temp.replace(/\{\{[^{}]+\}\}/g, 'null');
          JSON.parse(temp);
          
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
          
          formatted = formatted.replace(/\{\}/g, '{\n}');
          formatted = formatted.replace(/\[\]/g, '[\n]');
          
          placeholders.forEach((original, ph) => {
            formatted = formatted.replace(ph, original);
          });
          
          if (formatted !== value) {
            onChange(formatted);
          }
        } catch {
          // Ignore
        }
      }, 500);
    }
    
    wasInvalidRef.current = !jsonValidity.valid;
    
    return () => {
      if (autoFormatTimeoutRef.current) {
        clearTimeout(autoFormatTimeoutRef.current);
      }
    };
  }, [jsonValidity.valid, jsonValidity.empty, value, onChange]);

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
          {resolvedJson}
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
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs shrink-0">
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="text-[11px] px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
          >
            {action.label}
          </button>
        )}
        <div className="flex-1" />
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