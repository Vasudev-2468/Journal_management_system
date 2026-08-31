import client from './client';

/**
 * Two-factor recovery-code endpoints for the currently signed-in user.
 *
 * All three calls require an authenticated session — client.ts picks the
 * token by URL prefix. The recovery-code routes don't match any of the
 * role-scoped prefixes, so the interceptor falls back to the generic
 * ``token`` slot; callers that live on the author or editor side should
 * pass an explicit Authorization header via a config override.
 */

export interface GenerateCodesResponse {
    codes: string[];
    generated_at: string;
    message: string;
}

export interface CountResponse {
    total: number;
    remaining: number;
}

export interface ConsumeResponse {
    ok: boolean;
}

const buildAuthConfig = (token?: string) =>
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;

// ── Mint 8 fresh codes (any existing codes are voided) ──

export const generateCodes = async (
    token?: string,
): Promise<GenerateCodesResponse> => {
    const res = await client.post<GenerateCodesResponse>(
        '/recovery-codes/generate',
        {},
        buildAuthConfig(token),
    );
    return res.data;
};

// ── How many are still unused? ──────────────────────────

export const getCount = async (token?: string): Promise<CountResponse> => {
    const res = await client.get<CountResponse>(
        '/recovery-codes/count',
        buildAuthConfig(token),
    );
    return res.data;
};

// ── Spend one code ──────────────────────────────────────

export const consumeCode = async (
    code: string,
    token?: string,
): Promise<ConsumeResponse> => {
    const res = await client.post<ConsumeResponse>(
        '/recovery-codes/consume',
        { code },
        buildAuthConfig(token),
    );
    return res.data;
};
