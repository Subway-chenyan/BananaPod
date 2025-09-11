import React, { useState } from 'react';

interface ImageUrlUploadProps {
    onUpload: (url: string) => void;
    onClose: () => void;
}

export const ImageUrlUpload: React.FC<ImageUrlUploadProps> = ({ onUpload, onClose }) => {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url.trim()) {
            setError('请输入图片链接');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            // 验证URL格式
            new URL(url);
            
            // 检查是否为受限制的内部链接或有防盗链的网站
            if (url.includes('larkoffice.com') || url.includes('feishu.cn') || url.includes('internal-api')) {
                throw new Error('无法访问内部链接，请使用公开可访问的图片链接');
            }
            
            // 检查Pinterest等有防盗链限制的网站
            if (url.includes('pinimg.com') || url.includes('pinterest.com')) {
                throw new Error('Pinterest图片有防盗链保护，请右键保存图片后使用本地上传，或使用其他图床');
            }
            
            // 创建一个临时图片元素来验证图片是否可以加载
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => {
                    // 提供更详细的错误信息
                    if (url.includes('localhost') || url.includes('127.0.0.1')) {
                        reject(new Error('本地链接无法访问，请使用公网图片链接'));
                    } else {
                        reject(new Error('无法加载图片，请检查链接是否正确或图片是否公开可访问'));
                    }
                };
                img.src = url;
            });

            onUpload(url);
            onClose();
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('无效的图片链接');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
            <div 
                className="bg-white rounded-lg p-6 w-96 max-w-[90vw] shadow-xl"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleKeyDown}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">添加图片链接</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label="关闭"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label htmlFor="imageUrl" className="block text-sm font-medium text-gray-700 mb-2">
                            图片链接 (URL)
                        </label>
                        <input
                            id="imageUrl"
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://example.com/image.jpg"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            disabled={isLoading}
                            autoFocus
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            请使用公开可访问的图片链接，支持 JPG、PNG、GIF、WebP 等格式<br/>
                            推荐使用：imgur.com、GitHub、或其他公开图床服务
                        </p>
                        {error && (
                            <p className="mt-2 text-sm text-red-600">{error}</p>
                        )}
                    </div>
                    
                    <div className="flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                            disabled={isLoading}
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                            disabled={isLoading || !url.trim()}
                        >
                            {isLoading && (
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            )}
                            {isLoading ? '加载中...' : '添加图片'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};