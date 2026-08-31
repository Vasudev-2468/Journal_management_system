import React from 'react';
import { captureException } from '../../lib/errorReporting';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // eslint-disable-next-line no-console
        console.error('Uncaught error in component tree:', error, info);
        // Forward the error to the reporting layer. When the Sentry
        // DSN isn't configured this is a no-op.
        captureException(error, { componentStack: info.componentStack });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;
            return (
                <div
                    role="alert"
                    className="max-w-lg mx-auto my-16 p-6 bg-white border border-red-200 rounded shadow"
                >
                    <h1 className="text-xl font-bold text-red-700 mb-2">
                        Something went wrong
                    </h1>
                    <p className="text-gray-700 mb-4">
                        The page failed to render. Try reloading — if this keeps happening,
                        please contact the editorial office.
                    </p>
                    {this.state.error && (
                        <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto">
                            {this.state.error.message}
                        </pre>
                    )}
                    <button
                        type="button"
                        className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        onClick={this.handleReset}
                    >
                        Try again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
