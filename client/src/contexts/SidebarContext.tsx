import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';

interface SidebarState {
  isCollapsed: boolean;
  expandedGroups: Set<string>;
}

interface SidebarContextType {
  isCollapsed: boolean;
  expandedGroups: Set<string>;
  toggleCollapsed: () => void;
  toggleGroup: (groupId: string) => void;
  isGroupExpanded: (groupId: string) => boolean;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

const SIDEBAR_STORAGE_KEY = 'sidebar-state';

function getStoredState(): SidebarState {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          isCollapsed: parsed.isCollapsed ?? false,
          expandedGroups: new Set(parsed.expandedGroups ?? [])
        };
      }
    } catch {
      // Ignore parse errors
    }
  }
  return { isCollapsed: false, expandedGroups: new Set() };
}

function saveState(state: SidebarState): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify({
      isCollapsed: state.isCollapsed,
      expandedGroups: Array.from(state.expandedGroups)
    }));
  }
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => getStoredState().isCollapsed);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => getStoredState().expandedGroups);

  // Persist state changes
  useEffect(() => {
    saveState({ isCollapsed, expandedGroups });
  }, [isCollapsed, expandedGroups]);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  }, []);

  const isGroupExpanded = useCallback((groupId: string) => {
    return expandedGroups.has(groupId);
  }, [expandedGroups]);

  const value: SidebarContextType = {
    isCollapsed,
    expandedGroups,
    toggleCollapsed,
    toggleGroup,
    isGroupExpanded,
  };

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
