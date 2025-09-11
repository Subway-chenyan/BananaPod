
import React, { useEffect } from 'react';
import type { Tool } from '../types';
import type { JSX } from 'react';

interface ToolbarProps {
    activeTool: Tool;
    setActiveTool: (tool: Tool) => void;
    drawingOptions: { strokeColor: string; strokeWidth: number; fillColor: string };
    setDrawingOptions: (options: { strokeColor: string; strokeWidth: number; fillColor: string }) => void;
    onUpload: (file: File) => void;
    onUrlUpload: (url: string) => void;
    isCropping: boolean;
    onConfirmCrop: () => void;
    onCancelCrop: () => void;
    onSettingsClick: () => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

const ToolButton: React.FC<{
    label: string;
    icon: JSX.Element;
    isActive?: boolean;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
    shortcut?: string;
}> = ({ label, icon, isActive = false, onClick, disabled = false, className = '', shortcut }) => (
    <button
        onClick={onClick}
        aria-label={label}
        disabled={disabled}
        title={shortcut ? `${label} (${shortcut})` : label}
        className={`p-2 rounded-md transition-colors duration-200 ${
            isActive ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-200'
        } disabled:text-gray-300 disabled:bg-white disabled:cursor-not-allowed ${className}`}
    >
        {icon}
    </button>
);

// 快捷键映射
const SHORTCUTS = {
    select: 'V',
    pan: 'H',
    draw: 'B',
    rectangle: 'R',
    circle: 'C',
    triangle: 'T',
    erase: 'E',
    undo: 'Ctrl+Z',
    redo: 'Ctrl+Y',
    upload: 'Ctrl+O',
    settings: 'Ctrl+,'
};

export const Toolbar: React.FC<ToolbarProps> = ({
    activeTool,
    setActiveTool,
    drawingOptions,
    setDrawingOptions,
    onUpload,
    onUrlUpload,
    isCropping,
    onConfirmCrop,
    onCancelCrop,
    onSettingsClick,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
}) => {
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const handleUploadClick = () => fileInputRef.current?.click();
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            onUpload(e.target.files[0]);
            e.target.value = '';
        }
    };

    // 键盘快捷键处理
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 防止在输入框中触发快捷键
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            const key = e.key.toUpperCase();
            const isCtrl = e.ctrlKey || e.metaKey;

            // 处理组合键
            if (isCtrl) {
                switch (key) {
                    case 'Z':
                        if (!e.shiftKey && canUndo) {
                            e.preventDefault();
                            onUndo();
                        }
                        break;
                    case 'Y':
                        if (canRedo) {
                            e.preventDefault();
                            onRedo();
                        }
                        break;
                    case 'O':
                        e.preventDefault();
                        handleUploadClick();
                        break;
                    case ',':
                        e.preventDefault();
                        onSettingsClick();
                        break;
                }
                return;
            }

            // 处理单键快捷键
            if (!isCropping) {
                switch (key) {
                    case 'V':
                        setActiveTool('select');
                        break;
                    case 'H':
                        setActiveTool('pan');
                        break;
                    case 'B':
                        setActiveTool('draw');
                        break;
                    case 'R':
                        setActiveTool('rectangle');
                        break;
                    case 'C':
                        setActiveTool('circle');
                        break;
                    case 'T':
                        setActiveTool('triangle');
                        break;
                    case 'E':
                        setActiveTool('erase');
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTool, setActiveTool, canUndo, canRedo, onUndo, onRedo, onSettingsClick, isCropping, handleUploadClick]);

    if (isCropping) {
        return (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 p-2 bg-white rounded-lg shadow-lg flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-700">Crop Image</span>
                <div className="h-8 w-px bg-gray-200 mx-2"></div>
                <button onClick={onCancelCrop} className="px-4 py-1.5 text-sm rounded-md bg-white text-gray-700 hover:bg-gray-100 border border-gray-300">Cancel</button>
                <button onClick={onConfirmCrop} className="px-4 py-1.5 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600">Confirm</button>
            </div>
        )
    }

    const mainTools: { id: Tool; label: string; icon: JSX.Element; shortcut: string }[] = [
        { id: 'select', label: 'Select & Move', shortcut: SHORTCUTS.select, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg> },
        { id: 'pan', label: 'Pan Canvas', shortcut: SHORTCUTS.pan, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18.5V14a2.5 2.5 0 0 1 2.5-2.5h1.5a2.5 2.5 0 0 1 2.5 2.5v4.5"/><path d="M10.5 11.5V6a2.5 2.5 0 0 1 2.5-2.5h1.5a2.5 2.5 0 0 1 2.5 2.5v5.5"/><path d="M10 14h5.5a2.5 2.5 0 0 1 2.5 2.5v1.5a2.5 2.5 0 0 1-2.5 2.5h-1.5a2.5 2.5 0 0 1-2.5-2.5"/></svg> },
    ];

     const drawingTools: { id: Tool; label: string; icon: JSX.Element; shortcut: string }[] = [
        { id: 'draw', label: 'Draw', shortcut: SHORTCUTS.draw, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg> },
        { id: 'rectangle', label: 'Rectangle', shortcut: SHORTCUTS.rectangle, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg> },
        { id: 'circle', label: 'Circle', shortcut: SHORTCUTS.circle, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /></svg> },
        { id: 'triangle', label: 'Triangle', shortcut: SHORTCUTS.triangle, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg> },
        { id: 'erase', label: 'Erase', shortcut: SHORTCUTS.erase, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21H7Z"/><path d="M22 21H7"/><path d="m5 12 5 5"/></svg> },
    ];

    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 p-2 bg-white rounded-lg shadow-lg flex items-center space-x-2">
            <ToolButton label="Undo" onClick={onUndo} disabled={!canUndo} shortcut={SHORTCUTS.undo} icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10v6h6"/><path d="m21.76 18.24-1.28-1.28A9.95 9.95 0 0 0 20 13a10 10 0 1 0-10 10c.89 0 1.76-.12 2.59-.35"/></svg>} />
            <ToolButton label="Redo" onClick={onRedo} disabled={!canRedo} shortcut={SHORTCUTS.redo} icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10v6h-6"/><path d="m2.24 18.24 1.28-1.28A9.95 9.95 0 0 1 4 13a10 10 0 1 1 10 10c-.89 0-1.76-.12-2.59-.35"/></svg>} />
            <div className="h-8 w-px bg-gray-200 mx-2"></div>
            {mainTools.map(tool => (
                <ToolButton key={tool.id} label={tool.label} icon={tool.icon} isActive={activeTool === tool.id} onClick={() => setActiveTool(tool.id)} shortcut={tool.shortcut} />
            ))}
             <div className="h-8 w-px bg-gray-200 mx-2"></div>
            {drawingTools.map(tool => (
                <ToolButton key={tool.id} label={tool.label} icon={tool.icon} isActive={activeTool === tool.id} onClick={() => setActiveTool(tool.id)} shortcut={tool.shortcut} />
            ))}
            <div className="h-8 w-px bg-gray-200 mx-2"></div>
            <input type="color" aria-label="Stroke Color" value={drawingOptions.strokeColor} onChange={(e) => setDrawingOptions({ ...drawingOptions, strokeColor: e.target.value })} className="w-8 h-8 p-0 border-none rounded-md cursor-pointer bg-white" />
            <input type="range" min="1" max="50" value={drawingOptions.strokeWidth} aria-label="Stroke Width" onChange={(e) => setDrawingOptions({ ...drawingOptions, strokeWidth: parseInt(e.target.value, 10) })} className="w-24 cursor-pointer" />
            <span className="text-sm text-gray-600 w-6 text-center">{drawingOptions.strokeWidth}</span>
            <div className="flex items-center space-x-1">
                <button
                    onClick={() => setDrawingOptions({ ...drawingOptions, fillColor: 'none' })}
                    className={`w-8 h-8 border-2 rounded-md cursor-pointer flex items-center justify-center ${
                        drawingOptions.fillColor === 'none' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'
                    }`}
                    title="Transparent Fill"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="none"/>
                    </svg>
                </button>
                <input
                    type="color"
                    aria-label="Fill Color"
                    value={drawingOptions.fillColor === 'none' ? '#ffffff' : drawingOptions.fillColor}
                    onChange={(e) => setDrawingOptions({ ...drawingOptions, fillColor: e.target.value })}
                    className="w-8 h-8 p-0 border-none rounded-md cursor-pointer bg-white"
                    title="Fill Color"
                />
            </div>
            <div className="h-8 w-px bg-gray-200 mx-2"></div>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            <div className="relative">
                <ToolButton label="Upload Image" onClick={handleUploadClick} shortcut={SHORTCUTS.upload} icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>} />
            </div>
            <ToolButton label="Upload from URL" onClick={() => onUrlUpload('')} icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>} />
            <div className="h-8 w-px bg-gray-200 mx-2"></div>
             <ToolButton label="Canvas Settings" onClick={onSettingsClick} shortcut={SHORTCUTS.settings} icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2.12l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2.12l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>} />
        </div>
    );
};
