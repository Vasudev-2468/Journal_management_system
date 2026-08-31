import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps
    extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: 'button' | 'submit' | 'reset';
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary: 'bg-blue-500 text-white hover:bg-blue-600',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    ghost: 'bg-transparent text-blue-600 hover:bg-blue-50',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
};

const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    type = 'button',
    className = '',
    children,
    disabled,
    ...rest
}) => {
    return (
        <button
            type={type}
            className={`rounded transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
            disabled={disabled}
            {...rest}
        >
            {children}
        </button>
    );
};

export default Button;
