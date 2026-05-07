import { useState, useEffect, useMemo } from "react";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import {
  LayoutDashboard,
  Menu,
  User,
  LogOut,
  PhoneCall,
  X,
  Star,
  Activity,
  ShieldBan,
  ListChecks,
  PhoneOutgoing,
  Calendar,
  Pin,
  PinOff,
  FileBarChart2,
  Workflow,
  GitBranch,
  Network,
  Users,
  KeyRound,
  LifeBuoy,
  Mic,
  BookOpen,
  Settings,
  ClipboardList
} from "lucide-react";
import { cn } from "./ui/utils";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { UserProfileModal } from "./UserProfileModal";
import { BackgroundTasksPanel } from "./BackgroundTasksPanel";
import { BackgroundSocketManager } from "./BackgroundSocketManager";
import { GlobalSupervisorChatWidget } from "./GlobalSupervisorChatWidget";
import { toast } from "sonner";
import logoChock from "../logo chock.png";
import { useAuthStore } from "@/stores/authStore";
import { SupervisorWebPhone } from "./SupervisorWebPhone";

interface DashboardLayoutProps {
  children: React.ReactNode;
  username: string;
  userLevel: number;
  onLogout: () => void;
  onNavigate?: (menuId: string) => void;
  currentPage?: string;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  shortcutKey?: string;
  /** Si está definido, se exige ese permiso exacto. */
  requiredPermission?: string;
  /** Si está definido (y no hay match por requiredPermission primero), basta con uno de la lista. */
  requiredAnyPermission?: string[];
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    title: "Operación",
    items: [
      {
        id: "campaigns",
        label: "Campañas",
        icon: PhoneCall,
        shortcut: "Alt+C",
        shortcutKey: "c",
        requiredPermission: "view_campaigns",
      },
      {
        id: "schedule-templates",
        label: "Horarios",
        icon: Calendar,
        shortcut: "Alt+P",
        shortcutKey: "p",
        requiredPermission: "manage_schedules",
      },
      {
        id: "consolidated",
        label: "Reportes",
        icon: FileBarChart2,
        shortcut: "Alt+R",
        shortcutKey: "r",
        requiredPermission: "view_reports",
      },
      {
        id: "ivr-builder",
        label: "IVR Builder",
        icon: Workflow,
        shortcut: "Alt+I",
        shortcutKey: "i",
        requiredPermission: "manage_ivr",
      },
      {
        id: "agent-workspace-admin",
        label: "Workspace agentes",
        icon: ClipboardList,
        shortcut: "Alt+W",
        shortcutKey: "w",
        requiredAnyPermission: ["manage_agent_workspace", "admin"],
      },
    ]
  },
  {
    title: "Configuración",
    items: [
      {
        id: "callerid-pools",
        label: "CallerID Pools",
        icon: PhoneOutgoing,
        shortcut: "Alt+I",
        shortcutKey: "i",
        requiredPermission: "manage_callerid",
      },
      {
        id: "blacklist",
        label: "Blacklist",
        icon: ShieldBan,
        shortcut: "Alt+B",
        shortcutKey: "b",
        requiredPermission: "manage_blacklist",
      },
      {
        id: "settings",
        label: "Ajustes Globales",
        icon: Settings,
        shortcut: "Alt+G",
        shortcutKey: "g",
        requiredPermission: "admin",
      },
    ]
  },
  {
    title: "Sistema",
    items: [
      {
        id: "tts-nodes",
        label: "Nodos TTS",
        icon: Mic,
        shortcut: "Alt+N",
        shortcutKey: "n",
        requiredPermission: "manage_tts_nodes",
      },
      {
        id: "trunks",
        label: "Troncales",
        icon: Network,
        shortcut: "Alt+T",
        shortcutKey: "t",
        requiredPermission: "manage_trunks",
      },
      {
        id: "routing-rules",
        label: "Enrutamiento",
        icon: GitBranch,
        shortcut: "Alt+E",
        shortcutKey: "e",
        requiredPermission: "manage_routing",
      },
      {
        id: "users",
        label: "Usuarios",
        icon: Users,
        shortcut: "Alt+U",
        shortcutKey: "u",
        requiredPermission: "view_users",
      },
      {
        id: "roles",
        label: "Roles y Permisos",
        icon: KeyRound,
        shortcut: "Alt+K",
        shortcutKey: "k",
        requiredPermission: "view_roles",
      },
      {
        id: "api-docs",
        label: "API Docs",
        icon: BookOpen,
        shortcut: "Alt+D",
        shortcutKey: "d",
        requiredPermission: "view_api_docs",
      },
    ]
  }
];

