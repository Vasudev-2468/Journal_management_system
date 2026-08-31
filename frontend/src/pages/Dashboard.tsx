import React from 'react';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import SEO from '../components/common/SEO';
import HeroSection from '../components/dashboard/HeroSection';
import JournalMetrics from '../components/dashboard/JournalMetrics';
import AnnouncementsBanner from '../components/dashboard/AnnouncementsBanner';
import CurrentIssue from '../components/dashboard/CurrentIssue';
import LatestArticles from '../components/dashboard/LatestArticles';
import CallForPapersSection from '../components/dashboard/CallForPapersSection';
import PublicationStatistics from '../components/dashboard/PublicationStatistics';
import NewsAnnouncements from '../components/dashboard/NewsAnnouncements';
import IndexingArchiving from '../components/dashboard/IndexingArchiving';
import EditorialBoardPreview from '../components/dashboard/EditorialBoardPreview';
import WhyPublishSection from '../components/dashboard/WhyPublishSection';

const Dashboard: React.FC = () => {
    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <SEO
                title="JGAIR — Journal of Generative and Applied Intelligence Research"
                description="Open-access, peer-reviewed research in AI, machine learning and computational sciences. Fast, fair peer review with AI-assisted editorial workflows."
                canonical={typeof window !== 'undefined' ? window.location.origin + '/' : undefined}
                type="website"
                keywords={['AI journal', 'machine learning', 'peer review', 'open access', 'generative AI']}
                schema={{
                    '@context': 'https://schema.org',
                    '@type': 'Periodical',
                    name: 'Journal of Generative and Applied Intelligence Research',
                    inLanguage: 'en',
                    publisher: { '@type': 'Organization', name: 'JGAIR' },
                    genre: 'Academic journal',
                }}
            />
            <Header />

            <main className="flex-1">
                {/* 1. Hero — Journal name, logo, description, search, submit CTA */}
                <HeroSection />

                {/* 2. Journal-at-a-glance quick metrics */}
                <JournalMetrics />

                {/* 3. Top announcements ticker (deadlines / news) */}
                <AnnouncementsBanner />

                {/* 4. Current Issue */}
                <CurrentIssue />

                {/* 5. Latest Articles */}
                <LatestArticles />

                {/* 6. Call for Papers */}
                <CallForPapersSection />

                {/* 7. Publication Statistics */}
                <PublicationStatistics />

                {/* 8. News & Announcements list */}
                <NewsAnnouncements />

                {/* 9. Why Publish With Us */}
                <WhyPublishSection />

                {/* 10. Editorial Board highlights */}
                <EditorialBoardPreview />

                {/* 11. Indexing & Archiving partners */}
                <IndexingArchiving />
            </main>

            <Footer />
        </div>
    );
};

export default Dashboard;
