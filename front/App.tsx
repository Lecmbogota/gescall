import { useState, useEffect } from 'react';
// @ts-ignore
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Login } from './components/Login';
import { DashboardLayout } from './components/DashboardLayout';

import { Campaigns } from './components/Campaigns';
import { Agents } from './components/Agents';
import { Reports } from './components/Reports';
import { BlacklistManager } from './components/BlacklistManager';

import { ConsolidatedReportsHub } from './components/reports/ConsolidatedReportsHub';
import ScheduleTemplates from './components/ScheduleTemplates';
import { CampaignDetailPage } from './components/CampaignDetailPage';
import { IvrFlowBuilder } from './components/IvrFlowBuilder';
import { TrunksManager } from './components/TrunksManager';
import { RouteRulesManager } from './components/RouteRulesManager';
import { Users } from './components/Users';
import { Roles } from './components/Roles';
import { TTSNodesManager } from './components/TTSNodesManager';
import { Settings } from './components/Settings';
import SwaggerDocs from './components/SwaggerDocs';
import { CallerIDPoolsManager } from './components/CallerIDPoolsManager';
import { Toaster } from './components/ui/sonner';
import { useAuthStore, type AuthSession } from './stores/authStore';
import authService from './services/authService';
import { AgentWorkspace } from './components/AgentWorkspace';
import { AgentWorkspaceAdmin } from './components/AgentWorkspaceAdmin';
import socketService from './services/socket';

// Campaign type for navigation
interface Campaign {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'inactive';
  totalLeads: number;
  contactedLeads: number;
  successRate: number;
  dialingMethod: string;
  activeAgents: number;
  lastActivity: string;
  /** Sincronizado al guardar metas desde el detalle de campaña */
  workspaceDailyTarget?: number;
  workspaceGoalPeriodDays?: number;
  workspaceGoalTypificationId?: number | null;
}

/** Menús retirados: limpia favorito guardado para no abrir una vista huérfana. */
function getValidFavoriteMenuId(): string | null {
  const raw = localStorage.getItem('favoriteMenu');
  if (raw === 'audio') {
    localStorage.removeItem('favoriteMenu');
    return null;
  }
  return raw;
}

/** Alineado con el API supervisor (admin, manage_agent_workspace, is_system). */
function canAccessAgentWorkspaceAdmin(session: AuthSession | null): boolean {
  if (!session?.user) return false;
  if (session.user.is_system === true) return true;
  const granted = session.permissions?.granted ?? [];
  return granted.includes('manage_agent_workspace') || granted.includes('admin');
}

