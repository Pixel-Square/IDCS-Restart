import React from 'react';
import './PillButton.css';

interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

const PillButton: React.FC<PillButtonProps> = ({ variant = 'primary', children, ...props }) => (
  <button
    className={`pill-button${variant === 'secondary' ? ' secondary' : ''}`}
    {...props}
  >
    {children}
  </button>
);

export default PillButton;
