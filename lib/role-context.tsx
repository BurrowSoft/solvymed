import React, { createContext, useContext, useEffect, useState } from 'react';
import { getUserRole, setUserRole, linkPatientByEmail } from './services';
import { UserRole } from './types';

interface RoleContextType {
  role: UserRole | null;
  linkedPatientId: string | null;
  loading: boolean;
  needsRoleSelection: boolean;
  selectRole: (userId: string, email: string, role: UserRole) => Promise<void>;
  refresh: (userId: string) => Promise<void>;
}

const RoleContext = createContext<RoleContextType>({
  role: null,
  linkedPatientId: null,
  loading: true,
  needsRoleSelection: false,
  selectRole: async () => {},
  refresh: async () => {},
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole | null>(null);
  const [linkedPatientId, setLinkedPatientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsRoleSelection, setNeedsRoleSelection] = useState(false);

  async function refresh(userId: string) {
    setLoading(true);
    try {
      const record = await getUserRole(userId);
      if (!record) {
        setNeedsRoleSelection(true);
        setRole(null);
      } else {
        setRole(record.role);
        setLinkedPatientId(record.linkedPatientId);
        setNeedsRoleSelection(false);
      }
    } catch {
      setNeedsRoleSelection(true);
    } finally {
      setLoading(false);
    }
  }

  async function selectRole(userId: string, email: string, selectedRole: UserRole) {
    if (selectedRole === 'patient') {
      const patientId = await linkPatientByEmail(userId, email);
      setRole('patient');
      setLinkedPatientId(patientId);
    } else {
      await setUserRole(userId, 'professional');
      setRole('professional');
      setLinkedPatientId(null);
    }
    setNeedsRoleSelection(false);
  }

  return (
    <RoleContext.Provider value={{ role, linkedPatientId, loading, needsRoleSelection, selectRole, refresh }}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => useContext(RoleContext);
