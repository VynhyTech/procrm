import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-error-50 p-3 dark:bg-error-950">
                <AlertTriangle className="h-8 w-8 text-error-500" />
              </div>
            </div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">Something went wrong</h2>
            <p className="mb-4 text-sm text-foreground-muted">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            {this.state.error && (
              <p className="mb-4 rounded-lg bg-background-secondary p-3 text-left text-xs text-foreground-subtle">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="flex items-center gap-1.5 mx-auto rounded-lg bg-button-primary-bg px-4 py-2 text-sm font-medium text-button-primary-text transition-colors hover:bg-button-primary-hover"
            >
              <RefreshCw className="h-4 w-4" /> Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
