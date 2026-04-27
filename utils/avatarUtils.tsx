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
export type RoleLike = 'client' | 'vendor' | 'designer' | 'admin' | string | undefined;

export const getInitialsColorsByRole = (initials: string, role?: RoleLike): { bg: string; text: string; border?: string } => {
  // Role-based gentle shades for background + contrasting text
  if (role === 'client') return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' };
  if (role === 'vendor') return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' };
  if (role === 'designer' || role === 'team') return { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' };
  if (role === 'admin') return { bg: 'bg-gray-800', text: 'text-white', border: 'border-gray-700' };

  // Fallback deterministic palette for unknown roles or when role not provided
  const colors = [
    { bg: 'bg-red-500', text: 'text-white' },
    { bg: 'bg-blue-500', text: 'text-white' },
    { bg: 'bg-green-500', text: 'text-white' },
    { bg: 'bg-purple-500', text: 'text-white' },
    { bg: 'bg-pink-500', text: 'text-white' },
    { bg: 'bg-yellow-500', text: 'text-white' },
    { bg: 'bg-indigo-500', text: 'text-white' },
    { bg: 'bg-teal-500', text: 'text-white' },
    { bg: 'bg-orange-500', text: 'text-white' },
    { bg: 'bg-cyan-500', text: 'text-white' }
  ];
  const sum = initials.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[sum % colors.length];
};

/**
 * Avatar component - shows initials circle (no image avatars)
 */
export const AvatarCircle = ({ 
  avatar, 
  name, 
  size = 'md',
  role
}: { 
  avatar?: string; 
  name: string; 
  size?: 'sm' | 'md' | 'lg',
  role?: RoleLike
}): React.ReactElement => {
  const initials = getInitials(name);
  const color = getInitialsColorsByRole(initials, role);
  
  const sizeClasses: Record<string, string> = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-lg'
  };

  const borderClass = color.border ? color.border : 'border-gray-200';

  return (
    <div 
      className={`${sizeClasses[size]} ${color.bg} rounded-full flex items-center justify-center ${color.text} font-bold border-2 ${borderClass}`}
    >
      {initials}
    </div>
  );
};
