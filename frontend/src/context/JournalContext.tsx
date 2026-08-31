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
            setError(e?.message || 'Failed to load journal identity');
            setJournal(null);
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
