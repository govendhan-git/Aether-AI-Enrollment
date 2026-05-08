"use client";
import clsx from 'clsx';
import React from 'react';

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx('glass glass-card hover-lift', className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-start justify-between">
      <div>
        <div className="text-sm opacity-70">{subtitle}</div>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      {right}
    </div>
  );
}

export function CardContent({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}
