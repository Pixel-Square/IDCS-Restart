/**
 * CanvaConnectPage.tsx
 *
 * Lets a Branding user authorise IDCS with their Canva account via OAuth 2.0 PKCE.
 * Shown from the Templates section when no Canva connection is stored.
 */
import React, { useState } from 'react';
import { ExternalLink, Zap, ShieldCheck, Palette, AlertCircle } from 'lucide-react';
import { initiateOAuth } from '../../../services/canva/CanvaAuthService';
import { getConnection, type CanvaConnection } from '../../../store/canvaStore';
import { disconnect } from '../../../services/canva/CanvaAuthService';

interface Props {
  /** Called after a successful disconnect so the parent can re-check connection */
  onDisconnected?: () => void;
}

export default function CanvaConnectPage({ onDisconnected }: Props) {
  const [connecting, setConnecting]       = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const connection: CanvaConnection | null = getConnection();

  async function handleConnect() {
    try {
      setConnecting(true);
      setError(null);
      await initiateOAuth();
      // Redirects away — if we're still here, something went wrong
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to start OAuth flow.');
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    await disconnect();
    setDisconnecting(false);
    onDisconnected?.();
  }

  if (connection) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center">
        <div className="w-20 h-20 rounded-3xl bg-green-100 flex items-center justify-center mx-auto mb-5">
          <ShieldCheck className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Connected to Canva</h2>
        <p className="text-gray-500 text-sm mb-2">
          Signed in as <span className="font-semibold text-gray-700">{connection.displayName}</span>
        </p>
        <p className="text-xs text-gray-400 mb-8">
          Token expires&nbsp;
          {new Date(connection.expiresAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="px-6 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {disconnecting ? 'Disconnecting…' : 'Disconnect Canva Account'}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-10">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 rounded-3xl bg-purple-100 flex items-center justify-center mx-auto mb-5">
          <Palette className="w-10 h-10 text-purple-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect your Canva Account</h2>
        <p className="text-gray-500 text-sm max-w-sm mx-auto leading-relaxed">
          Link your Canva account to select existing designs as event poster templates.
          HODs can then use those templates to generate autofilled Canva designs.
        </p>
      </div>

      {/* Feature list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 space-y-3">
        {[
          { icon: Zap,         text: 'Browse & save your Canva designs as reusable templates' },
          { icon: Palette,     text: 'HODs generate autofilled poster designs from your templates' },
          { icon: ShieldCheck, text: 'Inline Canva editor for final HOD adjustments' },
          { icon: ExternalLink,text: 'Export finished posters as PNG or PDF directly to IDCS' },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Connection failed</p>
            <p className="text-red-600 mt-0.5">{error}</p>
            {error.includes('VITE_CANVA_CLIENT_ID') && (
              <p className="mt-1 text-xs">
                Add <code className="bg-red-100 px-1 py-0.5 rounded text-red-800">VITE_CANVA_CLIENT_ID=…</code> to&nbsp;
                <code className="bg-red-100 px-1 py-0.5 rounded text-red-800">frontend/.env</code> and restart the dev server.
              </p>
            )}
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-colors shadow-md disabled:opacity-60"
      >
        <Palette className="w-5 h-5" />
        {connecting ? 'Redirecting to Canva…' : 'Connect Canva Account'}
      </button>

      <p className="text-center text-xs text-gray-400 mt-4">
        You will be redirected to Canva to authorise access. No passwords are shared with IDCS.
      </p>
    </div>
  );
}
