
import React from 'react';

interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

const PillButton: React.FC<PillButtonProps> = ({ variant = 'primary', children, className = '', ...props }) => {
  const baseClasses = 'inline-flex items-center justify-center min-w-[80px] h-8 px-4 border-0 rounded-full text-sm font-semibold cursor-pointer transition-all duration-200 tracking-wide';
  const variantClasses = variant === 'secondary' 
    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' 
    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg';
  
  return (
    <button
      className={`${baseClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default PillButton;
