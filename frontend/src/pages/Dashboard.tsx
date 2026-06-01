import React from 'react';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import HeroSection from '../components/dashboard/HeroSection';
import JournalMetrics from '../components/dashboard/JournalMetrics';
import AnnouncementsBanner from '../components/dashboard/AnnouncementsBanner';
import NewsAnnouncements from '../components/dashboard/NewsAnnouncements';
import IndexingArchiving from '../components/dashboard/IndexingArchiving';
import EditorialBoardPreview from '../components/dashboard/EditorialBoardPreview';
import WhyPublishSection from '../components/dashboard/WhyPublishSection';

const Dashboard: React.FC = () => {
    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />

            <main className="flex-1">
                {/* 1. Hero: Journal name, logo, ISSN, search, latest issue, CTA */}
                <HeroSection />

                {/* 2. Quick stats: acceptance rate, time to decision, indexing */}
                <JournalMetrics />

                {/* 3. Announcements banner */}
                <AnnouncementsBanner />

                {/* 4. News & Announcements */}
                <NewsAnnouncements />

                {/* 6. Why Publish With Us — visual CTA banner */}
                <WhyPublishSection />

                {/* 7. Editorial Board Preview */}
                <EditorialBoardPreview />

                {/* 7. Indexing & Archiving */}
                <IndexingArchiving />
            </main>

            <Footer />
        </div>
    );
};

export default Dashboard;