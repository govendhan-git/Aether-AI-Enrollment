"use client";
import React from 'react';

export function AnimatedButton({ children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return (
    <button {...rest} className={`glass-button ${className || ''}`}>
      <span className="relative">
        {children}
        <span className="absolute inset-0 -z-10 shimmer rounded-xl" />
      </span>
    </button>
  );
}
