import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CollabBoard crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash-screen">
          <div className="crash-card">
            <h2>Something went wrong</h2>
            <p>
              Your board is still saved in this browser. Reloading usually fixes it — if not, export your board from
              the library before clearing site data.
            </p>
            <pre>{this.state.error.message}</pre>
            <div className="crash-actions">
              <button className="primary-btn" onClick={() => window.location.reload()}>
                Reload board
              </button>
              <button
                className="secondary-btn"
                onClick={() => {
                  window.location.hash = '';
                  window.location.reload();
                }}
              >
                Start a new board
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
