import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";

export function usePricingPreview(enabled) {
  const [pricing, setPricing] = useState({
    status: enabled ? "loading" : "idle",
    displayPrice: "",
    message: ""
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setPricing({ status: "idle", displayPrice: "", message: "" });
      return;
    }

    let cancelled = false;
    setPricing({ status: "loading", displayPrice: "", message: "" });
    apiFetch("/api/pricing-preview", {
      credentials: "include",
      requireOkFlag: false,
      errorKeys: ["message"],
      fallbackError: "Pricing unavailable."
    })
      .then((payload) => payload.pricing || {})
      .then((nextPricing) => {
        if (cancelled) return;
        setPricing({
          status: nextPricing.displayPrice ? "available" : "error",
          displayPrice: nextPricing.displayPrice || "",
          message: nextPricing.displayPrice ? "Dodo checkout price" : "Pricing unavailable."
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setPricing({
          status: "error",
          displayPrice: "",
          message: error?.message || "Pricing unavailable."
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  return { ...pricing, reload: () => setAttempt((value) => value + 1) };
}
