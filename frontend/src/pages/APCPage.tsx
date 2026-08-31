import React from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import SEO from '../components/common/SEO';

const feeRows = [
    { label: 'Submission fee', amount: 'Free', note: 'No charge to submit a manuscript.' },
    { label: 'Peer review fee', amount: 'Free', note: 'Reviewers volunteer their time; the journal covers coordination.' },
    { label: 'Publication (APC)', amount: 'Free', note: 'No article processing charge on acceptance.' },
    { label: 'Colour figure fee', amount: 'Free', note: 'All figures publish in colour at no extra cost.' },
    { label: 'Open-access licence transfer', amount: 'Free', note: 'CC BY licence — no fee to authors.' },
    { label: 'Reviewer / editor honoraria', amount: 'Free', note: 'No honoraria are charged back to authors.' },
    { label: 'Withdrawal fee', amount: 'Free', note: 'Withdraw at any stage without penalty.' },
];

const APCPage: React.FC = () => (
    <div className="min-h-screen flex flex-col bg-gray-50">
        <SEO
            title="Article Processing Charges"
            description="The journal charges no APC. Submission, review, publication, and open-access are entirely free for authors."
            keywords={['APC', 'article processing charges', 'free', 'open access']}
        />
        <Header />

        {/* Hero */}
        <section className="relative py-20 overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-emerald-900">
            <div className="absolute inset-0 opacity-30">
                <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-emerald-500 blur-3xl" />
                <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-brand-500 blur-3xl" />
            </div>
            <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                <span className="inline-block px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-bold uppercase tracking-wider">
                    Zero APC · Diamond open access
                </span>
                <h1 className="mt-4 text-4xl sm:text-6xl font-extrabold text-white tracking-tight">
                    There are no article processing charges.
                </h1>
                <p className="mt-4 text-lg text-emerald-100 max-w-2xl mx-auto">
                    Publishing with us is entirely free. No submission fee, no page charge, no
                    open-access surcharge — for every author, from every country.
                </p>
            </div>
        </section>

        <main className="flex-1 py-16">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
                {/* Fee table */}
                <section className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-gray-100">
                        <h2 className="text-xl font-extrabold text-gray-900">Fee breakdown</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Every charge in the publication pipeline — and what it costs authors.
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 text-gray-600 uppercase text-xs tracking-wider">
                                <tr>
                                    <th className="text-left px-6 py-3 font-bold">Line item</th>
                                    <th className="text-left px-6 py-3 font-bold">Amount</th>
                                    <th className="text-left px-6 py-3 font-bold">Note</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {feeRows.map((r) => (
                                    <tr key={r.label} className="hover:bg-gray-50/50">
                                        <td className="px-6 py-4 font-semibold text-gray-900">{r.label}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                                {r.amount}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">{r.note}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Waiver policy */}
                <section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
                    <h2 className="text-xl font-extrabold text-gray-900">Waiver policy</h2>
                    <p className="mt-4 text-gray-700 leading-relaxed">
                        A waiver programme exists to remove financial barriers for authors from
                        low- and middle-income countries. Because this journal charges no APC to
                        begin with, the waiver policy is not applicable — every author already
                        receives the benefit a waiver would provide, regardless of geography,
                        institution, or funding status.
                    </p>
                    <p className="mt-3 text-gray-700 leading-relaxed">
                        Should the journal ever introduce an APC (there are no such plans), a full
                        waiver policy will be published here alongside a transitional period.
                    </p>
                </section>

                {/* No hidden costs */}
                <section className="bg-gradient-to-br from-emerald-50 to-brand-50 border border-emerald-100 rounded-3xl p-8">
                    <h2 className="text-xl font-extrabold text-emerald-900">No hidden costs</h2>
                    <p className="mt-3 text-emerald-900/80 leading-relaxed">
                        Beyond the fee table above, there are no ancillary charges tied to
                        publication — no fee to transfer open-access rights, no reviewer or editor
                        honoraria billed to authors, no charge for supplementary materials, no
                        surcharge for figures in colour, and no gatekeeping paywall for readers.
                    </p>
                    <p className="mt-3 text-emerald-900/80 leading-relaxed">
                        Journal operations are funded by our institutional publisher.
                        The reader pays nothing. The author pays nothing.
                    </p>
                </section>

                <div className="text-center">
                    <Link
                        to="/author-login"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 transition no-underline shadow-lg shadow-brand-600/30"
                    >
                        Submit your manuscript →
                    </Link>
                </div>
            </div>
        </main>

        <Footer />
    </div>
);

export default APCPage;
