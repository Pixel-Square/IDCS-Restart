declare module 'next/router' {
  export type NextRouter = {
    query: Record<string, string | string[] | undefined>;
  };

  export function useRouter(): NextRouter;
}

declare module 'next/link' {
  import type * as React from 'react';

  export type LinkProps = {
    href: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  };

  const Link: React.FC<LinkProps>;
  export default Link;
}
