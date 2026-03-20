import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props  { children: ReactNode; }
interface State  { error: Error | null; }

/**
 * Catches render-phase errors anywhere in the child tree.
 * Must be a class component — React only supports error boundaries via
 * getDerivedStateFromError / componentDidCatch on class components.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;

    if (error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '60vh', gap: '1rem',
          padding: '2rem', textAlign: 'center',
        }}>
          <span style={{ fontSize: '2.5rem' }}>💥</span>
          <p style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Something went wrong
          </p>
          <p style={{
            fontSize: '0.8125rem', fontFamily: 'monospace',
            color: '#ef4444', maxWidth: 520, wordBreak: 'break-word', margin: 0,
          }}>
            {error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem 1.25rem',
              background: 'var(--accent-blue)',
              color: '#fff', border: 'none', borderRadius: '0.5rem',
              fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
