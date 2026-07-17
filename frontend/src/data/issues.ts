/**
 * Shared mock data for Issues & Archives.
 * When the backend gains Volume/Issue models, replace the exports below
 * with real API calls (keeping the same shapes).
 */

export type IssueStatus = 'published' | 'forthcoming' | 'accepting' | 'not-open';

export interface ArticleEntry {
    id: number;
    title: string;
    authors: string;
    pages: string;
    doi: string;
    category: string;
    openAccess?: boolean;
}

export interface Issue {
    number: number;
    month: string;
    status: IssueStatus;
    articleCount: number;
    articles: ArticleEntry[];
    deadline?: string;
    theme?: string;
    editorialNote?: string;
    coverImage?: string;
}

export interface Volume {
    volume: number;
    year: number;
    issues: Issue[];
}

/* ── Article category ↔ section grouping ─────────────────
 * Used by IssueDetailPage to bucket articles under the
 * standard Q1-journal section headings.
 */
export type ArticleSection =
    | 'Editorial'
    | 'Research Articles'
    | 'Review Articles'
    | 'Short Communications'
    | 'Other';

export const SECTION_ORDER: ArticleSection[] = [
    'Editorial',
    'Research Articles',
    'Review Articles',
    'Short Communications',
    'Other',
];

export const sectionForCategory = (category: string): ArticleSection => {
    const c = category.toLowerCase();
    if (c === 'editorial') return 'Editorial';
    if (c.includes('review')) return 'Review Articles';
    if (c.includes('short') || c.includes('communication')) return 'Short Communications';
    if (
        c.includes('deep learning') ||
        c.includes('healthcare') ||
        c.includes('edge') ||
        c.includes('generative') ||
        c.includes('ethic') ||
        c.includes('nlp') ||
        c.includes('vision') ||
        c.includes('reinforcement') ||
        c.includes('robotics') ||
        c.includes('federated')
    )
        return 'Research Articles';
    return 'Other';
};

export const categoryColor: Record<string, string> = {
    'Deep Learning': 'bg-blue-100 text-blue-700',
    'AI for Healthcare': 'bg-emerald-100 text-emerald-700',
    'Edge AI': 'bg-orange-100 text-orange-700',
    'Generative AI': 'bg-purple-100 text-purple-700',
    'AI Ethics': 'bg-rose-100 text-rose-700',
    NLP: 'bg-sky-100 text-sky-700',
    'Computer Vision': 'bg-teal-100 text-teal-700',
    'Reinforcement Learning': 'bg-amber-100 text-amber-700',
    Robotics: 'bg-indigo-100 text-indigo-700',
    'Federated Learning': 'bg-lime-100 text-lime-700',
    Editorial: 'bg-gray-100 text-gray-700',
    'Review Article': 'bg-violet-100 text-violet-700',
    'Short Communication': 'bg-cyan-100 text-cyan-700',
};

export const statusBadge: Record<IssueStatus, { text: string; color: string }> = {
    published: { text: 'Published', color: 'bg-emerald-100 text-emerald-700' },
    forthcoming: { text: 'Forthcoming', color: 'bg-amber-100 text-amber-700' },
    accepting: { text: 'Accepting Submissions', color: 'bg-blue-100 text-blue-700' },
    'not-open': { text: 'Not Yet Open', color: 'bg-gray-100 text-gray-500' },
};

