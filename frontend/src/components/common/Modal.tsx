import React from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="fixed inset-0 bg-black opacity-50" onClick={onClose}></div>
            <div className="bg-white rounded-lg shadow-lg z-10 p-6">
                {title && <h2 className="text-lg font-bold mb-4">{title}</h2>}
                <div>{children}</div>
                <button className="mt-4 bg-blue-500 text-white px-4 py-2 rounded" onClick={onClose}>
                    Close
                </button>
            </div>
        </div>
    );
};

export default Modal;

// TODO: Implement animations for modal opening and closing
// TODO: Add accessibility features (e.g., keyboard navigation, aria attributes)