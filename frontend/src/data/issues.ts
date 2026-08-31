/**
 * Shared mock data for Issues & Archives.
 *
 * When the backend gains Volume/Issue/Article models, replace the exports
 * below with real API calls — the frontend shapes here are designed to be
 * a one-to-one drop-in for the API response types.
 */

export type IssueStatus = 'published' | 'forthcoming' | 'accepting' | 'not-open';

/* ── Author / metadata sub-types ─────────────────────── */

export interface Author {
    name: string;
    affiliation?: string;
    orcid?: string;
    email?: string;
    corresponding?: boolean;
}

export interface SupplementaryFile {
    label: string;
    size: string;
    format: string;
    url?: string;
}

export interface Reference {
    id: number;
    text: string;
    doi?: string;
    url?: string;
}

export interface Figure {
    id: string;
    caption: string;
    image?: string;
}

export interface Table {
    id: string;
    caption: string;
    headers: string[];
    rows: string[][];
}

export interface Metrics {
    views: number;
    downloads: number;
    citations: number;
    altmetric?: number;
}

export interface ArticleContentSection {
    heading: string;
    body: string;                   // paragraphs separated by \n\n
    figureRefs?: string[];          // Figure ids rendered inline after this section
    tableRefs?: string[];           // Table ids rendered inline after this section
}

/* ── ArticleEntry ────────────────────────────────────── */

export interface ArticleEntry {
    id: number;
    title: string;
    authors: string;                // legacy single-string byline (kept for ToC rows)
    pages: string;
    doi: string;
    category: string;
    openAccess?: boolean;

    // Extended fields — all optional; the Article Page renders sensibly when absent.
    authorList?: Author[];
    abstract?: string;
    keywords?: string[];
    receivedDate?: string;
    revisedDate?: string;
    acceptedDate?: string;
    publishedDate?: string;
    pdfUrl?: string;
    htmlUrl?: string;
    supplementary?: SupplementaryFile[];
    references?: Reference[];
    figures?: Figure[];
    tables?: Table[];
    metrics?: Metrics;
    relatedIds?: number[];
    fullContent?: ArticleContentSection[];
}

/* ── Issue ──────────────────────────────────────────── */

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
    publishedDate?: string;         // ISO date, e.g. '2026-03-15'
}

export interface Volume {
    volume: number;
    year: number;
    issues: Issue[];
}

/* ── Section grouping ────────────────────────────────── */

export type ArticleSection =
    | 'Editorial'
    | 'Research Articles'
    | 'Review Articles'
    | 'Short Communications'
    | 'Case Studies'
    | 'Other';

export const SECTION_ORDER: ArticleSection[] = [
    'Editorial',
    'Research Articles',
    'Review Articles',
    'Short Communications',
    'Case Studies',
    'Other',
];

export const sectionForCategory = (category: string): ArticleSection => {
    const c = category.toLowerCase();
    if (c === 'editorial') return 'Editorial';
    if (c.includes('review')) return 'Review Articles';
    if (c.includes('short') || c.includes('communication')) return 'Short Communications';
    if (c.includes('case')) return 'Case Studies';
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
    'Case Study': 'bg-pink-100 text-pink-700',
};

export const statusBadge: Record<IssueStatus, { text: string; color: string }> = {
    published: { text: 'Published', color: 'bg-emerald-100 text-emerald-700' },
    forthcoming: { text: 'Forthcoming', color: 'bg-amber-100 text-amber-700' },
    accepting: { text: 'Accepting Submissions', color: 'bg-blue-100 text-blue-700' },
    'not-open': { text: 'Not Yet Open', color: 'bg-gray-100 text-gray-500' },
};

/* ── Reusable image assets ───────────────────────────── */

const COVER_INAUGURAL =
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=800&fit=crop&q=80';

const FIG_ARCH =
    'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1000&h=600&fit=crop&q=80';
