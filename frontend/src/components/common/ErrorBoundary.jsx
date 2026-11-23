import { Component } from "react";
import { Button } from "./Button";

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
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-5"
            onClick={() => window.location.reload()}
          >
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
