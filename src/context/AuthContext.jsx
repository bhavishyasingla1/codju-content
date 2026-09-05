/* oxlint-disable react/only-export-components */
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { PINS, ROLES } from './authConstants';

export { PINS, ROLES };

const AuthContext = createContext(null);

const STORAGE_KEY = 'codju_auth_role';

export function AuthProvider({ children }) {
  // Always default to VIEWER so Admin view is never exposed without entering the PIN
  const [role, setRole] = useState(ROLES.VIEWER);

  // When the link is opened, always ask who is there (Admin or Designer)
  const [isPinModalOpen, setIsPinModalOpen] = useState(true);
  const [targetAction, setTargetAction] = useState(null);

  // Clean up any stale admin credentials from localStorage so admin cannot auto-open
  useEffect(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, []);

  const selectDesigner = useCallback(() => {
    setRole(ROLES.DESIGNER);
    setIsPinModalOpen(false);
    return { success: true, role: ROLES.DESIGNER };
  }, []);

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
      selectDesigner,
      login,
      logout,
      isPinModalOpen,
      openPinModal,
      closePinModal,
      targetAction,
    };
  }, [role, selectDesigner, login, logout, isPinModalOpen, openPinModal, closePinModal, targetAction]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
