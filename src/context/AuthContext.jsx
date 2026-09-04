/* oxlint-disable react/only-export-components */
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { PINS, ROLES } from './authConstants';

export { PINS, ROLES };

const AuthContext = createContext(null);

const STORAGE_KEY = 'codju_auth_role';

export function AuthProvider({ children }) {
  const [role, setRole] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === ROLES.DESIGNER || saved === ROLES.ADMIN || saved === ROLES.VIEWER) {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return ROLES.ADMIN; // Default to Admin for full editing, adding, and deleting control
  });

  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [targetAction, setTargetAction] = useState(null);

  // Sync role to localStorage
  useEffect(() => {
    try {
      if (role === ROLES.VIEWER) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, role);
      }
    } catch {
      // ignore storage errors
    }
  }, [role]);

  const login = useCallback((pin) => {
    const cleanPin = String(pin).trim();
    if (cleanPin === PINS.DESIGNER) {
      setRole(ROLES.DESIGNER);
      setIsPinModalOpen(false);
      return { success: true, role: ROLES.DESIGNER };
    }
    if (cleanPin === PINS.ADMIN) {
      setRole(ROLES.ADMIN);
      setIsPinModalOpen(false);
      return { success: true, role: ROLES.ADMIN };
    }
    return { success: false, error: 'Incorrect PIN. Please try again.' };
  }, []);

  const logout = useCallback(() => {
    setRole(ROLES.VIEWER);
    setIsPinModalOpen(false);
  }, []);

  const openPinModal = useCallback((action = null) => {
    setTargetAction(action);
    setIsPinModalOpen(true);
  }, []);

  const closePinModal = useCallback(() => {
    setIsPinModalOpen(false);
    setTargetAction(null);
  }, []);

  const value = useMemo(() => {
    const isViewer = role === ROLES.VIEWER;
    const isDesigner = role === ROLES.DESIGNER;
    const isAdmin = role === ROLES.ADMIN;

    return {
      role,
      isViewer,
      isDesigner,
      isAdmin,
      // Permission flags
      canEditBriefs: isAdmin,
      canUploadAssets: isDesigner || isAdmin,
      canApprove: isAdmin,
      canRequestRevision: isAdmin,
      canPublish: isAdmin,
      canDeleteRows: isAdmin,
      canGenerateAi: isAdmin,
      canEditMonthNotes: isAdmin,
      canAddRows: isAdmin,
      // Auth actions
      login,
      logout,
      isPinModalOpen,
      openPinModal,
      closePinModal,
      targetAction,
    };
  }, [role, login, logout, isPinModalOpen, openPinModal, closePinModal, targetAction]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
