import React, { useEffect, useRef } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    closeOnBackdrop?: boolean;
}

const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    closeOnBackdrop = true,
}) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        previouslyFocused.current = document.activeElement as HTMLElement | null;
        dialogRef.current?.focus();

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        document.addEventListener('keydown', handleKey);

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = originalOverflow;
            previouslyFocused.current?.focus?.();
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const titleId = title ? 'modal-title' : undefined;

    return (
        <div
            className="fixed inset-0 flex items-center justify-center z-50 transition-opacity duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
        >
            <div
                className="fixed inset-0 bg-black opacity-50"
                onClick={closeOnBackdrop ? onClose : undefined}
                aria-hidden="true"
            />
            <div
                ref={dialogRef}
                tabIndex={-1}
                className="bg-white rounded-lg shadow-lg z-10 p-6 max-w-lg w-full mx-4 outline-none transform transition-transform duration-150"
            >
                {title && (
                    <h2 id={titleId} className="text-lg font-bold mb-4">
                        {title}
                    </h2>
                )}
                <div>{children}</div>
                <div className="mt-4 text-right">
                    <button
                        type="button"
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Modal;
