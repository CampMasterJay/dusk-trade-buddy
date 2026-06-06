import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

interface Props {
  children: ReactNode;
  /** Optional label so logs distinguish which screen failed. */
  screen?: string;
  fallback?: (reset: () => void, error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log with component stack for debugging
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary${this.props.screen ? `:${this.props.screen}` : ""}]`,
      error,
      info.componentStack,
    );
    reportLovableError(error, {
      boundary: "react_error_boundary",
      screen: this.props.screen,
      componentStack: info.componentStack,
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset, this.state.error);

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-sm rounded-xl border border-trade-red/40 bg-trade-red/5 p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-trade-red/10">
            <AlertTriangle className="h-5 w-5 text-trade-red" />
          </div>
          <h2 className="text-sm font-semibold text-trade-red font-heading">
            Something went wrong
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {this.state.error.message || "Unexpected error on this screen."}
          </p>
          <button
            onClick={this.reset}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-trade-red/30 bg-trade-red/10 px-4 py-2 text-xs font-medium text-trade-red transition-colors hover:bg-trade-red/20"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tap to retry
          </button>
        </div>
      </div>
    );
  }
}