import React from 'react';

import UserQueriesPanel from './UserQueriesPanel';

export default function UserQueriesComponent({ user }: { user?: any }) {
  return <UserQueriesPanel user={user} />;
}
