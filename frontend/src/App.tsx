import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import JournalPage from './pages/JournalPage';
import ArticlePage from './pages/ArticlePage';
import ReviewPage from './pages/ReviewPage';
import AIInsightsPage from './pages/AIInsightsPage';
import LoginPage from './pages/LoginPage';
import EditorDashboard from './pages/EditorDashboard';
import SubmitPaper from './pages/SubmitPaper';
import ReviewerPortal from './pages/ReviewerPortal';
import AboutPage from './pages/AboutPage';
import EditorialBoardPage from './pages/EditorialBoardPage';
import ForAuthorsPage from './pages/ForAuthorsPage';
import ForReviewersPage from './pages/ForReviewersPage';
import IssuesArchivesPage from './pages/IssuesArchivesPage';
import IssueDetailPage from './pages/IssueDetailPage';
import ConsultPartyDashboard from './pages/ConsultPartyDashboard';
import EditorLoginPage from './pages/EditorLoginPage';
import EditorRecoveryVerifyPage from './pages/EditorRecoveryVerifyPage';
import AuthorLoginPage from './pages/AuthorLoginPage';
import AuthorRegisterPage from './pages/AuthorRegisterPage';
import AuthorDashboard from './pages/AuthorDashboard';
import AuthorSubmissionDetail from './pages/AuthorSubmissionDetail';
import ProtectedEditorRoute from './components/common/ProtectedEditorRoute';
import ProtectedAuthorRoute from './components/common/ProtectedAuthorRoute';
import { AuthProvider } from './context/AuthContext';
import { JournalProvider } from './context/JournalContext';
import EditorJournalIdentityPage from './pages/EditorJournalIdentityPage';
import ArticleListPage from './pages/ArticleListPage';
import PolicyPageView from './pages/PolicyPageView';
import ContactPage from './pages/ContactPage';
import EditorContactInbox from './pages/EditorContactInbox';
import EditorEditorialBoardAdmin from './pages/EditorEditorialBoardAdmin';
import EditorAnnouncementsAdmin from './pages/EditorAnnouncementsAdmin';
import EditorIssuesAdmin from './pages/EditorIssuesAdmin';
import EditorPoliciesAdmin from './pages/EditorPoliciesAdmin';
import AnnouncementsPage from './pages/AnnouncementsPage';
import SpecialIssuesPage from './pages/SpecialIssuesPage';
import SpecialIssueDetailPage from './pages/SpecialIssueDetailPage';
import ReviewerLoginPage from './pages/ReviewerLoginPage';
import ReviewerSetPasswordPage from './pages/ReviewerSetPasswordPage';
import BoardCompleteProfilePage from './pages/BoardCompleteProfilePage';
import ReviewerInvitePage from './pages/ReviewerInvitePage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import RecoveryCodesPage from './pages/RecoveryCodesPage';
import SessionsPage from './pages/SessionsPage';
import AuthorProfileEditPage from './pages/AuthorProfileEditPage';
import EditorialBoardMemberPage from './pages/EditorialBoardMemberPage';
import EditorArticleReferencesPage from './pages/EditorArticleReferencesPage';
import PrivacyControlsPage from './pages/PrivacyControlsPage';
import ReviewerDashboardPage from './pages/ReviewerDashboardPage';
import AssignmentsListPage from './pages/reviewer/AssignmentsListPage';
import AssignmentDetailsPage from './pages/reviewer/AssignmentDetailsPage';
import ReviewFormPage from './pages/reviewer/ReviewFormPage';
import ReviewHistoryPage from './pages/reviewer/ReviewHistoryPage';
import NotificationsPage from './pages/reviewer/NotificationsPage';
import ProfilePage from './pages/reviewer/ProfilePage';
import AvailabilityPage from './pages/reviewer/AvailabilityPage';
import SecurityPage from './pages/reviewer/SecurityPage';
import GuidelinesPage from './pages/reviewer/GuidelinesPage';
import EditorReviewerReportPage from './pages/editor/EditorReviewerReportPage';
import EditorReviewerReportsPage from './pages/editor/EditorReviewerReportsPage';
import AuthorRevisionPage from './pages/AuthorRevisionPage';
import AuthorRevisionResponsePage from './pages/AuthorRevisionResponsePage';
import EditorUsersAdmin from './pages/EditorUsersAdmin';
import EditorAuditLogPage from './pages/EditorAuditLogPage';
import EditorEmailTemplatesPage from './pages/EditorEmailTemplatesPage';
import EditorSpecialIssuesAdmin from './pages/EditorSpecialIssuesAdmin';
import EditorProductionQueue from './pages/EditorProductionQueue';
import StatisticsPage from './pages/StatisticsPage';
import SearchPage from './pages/SearchPage';
import AuthorProfilePage from './pages/AuthorProfilePage';
import APCPage from './pages/APCPage';
import ManuscriptPreparationPage from './pages/ManuscriptPreparationPage';
import AnalyticsLoader from './components/common/AnalyticsLoader';
import CookieBanner from './components/common/CookieBanner';
import './styles/index.css';

