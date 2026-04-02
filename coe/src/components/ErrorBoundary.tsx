import React from 'react';
export class ErrorBoundary extends React.Component<{children: React.ReactNode, fallback: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: {children: React.ReactNode, fallback: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return <div className="p-4 bg-red-100 text-red-900 overflow-auto max-h-96 whitespace-pre-wrap"><h1 className="font-bold">Error Occurred</h1>{String(this.state.error && this.state.error.stack)}</div>;
    }
    return this.props.children;
  }
}