export default function App() {
  const { isAuthenticated, session, logout: logoutStore, getUserLevel } = useAuthStore();
  const [username, setUsername] = useState('');
  const [currentPage, setCurrentPage] = useState(() => {
    // Initialize with favorite or default to 'campaigns'
    return getValidFavoriteMenuId() || 'campaigns';
  });
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // On mount, check if we have a persisted session
  useEffect(() => {
    if (isAuthenticated && session) {
      console.log('[App] Restored session for user:', session.agent_user);
      setUsername(session.agent_user);

      const savedFavorite = getValidFavoriteMenuId();
      if (savedFavorite) {
        if (savedFavorite === 'agent-workspace-admin' && !canAccessAgentWorkspaceAdmin(session)) {
          localStorage.removeItem('favoriteMenu');
          setCurrentPage('campaigns');
        } else {
          setCurrentPage(savedFavorite);
        }
      }
    }
  }, [isAuthenticated, session]);

  useEffect(() => {
    if (!isAuthenticated || !session) return;
    if (currentPage === 'agent-workspace-admin' && !canAccessAgentWorkspaceAdmin(session)) {
      setCurrentPage('campaigns');
    }
  }, [isAuthenticated, session, currentPage]);

  const handleLogin = (user: string) => {
    setUsername(user);

    const savedFavorite = getValidFavoriteMenuId();
    if (savedFavorite) {
      const s = useAuthStore.getState().session;
      if (savedFavorite === 'agent-workspace-admin' && !canAccessAgentWorkspaceAdmin(s)) {
        localStorage.removeItem('favoriteMenu');
        setCurrentPage('campaigns');
      } else {
        setCurrentPage(savedFavorite);
      }
    }
  };

  const handleLogout = () => {
    console.log('[App] Logging out user:', username);

    // Broadcast OFFLINE immediately so supervisors see the agent as disconnected,
    // regardless of how the browser/socket lifecycle resolves.
    try {
      socketService.updateAgentState(username, 'OFFLINE');
    } catch (e) {
      console.error('[App] Error sending OFFLINE on logout:', e);
    }

    // Allow the WebSocket message to be sent before disconnecting
    setTimeout(() => {
      socketService.disconnect();
    }, 200);

    // Clear auth store
    logoutStore();

    // Clear auth service
    authService.logout();

    setUsername('');

    // Don't reset currentPage to preserve favorite for next login
    setCurrentPage(getValidFavoriteMenuId() || 'campaigns');
  };

  const handleNavigate = (menuId: string, campaign?: Campaign) => {
    setCurrentPage(menuId);
    if (campaign) {
      setSelectedCampaign(campaign);
    } else if (menuId !== 'campaign-detail') {
      // Clear selected campaign when navigating away from campaign details
      setSelectedCampaign(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <>
        <Login onLogin={handleLogin} />
        <Toaster position="bottom-right" />
      </>
    );
  }

  // Determine if user is an agent by explicitly evaluating their role group
  const userGroupName = session?.user?.group?.toLowerCase() || '';
  const isAgent = userGroupName === 'agente' || userGroupName === 'agent' || 
                  (!session?.permissions?.granted?.includes('admin') && !session?.permissions?.granted?.includes('view_campaigns'));

  if (isAgent) {
    return (
      <DndProvider backend={HTML5Backend}>
        <DashboardLayout
          username={username}
          userLevel={getUserLevel()}
          onLogout={handleLogout}
          onNavigate={handleNavigate}
          currentPage="agent-workspace"
        >
          <AgentWorkspace />
        </DashboardLayout>
        <Toaster position="bottom-right" />
      </DndProvider>
    );
  }

  const renderPage = () => {
    switch (currentPage) {

      case 'campaigns':
      case 'campaigns-list':
      case 'campaigns-active':
      case 'campaigns-create':
        return (
          <Campaigns
            username={username}
            onSelectCampaign={(campaign) => handleNavigate('campaign-detail', campaign)}
          />
        );
      case 'campaign-detail':
        if (selectedCampaign) {
          return (
            <CampaignDetailPage
              campaign={selectedCampaign}
              onBack={() => handleNavigate('campaigns')}
              username={username}
              userLevel={getUserLevel()}
              onUpdateCampaign={(patch) => {
                setSelectedCampaign((prev) => {
                  if (!prev) return null;
                  return patch ? { ...prev, ...patch } : prev;
                });
              }}
            />
          );
        }
        return (
          <Campaigns
            username={username}
            onSelectCampaign={(campaign) => handleNavigate('campaign-detail', campaign)}
          />
        );
      case 'agents':
      case 'agents-list':
      case 'agents-performance':
        return <Agents username={username} />;
      case 'reports':
      case 'reports-calls':
      case 'reports-agents':
      case 'reports-campaigns':
        return <Reports username={username} />;
      case 'blacklist':
        return <BlacklistManager />;

      case 'callerid-pools':
        return <CallerIDPoolsManager />;

      case 'schedule-templates':
      case 'scheduler': // alias legacy: el id antiguo del menú apuntaba al programador
        return <ScheduleTemplates />;
      case 'consolidated':
        return <ConsolidatedReportsHub />;
      case 'trunks':
        return <TrunksManager />;
      case 'routing-rules':
        return <RouteRulesManager />;
      case 'ivr-builder':
        return <IvrFlowBuilder />;
      case 'users':
        return <Users username={username} />;
      case 'roles':
        return <Roles username={username} />;
      case 'tts-nodes':
        return <TTSNodesManager />;
      case 'settings':
        return <Settings />;
      case 'agent-workspace-admin':
        if (!canAccessAgentWorkspaceAdmin(session)) {
          return (
            <div className="flex flex-col h-full p-6 items-center justify-center gap-4 animate-in fade-in duration-300">
              <p className="text-slate-500 text-center max-w-md">
                No tienes permiso para administrar el workspace de agentes (avisos y callbacks).
                Si lo necesitas, pide que te asignen el permiso correspondiente en Roles.
              </p>
              <button
                type="button"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => handleNavigate('campaigns')}
              >
                Ir a campañas
              </button>
            </div>
          );
        }
        return <AgentWorkspaceAdmin username={username} />;
      case 'api-docs':
        return <SwaggerDocs />;
      default:
        // Default to Campaigns instead of Dashboard
        return (
          <Campaigns
            username={username}
            onSelectCampaign={(campaign) => handleNavigate('campaign-detail', campaign)}
          />
        );
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <DashboardLayout
        username={username}
        userLevel={getUserLevel()}
        onLogout={handleLogout}
        onNavigate={handleNavigate}
        currentPage={currentPage}
      >
        {renderPage()}
      </DashboardLayout>
      <Toaster position="bottom-right" />
    </DndProvider>
  );
}
