
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { PromptBar } from './components/PromptBar';
import { Loader } from './components/Loader';
import { CanvasSettings } from './components/CanvasSettings';
import { ImageUrlUpload } from './components/ImageUrlUpload';
import { CanvasSizeSlider } from './components/CanvasSizeSlider';
import type { Tool, Point, Element, ImageElement, PathElement, ShapeElement } from './types';
import { fileToDataUrl } from './utils/fileUtils';
import { createElement, getElementAtPosition, generateId } from './utils/elementUtils';
import { editImage } from './services/geminiService';
import { saveAs } from 'file-saver';

const getElementBounds = (element: Element): { x: number; y: number; width: number; height: number } => {
    if (element.type === 'image' || element.type === 'shape') {
        return { x: element.x, y: element.y, width: element.width, height: element.height };
    }
    const { points } = element;
    if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    let minX = points[0].x, maxX = points[0].x;
    let minY = points[0].y, maxY = points[0].y;
    for (const p of points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

type Rect = { x: number; y: number; width: number; height: number };
type Guide = { type: 'v' | 'h'; position: number; start: number; end: number };
const SNAP_THRESHOLD = 5; // pixels in screen space

type Action = 'none' | 'drawing' | 'moving' | 'resizing';

const App: React.FC = () => {
    const [history, setHistory] = useState<Element[][]>([[]]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [elements, setElements] = useState<Element[]>([]);
    const [selectedElement, setSelectedElement] = useState<Element | null>(null);
    const [clipboard, setClipboard] = useState<Element | null>(null);
    const [action, setAction] = useState<Action>('none');
    const [activeTool, setActiveTool] = useState<Tool>('select');
    const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [drawingOptions, setDrawingOptions] = useState({ strokeColor: '#000000', strokeWidth: 5, fillColor: 'none' });
    const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
    const [selectionBox, setSelectionBox] = useState<Rect | null>(null);
    const [prompt, setPrompt] = useState('');
    const [canvasSize, setCanvasSize] = useState(100);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
    const [canvasBackgroundColor, setCanvasBackgroundColor] = useState<string>('#f3f4f6');
    const [showUrlUpload, setShowUrlUpload] = useState(false);
    const [croppingState, setCroppingState] = useState<{ elementId: string; originalElement: ImageElement; cropBox: Rect } | null>(null);
    const [alignmentGuides, setAlignmentGuides] = useState<Guide[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string } | null>(null);


    const interactionMode = useRef<string | null>(null);
    const startPoint = useRef<Point>({ x: 0, y: 0 });
    const currentDrawingElementId = useRef<string | null>(null);
    const resizeStartInfo = useRef<{ originalElement: ImageElement | ShapeElement; startCanvasPoint: Point; handle: string; shiftKey: boolean } | null>(null);
    const cropStartInfo = useRef<{ originalCropBox: Rect, startCanvasPoint: Point } | null>(null);
    const dragStartElementPositions = useRef<Map<string, {x: number, y: number} | Point[]>>(new Map());
    const elementsRef = useRef(elements); // Ref to have latest elements inside closures
    const svgRef = useRef<SVGSVGElement>(null);
    
    // 确保elementsRef与当前elements状态同步
    useEffect(() => {
        elementsRef.current = elements;
    }, [elements]);

    const [isGenerating, setIsGenerating] = useState(false);


    const commitAction = (newElements: Element[]) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newElements);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setElements(history[newIndex]);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            setElements(history[newIndex]);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                handleUndo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
                e.preventDefault();
                handleRedo();
                return;
            }
            
            if (!isTyping && (e.key === 'Delete' || e.key === 'Backspace') && (selectedElement || selectedElementIds.length > 0)) {
                e.preventDefault();
                handleDelete();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo, handleRedo, selectedElement, selectedElementIds]);


    const handleMouseDown = (event: React.MouseEvent<SVGSVGElement>) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        
        const scaleFactor = canvasSize / 100;
        const canvasX = ((event.clientX - rect.left) / scaleFactor - panOffset.x) / zoom;
        const canvasY = ((event.clientY - rect.top) / scaleFactor - panOffset.y) / zoom;
        
        startPoint.current = { x: canvasX, y: canvasY };
        
        if (croppingState) {
            cropStartInfo.current = {
                originalCropBox: { ...croppingState.cropBox },
                startCanvasPoint: { x: canvasX, y: canvasY }
            };
            return;
        }
        
        if (activeTool === 'select') {
            // 检查是否点击了调整控制点
            const target = event.target as SVGElement;
            const handleName = target.getAttribute('data-handle');
            
            if (handleName && selectedElement && (selectedElement.type === 'image' || selectedElement.type === 'shape')) {
                // 点击了调整控制点
                setAction('resizing');
                resizeStartInfo.current = {
                    originalElement: selectedElement as ImageElement | ShapeElement,
                    startCanvasPoint: { x: canvasX, y: canvasY },
                    handle: handleName,
                    shiftKey: event.shiftKey
                };
                return;
            }
            
            const clickedElement = getElementAtPosition(canvasX, canvasY, elementsRef.current);
            
            if (clickedElement) {
                setSelectedElement(clickedElement);
                setSelectedElementIds([clickedElement.id]);
                setAction('moving');
                
                // 记录拖拽开始时的元素位置
                if (clickedElement.type === 'path') {
                    dragStartElementPositions.current.set(clickedElement.id, [...clickedElement.points]);
                } else {
                    dragStartElementPositions.current.set(clickedElement.id, { x: clickedElement.x, y: clickedElement.y });
                }
            } else {
                setSelectedElement(null);
                setSelectedElementIds([]);
                setAction('drawing');
                setSelectionBox({ x: canvasX, y: canvasY, width: 0, height: 0 });
            }
        } else if (activeTool === 'pan') {
            setAction('moving');
            startPoint.current = { x: event.clientX, y: event.clientY };
        } else if (activeTool === 'draw') {
             setAction('drawing');
             const newElement = createElement('draw', canvasX, canvasY);
             if (newElement && newElement.type === 'path') {
                 newElement.points = [{ x: canvasX, y: canvasY }];
                 newElement.strokeColor = drawingOptions.strokeColor;
                 newElement.strokeWidth = drawingOptions.strokeWidth;
                 currentDrawingElementId.current = newElement.id;
                 const newElements = [...elementsRef.current, newElement];
                 setElements(newElements);
             }
        } else if (activeTool === 'erase') {
             setAction('drawing');
             // 橡皮擦工具：删除鼠标位置的元素
             const elementToErase = getElementAtPosition(canvasX, canvasY, elementsRef.current);
             if (elementToErase) {
                 const newElements = elementsRef.current.filter(el => el.id !== elementToErase.id);
                 setElements(newElements);
                 commitAction(newElements);
                 if (selectedElement && selectedElement.id === elementToErase.id) {
                     setSelectedElement(null);
                     setSelectedElementIds([]);
                 }
             }
        } else if (['rectangle', 'circle', 'triangle'].includes(activeTool)) {
             setAction('drawing');
             const newElement = createElement(activeTool as Tool, canvasX, canvasY);
             if (newElement && newElement.type === 'shape') {
                 newElement.fillColor = drawingOptions.fillColor;
                 newElement.strokeColor = drawingOptions.strokeColor;
                 newElement.strokeWidth = drawingOptions.strokeWidth;
                 currentDrawingElementId.current = newElement.id;
                 const newElements = [...elementsRef.current, newElement];
                 setElements(newElements);
             }
        }
    };

    const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        
        const scaleFactor = canvasSize / 100;
        const canvasX = ((event.clientX - rect.left) / scaleFactor - panOffset.x) / zoom;
        const canvasY = ((event.clientY - rect.top) / scaleFactor - panOffset.y) / zoom;
        
        if (croppingState && cropStartInfo.current) {
            const dx = canvasX - cropStartInfo.current.startCanvasPoint.x;
            const dy = canvasY - cropStartInfo.current.startCanvasPoint.y;
            
            setCroppingState(prev => prev ? {
                ...prev,
                cropBox: {
                    x: cropStartInfo.current!.originalCropBox.x + dx,
                    y: cropStartInfo.current!.originalCropBox.y + dy,
                    width: cropStartInfo.current!.originalCropBox.width,
                    height: cropStartInfo.current!.originalCropBox.height
                }
            } : null);
            return;
        }
        
        if (action === 'moving' && selectedElement && activeTool === 'select') {
            const dx = canvasX - startPoint.current.x;
            const dy = canvasY - startPoint.current.y;
            
            const newElements = elementsRef.current.map(el => {
                if (el.id === selectedElement.id) {
                    if (el.type === 'path') {
                        const originalPoints = dragStartElementPositions.current.get(el.id) as Point[];
                        return {
                            ...el,
                            points: originalPoints.map(p => ({ x: p.x + dx, y: p.y + dy }))
                        };
                    } else {
                        const originalPos = dragStartElementPositions.current.get(el.id) as { x: number; y: number };
                        return {
                            ...el,
                            x: originalPos.x + dx,
                            y: originalPos.y + dy
                        };
                    }
                }
                return el;
            });
            setElements(newElements);
        } else if (action === 'resizing' && resizeStartInfo.current) {
            const { originalElement, startCanvasPoint, handle, shiftKey } = resizeStartInfo.current;
            const dx = canvasX - startCanvasPoint.x;
            const dy = canvasY - startCanvasPoint.y;
            
            let newX = originalElement.x;
            let newY = originalElement.y;
            let newWidth = originalElement.width;
            let newHeight = originalElement.height;
            
            // 根据控制点计算新的尺寸和位置
            if (handle.includes('l')) { // 左边控制点
                newX = originalElement.x + dx;
                newWidth = originalElement.width - dx;
            }
            if (handle.includes('r')) { // 右边控制点
                newWidth = originalElement.width + dx;
            }
            if (handle.includes('t')) { // 顶部控制点
                newY = originalElement.y + dy;
                newHeight = originalElement.height - dy;
            }
            if (handle.includes('b')) { // 底部控制点
                newHeight = originalElement.height + dy;
            }
            
            // 保持最小尺寸
            const minSize = 10;
            if (newWidth < minSize) {
                if (handle.includes('l')) {
                    newX = originalElement.x + originalElement.width - minSize;
                }
                newWidth = minSize;
            }
            if (newHeight < minSize) {
                if (handle.includes('t')) {
                    newY = originalElement.y + originalElement.height - minSize;
                }
                newHeight = minSize;
            }
            
            // 如果按住Shift键，保持宽高比
            if (shiftKey) {
                const aspectRatio = originalElement.width / originalElement.height;
                if (handle.includes('t') || handle.includes('b')) {
                    newWidth = newHeight * aspectRatio;
                    if (handle.includes('l')) {
                        newX = originalElement.x + originalElement.width - newWidth;
                    }
                } else {
                    newHeight = newWidth / aspectRatio;
                    if (handle.includes('t')) {
                        newY = originalElement.y + originalElement.height - newHeight;
                    }
                }
            }
            
            const newElements = elementsRef.current.map(el => {
                if (el.id === originalElement.id) {
                    return {
                        ...el,
                        x: newX,
                        y: newY,
                        width: newWidth,
                        height: newHeight
                    };
                }
                return el;
            });
            setElements(newElements);
        } else if (action === 'drawing' && activeTool === 'select') {
            const width = canvasX - startPoint.current.x;
            const height = canvasY - startPoint.current.y;
            setSelectionBox({
                x: width < 0 ? canvasX : startPoint.current.x,
                y: height < 0 ? canvasY : startPoint.current.y,
                width: Math.abs(width),
                height: Math.abs(height)
            });
        } else if (action === 'moving' && activeTool === 'pan') {
            const dx = event.clientX - startPoint.current.x;
            const dy = event.clientY - startPoint.current.y;
            setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            startPoint.current = { x: event.clientX, y: event.clientY };
        } else if (action === 'drawing' && activeTool === 'draw' && currentDrawingElementId.current) {
            const newElements = elementsRef.current.map(el => {
                if (el.id === currentDrawingElementId.current) {
                    if (el.type === 'path') {
                        return {
                            ...el,
                            points: [...el.points, { x: canvasX, y: canvasY }]
                        };
                    }
                }
                return el;
            });
            setElements(newElements);
        } else if (action === 'drawing' && activeTool === 'erase') {
            // 橡皮擦工具：持续删除鼠标经过的元素
            const elementToErase = getElementAtPosition(canvasX, canvasY, elementsRef.current);
            if (elementToErase) {
                const newElements = elementsRef.current.filter(el => el.id !== elementToErase.id);
                setElements(newElements);
                if (selectedElement && selectedElement.id === elementToErase.id) {
                    setSelectedElement(null);
                    setSelectedElementIds([]);
                }
            }
        } else if (action === 'drawing' && currentDrawingElementId.current) {
            const newElements = elementsRef.current.map(el => {
                if (el.id === currentDrawingElementId.current) {
                    if (el.type === 'shape') {
                        const width = canvasX - startPoint.current.x;
                        const height = canvasY - startPoint.current.y;
                        return {
                            ...el,
                            x: width < 0 ? canvasX : startPoint.current.x,
                            y: height < 0 ? canvasY : startPoint.current.y,
                            width: Math.abs(width),
                            height: Math.abs(height)
                        };
                    }
                }
                return el;
            });
            setElements(newElements);
        }
    };

    const handleMouseUp = (event: React.MouseEvent<SVGSVGElement>) => {
        if (croppingState && cropStartInfo.current) {
            cropStartInfo.current = null;
            return;
        }
        
        if (action === 'drawing' && activeTool === 'select' && selectionBox) {
            // 处理框选逻辑
            const selectedIds: string[] = [];
            elementsRef.current.forEach(element => {
                if (isElementInSelectionBox(element, selectionBox)) {
                    selectedIds.push(element.id);
                }
            });
            setSelectedElementIds(selectedIds);
            setSelectionBox(null);
        } else if (action === 'drawing' && activeTool === 'draw' && currentDrawingElementId.current) {
            // 完成绘制，提交到历史记录
            commitAction(elementsRef.current);
        } else if (action === 'drawing' && activeTool === 'erase') {
            // 橡皮擦完成，提交历史记录
            commitAction(elementsRef.current);
        } else if (action === 'drawing' && ['rectangle', 'circle', 'triangle'].includes(activeTool) && currentDrawingElementId.current) {
            // 形状工具完成绘制，提交到历史记录
            commitAction(elementsRef.current);
        } else if (action === 'moving' && selectedElement) {
            // 完成拖拽，提交到历史记录
            commitAction(elementsRef.current);
        } else if (action === 'resizing' && resizeStartInfo.current) {
            // 完成调整大小，提交到历史记录
            commitAction(elementsRef.current);
            // 更新选中元素
            const updatedElement = elementsRef.current.find(el => el.id === resizeStartInfo.current!.originalElement.id);
            if (updatedElement) {
                setSelectedElement(updatedElement);
            }
        }
        
        // 清理状态
        setAction('none');
        currentDrawingElementId.current = null;
        dragStartElementPositions.current.clear();
        cropStartInfo.current = null;
        resizeStartInfo.current = null;
    };
    
    // 辅助函数：检查元素是否在选择框内
    const isElementInSelectionBox = (element: Element, box: { x: number; y: number; width: number; height: number }) => {
        if (element.type === 'path') {
            return element.points.some(point => 
                point.x >= box.x && point.x <= box.x + box.width &&
                point.y >= box.y && point.y <= box.y + box.height
            );
        } else {
            return element.x < box.x + box.width &&
                   element.x + (element.width || 0) > box.x &&
                   element.y < box.y + box.height &&
                   element.y + (element.height || 0) > box.y;
        }
    };

    const handleAddImageElement = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const newImageElement: Element = {
                    id: generateId(),
                    type: 'image',
                    x: 100,
                    y: 100,
                    width: img.width,
                    height: img.height,
                    href: img.src,
                    mimeType: file.type,
                };
                const newElements = [...elements, newImageElement];
                setElements(newElements);
                commitAction(newElements);
            };
            img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
         e.preventDefault();
         const files = Array.from(e.dataTransfer.files);
         files.forEach((file: File) => {
             if (file.type.startsWith('image/')) {
                 handleAddImageElement(file);
             }
         });
     };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
    };

    const handleCopyElement = () => {
         if (selectedElement) {
             setClipboard(selectedElement);
         }
     };

    const handleDownloadImage = () => {
         if (selectedElement && selectedElement.type === 'image') {
             const imageElement = selectedElement as ImageElement;
             const link = document.createElement('a');
             link.href = imageElement.href;
             link.download = `image_${imageElement.id}.png`;
             link.click();
         }
     };

    const handleStartCrop = () => {
         if (selectedElement && selectedElement.type === 'image') {
             const imageElement = selectedElement as ImageElement;
             setCroppingState({
                 elementId: imageElement.id,
                 originalElement: imageElement,
                 cropBox: {
                     x: imageElement.x,
                     y: imageElement.y,
                     width: imageElement.width,
                     height: imageElement.height
                 }
             });
         }
     };

    const handleDeleteElement = () => {
         if (selectedElement) {
             const newElements = elements.filter(el => el.id !== selectedElement.id);
             setElements(newElements);
             commitAction(newElements);
             setSelectedElement(null);
         }
     };

    const handleConfirmCrop = () => {
        if (croppingState) {
            const { elementId, cropBox } = croppingState;
            const newElements = elements.map(el => {
                if (el.id === elementId && el.type === 'image') {
                    return {
                        ...el,
                        x: cropBox.x,
                        y: cropBox.y,
                        width: cropBox.width,
                        height: cropBox.height
                    };
                }
                return el;
            });
            setElements(newElements);
            commitAction(newElements);
        }
        setCroppingState(null);
    };

    const handleCancelCrop = () => {
        setCroppingState(null);
    };

    const handleGenerate = async (prompt: string) => {
        await handleGenerateArt(prompt);
    };

    const handleCopy = () => {
        if (selectedElement) {
            setClipboard(selectedElement);
        }
    };

    const handlePaste = () => {
        if (clipboard) {
            const newElement = {
                ...clipboard,
                id: generateId(),
                x: clipboard.x + 10,
                y: clipboard.y + 10
            };
            const newElements = [...elements, newElement];
            setElements(newElements);
            commitAction(newElements);
        }
    };

    const handleDelete = () => {
        if (selectedElementIds.length > 0) {
            // 删除所有选中的元素
            const newElements = elements.filter(el => !selectedElementIds.includes(el.id));
            setElements(newElements);
            commitAction(newElements);
            setSelectedElement(null);
            setSelectedElementIds([]);
        } else if (selectedElement) {
            // 兼容单个选中元素的情况
            const newElements = elements.filter(el => el.id !== selectedElement.id);
            setElements(newElements);
            commitAction(newElements);
            setSelectedElement(null);
        }
    };

    const handleLayerChange = (direction: 'up' | 'down') => {
        if (selectedElement) {
            const index = elements.findIndex(el => el.id === selectedElement.id);
            if ((direction === 'up' && index < elements.length - 1) || (direction === 'down' && index > 0)) {
                const newIndex = direction === 'up' ? index + 1 : index - 1;
                const newElements = [...elements];
                [newElements[index], newElements[newIndex]] = [newElements[newIndex], newElements[index]];
                setElements(newElements);
                commitAction(newElements);
            }
        }
    };

    const handleGenerateArt = async (prompt: string) => {
        if (!prompt.trim()) return;
        setIsGenerating(true);
        try {
            // 获取选中的图片作为输入
            const selectedImageElements = elements.filter(el => 
                selectedElementIds.includes(el.id) && el.type === 'image'
            ) as ImageElement[];
            
            // 如果没有选中图片，创建一个默认的白色背景图片
            let inputImages: { href: string; mimeType: string }[] = [];
            
            if (selectedImageElements.length === 0) {
                // 创建一个白色背景的canvas作为默认输入
                const canvas = document.createElement('canvas');
                canvas.width = 512;
                canvas.height = 512;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, 512, 512);
                    const dataUrl = canvas.toDataURL('image/png');
                    inputImages = [{ href: dataUrl, mimeType: 'image/png' }];
                }
            } else {
                // 将选中的图片转换为base64格式
                const convertedImages = await Promise.all(
                    selectedImageElements.map(async (el) => {
                        if (el.href.startsWith('data:')) {
                            // 已经是data URL格式
                            return { href: el.href, mimeType: el.mimeType };
                        } else {
                            // 是URL，需要转换为base64
                            try {
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                const img = new Image();
                                img.crossOrigin = 'anonymous';
                                
                                return new Promise<{ href: string; mimeType: string }>((resolve, reject) => {
                                    img.onload = () => {
                                        canvas.width = img.width;
                                        canvas.height = img.height;
                                        ctx?.drawImage(img, 0, 0);
                                        const dataUrl = canvas.toDataURL(el.mimeType || 'image/png');
                                        resolve({ href: dataUrl, mimeType: el.mimeType || 'image/png' });
                                    };
                                    img.onerror = () => reject(new Error(`Failed to load image: ${el.href}`));
                                    img.src = el.href;
                                });
                            } catch (error) {
                                console.warn(`Failed to convert image ${el.href}:`, error);
                                // 如果转换失败，创建一个白色背景作为替代
                                const canvas = document.createElement('canvas');
                                canvas.width = 512;
                                canvas.height = 512;
                                const ctx = canvas.getContext('2d');
                                if (ctx) {
                                    ctx.fillStyle = 'white';
                                    ctx.fillRect(0, 0, 512, 512);
                                    const dataUrl = canvas.toDataURL('image/png');
                                    return { href: dataUrl, mimeType: 'image/png' };
                                }
                                throw error;
                            }
                        }
                    })
                );
                inputImages = convertedImages;
            }
            
            // 调用Gemini API生成图片
            const result = await editImage(inputImages, prompt);
            
            if (result.newImageBase64 && result.newImageMimeType) {
                const dataUrl = `data:${result.newImageMimeType};base64,${result.newImageBase64}`;
                
                // 创建新的图片元素
                const newImageElement: Element = {
                    id: generateId(),
                    type: 'image',
                    x: 100,
                    y: 100,
                    width: 512,
                    height: 512,
                    href: dataUrl,
                    mimeType: result.newImageMimeType,
                };
                
                const newElements = [...elements, newImageElement];
                setElements(newElements);
                commitAction(newElements);
                
                // 如果有文本响应，可以在控制台显示
                if (result.textResponse) {
                    console.log('AI Response:', result.textResponse);
                }
            } else {
                // 如果没有生成图片，显示错误信息
                const errorMessage = result.textResponse || 'Failed to generate image';
                setError(errorMessage);
                setTimeout(() => setError(null), 5000);
            }
        } catch (error) {
            console.error('Error generating art:', error);
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            setError(`Failed to generate image: ${errorMessage}`);
            setTimeout(() => setError(null), 5000);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSave = () => {
        const dataStr = JSON.stringify(elements, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        saveAs(dataBlob, 'canvas-elements.json');
    };

    const handleLoad = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const loadedElements = JSON.parse(e.target?.result as string);
                    setElements(loadedElements);
                    commitAction(loadedElements);
                } catch (error) {
                    console.error('Error loading file:', error);
                }
            };
            reader.readAsText(file);
        }
    };

    const handleClear = () => {
        const newElements: Element[] = [];
        setElements(newElements);
        commitAction(newElements);
    };

    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    const newImageElement: Element = {
                        id: generateId(),
                        type: 'image',
                        x: 100,
                        y: 100,
                        width: img.width,
                        height: img.height,
                        href: img.src,
                        mimeType: file.type,
                    };
                    const newElements = [...elements, newImageElement];
                    setElements(newElements);
                    commitAction(newElements);
                };
                img.src = reader.result as string;
            };
            reader.readAsDataURL(file);
        }
    };

    const handleUrlUpload = (url: string) => {
        if (url === '') {
            setShowUrlUpload(true);
            return;
        }
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const newImageElement: Element = {
                id: generateId(),
                type: 'image',
                x: 100,
                y: 100,
                width: img.width,
                height: img.height,
                href: url,
                mimeType: 'image/png', // 默认类型，实际可能不同
            };
            const newElements = [...elements, newImageElement];
            setElements(newElements);
            commitAction(newElements);
        };
        img.onerror = () => {
            console.error('Failed to load image from URL:', url);
        };
        img.src = url;
    };

    const handleFillColorChange = (elementId: string, newColor: string) => {
        const newElements = elements.map(el => (el.id === elementId && el.type === 'shape') ? { ...el, fillColor: newColor } : el);
        setElements(newElements);
        commitAction(newElements);
    };

     const handleLayerAction = (elementId: string, action: 'front' | 'back' | 'forward' | 'backward') => {
        const elementsCopy = [...elements];
        const index = elementsCopy.findIndex(el => el.id === elementId);
        if (index === -1) return;

        const [element] = elementsCopy.splice(index, 1);

        if (action === 'front') {
            elementsCopy.push(element);
        } else if (action === 'back') {
            elementsCopy.unshift(element);
        } else if (action === 'forward') {
            const newIndex = Math.min(elementsCopy.length, index + 1);
            elementsCopy.splice(newIndex, 0, element);
        } else if (action === 'backward') {
            const newIndex = Math.max(0, index - 1);
            elementsCopy.splice(newIndex, 0, element);
        }
        setElements(elementsCopy);
        commitAction(elementsCopy);
        setContextMenu(null);
    };

    const handleContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
        e.preventDefault();
        setContextMenu(null);
        const target = e.target as SVGElement;
        const elementId = target.closest('[data-id]')?.getAttribute('data-id');
        if (elementId) {
            setContextMenu({ x: e.clientX, y: e.clientY, elementId });
        }
    };


    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => { if (e.clipboardData?.files[0]?.type.startsWith("image/")) { e.preventDefault(); handleAddImageElement(e.clipboardData.files[0]); } };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [handleAddImageElement]);

    // 画布尺寸变化处理
    const handleCanvasSizeChange = useCallback((newSize: number) => {
        setCanvasSize(newSize);
    }, []);

    // 快捷键处理
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '=' || e.key === '+') {
                    e.preventDefault();
                    setCanvasSize(prev => Math.min(200, prev + 10));
                } else if (e.key === '-') {
                    e.preventDefault();
                    setCanvasSize(prev => Math.max(50, prev - 10));
                }
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const selectedImageElements = elements.filter(el => selectedElementIds.includes(el.id) && el.type === 'image');
    const isImageSelectionActive = selectedImageElements.length > 0;
    const singleSelectedElement = selectedElementIds.length === 1 ? elements.find(el => el.id === selectedElementIds[0]) : null;

    let cursor = 'default';
    if (croppingState) cursor = 'default';
    else if (action === 'moving' && activeTool === 'pan') cursor = 'grabbing';
    else if (activeTool === 'pan') cursor = 'grab';
    else if (['draw', 'erase', 'rectangle', 'circle', 'triangle'].includes(activeTool)) cursor = 'crosshair';
    

    return (
        <div className="w-screen h-screen flex flex-col font-sans" style={{ backgroundColor: canvasBackgroundColor }} onDragOver={handleDragOver} onDrop={handleDrop}>
            {isLoading && <Loader />}
            {error && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md shadow-lg flex items-center max-w-lg">
                    <span className="flex-grow">{error}</span>
                    <button onClick={() => setError(null)} className="ml-4 p-1 rounded-full hover:bg-red-200">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
                    </button>
                </div>
            )}
            <CanvasSettings isOpen={isSettingsPanelOpen} onClose={() => setIsSettingsPanelOpen(false)} backgroundColor={canvasBackgroundColor} onBackgroundColorChange={setCanvasBackgroundColor} />
            <Toolbar
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                drawingOptions={drawingOptions}
                setDrawingOptions={setDrawingOptions}
                onUpload={handleAddImageElement}
                onUrlUpload={handleUrlUpload}
                isCropping={!!croppingState}
                onConfirmCrop={handleConfirmCrop}
                onCancelCrop={handleCancelCrop}
                onSettingsClick={() => setIsSettingsPanelOpen(true)}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={historyIndex > 0}
                canRedo={historyIndex < history.length - 1}
            />
            <div className="flex-grow relative overflow-hidden">
                <CanvasSizeSlider 
                    canvasSize={canvasSize}
                    onSizeChange={handleCanvasSizeChange}
                    minSize={50}
                    maxSize={200}
                />
                <svg
                    ref={svgRef}
                    className="w-full h-full"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                    onContextMenu={handleContextMenu}
                    style={{ 
                        cursor,
                        transform: `scale(${canvasSize / 100})`,
                        transformOrigin: 'center center'
                    }}
                >
                    <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>
                        <defs>
                            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                                <circle cx="1" cy="1" r="1" className="fill-gray-400 opacity-50"/>
                            </pattern>
                        </defs>
                        <rect x={-panOffset.x/zoom} y={-panOffset.y/zoom} width={`calc(100% / ${zoom})`} height={`calc(100% / ${zoom})`} fill="url(#grid)" />
                        
                        {elements.map(el => {
                            const isSelected = selectedElementIds.includes(el.id);
                            let selectionComponent = null;

                            if (isSelected && !croppingState) {
                                if (selectedElementIds.length > 1 || (el.type === 'path')) {
                                     const bounds = getElementBounds(el);
                                     selectionComponent = <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="none" stroke="rgb(59 130 246)" strokeWidth={2/zoom} strokeDasharray={`${6/zoom} ${4/zoom}`} pointerEvents="none" />
                                } else if ((el.type === 'image' || el.type === 'shape')) {
                                    const handleSize = 8 / zoom;
                                    const handles = [
                                        { name: 'tl', x: el.x, y: el.y, cursor: 'nwse-resize' }, { name: 'tm', x: el.x + el.width / 2, y: el.y, cursor: 'ns-resize' }, { name: 'tr', x: el.x + el.width, y: el.y, cursor: 'nesw-resize' },
                                        { name: 'ml', x: el.x, y: el.y + el.height / 2, cursor: 'ew-resize' }, { name: 'mr', x: el.x + el.width, y: el.y + el.height / 2, cursor: 'ew-resize' },
                                        { name: 'bl', x: el.x, y: el.y + el.height, cursor: 'nesw-resize' }, { name: 'bm', x: el.x + el.width / 2, y: el.y + el.height, cursor: 'ns-resize' }, { name: 'br', x: el.x + el.width, y: el.y + el.height, cursor: 'nwse-resize' },
                                    ];
                                     selectionComponent = <g>
                                        <rect x={el.x} y={el.y} width={el.width} height={el.height} fill="none" stroke="rgb(59 130 246)" strokeWidth={2 / zoom} pointerEvents="none" />
                                        {handles.map(h => <rect key={h.name} data-handle={h.name} x={h.x - handleSize / 2} y={h.y - handleSize / 2} width={handleSize} height={handleSize} fill="white" stroke="#3b82f6" strokeWidth={1 / zoom} style={{ cursor: h.cursor }} pointerEvents="all" />)}
                                    </g>;
                                }
                            }
                           
                            if (el.type === 'path') {
                                const pathData = el.points.map((p, i) => i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`).join(' ');
                                return <g key={el.id} data-id={el.id} className="cursor-pointer"><path d={pathData} stroke={el.strokeColor} strokeWidth={el.strokeWidth / zoom} fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" />{selectionComponent}</g>;
                            }
                             if (el.type === 'shape') {
                                let shapeJsx;
                                if (el.shapeType === 'rectangle') shapeJsx = <rect width={el.width} height={el.height} />
                                else if (el.shapeType === 'circle') shapeJsx = <ellipse cx={el.width/2} cy={el.height/2} rx={el.width/2} ry={el.height/2} />
                                else if (el.shapeType === 'triangle') shapeJsx = <polygon points={`${el.width/2},0 0,${el.height} ${el.width},${el.height}`} />
                                return (
                                     <g key={el.id} data-id={el.id} transform={`translate(${el.x}, ${el.y})`} className="cursor-pointer">
                                        {shapeJsx && React.cloneElement(shapeJsx, { fill: el.fillColor, stroke: el.strokeColor, strokeWidth: el.strokeWidth / zoom })}
                                        {selectionComponent && React.cloneElement(selectionComponent, { transform: `translate(${-el.x}, ${-el.y})` })}
                                    </g>
                                );
                            }
                            if (el.type === 'image') {
                                return <g key={el.id} data-id={el.id}><image transform={`translate(${el.x}, ${el.y})`} href={el.href} width={el.width} height={el.height} className={croppingState && croppingState.elementId !== el.id ? 'opacity-30' : ''} />{selectionComponent}</g>;
                            }
                            return null;
                        })}
                        
                        {alignmentGuides.map((guide, i) => (
                             <line key={i} x1={guide.type === 'v' ? guide.position : guide.start} y1={guide.type === 'h' ? guide.position : guide.start} x2={guide.type === 'v' ? guide.position : guide.end} y2={guide.type === 'h' ? guide.position : guide.end} stroke="red" strokeWidth={1/zoom} strokeDasharray={`${4/zoom} ${2/zoom}`} />
                        ))}
                        
                        {selectionBox && (
                            <rect 
                                x={selectionBox.x} 
                                y={selectionBox.y} 
                                width={selectionBox.width} 
                                height={selectionBox.height} 
                                fill="rgba(59, 130, 246, 0.1)" 
                                stroke="rgb(59, 130, 246)" 
                                strokeWidth={1/zoom} 
                                strokeDasharray={`${4/zoom} ${2/zoom}`}
                                pointerEvents="none"
                            />
                        )}

                        {singleSelectedElement && !croppingState && (() => {
                            const element = singleSelectedElement;
                            const bounds = getElementBounds(element);
                            const toolbarScreenWidth = element.type === 'shape' ? 200 : 160;
                            const toolbarScreenHeight = 56;
                            
                            const toolbarCanvasWidth = toolbarScreenWidth / zoom;
                            const toolbarCanvasHeight = toolbarScreenHeight / zoom;
                            
                            const x = bounds.x + bounds.width / 2 - (toolbarCanvasWidth / 2);
                            const y = bounds.y - toolbarCanvasHeight - (10 / zoom);
                            
                            const toolbar = <div
                                style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'top left', width: `${toolbarScreenWidth}px`, height: `${toolbarScreenHeight}px` }}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <div className="p-1.5 bg-white rounded-lg shadow-lg flex items-center justify-center space-x-2 border border-gray-200 text-gray-800">
                                    <button title="Copy" onClick={handleCopy} className="p-2 rounded hover:bg-blue-100 hover:text-blue-600 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                                    {element.type === 'image' && <button title="Download" onClick={handleDownloadImage} className="p-2 rounded hover:bg-gray-100 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>}
                                    {element.type === 'image' && <button title="Crop" onClick={handleStartCrop} className="p-2 rounded hover:bg-gray-100 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"></path><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"></path></svg></button>}
                                    {element.type === 'shape' && <input type="color" title="Fill Color" value={(element as ShapeElement).fillColor} onChange={e => handleFillColorChange(element.id, e.target.value)} className="w-7 h-7 p-0 border-none rounded cursor-pointer" />}
                                    <div className="h-6 w-px bg-gray-200"></div>
                                    <button title="Delete" onClick={handleDelete} className="p-2 rounded hover:bg-red-100 hover:text-red-600 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                                </div>
                            </div>;
                            
                            return (
                                <foreignObject x={x} y={y} width={toolbarCanvasWidth} height={toolbarCanvasHeight} style={{ overflow: 'visible' }}>
                                    {toolbar}
                                </foreignObject>
                            );
                        })()}
                        {croppingState && (
                             <g>
                                <path
                                    d={`M ${-panOffset.x/zoom},${-panOffset.y/zoom} H ${window.innerWidth/zoom - panOffset.x/zoom} V ${window.innerHeight/zoom - panOffset.y/zoom} H ${-panOffset.x/zoom} Z M ${croppingState.cropBox.x},${croppingState.cropBox.y} v ${croppingState.cropBox.height} h ${croppingState.cropBox.width} v ${-croppingState.cropBox.height} Z`}
                                    fill="rgba(0,0,0,0.5)"
                                    fillRule="evenodd"
                                    pointerEvents="none"
                                />
                                <rect x={croppingState.cropBox.x} y={croppingState.cropBox.y} width={croppingState.cropBox.width} height={croppingState.cropBox.height} fill="none" stroke="white" strokeWidth={2 / zoom} pointerEvents="all" />
                                {(() => {
                                    const { x, y, width, height } = croppingState.cropBox;
                                    const handleSize = 10 / zoom;
                                    const handles = [
                                        { name: 'tl', x, y, cursor: 'nwse-resize' }, { name: 'tr', x: x + width, y, cursor: 'nesw-resize' },
                                        { name: 'bl', x, y: y + height, cursor: 'nesw-resize' }, { name: 'br', x: x + width, y: y + height, cursor: 'nwse-resize' },
                                    ];
                                    return handles.map(h => <rect key={h.name} data-handle={h.name} x={h.x - handleSize/2} y={h.y - handleSize/2} width={handleSize} height={handleSize} fill="white" stroke="#3b82f6" strokeWidth={1/zoom} style={{ cursor: h.cursor }}/>)
                                })()}
                            </g>
                        )}
                        {selectionBox && (
                             <rect
                                x={selectionBox.x}
                                y={selectionBox.y}
                                width={selectionBox.width}
                                height={selectionBox.height}
                                fill="rgba(59, 130, 246, 0.1)"
                                stroke="rgb(59, 130, 246)"
                                strokeWidth={1 / zoom}
                            />
                        )}
                    </g>
                </svg>
                 {contextMenu && (
                    <div style={{ top: contextMenu.y, left: contextMenu.x }} className="absolute z-30 bg-white rounded-md shadow-lg border border-gray-200 text-sm py-1 text-gray-800">
                        <button onClick={() => handleLayerAction(contextMenu.elementId, 'forward')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100">Bring Forward</button>
                        <button onClick={() => handleLayerAction(contextMenu.elementId, 'backward')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100">Send Backward</button>
                        <div className="border-t border-gray-100 my-1"></div>
                        <button onClick={() => handleLayerAction(contextMenu.elementId, 'front')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100">Bring to Front</button>
                        <button onClick={() => handleLayerAction(contextMenu.elementId, 'back')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100">Send to Back</button>
                    </div>
                )}
            </div>
            {!croppingState && <PromptBar prompt={prompt} setPrompt={setPrompt} onGenerate={handleGenerate} isLoading={isGenerating} isImageSelectionActive={isImageSelectionActive} selectedImageCount={selectedImageElements.length} />}
            {showUrlUpload && (
                <ImageUrlUpload
                    onUpload={handleUrlUpload}
                    onClose={() => setShowUrlUpload(false)}
                />
            )}
            {isGenerating && <Loader />}
        </div>
    );
};

export default App;