export function DashboardLayout({
  children,
  username,
  userLevel,
  onLogout,
  onNavigate,
  currentPage = "dashboard",
}: DashboardLayoutProps) {
  const [isPinned, setIsPinned] = useState(() => {
    return localStorage.getItem("sidebarPinned") === "true";
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(isPinned); // Initial state depends on pin
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] =
    useState(false);
  const [activeMenu, setActiveMenu] = useState(currentPage);
  const [isProfileModalOpen, setIsProfileModalOpen] =
    useState(false);
  const [favoriteMenu, setFavoriteMenu] = useState<
    string | null
  >(null);

  const { hasRolePermission } = useAuthStore();
  const canUseSupervisorChat =
    hasRolePermission("manage_agent_workspace") || hasRolePermission("admin");

  // Filter menu groups based on user level and role permissions
  const menuGroups = useMemo(() => {
    return MENU_GROUPS.map((group) => {
      // Filter the items within the group
      const filteredItems = group.items.filter((item) => {
        if (item.requiredAnyPermission && item.requiredAnyPermission.length > 0) {
          return item.requiredAnyPermission.some((p) => hasRolePermission(p));
        }
        if (!item.requiredPermission) return true;
        return hasRolePermission(item.requiredPermission);
      });

      return {
        ...group,
        items: filteredItems,
      };
    }).filter((group) => group.items.length > 0); // Hide completely empty groups
  }, [userLevel, hasRolePermission]);

  // Load favorite menu from localStorage
  useEffect(() => {
    let savedFavorite = localStorage.getItem("favoriteMenu");
    if (savedFavorite === "audio") {
      localStorage.removeItem("favoriteMenu");
      savedFavorite = null;
    }
    if (savedFavorite) {
      setFavoriteMenu(savedFavorite);
    }
  }, []);

  // Sync activeMenu with currentPage
  useEffect(() => {
    setActiveMenu(currentPage);
  }, [currentPage]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if input/textarea is focused
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      // Sidebar Pin Toggle: Alt + S
      if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const newPinnedState = !isPinned; // Use functional update pattern not possible here easily without ref, relying on state closure which might be stale?
        // Actually, let's just leave it open until explicit mouse leave or keep it open for now.
        // Usually standard behavior is it stays open until mouse leaves.
        // If we pinned, ensure it stays open (it already is).
      }

      if (e.altKey) {
        const key = e.key.toLowerCase();

        if (key === 's') {
          e.preventDefault();
          togglePin(e as any); // Use the function which handles state logic
          return;
        }

        // Check menu shortcuts
        for (const group of menuGroups) {
          const item = group.items.find(i => i.shortcutKey === key);
          if (item) {
            e.preventDefault();
            handleMenuClick(item.id);
            return;
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPinned, onNavigate, menuGroups]); // Re-bind when isPinned/navigate changes to capture fresh state/closure

  // Handle sidebar hover
  const handleSidebarMouseEnter = () => {
    if (!isPinned) {
      setIsSidebarOpen(true);
    }
  };

  const handleSidebarMouseLeave = () => {
    if (!isPinned) {
      setIsSidebarOpen(false);
    }
  };

  const togglePin = (e: React.MouseEvent) => {
    e?.stopPropagation && e.stopPropagation();
    // Use functional update to ensure we always have latest state even if called from stale closure event
    setIsPinned(prev => {
      const next = !prev;
      localStorage.setItem("sidebarPinned", String(next));
      if (next) {
        setIsSidebarOpen(true); // Ensure open if pinning
      }
      return next;
    });
  };

  const handleMenuClick = (menuId: string) => {
    setActiveMenu(menuId);
    setIsMobileSidebarOpen(false);
    if (onNavigate) {
      onNavigate(menuId);
    }
  };

  const handleToggleFavorite = (
    menuId: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation(); // Prevent menu click

    if (favoriteMenu === menuId) {
      // Remove favorite
      setFavoriteMenu(null);
      localStorage.removeItem("favoriteMenu");
      toast.success("Favorito eliminado");
    } else {
      // Set as favorite
      setFavoriteMenu(menuId);
      localStorage.setItem("favoriteMenu", menuId);

      // Find item in groups
      let menuItem: MenuItem | undefined;
      for (const group of menuGroups) {
        const found = group.items.find((item) => item.id === menuId);
        if (found) {
          menuItem = found;
          break;
        }
      }

      if (menuItem) {
        toast.success(`${menuItem.label} marcado como favorito`);
      }
    }
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo Section */}
      <div
        className={cn(
          "flex items-center transition-all duration-300 relative",
          isSidebarOpen ? "justify-between px-4 py-4" : "justify-center px-2 py-3",
        )}
      >
        <div className={cn(
          "flex items-center justify-center overflow-hidden rounded-xl transition-all duration-300",
          isSidebarOpen ? "w-44 h-16" : "w-14 h-14 p-1",
        )}>
          <ImageWithFallback
            src={logoChock}
            alt="Chock Telecom Logo"
            className="w-full h-full object-contain brightness-0"
          />
        </div>

        {/* Pin Toggle Button */}
        {isSidebarOpen && (
          <button
            onClick={togglePin}
            className={cn(
              "absolute top-2 right-2 p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors",
              isPinned && "text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700"
            )}
            title={isPinned ? "Desanclar barra lateral (Alt+S)" : "Anclar barra lateral (Alt+S)"}
          >
            {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
          </button>
        )}
      </div>

      <Separator />

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <TooltipProvider>
          <nav className="flex flex-col gap-6">
            {menuGroups.map((group, groupIndex) => (
              <div key={group.title} className="flex flex-col gap-1">
                {/* Group Title - Only visible when open */}
                {isSidebarOpen && (
                  <h4 className="px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    {group.title}
                  </h4>
                )}

                {/* Group Separator - Only visible when closed (except first group) */}
                {!isSidebarOpen && groupIndex > 0 && (
                  <div className="my-1.5 mx-2 h-px bg-slate-100" />
                )}

                <div className="space-y-1">
                  {group.items.map((item) => (
                    <div key={item.id}>
                      {!isSidebarOpen ? (
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                            <Button
                              variant={
                                activeMenu === item.id
                                  ? "secondary"
                                  : "ghost"
                              }
                              className={cn(
                                "w-full justify-center px-2 relative h-9",
                                activeMenu === item.id
                                  ? "bg-blue-50 text-blue-700 shadow-sm"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                              )}
                              onClick={() => handleMenuClick(item.id)}
                            >
                              <item.icon className={cn("w-5 h-5 flex-shrink-0", activeMenu === item.id ? "text-blue-600" : "text-slate-500")} />
                              {favoriteMenu === item.id && (
                                <div className="absolute top-1 right-1">
                                  <Star className="w-2 h-2 fill-yellow-400 text-yellow-400" />
                                </div>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="font-medium">
                            <div className="flex items-center gap-2">
                              <p>{item.label} <span className="text-slate-400 font-normal text-xs ml-1">({item.shortcut})</span></p>
                              {favoriteMenu === item.id && (
                                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button
                          variant={
                            activeMenu === item.id
                              ? "secondary"
                              : "ghost"
                          }
                          className={cn(
                            "w-full justify-start gap-3 px-3 h-10 transition-all duration-200 group relative overflow-hidden",
                            activeMenu === item.id
                              ? "bg-blue-50/80 text-blue-700 shadow-sm font-medium"
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          )}
                          onClick={() => handleMenuClick(item.id)}
                          title={item.shortcut ? `Atajo: ${item.shortcut}` : undefined}
                        >
                          {/* Active Indicator Pill */}
                          {activeMenu === item.id && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-blue-600 rounded-r-md" />
                          )}

                          <item.icon className={cn("w-4.5 h-4.5 flex-shrink-0 transition-colors", activeMenu === item.id ? "text-blue-600" : "text-slate-500 group-hover:text-slate-700")} />
                          <span className="flex-1 text-left text-sm truncate flex items-center justify-between">
                            {item.label}
                          </span>
                          <div
                            onClick={(e) =>
                              handleToggleFavorite(item.id, e)
                            }
                            className={cn(
                              "p-1 rounded-md hover:bg-slate-200/50 transition-all duration-200 ease-out cursor-pointer opacity-0 group-hover:opacity-100",
                              favoriteMenu === item.id &&
                              "opacity-100 text-yellow-500",
                            )}
                          >
                            <Star
                              className={cn(
                                "w-3.5 h-3.5",
                                favoriteMenu === item.id ? "fill-yellow-400 text-yellow-400" : "text-slate-400"
                              )}
                            />
                          </div>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </TooltipProvider>
      </ScrollArea>



      {/* User Section at Bottom */}
      <Separator />
      <div className="p-3">
        <TooltipProvider>
          {!isSidebarOpen ? (
            // Collapsed state - Icon buttons stacked
            <div className="space-y-2">


              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-center px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={onLogout}
                  >
                    <LogOut className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Cerrar Sesión</p>
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            // Expanded state - Full user card
            <div className="space-y-2">
              {/* User Profile Card */}


              {/* Logout Button */}
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={onLogout}
              >
                <LogOut className="w-5 h-5" />
                <span>Cerrar Sesión</span>
              </Button>
            </div>
          )}
        </TooltipProvider>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen relative overflow-hidden">
      {/* Background Image - Full Screen with higher opacity */}
      <div className="absolute inset-0 z-0">
        <ImageWithFallback
          src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80"
          alt="Snowy mountain background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-white/70" />
      </div>

      {/* Desktop Sidebar - Floating with auto-expand on hover */}
      {currentPage !== 'agent-workspace' && (
        <aside
          className={cn(
            "hidden md:flex flex-col bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-slate-200/60 transition-all duration-500 ease-out m-4 mr-0 z-50 relative",
            isSidebarOpen ? "w-64" : "w-20",
          )}
          onMouseEnter={handleSidebarMouseEnter}
          onMouseLeave={handleSidebarMouseLeave}
        >
          <SidebarContent />
        </aside>
      )}

      {/* Mobile Menu Toggle Button - Fixed Top Left */}
      {currentPage !== 'agent-workspace' && (
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden fixed top-4 left-4 z-50 bg-white/95 backdrop-blur-md shadow-lg border border-slate-200/60 rounded-xl"
          onClick={() => setIsMobileSidebarOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </Button>
      )}

      {/* Mobile Sidebar */}
      {currentPage !== 'agent-workspace' && isMobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <aside className="fixed top-4 bottom-4 left-4 w-64 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/60 z-50 md:hidden">
            <div className="flex justify-end p-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileSidebarOpen(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <SidebarContent />
          </aside>
        </>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col relative z-10 w-full min-w-0">
        <div className="flex-1 overflow-auto p-3 lg:p-4 pt-16 md:pt-4 w-full h-full custom-scrollbar">
          <div className="h-full w-full">{children}</div>
        </div>
      </main>

      {/* Background Services */}
      <BackgroundTasksPanel />
      <BackgroundSocketManager />
      <SupervisorWebPhone />
      <GlobalSupervisorChatWidget
        username={username}
        enabled={currentPage !== 'agent-workspace' && canUseSupervisorChat}
      />

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        username={username}
      />
    </div>
  );
}