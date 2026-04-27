import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  className?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ size = 'md', color = 'currentColor', className = '' }) => {
  const sizeMap = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  console.log('Spinner rendered:', { size, color, className, sizeClass: sizeMap[size] });

  return (
    <div
      className={`spinner ${sizeMap[size]} ${className}`}
      style={{
        display: 'inline-block',
        width: size === 'sm' ? '12px' : size === 'lg' ? '20px' : '16px',
        height: size === 'sm' ? '12px' : size === 'lg' ? '20px' : '16px',
        border: '2px solid',
        borderColor: `${color}40`,
        borderTopColor: color,
        borderRightColor: color,
        borderRadius: '50%',
        animation: 'spin 0.6s linear infinite'
      }}
    />
  );
};

export default Spinner;
