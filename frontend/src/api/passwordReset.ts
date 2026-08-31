import client from './client';

/**
 * Public password-reset endpoints.
 *
 * Both calls are anonymous — no Authorization header — so they must not
 * rely on the client.ts token routing. The backend intentionally returns
 * the same success shape whether or not the email is registered, so this
 * module returns whatever the server sends without trying to infer
 * existence.
 */

export interface RequestResetResponse {
    message: string;
}

export interface VerifyResetResponse {
    ok: boolean;
}

// ── Request a reset link ────────────────────────────────

export const requestReset = async (
    email: string,
): Promise<RequestResetResponse> => {
    const res = await client.post<RequestResetResponse>(
        '/password-reset/request',
        { email },
    );
    return res.data;
};

// ── Complete the reset ──────────────────────────────────

export const verifyReset = async (
    token: string,
    newPassword: string,
): Promise<VerifyResetResponse> => {
    const res = await client.post<VerifyResetResponse>(
        '/password-reset/verify',
        { token, new_password: newPassword },
    );
    return res.data;
};
