import React from 'react';

interface CanvasSizeSliderProps {
  canvasSize: number;
  onSizeChange: (size: number) => void;
  minSize?: number;
  maxSize?: number;
}

export const CanvasSizeSlider: React.FC<CanvasSizeSliderProps> = ({
  canvasSize,
  onSizeChange,
  minSize = 50,
  maxSize = 200
}) => {
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value);
    onSizeChange(newSize);
  };

  const handlePresetSize = (size: number) => {
    onSizeChange(size);
  };

  return (
    <div className="fixed left-4 top-1/2 transform -translate-y-1/2 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-16">
      {/* 尺寸显示 */}
      <div className="text-center mb-4">
        <div className="text-xs text-gray-500 mb-1">尺寸</div>
        <div className="text-sm font-semibold text-gray-800">{canvasSize}%</div>
      </div>
      
      {/* 垂直滑动条 */}
      <div className="flex justify-center mb-4">
        <input
          type="range"
          min={minSize}
          max={maxSize}
          value={canvasSize}
          onChange={handleSliderChange}
          className="slider-vertical w-2 h-32 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          style={{
            writingMode: 'bt-lr',
            WebkitAppearance: 'slider-vertical'
          }}
        />
      </div>
      
      {/* 快速预设按钮 */}
      <div className="space-y-2">
        <button
          onClick={() => handlePresetSize(50)}
          className={`w-full text-xs py-1 px-2 rounded transition-colors ${
            canvasSize === 50 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          50%
        </button>
        <button
          onClick={() => handlePresetSize(100)}
          className={`w-full text-xs py-1 px-2 rounded transition-colors ${
            canvasSize === 100 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          100%
        </button>
        <button
          onClick={() => handlePresetSize(150)}
          className={`w-full text-xs py-1 px-2 rounded transition-colors ${
            canvasSize === 150 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          150%
        </button>
      </div>
      
      {/* 快捷键提示 */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="text-xs text-gray-400 text-center">
          <div>Ctrl + +</div>
          <div>Ctrl + -</div>
        </div>
      </div>
    </div>
  );
};

export default CanvasSizeSlider;