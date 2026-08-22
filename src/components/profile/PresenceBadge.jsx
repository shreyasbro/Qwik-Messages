import React from 'react';

export const PRESENCE_OPTIONS = [
  {
    id: 'online',
    label: 'Online',
    description: 'Active & Available',
    renderIcon: (sizeClass) => (
      <span className={`${sizeClass} rounded-full bg-emerald-500 ring-2 ring-gray-950 inline-block`} />
    )
  },
  {
    id: 'idle',
    label: 'Idle / Away',
    description: 'May be away from keyboard',
    renderIcon: (sizeClass) => (
      <span className={`${sizeClass} rounded-full border-[1.5px] border-emerald-500 bg-gray-950 ring-2 ring-gray-950 inline-block`} />
    )
  },
  {
    id: 'busy',
    label: 'Busy',
    description: 'Focusing / Do not interrupt',
    renderIcon: (sizeClass) => (
      <span className={`${sizeClass} rounded-full border-[1.5px] border-gray-400 bg-gray-950 ring-2 ring-gray-950 inline-block`} />
    )
  },
  {
    id: 'dnd',
    label: 'Do Not Disturb',
    description: 'Mute sounds & notifications',
    renderIcon: (sizeClass) => (
      <span className={`${sizeClass} rounded-full bg-rose-500 ring-2 ring-gray-950 flex items-center justify-center`} >
        <span className="w-1 h-[1.5px] bg-white rounded-full inline-block" />
      </span>
    )
  }
];

export default function PresenceBadge({ 
  status = 'online', 
  size = 'w-2.5 h-2.5', 
  className = 'absolute bottom-0 right-0' 
}) {
  const current = PRESENCE_OPTIONS.find(p => p.id === status) || PRESENCE_OPTIONS[0];
  return (
    <div className={`flex items-center justify-center ${className}`} title={current.label}>
      {current.renderIcon(size)}
    </div>
  );
}
