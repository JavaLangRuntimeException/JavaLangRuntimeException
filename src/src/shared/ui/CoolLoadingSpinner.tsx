import React from 'react';

interface CoolLoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

export function CoolLoadingSpinner({ size = 'md', color = 'blue' }: CoolLoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };

  const dotSizes = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  const colorClasses = {
    blue: 'bg-blue-500',
    indigo: 'bg-indigo-500',
    purple: 'bg-purple-500',
    pink: 'bg-pink-500',
  };

  const bgColor = colorClasses[color as keyof typeof colorClasses] || colorClasses.blue;

  return (
    <div className={`${sizeClasses[size]} relative`}>
      {/* Center rotating ring */}
      <div className="absolute inset-0 animate-spin">
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 ${dotSizes[size]} ${bgColor} rounded-full`} />
      </div>

      {/* Secondary rotating ring (faster, opposite direction) */}
      <div className="absolute inset-0 animate-spin-reverse" style={{ animationDuration: '1s' }}>
        <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 ${dotSizes[size]} ${bgColor} rounded-full opacity-60`} />
      </div>

      {/* Pulsing center dot */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`${dotSizes[size]} ${bgColor} rounded-full animate-pulse`} />
      </div>

      {/* Orbiting dots */}
      <div className="absolute inset-0 animate-spin" style={{ animationDuration: '1.5s' }}>
        <div className={`absolute left-0 top-1/2 -translate-y-1/2 ${dotSizes[size]} ${bgColor} rounded-full opacity-40`} />
      </div>

      <div className="absolute inset-0 animate-spin" style={{ animationDuration: '2s' }}>
        <div className={`absolute right-0 top-1/2 -translate-y-1/2 ${dotSizes[size]} ${bgColor} rounded-full opacity-40`} />
      </div>
    </div>
  );
}

export function WaveLoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dotSizes = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  const gaps = {
    sm: 'gap-1',
    md: 'gap-1.5',
    lg: 'gap-2',
  };

  return (
    <div className={`flex ${gaps[size]} items-center justify-center`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`${dotSizes[size]} rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 animate-wave`}
          style={{
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

export function PulseLoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };

  return (
    <div className={`${sizes[size]} relative`}>
      {/* Outer expanding ring */}
      <div className="absolute inset-0 rounded-full border-4 border-blue-500 animate-ping opacity-75" />

      {/* Middle expanding ring */}
      <div
        className="absolute inset-0 rounded-full border-4 border-indigo-500 animate-ping opacity-75"
        style={{ animationDelay: '0.3s' }}
      />

      {/* Inner solid circle */}
      <div className="absolute inset-0 m-auto h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 animate-pulse" />
    </div>
  );
}

export function DotsLoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dotSizes = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  const gaps = {
    sm: 'gap-1.5',
    md: 'gap-2',
    lg: 'gap-2.5',
  };

  return (
    <div className={`flex ${gaps[size]} items-center justify-center`}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`${dotSizes[size]} rounded-full bg-gradient-to-br from-blue-500 to-indigo-600`}
          style={{
            animation: 'bounce 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
    </div>
  );
}

