import { useState, useEffect } from 'react';
// @ts-ignore
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Login } from './components/Login';
import { DashboardLayout } from './components/DashboardLayout';

import { Campaigns } from './components/Campaigns';
import { Agents } from './components/Agents';
import { Reports } from './components/Reports';
import { AudioManager } from './components/AudioManager';
import { BlacklistManager } from './components/BlacklistManager';

import { ConsolidatedReportsHub } from './components/reports/ConsolidatedReportsHub';
import ScheduleTemplates from './components/ScheduleTemplates';
import { CampaignDetailPage } from './components/CampaignDetailPage';
import { IvrFlowBuilder } from './components/IvrFlowBuilder';
import { TrunksManager } from './components/TrunksManager';
import { Users } from './components/Users';
import { Roles } from './components/Roles';
import { TTSNodesManager } from './components/TTSNodesManager';
import { Settings } from './components/Settings';
import SwaggerDocs from './components/SwaggerDocs';
import { Toaster } from './components/ui/sonner';
import { useAuthStore } from './stores/authStore';
import authService from './services/authService';
import { AgentWorkspace } from './components/AgentWorkspace';
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
}

export default function App() {
  const { isAuthenticated, session, logout: logoutStore, getUserLevel } = useAuthStore();
  const [username, setUsername] = useState('');
  const [currentPage, setCurrentPage] = useState(() => {
    // Initialize with favorite or default to 'campaigns'
    const savedFavorite = localStorage.getItem('favoriteMenu');
    return savedFavorite || 'campaigns';
  });
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // On mount, check if we have a persisted session
  useEffect(() => {
    if (isAuthenticated && session) {
      console.log('[App] Restored session for user:', session.agent_user);
      setUsername(session.agent_user);

      // Load favorite menu from localStorage
      const savedFavorite = localStorage.getItem('favoriteMenu');
      if (savedFavorite) {
        setCurrentPage(savedFavorite);
      }
    }
  }, [isAuthenticated, session]);

  const handleLogin = (user: string) => {
    setUsername(user);

    // Load favorite menu from localStorage
    const savedFavorite = localStorage.getItem('favoriteMenu');
    if (savedFavorite) {
      setCurrentPage(savedFavorite);
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
    const savedFavorite = localStorage.getItem('favoriteMenu');
    setCurrentPage(savedFavorite || 'campaigns');
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
      case 'audio':
        return <AudioManager />;
      case 'blacklist':
        return <BlacklistManager />;

      case 'schedule-templates':
      case 'scheduler': // alias legacy: el id antiguo del menú apuntaba al programador
        return <ScheduleTemplates />;
      case 'consolidated':
        return <ConsolidatedReportsHub />;
      case 'trunks':
        return <TrunksManager />;
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
