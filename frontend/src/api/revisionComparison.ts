import client from './client';

export interface VersionFile {
    id: string;
    filename: string;
    kind: string | null;
    size_bytes: number | null;
}

export interface VersionRow {
    id: number;
    version_number: number;
    label: string;
    cover_letter: string | null;
    response_to_reviewers: string | null;
    change_summary: string | null;
    is_current: boolean;
    created_at: string;
    files: VersionFile[];
}

export interface FileDiff {
    filename: string;
    change: 'added' | 'removed' | 'unchanged' | 'modified';
    from_size: number | null;
    to_size: number | null;
    kind: string | null;
}

export interface DiffResponse {
    submission_id: string;
    from_version: VersionRow;
    to_version: VersionRow;
    file_changes: FileDiff[];
    author_summary: string | null;
    response_to_reviewers: string | null;
}

export const fetchVersions = (submissionId: string): Promise<VersionRow[]> =>
    client
        .get(`/revision-comparison/submissions/${submissionId}/versions`)
        .then((r) => r.data);

export const fetchDiff = (
    submissionId: string,
    fromVersion: number,
    toVersion: number,
): Promise<DiffResponse> =>
    client
        .get(`/revision-comparison/submissions/${submissionId}/diff`, {
            params: { from_version: fromVersion, to_version: toVersion },
        })
        .then((r) => r.data);
