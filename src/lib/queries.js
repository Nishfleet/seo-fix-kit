import { QueryClient } from "@tanstack/react-query";

// One cache for every signed-in screen. Data stays fresh for 30 seconds, so
// moving between app pages shows the last result at once and refreshes it
// in the background.
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
  billing: ["billing-summary"],
  pricing: ["pricing-preview"],
  report: (id) => ["report", id],
  repairQueue: (id) => ["report", id, "repair-queue"],
  repairBoard: (id) => ["report", id, "repair-board"],
  clientTools: (id) => ["report", id, "client-tools"]
};
