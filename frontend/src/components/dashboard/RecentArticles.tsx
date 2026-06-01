import React from 'react';
import { Link } from 'react-router-dom';

interface Article {
    id: number;
    title: string;
    authors: string;
    date: string;
    category: string;
    abstract: string;
}

const sampleArticles: Article[] = [
    {
        id: 1,
        title: 'Transformer-Based Architectures for Multi-Modal Learning: A Comprehensive Survey',
        authors: 'J. Chen, A. Kumar, M. Rodriguez',
        date: 'Apr 15, 2026',
        category: 'Deep Learning',
        abstract: 'This survey provides a comprehensive overview of transformer-based architectures designed for multi-modal learning tasks, examining cross-attention mechanisms, fusion strategies, and benchmark performance across vision-language tasks.',
    },
    {
        id: 2,
        title: 'Federated Learning with Differential Privacy Guarantees for Healthcare Applications',
        authors: 'S. Patel, L. Wang, R. Müller',
        date: 'Apr 14, 2026',
        category: 'AI for Healthcare',
        abstract: 'We propose a novel federated learning framework that provides formal differential privacy guarantees while maintaining model utility in clinical decision support systems across distributed hospital networks.',
    },
    {
        id: 3,
        title: 'Energy-Efficient Edge AI: Compiler Optimizations for Neural Network Inference on IoT Devices',
        authors: 'K. Nakamura, F. Silva, D. Kim',
        date: 'Apr 13, 2026',
        category: 'Edge AI',
        abstract: 'This paper presents compiler-level optimizations that reduce energy consumption by up to 47% for neural network inference on resource-constrained IoT devices without significant accuracy degradation.',
    },
    {
        id: 4,
        title: 'Causal Reasoning in Large Language Models: Benchmarks, Methods, and Open Challenges',
        authors: 'P. Gupta, E. Thompson, Y. Zhang',
        date: 'Apr 12, 2026',
        category: 'Generative AI',
        abstract: 'We introduce CausalBench, a comprehensive benchmark for evaluating causal reasoning capabilities in LLMs, along with novel prompting strategies that improve causal inference accuracy by 23%.',
    },
    {
        id: 5,
        title: 'Explainable AI for Autonomous Driving: Integrating Visual Saliency with Decision Rationale',
        authors: 'T. Anderson, H. Liu, C. Fernandez',
        date: 'Apr 11, 2026',
        category: 'AI Ethics',
        abstract: 'This work presents an explainable framework for autonomous driving decisions that combines visual saliency maps with natural language rationale generation to meet emerging regulatory requirements.',
    },
];

const statusColors: Record<string, string> = {
    'Deep Learning': 'bg-blue-100 text-blue-700',
    'AI for Healthcare': 'bg-emerald-100 text-emerald-700',
    'Edge AI': 'bg-orange-100 text-orange-700',
    'Generative AI': 'bg-purple-100 text-purple-700',
    'AI Ethics': 'bg-rose-100 text-rose-700',
};

const RecentArticles: React.FC = () => {
    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Recent Submissions</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Latest research papers submitted to the journal</p>
                </div>
                <Link
                    to="/articles"
                    className="text-sm font-medium text-brand-600 hover:text-brand-700 no-underline flex items-center gap-1"
                >
                    View all
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                </Link>
            </div>

            <div className="space-y-4">
                {sampleArticles.map((article) => (
                    <article
                        key={article.id}
                        className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition group"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[article.category] || 'bg-gray-100 text-gray-600'}`}>
                                        {article.category}
                                    </span>
                                    <span className="text-xs text-gray-400">{article.date}</span>
                                </div>
                                <h3 className="text-base font-semibold text-gray-900 group-hover:text-brand-700 transition leading-snug">
                                    <Link to={`/articles/${article.id}`} className="no-underline text-inherit hover:text-brand-700">
                                        {article.title}
                                    </Link>
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">{article.authors}</p>
                                <p className="text-sm text-gray-400 mt-2 line-clamp-2 leading-relaxed">
                                    {article.abstract}
                                </p>
                            </div>
                            <div className="flex-shrink-0 flex items-center gap-2 pt-1">
                                <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded font-medium">
                                    PDF
                                </span>
                            </div>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
};

export default RecentArticles;
