import { useQuery } from "@tanstack/react-query";
import { fetchPricingPreview } from "../lib/requests.js";
import { queryKeys } from "../lib/queries.js";

export function usePricingPreview(enabled) {
  const query = useQuery({ queryKey: queryKeys.pricing, queryFn: fetchPricingPreview, enabled: Boolean(enabled) });
  const displayPrice = query.data?.displayPrice || "";
  let pricing = { status: "idle", displayPrice: "", message: "" };
  if (enabled && (query.isPending || (query.isError && query.isFetching)))
    pricing = { status: "loading", displayPrice: "", message: "" };
  else if (query.isError)
    pricing = { status: "error", displayPrice: "", message: query.error?.message || "Pricing unavailable." };
  else if (enabled && query.isSuccess) {
    pricing = displayPrice
      ? { status: "available", displayPrice, message: "Dodo checkout price" }
      : { status: "error", displayPrice: "", message: "Pricing unavailable." };
  }
  return { ...pricing, reload: () => query.refetch() };
}
