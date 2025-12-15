import React from 'react';

/**
 * Generate initials from a name
 * @param name - Full name
 * @returns Two letter initials
 */
export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join('');
};

/**
 * Get background color based on initials (deterministic)
 * @param initials - Two letter initials
 * @returns Tailwind color class
 */
export const getInitialsBgColor = (initials: string): string => {
  const colors = [
    'bg-red-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-yellow-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-orange-500',
    'bg-cyan-500'
  ];
  
  // Use sum of character codes to pick color deterministically
  const sum = initials.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[sum % colors.length];
};

/**
 * Avatar component - shows initials circle (no image avatars)
 */
export const AvatarCircle = ({ 
  avatar, 
  name, 
  size = 'md' 
}: { 
  avatar?: string; 
  name: string; 
  size?: 'sm' | 'md' | 'lg' 
}): React.ReactElement => {
  const initials = getInitials(name);
  const bgColor = getInitialsBgColor(initials);
  
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-lg'
  };

  return (
    <div 
      className={`${sizeClasses[size]} ${bgColor} rounded-full flex items-center justify-center text-white font-bold border-2 border-gray-200`}
    >
      {initials}
    </div>
  );
};
