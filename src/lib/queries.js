import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => error?.status !== 401 && error?.status !== 404 && failureCount < 1,
      refetchOnWindowFocus: false
    }
  }
});

export const queryKeys = {
  session: ["session"],
  account: ["account-summary"],
  reports: ["reports"],
  developer: ["developer"],
  emailPreferences: ["email-preferences"],
  billing: ["billing-summary"],
  pricing: ["pricing-preview"],
  report: (id) => ["report", id],
  repairQueue: (id) => ["report", id, "repair-queue"],
  repairBoard: (id) => ["report", id, "repair-board"],
  clientTools: (id) => ["report", id, "client-tools"],
  scoreBadge: (id) => ["report", id, "score-badge"],
  fixKit: (id) => ["report", id, "fix-kit"],
  auditWidget: ["audit-widget"]
};