const FIG_DATA =
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1000&h=600&fit=crop&q=80';
const FIG_ROBUST =
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1000&h=600&fit=crop&q=80';
const FIG_MEDICAL =
    'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1000&h=600&fit=crop&q=80';

/* ══════════════════════════════════════════════════════
 *   Volumes
 *   ────────
 *   The inaugural issue is content-heavy so the Article Page has real
 *   data to render for every article. Later issues are placeholders.
 * ══════════════════════════════════════════════════════ */

export const volumes: Volume[] = [
    {
        volume: 1,
        year: 2026,
        issues: [
            {
                number: 1,
                month: 'March',
                status: 'published',
                publishedDate: '2026-03-15',
                coverImage: COVER_INAUGURAL,
                articleCount: 8,
                theme: 'Inaugural Issue',
                editorialNote:
                    'The inaugural issue of JGAIR features a curated selection of research spanning multi-modal learning, privacy-preserving federated systems, edge AI, and the state of explainable AI in 2026.',
                articles: [
                    /* ── 1. Editorial ─────────────────────────── */
                    {
                        id: 1,
                        title: 'Editorial: Welcome to the Journal of Generative and Applied Intelligence Research',
                        authors: 'Dr. Sarah Mitchell',
                        pages: 'i–iv',
                        doi: '10.xxxxx/jgair.2026.01.000',
                        category: 'Editorial',
                        openAccess: true,
                        authorList: [
                            {
                                name: 'Dr. Sarah Mitchell',
                                affiliation: 'Stanford AI Lab, Stanford University, California, USA',
                                orcid: '0000-0001-2345-6789',
                                email: 'editor@jgair-journal.org',
                                corresponding: true,
                            },
                        ],
                        abstract:
                            'We introduce JGAIR — a fully open-access, peer-reviewed journal dedicated to advancing the theory and practice of generative and applied intelligence research. This editorial outlines the journal’s scope, our commitment to rigorous yet rapid peer review, and the AI-assisted editorial infrastructure that supports it.',
                        keywords: ['Editorial', 'Open Access', 'AI Research', 'Peer Review', 'Publishing'],
                        receivedDate: '2026-01-10',
                        acceptedDate: '2026-02-01',
                        publishedDate: '2026-03-15',
                        pdfUrl: '#',
                        htmlUrl: '#',
                        metrics: { views: 2841, downloads: 612, citations: 3, altmetric: 24 },
                        relatedIds: [2, 6],
                    },
                    /* ── 2. Multi-Modal Learning — fully fleshed ── */
                    {
                        id: 2,
                        title: 'Transformer-Based Architectures for Multi-Modal Learning: A Comprehensive Survey',
                        authors: 'J. Chen, A. Kumar, M. Rodriguez',
                        pages: '1–28',
                        doi: '10.xxxxx/jgair.2026.01.001',
                        category: 'Deep Learning',
                        openAccess: true,
                        authorList: [
                            { name: 'Jiaxin Chen', affiliation: 'Department of Computer Science, MIT, Cambridge, MA, USA', orcid: '0000-0002-1111-2222', email: 'jchen@mit.edu', corresponding: true },
                            { name: 'Anil Kumar', affiliation: 'Indian Institute of Science, Bangalore, India', orcid: '0000-0002-3333-4444' },
                            { name: 'María Rodríguez', affiliation: 'ETH Zürich, Switzerland', orcid: '0000-0002-5555-6666' },
                        ],
                        abstract:
                            'Multi-modal transformer architectures have emerged as a unifying framework for tasks that jointly reason over text, images, audio, and structured data. This survey reviews 148 papers published between 2020 and 2026, organising them by fusion strategy, alignment objective, and downstream capability. We identify five open challenges — modality imbalance, compositional generalisation, robustness under distribution shift, sample efficiency, and evaluation reliability — and propose a research agenda that separates architectural innovation from data-scale confounds.',
                        keywords: ['Multi-modal learning', 'Transformers', 'Vision-language models', 'Fusion architectures', 'Survey'],
                        receivedDate: '2025-11-04',
                        revisedDate: '2026-01-22',
                        acceptedDate: '2026-02-14',
                        publishedDate: '2026-03-15',
                        pdfUrl: '#',
                        htmlUrl: '#',
                        supplementary: [
                            { label: 'Appendix A — Full paper list (148 entries)', size: '312 KB', format: 'CSV' },
                            { label: 'Appendix B — Evaluation protocol', size: '480 KB', format: 'PDF' },
                            { label: 'Reproducibility package', size: '18 MB', format: 'ZIP' },
                        ],
                        figures: [
                            { id: 'F1', caption: 'Figure 1. Taxonomy of multi-modal fusion strategies, grouped by the stage at which modalities are merged (early, mid, late) and the alignment objective used.', image: FIG_ARCH },
                            { id: 'F2', caption: 'Figure 2. Publication counts by year and modality pair (2020–2026). Vision-language dominates but audio-language has grown sharply post-2023.', image: FIG_DATA },
                            { id: 'F3', caption: 'Figure 3. Robustness under systematic modality dropout on MMRobust-2026. Late-fusion methods retain 78% of accuracy vs 41% for early fusion.', image: FIG_ROBUST },
                        ],
                        tables: [
                            {
                                id: 'T1',
                                caption: 'Table 1. Summary of representative multi-modal architectures reviewed.',
                                headers: ['Model', 'Year', 'Modalities', 'Params', 'Fusion'],
                                rows: [
                                    ['CLIP', '2021', 'Vision + Language', '400 M', 'Late (contrastive)'],
                                    ['Flamingo', '2022', 'Vision + Language', '80 B', 'Mid (cross-attn)'],
                                    ['ImageBind', '2023', '6 modalities', '1.2 B', 'Late (contrastive)'],
                                    ['GPT-4V', '2023', 'Vision + Language', 'Undisclosed', 'Mid (unified)'],
                                    ['MM-Fusion-26', '2026', 'Vision + Language + Audio', '7 B', 'Early (token-level)'],
                                ],
                            },
                        ],
                        references: [
                            { id: 1, text: 'Radford, A. et al. (2021). Learning transferable visual models from natural language supervision. ICML.', doi: '10.48550/arXiv.2103.00020' },
                            { id: 2, text: 'Alayrac, J.-B. et al. (2022). Flamingo: a Visual Language Model for Few-Shot Learning. NeurIPS.', doi: '10.48550/arXiv.2204.14198' },
                            { id: 3, text: 'Girdhar, R. et al. (2023). ImageBind: One Embedding Space to Bind Them All. CVPR.', doi: '10.48550/arXiv.2305.05665' },
                            { id: 4, text: 'Devlin, J. et al. (2019). BERT: Pre-training of Deep Bidirectional Transformers. NAACL-HLT.', doi: '10.18653/v1/N19-1423' },
                            { id: 5, text: 'Vaswani, A. et al. (2017). Attention Is All You Need. NeurIPS.', doi: '10.48550/arXiv.1706.03762' },
                            { id: 6, text: 'Dosovitskiy, A. et al. (2021). An Image is Worth 16×16 Words. ICLR.', doi: '10.48550/arXiv.2010.11929' },
                            { id: 7, text: 'Chen, T. et al. (2023). Modality-agnostic pre-training for vision-language tasks. TMLR.' },
                            { id: 8, text: 'Kim, W., Son, B., Kim, I. (2021). ViLT: Vision-and-Language Transformer Without Convolution. ICML.', doi: '10.48550/arXiv.2102.03334' },
                        ],
                        metrics: { views: 12849, downloads: 3421, citations: 87, altmetric: 142 },
                        relatedIds: [3, 5, 6],
                        fullContent: [
                            {
                                heading: '1. Introduction',
                                body:
                                    'Multi-modal learning has moved from a niche subfield to the dominant paradigm in applied AI. Systems that jointly ingest and reason over text, images, audio, video, and increasingly other sensor streams underpin state-of-the-art performance in retrieval, question answering, robotics, healthcare imaging, and autonomous perception. This survey provides a systematic, taxonomised review of transformer-based multi-modal architectures published between January 2020 and March 2026.\n\nWe pursue three research questions. First, how have fusion strategies evolved as compute and data have scaled? Second, which alignment objectives have proven most transferable? Third, which failure modes persist across scales, and where should the community concentrate its next efforts?',
                            },
                            {
                                heading: '2. Taxonomy of fusion strategies',
                                body:
                                    'We propose a two-axis taxonomy: (i) the stage at which modalities are merged (early, mid, late), and (ii) the alignment objective (contrastive, cross-attention, unified token space, task-supervised). Figure 1 organises the surveyed works accordingly. Early-fusion approaches offer the tightest coupling but suffer under modality dropout; late-fusion methods trade tightness for robustness and modularity.',
                                figureRefs: ['F1'],
                            },
                            {
                                heading: '3. Publication landscape',
                                body:
                                    'Figure 2 tracks publication volume by modality pair. Vision-language remains the largest category, but audio-language work has grown three-fold since 2023, driven by advances in speech tokenisation and joint pre-training. Table 1 summarises the most-cited architectures across the review window.',
                                figureRefs: ['F2'],
                                tableRefs: ['T1'],
                            },
                            {
                                heading: '4. Robustness and open challenges',
                                body:
                                    'We benchmark ten representative models on MMRobust-2026, a suite of controlled modality-dropout, corruption, and distribution-shift tests. Figure 3 reports headline results. Late-fusion architectures retain 78% of clean accuracy on average when one modality is fully removed, compared with 41% for tightly-coupled early-fusion models — a gap that has not narrowed since 2022.\n\nWe conclude with a research agenda that separates architectural innovation from data-scale confounds, and calls for standardised robustness reporting alongside headline benchmarks.',
                                figureRefs: ['F3'],
                            },
                        ],
                    },
                    /* ── 3. Federated Learning + Healthcare ── */
                    {
                        id: 3,
                        title: 'Federated Learning with Differential Privacy Guarantees for Healthcare Applications',
                        authors: 'S. Patel, L. Wang, R. Müller',
                        pages: '29–48',
                        doi: '10.xxxxx/jgair.2026.01.002',
                        category: 'AI for Healthcare',
                        openAccess: true,
                        authorList: [
                            { name: 'Shreya Patel', affiliation: 'Johns Hopkins School of Medicine, Baltimore, USA', orcid: '0000-0002-7777-8888', email: 'spatel@jhmi.edu', corresponding: true },
                            { name: 'Lin Wang', affiliation: 'Tsinghua University, Beijing, China', orcid: '0000-0002-9999-0000' },
                            { name: 'Ralf Müller', affiliation: 'Charité — Universitätsmedizin Berlin, Germany', orcid: '0000-0003-1234-5678' },
                        ],
                        abstract:
                            'We present a federated-learning framework that trains diagnostic models across seven partner hospitals without leaving patient data on any single site, providing (ε, δ)-differential privacy at ε = 3.0 and matching centrally-trained baselines to within 1.4 F1 points on a chest-radiograph triage task.',
                        keywords: ['Federated learning', 'Differential privacy', 'Healthcare AI', 'Medical imaging', 'HIPAA'],
                        receivedDate: '2025-10-18',
                        revisedDate: '2026-01-05',
                        acceptedDate: '2026-02-08',
                        publishedDate: '2026-03-15',
                        pdfUrl: '#',
                        htmlUrl: '#',
                        supplementary: [
                            { label: 'Site-level accuracy breakdown', size: '96 KB', format: 'CSV' },
                            { label: 'Privacy accounting spreadsheet', size: '128 KB', format: 'XLSX' },
                        ],
                        figures: [
                            { id: 'F1', caption: 'Figure 1. System architecture. Local training loops feed a secure-aggregation service; DP noise is applied per-round.', image: FIG_MEDICAL },
                        ],
                        references: [
                            { id: 1, text: 'McMahan, B. et al. (2017). Communication-Efficient Learning of Deep Networks from Decentralized Data. AISTATS.', doi: '10.48550/arXiv.1602.05629' },
                            { id: 2, text: 'Dwork, C., Roth, A. (2014). The Algorithmic Foundations of Differential Privacy. Foundations and Trends in TCS.' },
                            { id: 3, text: 'Kaissis, G. et al. (2020). Secure, privacy-preserving and federated machine learning in medical imaging. Nature Machine Intelligence.', doi: '10.1038/s42256-020-0186-1' },
                        ],
                        metrics: { views: 8102, downloads: 2140, citations: 41, altmetric: 66 },
                        relatedIds: [2, 4, 8],
                    },
                    /* ── 4. Edge AI ── */
                    {
                        id: 4,
                        title: 'Energy-Efficient Edge AI: Compiler Optimizations for Neural Network Inference on IoT Devices',
                        authors: 'K. Nakamura, F. Silva, D. Kim',
                        pages: '49–67',
                        doi: '10.xxxxx/jgair.2026.01.003',
                        category: 'Edge AI',
                        openAccess: true,
                        authorList: [
                            { name: 'Kenji Nakamura', affiliation: 'University of Tokyo, Japan', orcid: '0000-0003-2222-3333', email: 'k.nakamura@u-tokyo.ac.jp', corresponding: true },
                            { name: 'Felipe Silva', affiliation: 'Universidade de São Paulo, Brazil', orcid: '0000-0003-4444-5555' },
                            { name: 'Dae-Won Kim', affiliation: 'KAIST, Daejeon, South Korea', orcid: '0000-0003-6666-7777' },
                        ],
                        abstract:
                            'A compiler pipeline for INT8 inference on ARM Cortex-M and RISC-V microcontrollers reduces energy per inference by 42% at iso-accuracy across MobileNetV3, EfficientNet-Lite, and a bespoke keyword-spotting network.',
                        keywords: ['Edge AI', 'Compiler optimisation', 'IoT', 'INT8 inference', 'Energy efficiency'],
                        receivedDate: '2025-11-30',
                        acceptedDate: '2026-02-11',
                        publishedDate: '2026-03-15',
                        pdfUrl: '#',
                        htmlUrl: '#',
                        metrics: { views: 5320, downloads: 1490, citations: 18, altmetric: 22 },
                        relatedIds: [2, 5],
                    },
                    /* ── 5. Causal reasoning in LLMs ── */
                    {
                        id: 5,
                        title: 'Causal Reasoning in Large Language Models: Benchmarks, Methods, and Open Challenges',
                        authors: 'P. Gupta, E. Thompson, Y. Zhang',
                        pages: '68–89',
                        doi: '10.xxxxx/jgair.2026.01.004',
                        category: 'Generative AI',
                        openAccess: true,
                        authorList: [
                            { name: 'Priya Gupta', affiliation: 'DeepMind, London, UK', orcid: '0000-0004-1111-2222', email: 'pgupta@deepmind.google', corresponding: true },
                            { name: 'Emily Thompson', affiliation: 'University of Oxford, UK', orcid: '0000-0004-3333-4444' },
                            { name: 'Yao Zhang', affiliation: 'Peking University, Beijing, China', orcid: '0000-0004-5555-6666' },
                        ],
                        abstract:
                            'We evaluate 14 frontier LLMs on causal-reasoning benchmarks spanning intervention prediction, counterfactual reasoning, and de-confounding under omitted-variable bias. Even the strongest models trail human baselines by 22 accuracy points under adversarial evaluation.',
                        keywords: ['Large language models', 'Causal inference', 'Counterfactual reasoning', 'Evaluation'],
                        receivedDate: '2025-11-12',
                        revisedDate: '2026-01-18',
                        acceptedDate: '2026-02-16',
                        publishedDate: '2026-03-15',
                        pdfUrl: '#',
                        htmlUrl: '#',
                        metrics: { views: 9412, downloads: 2681, citations: 55, altmetric: 91 },
                        relatedIds: [2, 6, 8],
                    },
                    /* ── 6. XAI Review ── */
                    {
                        id: 6,
                        title: 'State of Explainable AI: A 2026 Survey',
                        authors: 'Fei-Fei Li, Yoshua Bengio',
                        pages: '90–125',
                        doi: '10.xxxxx/jgair.2026.01.005',
                        category: 'Review Article',
                        openAccess: true,
                        authorList: [
                            { name: 'Fei-Fei Li', affiliation: 'Stanford University Human-Centered AI Institute, USA', orcid: '0000-0002-9781-1234', email: 'feifeili@stanford.edu', corresponding: true },
                            { name: 'Yoshua Bengio', affiliation: 'Mila — Québec AI Institute, Université de Montréal, Canada', orcid: '0000-0002-9322-3773' },
                        ],
                        abstract:
                            'We survey the state of explainable AI as of 2026, tracking the field’s move from post-hoc feature-attribution methods towards concept-based, mechanistic, and inherently interpretable models. Across 214 papers, we quantify a widening gap between technical progress on interpretability tooling and the operational use of those explanations in high-stakes deployments.',
                        keywords: ['Explainable AI', 'Interpretability', 'Mechanistic interpretability', 'Concept-based methods', 'AI governance'],
                        receivedDate: '2025-09-22',
                        revisedDate: '2026-01-30',
                        acceptedDate: '2026-02-18',
                        publishedDate: '2026-03-15',
                        pdfUrl: '#',
                        htmlUrl: '#',
                        supplementary: [
                            { label: 'Full bibliography (214 papers)', size: '412 KB', format: 'BibTeX' },
                        ],
                        figures: [
                            { id: 'F1', caption: 'Figure 1. Adoption curves for four families of interpretability methods, 2018–2026.', image: FIG_DATA },
                        ],
                        references: [
                            { id: 1, text: 'Ribeiro, M.T., Singh, S., Guestrin, C. (2016). "Why Should I Trust You?" Explaining the Predictions of Any Classifier. KDD.', doi: '10.1145/2939672.2939778' },
                            { id: 2, text: 'Lundberg, S.M., Lee, S.-I. (2017). A Unified Approach to Interpreting Model Predictions. NeurIPS.' },
                            { id: 3, text: 'Olah, C. et al. (2024). Scaling Monosemanticity. Anthropic Research.' },
                        ],
                        metrics: { views: 21032, downloads: 6280, citations: 132, altmetric: 240 },
                        relatedIds: [2, 5, 8],
                    },
                    /* ── 7. Short Communication ── */
                    {
                        id: 7,
                        title: 'A Note on Reproducibility in Reinforcement Learning',
                        authors: 'David Silver',
                        pages: '126–132',
                        doi: '10.xxxxx/jgair.2026.01.006',
                        category: 'Short Communication',
                        openAccess: true,
                        authorList: [
                            { name: 'David Silver', affiliation: 'Google DeepMind, London, UK', orcid: '0000-0002-1234-9999', email: 'davidsilver@deepmind.google', corresponding: true },
                        ],
                        abstract:
                            'We report seven concrete reproducibility failures observed across community re-implementations of published RL papers between 2023 and 2025, and propose a lightweight reporting checklist that would have surfaced six of them at review time.',
                        keywords: ['Reinforcement learning', 'Reproducibility', 'Research practice'],
                        receivedDate: '2026-01-08',
                        acceptedDate: '2026-02-04',
                        publishedDate: '2026-03-15',
                        pdfUrl: '#',
                        htmlUrl: '#',
                        metrics: { views: 6120, downloads: 1830, citations: 24, altmetric: 88 },
                        relatedIds: [5, 8],
                    },
                    /* ── 8. XAI for Autonomous Driving ── */
                    {
                        id: 8,
                        title: 'Explainable AI for Autonomous Driving: Integrating Visual Saliency with Decision Rationale',
                        authors: 'T. Anderson, H. Liu, C. Fernandez',
                        pages: '133–155',
                        doi: '10.xxxxx/jgair.2026.01.007',
                        category: 'AI Ethics',
                        openAccess: true,
                        authorList: [
                            { name: 'Thomas Anderson', affiliation: 'Carnegie Mellon University, Pittsburgh, USA', orcid: '0000-0005-1111-2222', email: 'tanderson@cmu.edu', corresponding: true },
                            { name: 'Hui Liu', affiliation: 'Shanghai Jiao Tong University, China', orcid: '0000-0005-3333-4444' },
                            { name: 'Carla Fernández', affiliation: 'Universidad Politécnica de Madrid, Spain', orcid: '0000-0005-5555-6666' },
                        ],
                        abstract:
                            'We combine visual saliency maps with a structured decision-rationale layer to produce human-legible explanations for autonomous-driving policy outputs, and evaluate the results with 42 driving-instructor participants.',
                        keywords: ['Explainable AI', 'Autonomous driving', 'Saliency', 'Human evaluation'],
                        receivedDate: '2025-12-01',
                        revisedDate: '2026-01-24',
                        acceptedDate: '2026-02-17',
                        publishedDate: '2026-03-15',
                        pdfUrl: '#',
                        htmlUrl: '#',
                        metrics: { views: 4310, downloads: 1122, citations: 12, altmetric: 34 },
                        relatedIds: [3, 6],
                    },
                ],
            },
            { number: 2, month: 'June', status: 'accepting', articleCount: 0, deadline: 'April 30, 2026', articles: [] },
            { number: 3, month: 'September', status: 'accepting', articleCount: 0, deadline: 'July 15, 2026', theme: 'Special Section: Trustworthy AI', articles: [] },
            { number: 4, month: 'December', status: 'not-open', articleCount: 0, deadline: 'October 15, 2026', articles: [] },
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

/** Locate an article (and its parent issue/volume) by numeric id. */
export const findArticleById = (
    id: number,
): { article: ArticleEntry; volume: Volume; issue: Issue } | null => {
    for (const v of volumes) {
        for (const i of v.issues) {
            const a = i.articles.find((x) => x.id === id);
            if (a) return { article: a, volume: v, issue: i };
        }
    }
    return null;
};

/**
 * Return up to `limit` related articles, prioritising explicit `relatedIds`
 * and then falling back to same-category peers.
 */
export const getRelatedArticles = (
    article: ArticleEntry,
    limit = 3,
): { article: ArticleEntry; volume: Volume; issue: Issue }[] => {
    const seen = new Set<number>([article.id]);
    const results: { article: ArticleEntry; volume: Volume; issue: Issue }[] = [];
    for (const id of article.relatedIds ?? []) {
        if (seen.has(id) || results.length >= limit) continue;
        const found = findArticleById(id);
        if (found) {
            results.push(found);
            seen.add(id);
        }
    }
    if (results.length < limit) {
        for (const v of volumes) {
            for (const i of v.issues) {
                for (const a of i.articles) {
                    if (seen.has(a.id) || results.length >= limit) continue;
                    if (a.category === article.category) {
                        results.push({ article: a, volume: v, issue: i });
                        seen.add(a.id);
                    }
                }
            }
        }
    }
    return results;
};

/** Group volumes by publication year (newest year first). */
export const volumesByYear = (): Array<{ year: number; volumes: Volume[] }> => {
    const map = new Map<number, Volume[]>();
    for (const v of volumes) {
        if (!map.has(v.year)) map.set(v.year, []);
        map.get(v.year)!.push(v);
    }
    return [...map.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([year, vols]) => ({ year, volumes: vols }));
};
