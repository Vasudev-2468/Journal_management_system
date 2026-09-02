import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import client from '../api/client';

/**
 * PermissionsContext — single-fetch RBAC snapshot for the editor UI.
 *
 * The backend seeds a role→action matrix at startup and exposes it on
 * ``GET /permissions/me``. This context caches the caller's action set
 * for the life of the tab so buttons can hide/show without a network
 * round-trip on every render.
 *
 * The frontend guard is a courtesy — every action-gated endpoint on
 * the server re-checks via ``require_permission`` — so a permission
 * missing here does not permit anything you couldn't do without the
 * cache.
 */

export interface PermissionsSnapshot {
    role: string | null;
    permissions: Set<string>;
    loading: boolean;
    error: string | null;
    reload: () => void;
    has: (action: string) => boolean;
}

const PermissionsCtx = createContext<PermissionsSnapshot>({
    role: null,
    permissions: new Set(),
    loading: false,
    error: null,
    reload: () => {},
    has: () => false,
});

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [role, setRole] = useState<string | null>(null);
    const [permissions, setPermissions] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        // Only fetch when an editor token is present — a public visitor
        // has no role to enumerate and the 401 would just noise up
        // the console.
        const token = localStorage.getItem('editor_token');
        if (!token) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        client
            .get('/permissions/me')
            .then((r) => {
                if (cancelled) return;
                setRole(r.data.role || null);
                setPermissions(new Set<string>(r.data.permissions || []));
            })
            .catch((e) => {
                if (cancelled) return;
                setError(e?.response?.data?.detail || e?.message || 'Failed to load permissions.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [tick]);

    const has = useCallback((action: string) => permissions.has(action), [permissions]);
    const reload = useCallback(() => setTick((t) => t + 1), []);

    const value = useMemo<PermissionsSnapshot>(
        () => ({ role, permissions, loading, error, reload, has }),
        [role, permissions, loading, error, reload, has],
    );

    return <PermissionsCtx.Provider value={value}>{children}</PermissionsCtx.Provider>;
};

export function usePermissions(): PermissionsSnapshot {
    return useContext(PermissionsCtx);
}

/**
 * <Permission action="DOI_ASSIGN">…</Permission>
 *
 * Renders children only when the caller carries the action. Optionally
 * pass a ``fallback`` element to show something else (e.g. a locked
 * badge) when the check fails.
 */
export const Permission: React.FC<{
    action: string;
    fallback?: React.ReactNode;
    children: React.ReactNode;
}> = ({ action, fallback = null, children }) => {
    const { has } = usePermissions();
    return <>{has(action) ? children : fallback}</>;
};

// ── Canonical action names ──────────────────────────────
//
// Kept as string constants (not enum) so a new action added on the
// backend can be referenced immediately without a matching frontend
// build. Mirrors ``services/permissions.py`` on the server.
export const ACTION = {
    DOI_ASSIGN: 'DOI_ASSIGN',
    PUBLISH: 'PUBLISH',
    MANAGE_USERS: 'MANAGE_USERS',
    CONFIGURE_JOURNAL: 'CONFIGURE_JOURNAL',
    FINAL_DECISION: 'FINAL_DECISION',
    ASSIGN_REVIEWERS: 'ASSIGN_REVIEWERS',
    CORRECT_ARTICLE: 'CORRECT_ARTICLE',
    RETRACT_ARTICLE: 'RETRACT_ARTICLE',
    VIEW_AUDIT: 'VIEW_AUDIT',
} as const;
