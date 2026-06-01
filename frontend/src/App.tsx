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
import ConsultPartyDashboard from './pages/ConsultPartyDashboard';
import EditorLoginPage from './pages/EditorLoginPage';
import AuthorLoginPage from './pages/AuthorLoginPage';
import AuthorRegisterPage from './pages/AuthorRegisterPage';
import AuthorDashboard from './pages/AuthorDashboard';
import AuthorSubmissionDetail from './pages/AuthorSubmissionDetail';
import ProtectedEditorRoute from './components/common/ProtectedEditorRoute';
import { AuthProvider } from './context/AuthContext';
import './styles/index.css';

const App: React.FC = () => {
    return (
        <AuthProvider>
            <Router>
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/journals" element={<JournalPage />} />
                    <Route path="/articles" element={<ArticlePage />} />
                    <Route path="/reviews" element={<ReviewPage />} />
                    <Route path="/ai-insights" element={<AIInsightsPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/editor-login" element={<EditorLoginPage />} />
                    <Route path="/author-login" element={<AuthorLoginPage />} />
                    <Route path="/author-register" element={<AuthorRegisterPage />} />
                    <Route path="/editor" element={
                        <ProtectedEditorRoute>
                            <EditorDashboard />
                        </ProtectedEditorRoute>
                    } />
                    <Route path="/submit" element={<SubmitPaper />} />
                    <Route path="/author-dashboard" element={<AuthorDashboard />} />
                    <Route path="/author-dashboard/:submissionId" element={<AuthorSubmissionDetail />} />
                    <Route path="/review/:token" element={<ReviewerPortal />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/editorial-board" element={<EditorialBoardPage />} />
                    <Route path="/for-authors" element={<ForAuthorsPage />} />
                    <Route path="/for-reviewers" element={<ForReviewersPage />} />
                    <Route path="/issues" element={<IssuesArchivesPage />} />
                    <Route path="/consult-party/:submissionId" element={
                        <ProtectedEditorRoute>
                            <ConsultPartyDashboard />
                        </ProtectedEditorRoute>
                    } />
                </Routes>
            </Router>
        </AuthProvider>
    );
};

export default App;