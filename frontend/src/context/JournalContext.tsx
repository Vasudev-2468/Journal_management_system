import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useMemo,
    ReactNode,
} from 'react';
import {
    getCurrentJournal,
    updateCurrentJournal,
    JournalIdentity,
    JournalIdentityPatch,
} from '../api/journal';
import client from '../api/client';

// JG-101 — single source of truth for publication identity across the SPA.
// Any component that needs ISSN, licence, frequency, publisher etc. reads
// from useJournal() rather than hardcoding a string.

interface JournalContextValue {
    journal: JournalIdentity | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    update: (patch: JournalIdentityPatch) => Promise<JournalIdentity>;
}

const JournalContext = createContext<JournalContextValue | undefined>(undefined);

export const JournalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [journal, setJournal] = useState<JournalIdentity | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getCurrentJournal();
            setJournal(data);
        } catch (e: any) {
            // Multi-journal scaffolding: if /journals/current returns 404
            // or otherwise yields nothing (e.g. a fresh deployment where
            // no journal has been marked active), silently fall back to
            // the primary journal so the SPA still renders masthead
            // fields. If both fail the context stays null — exactly as
            // it did before this fallback was introduced — so the UI's
            // existing "no journal" defaults keep working.
            try {
                const res = await client.get<JournalIdentity>(
                    '/tenancy/primary-journal',
                );
                setJournal(res.data);
            } catch {
                setError(e?.message || 'Failed to load journal identity');
                setJournal(null);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const update = useCallback(async (patch: JournalIdentityPatch) => {
        const updated = await updateCurrentJournal(patch);
        setJournal(updated);
        return updated;
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const value = useMemo(
        () => ({ journal, loading, error, refresh, update }),
        [journal, loading, error, refresh, update]
    );

    return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
};

export function useJournal(): JournalContextValue {
    const ctx = useContext(JournalContext);
    if (ctx === undefined) {
        throw new Error('useJournal must be used inside a <JournalProvider>');
    }
    return ctx;
}
