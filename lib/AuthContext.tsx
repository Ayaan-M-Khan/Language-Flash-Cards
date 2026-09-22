'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, testConnection } from './firebase';
import { UserProfile } from './types';
import { subscribeToUserProfile, syncUserProfile } from './firestore-sync';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isSyncing: boolean;
  syncStatus: 'synced' | 'syncing' | 'guest';
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  updateLocalProfileStats: (updater: (prev: UserProfile | null) => UserProfile | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Validate Firestore connection on boot
  useEffect(() => {
    testConnection();
  }, []);

  // Listen to auth state
  useEffect(() => {
    try {
      const unsubscribeAuth = onAuthStateChanged(
        auth,
        async (currentUser) => {
          setUser(currentUser);

          if (currentUser) {
            setIsSyncing(true);
            try {
              // Initialize profile in Firestore if not present
              const userProf = await syncUserProfile(
                currentUser.uid,
                currentUser.email || 'user@example.com',
                currentUser.displayName,
                currentUser.photoURL
              );
              setProfile(userProf);
            } catch (err) {
              console.warn('Initial profile sync warning:', err);
            } finally {
              setIsSyncing(false);
              setIsLoading(false);
            }
          } else {
            setProfile(null);
            setIsSyncing(false);
            setIsLoading(false);
          }
        },
        (err) => {
          console.warn('Auth state error:', err);
          setIsLoading(false);
        }
      );

      return () => unsubscribeAuth();
    } catch (err) {
      console.warn('Failed to attach auth listener:', err);
      setTimeout(() => setIsLoading(false), 0);
    }
  }, []);

  // Subscribe to real-time updates when user is logged in
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserProfile(user.uid, (updatedProfile) => {
      if (updatedProfile) {
        setProfile(updatedProfile);
      }
    });
    return () => unsub();
  }, [user]);

  const signInWithGoogle = async () => {
    setIsSyncing(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        const prof = await syncUserProfile(
          result.user.uid,
          result.user.email || 'user@example.com',
          result.user.displayName,
          result.user.photoURL
        );
        setProfile(prof);
      }
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        console.error('Google Sign-In failed:', err);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const signOutUser = async () => {
    setIsSyncing(true);
    try {
      await signOut(auth);
      setProfile(null);
      setUser(null);
    } catch (err) {
      console.error('Sign-Out error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateLocalProfileStats = (
    updater: (prev: UserProfile | null) => UserProfile | null
  ) => {
    setProfile(updater);
  };

  const syncStatus: 'synced' | 'syncing' | 'guest' = !user
    ? 'guest'
    : isSyncing
    ? 'syncing'
    : 'synced';

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        isSyncing,
        syncStatus,
        signInWithGoogle,
        signOutUser,
        updateLocalProfileStats,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