export const volumes: Volume[] = [
    {
        volume: 1,
        year: 2026,
        issues: [
            {
                number: 1,
                month: 'March',
                status: 'published',
                articleCount: 8,
                theme: 'Inaugural Issue',
                editorialNote:
                    'The inaugural issue of JGAIR features a curated selection of research spanning multi-modal learning, privacy-preserving federated systems, edge AI, and the state of explainable AI in 2026.',
                articles: [
                    { id: 1, title: 'Editorial: Welcome to the Journal of Generative and Applied Intelligence Research', authors: 'Dr. Sarah Mitchell (Editor-in-Chief)', pages: 'i–iv', doi: '10.xxxxx/jgair.2026.01.000', category: 'Editorial', openAccess: true },
                    { id: 2, title: 'Transformer-Based Architectures for Multi-Modal Learning: A Comprehensive Survey', authors: 'J. Chen, A. Kumar, M. Rodriguez', pages: '1–28', doi: '10.xxxxx/jgair.2026.01.001', category: 'Deep Learning', openAccess: true },
                    { id: 3, title: 'Federated Learning with Differential Privacy Guarantees for Healthcare Applications', authors: 'S. Patel, L. Wang, R. Müller', pages: '29–48', doi: '10.xxxxx/jgair.2026.01.002', category: 'AI for Healthcare', openAccess: true },
                    { id: 4, title: 'Energy-Efficient Edge AI: Compiler Optimizations for Neural Network Inference on IoT Devices', authors: 'K. Nakamura, F. Silva, D. Kim', pages: '49–67', doi: '10.xxxxx/jgair.2026.01.003', category: 'Edge AI', openAccess: true },
                    { id: 5, title: 'Causal Reasoning in Large Language Models: Benchmarks, Methods, and Open Challenges', authors: 'P. Gupta, E. Thompson, Y. Zhang', pages: '68–89', doi: '10.xxxxx/jgair.2026.01.004', category: 'Generative AI', openAccess: true },
                    { id: 6, title: 'State of Explainable AI: A 2026 Survey', authors: 'Fei-Fei Li, Yoshua Bengio', pages: '90–125', doi: '10.xxxxx/jgair.2026.01.005', category: 'Review Article', openAccess: true },
                    { id: 7, title: 'A Note on Reproducibility in Reinforcement Learning', authors: 'David Silver', pages: '126–132', doi: '10.xxxxx/jgair.2026.01.006', category: 'Short Communication', openAccess: true },
                    { id: 8, title: 'Explainable AI for Autonomous Driving: Integrating Visual Saliency with Decision Rationale', authors: 'T. Anderson, H. Liu, C. Fernandez', pages: '133–155', doi: '10.xxxxx/jgair.2026.01.007', category: 'AI Ethics', openAccess: true },
                ],
            },
            {
                number: 2,
                month: 'June',
                status: 'accepting',
                articleCount: 0,
                deadline: 'April 30, 2026',
                articles: [],
            },
            {
                number: 3,
                month: 'September',
                status: 'accepting',
                articleCount: 0,
                deadline: 'July 15, 2026',
                theme: 'Special Section: Trustworthy AI',
                articles: [],
            },
            {
                number: 4,
                month: 'December',
                status: 'not-open',
                articleCount: 0,
                deadline: 'October 15, 2026',
                articles: [],
            },
        ],
    },
    {
        volume: 2,
        year: 2027,
        issues: [
            { number: 1, month: 'March', status: 'not-open', articleCount: 0, articles: [] },
            { number: 2, month: 'June', status: 'not-open', articleCount: 0, articles: [] },
            { number: 3, month: 'September', status: 'not-open', articleCount: 0, articles: [] },
            { number: 4, month: 'December', status: 'not-open', articleCount: 0, articles: [] },
        ],
    },
];

/* ── Helpers ─────────────────────────────────────────── */

/** Return the most recent published issue across all volumes. */
export const getCurrentIssue = (): { volume: Volume; issue: Issue } | null => {
    for (let vi = volumes.length - 1; vi >= 0; vi--) {
        const v = volumes[vi];
        for (let ii = v.issues.length - 1; ii >= 0; ii--) {
            if (v.issues[ii].status === 'published') {
                return { volume: v, issue: v.issues[ii] };
            }
        }
    }
    return null;
};

/** Return the next issue that is accepting submissions or forthcoming. */
export const getForthcomingIssue = (): { volume: Volume; issue: Issue } | null => {
    for (const v of volumes) {
        for (const i of v.issues) {
            if (i.status === 'accepting' || i.status === 'forthcoming') {
                return { volume: v, issue: i };
            }
        }
    }
    return null;
};

export const findIssue = (
    volumeNum: number,
    issueNum: number,
): { volume: Volume; issue: Issue } | null => {
    const v = volumes.find((vol) => vol.volume === volumeNum);
    if (!v) return null;
    const i = v.issues.find((iss) => iss.number === issueNum);
    if (!i) return null;
    return { volume: v, issue: i };
};

export const pageRangeFor = (issue: Issue): string | null => {
    if (issue.articles.length === 0) return null;
    const first = issue.articles[0].pages.split('–')[0];
    const last = issue.articles[issue.articles.length - 1].pages.split('–').pop();
    return `${first}–${last}`;
};
