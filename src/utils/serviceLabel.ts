export interface ServiceLabel {
  category: string;
  label: string;
}

const TV_PROVIDERS = ["dstv", "gotv", "startimes", "showmax"];

export function normalizeServiceLabel(
  rawServiceId?: string | null,
  fallbackName?: string | null,
): ServiceLabel {
  const id = (rawServiceId || "").toLowerCase().trim();

  if (!id) {
    return { category: "wallet", label: fallbackName || "Wallet" };
  }

  if (id.includes("data")) {
    return { category: "data", label: "Data Purchase" };
  }

  if (id.includes("airtime")) {
    return { category: "airtime", label: "Airtime Purchase" };
  }

  if (id.includes("jamb")) {
    return { category: "jamb", label: "JAMB" };
  }

  if (id.includes("waec")) {
    return { category: "waec", label: "WAEC" };
  }

  if (TV_PROVIDERS.some((provider) => id.includes(provider))) {
    return { category: "tv", label: "TV Subscription" };
  }

  if (id.includes("electric")) {
    return { category: "electricity", label: "Electricity" };
  }

  if (id.includes("betting")) {
    return { category: "betting", label: "Betting" };
  }

  if (id.includes("transfer")) {
    return { category: "transfer", label: "Bank Transfer" };
  }

  // Unknown/new serviceID: still show something readable instead of "wallet".
  return {
    category: id,
    label: fallbackName || rawServiceId!.replace(/[-_]/g, " "),
  };
}
