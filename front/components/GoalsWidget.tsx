import React from 'react';

export interface AgentGoalRow {
  id: string;
  campaignName: string;
  target: number;
  current: number;
  color: string;
  icon: 'trophy' | 'target' | 'star';
  /** Días inclusivos hacia atrás desde hoy (1 = solo hoy) */
  periodDays?: number;
  /** Si la meta filtra por una tipificación, su nombre para mostrar */
  typificationName?: string | null;
}

interface GoalsWidgetProps {
  goals: AgentGoalRow[];
  loading?: boolean;
}

export const GoalsWidget: React.FC<GoalsWidgetProps> = ({ goals, loading = false }) => {
  const getColorClasses = (colorName: string) => {
    switch (colorName) {
      case 'amber': return { text: 'text-amber-500', bg: 'bg-amber-500', lightText: 'text-amber-600' };
      case 'emerald': return { text: 'text-emerald-500', bg: 'bg-emerald-500', lightText: 'text-emerald-600' };
      case 'blue': return { text: 'text-blue-500', bg: 'bg-blue-500', lightText: 'text-blue-600' };
      case 'purple': return { text: 'text-purple-500', bg: 'bg-purple-500', lightText: 'text-purple-600' };
      default: return { text: 'text-indigo-500', bg: 'bg-indigo-500', lightText: 'text-indigo-600' };
    }
  };

  const renderIcon = (iconName: string, className: string) => {
    switch (iconName) {
      case 'target':
        return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
      case 'star':
        return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
      case 'trophy':
      default:
        return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>;
    }
  };

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-lg border border-white/50 p-5 flex flex-col gap-5">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Metas de Campañas</span>
        <span className="text-[10px] font-bold text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded-full">{loading ? '…' : `${goals.length} Activas`}</span>
      </div>

      {loading ? (
        <div className="flex flex-col gap-4 animate-pulse">
          {[1, 2].map(i => (
            <div key={i}>
               <div className="h-4 bg-slate-200 rounded w-2/3 mb-2"></div>
               <div className="h-2 bg-slate-200 rounded-full w-full"></div>
            </div>
          ))}
        </div>
      ) : goals.length === 0 ? (
        <div className="py-6 text-center text-sm font-medium text-slate-400">
          No tienes metas asignadas (campañas o meta diaria configurable en admin).
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {goals.map(goal => {
            const percentage = goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
            const colors = getColorClasses(goal.color);

            return (
              <div key={goal.id} className="group flex flex-col gap-1.5">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2 text-slate-700 font-bold text-sm tracking-tight">
                    {renderIcon(goal.icon, colors.text)}
                    {goal.campaignName}
                  </div>
                  <span className={`${colors.lightText} text-xs font-black`}>{percentage}%</span>
                </div>

                <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>
                    {(() => {
                      const pd = goal.periodDays ?? 1;
                      const label =
                        pd <= 1 ? 'Tipificaciones hoy' : `Tipificaciones (${pd} días)`;
                      return `${label}: ${goal.current}`;
                    })()}
                  </span>
                  <span>Meta: {goal.target}</span>
                </div>
                {goal.typificationName ? (
                  <div className="text-[9px] font-medium text-slate-400 normal-case tracking-normal -mt-0.5">
                    Solo cuenta: <span className="text-slate-600">«{goal.typificationName}»</span>
                  </div>
                ) : null}

                <div className="w-full bg-slate-100/80 rounded-full h-2.5 overflow-hidden shadow-inner">
                  <div
                    className={`${colors.bg} h-full rounded-full transition-all duration-1000 ease-out`}
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GoalsWidget;