const App: React.FC = () => {
    return (
        <AuthProvider>
            <AnalyticsLoader />
            <JournalProvider>
                <Router>
                    <CookieBanner />
                    <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/journals" element={<JournalPage />} />
                    <Route path="/articles" element={<ArticleListPage />} />
                    <Route path="/articles/:id" element={<ArticlePage />} />
                    <Route path="/reviews" element={<ReviewPage />} />
                    <Route path="/ai-insights" element={<AIInsightsPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/editor-login" element={<EditorLoginPage />} />
                    <Route path="/editor-recovery-verify" element={<EditorRecoveryVerifyPage />} />
                    <Route path="/author-login" element={<AuthorLoginPage />} />
                    <Route path="/author-register" element={<AuthorRegisterPage />} />
                    <Route path="/editor" element={
                        <ProtectedEditorRoute>
                            <EditorDashboard />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/submit" element={
                        <ProtectedAuthorRoute>
                            <SubmitPaper />
                        </ProtectedAuthorRoute>
                    } />
                    <Route path="/author-dashboard" element={
                        <ProtectedAuthorRoute>
                            <AuthorDashboard />
                        </ProtectedAuthorRoute>
                    } />
                    <Route path="/author-dashboard/:submissionId" element={
                        <ProtectedAuthorRoute>
                            <AuthorSubmissionDetail />
                        </ProtectedAuthorRoute>
                    } />
                    <Route path="/review/:token" element={<ReviewerPortal />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/editorial-board" element={<EditorialBoardPage />} />
                    <Route path="/for-authors" element={<ForAuthorsPage />} />
                    <Route path="/for-reviewers" element={<ForReviewersPage />} />
                    <Route path="/issues" element={<IssuesArchivesPage />} />
                    <Route path="/issues/:volume/:issue" element={<IssueDetailPage />} />
                    <Route path="/consult-party/:submissionId" element={
                        <ProtectedEditorRoute>
                            <ConsultPartyDashboard />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/editor/journal-identity" element={
                        <ProtectedEditorRoute>
                            <EditorJournalIdentityPage />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/publication-ethics" element={<PolicyPageView slug="publication-ethics" />} />
                    <Route path="/open-access" element={<PolicyPageView slug="open-access" />} />
                    <Route path="/copyright" element={<PolicyPageView slug="copyright" />} />
                    <Route path="/plagiarism-policy" element={<PolicyPageView slug="plagiarism-policy" />} />
                    <Route path="/peer-review-process" element={<PolicyPageView slug="peer-review-process" />} />
                    <Route path="/archiving-policy" element={<PolicyPageView slug="archiving-policy" />} />
                    <Route path="/corrections-retractions" element={<PolicyPageView slug="corrections-retractions" />} />
                    <Route path="/contact" element={<ContactPage />} />
                    <Route path="/editor/contact-inbox" element={
                        <ProtectedEditorRoute>
                            <EditorContactInbox />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/editor/editorial-board" element={
                        <ProtectedEditorRoute>
                            <EditorEditorialBoardAdmin />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/editor/announcements" element={
                        <ProtectedEditorRoute>
                            <EditorAnnouncementsAdmin />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/editor/issues" element={
                        <ProtectedEditorRoute>
                            <EditorIssuesAdmin />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/editor/policies" element={
                        <ProtectedEditorRoute>
                            <EditorPoliciesAdmin />
                        </ProtectedEditorRoute>
                    } />

                    {/* New public routes — announcements, special issues, legal, reviewer */}
                    <Route path="/announcements" element={<AnnouncementsPage />} />
                    <Route path="/special-issues" element={<SpecialIssuesPage />} />
                    <Route path="/special-issues/:slug" element={<SpecialIssueDetailPage />} />
                    <Route path="/privacy-policy" element={<PolicyPageView slug="privacy-policy" />} />
                    <Route path="/terms-of-use" element={<PolicyPageView slug="terms-of-use" />} />
                    <Route path="/cookie-policy" element={<PolicyPageView slug="cookie-policy" />} />
                    <Route path="/accessibility-statement" element={<PolicyPageView slug="accessibility-statement" />} />
                    <Route path="/reviewer-login" element={<ReviewerLoginPage />} />
                    <Route path="/reviewer-set-password" element={<ReviewerSetPasswordPage />} />
                    <Route path="/board/complete-profile/:token" element={<BoardCompleteProfilePage />} />
                    <Route path="/reviewer-invite/:token" element={<ReviewerInvitePage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/recovery-codes" element={<RecoveryCodesPage />} />
                    <Route path="/sessions" element={<SessionsPage />} />
                    <Route path="/author-profile" element={<AuthorProfileEditPage />} />
                    <Route path="/editorial-board/:memberId" element={<EditorialBoardMemberPage />} />
                    <Route path="/privacy-controls" element={<PrivacyControlsPage />} />
                    <Route path="/editor/articles/:articleId/references" element={
                        <ProtectedEditorRoute>
                            <EditorArticleReferencesPage />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/reviewer-dashboard" element={<ReviewerDashboardPage />} />
                    <Route path="/reviewer/assignments" element={<AssignmentsListPage />} />
                    <Route path="/reviewer/assignment/:reviewId" element={<AssignmentDetailsPage />} />
                    <Route path="/reviewer/assignment/:reviewId/review" element={<ReviewFormPage />} />
                    <Route path="/reviewer/history" element={<ReviewHistoryPage />} />
                    <Route path="/reviewer/notifications" element={<NotificationsPage />} />
                    <Route path="/reviewer/profile" element={<ProfilePage />} />
                    <Route path="/reviewer/availability" element={<AvailabilityPage />} />
                    <Route path="/reviewer/security" element={<SecurityPage />} />
                    <Route path="/editor/reviewer-report/:reviewId" element={
                        <ProtectedEditorRoute>
                            <EditorReviewerReportPage />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/editor/reviewer-reports/:submissionId" element={
                        <ProtectedEditorRoute>
                            <EditorReviewerReportsPage />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/reviewer/guidelines" element={<GuidelinesPage />} />

                    {/* Public informational pages — statistics, search, author profile, APC, manuscript prep */}
                    <Route path="/statistics" element={<StatisticsPage />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/authors/:id" element={<AuthorProfilePage />} />
                    <Route path="/apc" element={<APCPage />} />
                    <Route path="/manuscript-preparation" element={<ManuscriptPreparationPage />} />

                    {/* Author revision UI */}
                    <Route path="/author-dashboard/:submissionId/revise" element={
                        <ProtectedAuthorRoute>
                            <AuthorRevisionPage />
                        </ProtectedAuthorRoute>
                    } />
                    <Route path="/author-dashboard/:submissionId/respond" element={
                        <ProtectedAuthorRoute>
                            <AuthorRevisionResponsePage />
                        </ProtectedAuthorRoute>
                    } />

                    {/* Editor admin — user mgmt / audit / email templates / special issues / production */}
                    <Route path="/editor/users" element={
                        <ProtectedEditorRoute>
                            <EditorUsersAdmin />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/editor/audit-log" element={
                        <ProtectedEditorRoute>
                            <EditorAuditLogPage />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/editor/email-templates" element={
                        <ProtectedEditorRoute>
                            <EditorEmailTemplatesPage />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/editor/special-issues" element={
                        <ProtectedEditorRoute>
                            <EditorSpecialIssuesAdmin />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/editor/production" element={
                        <ProtectedEditorRoute>
                            <EditorProductionQueue />
                        </ProtectedEditorRoute>
                    } />
                    </Routes>
                </Router>
            </JournalProvider>
        </AuthProvider>
    );
};

export default App;