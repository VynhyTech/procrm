import argon2 from "argon2";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Memoized so it's computed once per process, not once per request. Used by auth.login when no
// matching user/credential exists, so response latency doesn't reveal whether an email is registered.
let dummyHashPromise: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash("timing-defense-placeholder-password");
  }
  return dummyHashPromise;
}
