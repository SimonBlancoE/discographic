import { Component, type ErrorInfo, type ReactNode } from 'react';
import { translate, getCurrentLocale } from '../../shared/i18n.js';

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Changing this value (e.g. the route path) clears a previous error. */
  resetKey?: string;
};

type ErrorBoundaryState = {
  error: Error | null;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ui] render error', error, info.componentStack);
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const locale = getCurrentLocale();
    return (
      <div className="glass-panel mx-auto max-w-xl p-8 text-center">
        <p className="font-display text-2xl text-white">{translate(locale, 'app.errorTitle')}</p>
        <p className="mt-2 text-sm text-slate-400">{translate(locale, 'app.errorBody')}</p>
        <button type="button" className="primary-button mt-6" onClick={() => this.setState({ error: null })}>
          {translate(locale, 'app.errorRetry')}
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
