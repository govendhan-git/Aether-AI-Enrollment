"use client";
import React from 'react';
import { Card } from './Card';

export function StatWidget({ label, value, hint, icon }: { label: string; value: string | number; hint?: string; icon?: React.ReactNode }) {
  return (
    <Card className="p-4 glow-border">
      <div className="flex items-center gap-3">
        {icon ? <div className="pulse-ring">{icon}</div> : null}
        <div>
          <div className="text-xs opacity-70">{label}</div>
          <div className="text-2xl font-semibold">{value}</div>
          {hint ? <div className="text-xs opacity-70">{hint}</div> : null}
        </div>
      </div>
    </Card>
  );
}
