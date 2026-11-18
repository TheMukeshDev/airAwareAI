import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {}

  render() {
    if (this.state.hasError) {
      return (
        <div className="surface mx-auto my-10 max-w-xl p-6 text-center">
          <h1 className="font-display text-xl font-semibold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-400">
            The page could not be displayed. Refresh the page or try again later.
          </p>
          <button
            type="button"
            className="mt-4 rounded-xl border border-hairline bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
