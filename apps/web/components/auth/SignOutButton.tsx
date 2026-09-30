'use client';

import { postJson } from '@/lib/auth/client';

interface SignOutButtonProps {
  readonly redirectTo: string;
  readonly everywhere?: boolean;
}

export function SignOutButton({ redirectTo, everywhere = false }: SignOutButtonProps) {
  const signOut = async () => {
    await postJson(everywhere ? '/api/auth/logout-all' : '/api/auth/logout', {});
    window.location.assign(redirectTo);
  };
  return (
    <button
      type="button"
      className="btn"
      onClick={() => void signOut()}
      data-testid={everywhere ? 'sign-out-all' : 'sign-out'}
    >
      {everywhere ? 'Sign out everywhere' : 'Sign out'}
    </button>
  );
}
