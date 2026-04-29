
import React from 'react';
import { UserGreeting } from '../../UserGreeting';

interface StandardPageHeaderProps {
    title: string;
    username: string;
    description?: string;
    children?: React.ReactNode;
}

export function StandardPageHeader({ title, description, username, children }: StandardPageHeaderProps) {
    return (
        <div className="flex flex-col flex-shrink-0 mb-6">
            <div className={`flex items-center justify-between gap-8 ${children ? 'mb-6' : ''}`}>
                <div>
                    <h1 className="text-slate-900 mb-2">{title}</h1>
                    {description && (
                        <p className="text-slate-600">{description}</p>
                    )}
                </div>
                <div className="flex-shrink-0">
                    <UserGreeting username={username} />
                </div>
            </div>

            {children && (
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between flex-shrink-0">
                    {children}
                </div>
            )}
        </div>
    );
}
