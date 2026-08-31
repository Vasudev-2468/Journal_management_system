import React from 'react';

interface LoadingProps {
    fullScreen?: boolean;
    label?: string;
}

const Loading: React.FC<LoadingProps> = ({ fullScreen = false, label = 'Loading' }) => {
    const wrapperClass = fullScreen
        ? 'flex items-center justify-center h-screen'
        : 'flex items-center justify-center py-8';

    return (
        <div className={wrapperClass} role="status" aria-live="polite">
            <div className="loader" aria-hidden="true"></div>
            <span className="sr-only">{label}</span>
            <style>{`
                .loader {
                    border: 4px solid rgba(59, 130, 246, 0.15);
                    border-left-color: #3b82f6;
                    border-radius: 50%;
                    width: 32px;
                    height: 32px;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default Loading;
