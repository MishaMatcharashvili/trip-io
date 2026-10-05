// Who may run the curation queue. A short allowlist in env rather than a role
// column: through Phase 10 this is one person, and a role system would be the
// first thing to outgrow its need.

type SessionUser = {
  email: string;
  emailVerified: boolean;
  isAnonymous?: boolean | null;
};

/** The allowlist, lower-cased. Also who the dashboard leaves out of its cohort. */
export function curatorEmails(): string[] {
  return (process.env.CURATOR_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isCurator(user: SessionUser): boolean {
  if (user.isAnonymous || !user.emailVerified) return false;
  return curatorEmails().includes(user.email.toLowerCase());
}
