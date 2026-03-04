import React from 'react';
import { Navigate } from 'react-router-dom';

interface Props {
  element: React.ReactElement;
}

/**
 * Guards all /branding/* routes — only accessible when the Branding
 * session token is present in localStorage.  All other roles are redirected
 * to the main login page.
 */
export default function BrandingProtectedRoute({ element }: Props) {
  const isAuthenticated = localStorage.getItem('branding_auth') === 'true';
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return element;
}
