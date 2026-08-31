import client from './client';

// JG-101 — publication identity, the masthead source of truth.
export interface JournalIdentity {
    id: number;
    title: string;
    description: string | null;
    issn_online: string | null;
    issn_print: string | null;
    abbreviation: string | null;
    subject_area: string | null;
    language: string | null;
    start_year: number | null;
    frequency: string | null;
    publisher_name: string | null;
    publisher_address: string | null;
    licence: string;
    doi_prefix: string | null;
    oai_identifier_prefix: string | null;
    // ── Contact block (migration h4d8e5f6a2c1) ────────────
    // Populated via the editor's journal-identity form; consumed by the
    // public Contact page sidebar and the site footer.
    phone: string | null;
    address: string | null;
    twitter_url: string | null;
    linkedin_url: string | null;
    email_editorial: string | null;
    email_publisher: string | null;
    is_active: boolean;
}

export type JournalIdentityPatch = Partial<Omit<JournalIdentity, 'id' | 'is_active'>>;

export async function getCurrentJournal(): Promise<JournalIdentity> {
    const res = await client.get<JournalIdentity>('/journals/current');
    return res.data;
}

export async function updateCurrentJournal(
    patch: JournalIdentityPatch
): Promise<JournalIdentity> {
    const res = await client.patch<JournalIdentity>('/journals/current', patch);
    return res.data;
}
