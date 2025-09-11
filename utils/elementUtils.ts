import { Element, Tool, Point, ShapeElement, PathElement } from '../types';

const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

function getElementAtPosition(x: number, y: number, elements: Element[]): Element | null {
    for (let i = elements.length - 1; i >= 0; i--) {
        const element = elements[i];
        if (element.type === 'path') {
            // This is a simple bounding box check. For more accuracy, point-to-line distance would be needed.
            const { points } = element;
            if (points.length < 2) continue;
            let minX = points[0].x, maxX = points[0].x;
            let minY = points[0].y, maxY = points[0].y;
            points.forEach(p => {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            });
            if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                return element;
            }
        } else { // ImageElement or ShapeElement
            if (x >= element.x && x <= element.x + element.width && y >= element.y && y <= element.y + element.height) {
                return element;
            }
        }
    }
    return null;
}


function createElement(tool: Tool, x: number, y: number): Element | null {
    const id = generateId();
    if (tool === 'rectangle' || tool === 'circle' || tool === 'triangle') {
        const newShape: ShapeElement = {
            id,
            type: 'shape',
            shapeType: tool,
            x,
            y,
            width: 0,
            height: 0,
            strokeColor: '#000000',
            strokeWidth: 2,
            fillColor: 'none',
        };
        return newShape;
    } else if (tool === 'draw') {
        const newPath: PathElement = {
            id,
            type: 'path',
            points: [{x, y}],
            strokeColor: '#000000',
            strokeWidth: 5,
            x: 0, // Paths are positioned by their points, x/y can be 0.
            y: 0,
        };
        return newPath;
    }
    return null;
}

export { getElementAtPosition, createElement, generateId };