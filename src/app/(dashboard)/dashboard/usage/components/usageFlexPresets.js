/**
 * usageFlexPresets.js
 * Configuration for Usage Flex Report: preset types, visual themes, captions, auto-selection.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const FLEX_PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "all", label: "All Time" },
];

export const FLEX_TYPE_OPTIONS = [
  { value: "auto", label: "✨ Auto" },
  { value: "allStats", label: "📊 All Stats" },
  { value: "tokenBeast", label: "🦁 Token Beast" },
  { value: "costFlex", label: "💰 Cost Flex" },
  { value: "modelHopper", label: "🔀 Model Hopper" },
  { value: "providerCollector", label: "🌐 Providers" },
  { value: "memeMode", label: "🎪 Meme Mode" },
];

export const FLEX_STYLE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "cyber", label: "Cyber" },
  { value: "minimal", label: "Minimal" },
  { value: "gold", label: "Gold" },
  { value: "meme", label: "Meme" },
];

// ─── Auto-best selection ──────────────────────────────────────────────────────

/**
 * Pick the most impressive flex type based on the user's actual data.
 * Priority: providers → models → tokens → cost → meme
 */
export function autoSelectFlexType(flexData) {
  if (!flexData) return "memeMode";
  const { totals, highlights } = flexData;
  if ((highlights?.uniqueProviders ?? 0) >= 3) return "providerCollector";
  if ((highlights?.uniqueModels ?? 0) >= 5) return "modelHopper";
  if ((totals?.totalTokens ?? 0) > 10000) return "tokenBeast";
  if ((totals?.cost ?? 0) > 0) return "costFlex";
  return "memeMode";
}

/**
 * Pick default theme style for a given flex type.
 */
export function autoSelectStyle(flexType) {
  const map = {
    allStats: "cyber",
    tokenBeast: "cyber",
    costFlex: "gold",
    modelHopper: "cyber",
    providerCollector: "gold",
    memeMode: "meme",
  };
  return map[flexType] ?? "cyber";
}

// ─── Hero stat derivation ─────────────────────────────────────────────────────

/**
 * Given a resolved flex type + flex data, return the hero stat config for the card.
 */
export function getHeroConfig(flexType, flexData) {
  const totals = flexData?.totals ?? {};
  const highlights = flexData?.highlights ?? {};
  const fmt = (n) => new Intl.NumberFormat().format(n || 0);
  const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

  switch (flexType) {
    case "allStats":
      return {
        emoji: "📊",
        heroValue: fmt(totals.requests),
        heroLabel: "total requests",
        layout: "allStats",
        panels: [
          {
            emoji: "🦁",
            label: "Tokens",
            value: fmt(totals.totalTokens),
            sub: `${fmt(totals.cachedTokens)} cached`,
            color: "#818cf8",
          },
          {
            emoji: "💰",
            label: "Est. Cost",
            value: `$${(totals.cost || 0).toFixed(2)}`,
            sub: `~$${(totals.avgCostPerRequest || 0).toFixed(4)}/req`,
            color: "#f59e0b",
          },
          {
            emoji: "🔀",
            label: "Models",
            value: String(highlights.uniqueModels ?? 0),
            sub: highlights.topModel ?? "—",
            color: "#34d399",
          },
          {
            emoji: "🌐",
            label: "Providers",
            value: String(highlights.uniqueProviders ?? 0),
            sub: highlights.topProvider ?? "—",
            color: "#fb923c",
          },
        ],
        subStats: [],
      };
    case "tokenBeast":
      return {
        emoji: "🦁",
        heroValue: fmt(totals.totalTokens),
        heroLabel: "tokens consumed",
        subStats: [
          { label: "Requests", value: fmt(totals.requests) },
          { label: "Top Model", value: highlights.topModel ?? "—" },
          { label: "Cache Hit", value: totals.cacheHitRatio ? `${(totals.cacheHitRatio * 100).toFixed(0)}%` : "—" },
          { label: "Est. Cost", value: fmtCost(totals.cost) },
        ],
      };
    case "costFlex":
      return {
        emoji: "💰",
        heroValue: fmtCost(totals.cost),
        heroLabel: "estimated AI spend",
        subStats: [
          { label: "Requests", value: fmt(totals.requests) },
          { label: "Total Tokens", value: fmt(totals.totalTokens) },
          { label: "Avg/Request", value: fmtCost(totals.avgCostPerRequest) },
          { label: "Top Model", value: highlights.topModel ?? "—" },
        ],
      };
    case "modelHopper":
      return {
        emoji: "🔀",
        heroValue: String(highlights.uniqueModels ?? 0),
        heroLabel: "models used",
        subStats: [
          { label: "Top Model", value: highlights.topModel ?? "—" },
          { label: "Dominance", value: highlights.topModelPct ? `${highlights.topModelPct.toFixed(0)}%` : "—" },
          { label: "Requests", value: fmt(totals.requests) },
          { label: "Total Tokens", value: fmt(totals.totalTokens) },
        ],
      };
    case "providerCollector":
      return {
        emoji: "🌐",
        heroValue: String(highlights.uniqueProviders ?? 0),
        heroLabel: "providers routed",
        subStats: [
          { label: "Top Provider", value: highlights.topProvider ?? "—" },
          { label: "Coverage", value: highlights.topProviderPct ? `${highlights.topProviderPct.toFixed(0)}%` : "—" },
          { label: "Models", value: String(highlights.uniqueModels ?? 0) },
          { label: "Requests", value: fmt(totals.requests) },
        ],
      };
    case "memeMode":
    default:
      return {
        emoji: "🎪",
        heroValue: fmt(totals.requests),
        heroLabel: "requests fired",
        subStats: [
          { label: "Tokens Shot", value: fmt(totals.totalTokens) },
          { label: "Models", value: String(highlights.uniqueModels ?? 0) },
          { label: "Providers", value: String(highlights.uniqueProviders ?? 0) },
          { label: "Est. Cost", value: fmtCost(totals.cost) },
        ],
      };
  }
}

// ─── Theme configs ─────────────────────────────────────────────────────────────

/**
 * Returns inline-style-compatible theme config for UsageFlexCard.
 * No backdrop-filter (html-to-image limitation).
 * System fonts only for export fidelity.
 */
export function getThemeConfig(style, flexType) {
  const resolved = style === "auto" ? autoSelectStyle(flexType) : style;

  const themes = {
    cyber: {
      background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
      cardBg: "rgba(255,255,255,0.04)",
      cardBorder: "rgba(99,102,241,0.3)",
      heroBg: "rgba(99,102,241,0.12)",
      heroBorder: "rgba(99,102,241,0.4)",
      heroText: "#a5b4fc",
      heroLabelText: "#818cf8",
      subCardBg: "rgba(255,255,255,0.04)",
      subCardBorder: "rgba(99,102,241,0.2)",
      subLabelText: "#6366f1",
      subValueText: "#e2e8f0",
      headerText: "#c7d2fe",
      badgeBg: "rgba(99,102,241,0.2)",
      badgeText: "#a5b4fc",
      badgeBorder: "rgba(99,102,241,0.4)",
      footerText: "#4f46e5",
      dividerColor: "rgba(99,102,241,0.2)",
      accentColor: "#6366f1",
      fontFamily: "'ui-monospace', 'Cascadia Code', 'Courier New', monospace",
    },
    minimal: {
      background: "#ffffff",
      cardBg: "#f8fafc",
      cardBorder: "#e2e8f0",
      heroBg: "#f1f5f9",
      heroBorder: "#cbd5e1",
      heroText: "#0f172a",
      heroLabelText: "#64748b",
      subCardBg: "#f8fafc",
      subCardBorder: "#e2e8f0",
      subLabelText: "#94a3b8",
      subValueText: "#1e293b",
      headerText: "#334155",
      badgeBg: "#f1f5f9",
      badgeText: "#475569",
      badgeBorder: "#cbd5e1",
      footerText: "#94a3b8",
      dividerColor: "#e2e8f0",
      accentColor: "#3b82f6",
      fontFamily: "'ui-sans-serif', 'system-ui', '-apple-system', sans-serif",
    },
    gold: {
      background: "linear-gradient(135deg, #1a0e00 0%, #2d1a00 40%, #1a0e00 100%)",
      cardBg: "rgba(255,200,50,0.05)",
      cardBorder: "rgba(217,165,32,0.3)",
      heroBg: "rgba(217,165,32,0.1)",
      heroBorder: "rgba(217,165,32,0.4)",
      heroText: "#fde68a",
      heroLabelText: "#d97706",
      subCardBg: "rgba(255,200,50,0.04)",
      subCardBorder: "rgba(217,165,32,0.2)",
      subLabelText: "#b45309",
      subValueText: "#fef3c7",
      headerText: "#fde68a",
      badgeBg: "rgba(217,165,32,0.15)",
      badgeText: "#fbbf24",
      badgeBorder: "rgba(217,165,32,0.4)",
      footerText: "#92400e",
      dividerColor: "rgba(217,165,32,0.2)",
      accentColor: "#f59e0b",
      fontFamily: "'Georgia', 'Times New Roman', serif",
    },
    meme: {
      background: "linear-gradient(135deg, #7c3aed 0%, #db2777 50%, #ea580c 100%)",
      cardBg: "rgba(255,255,255,0.12)",
      cardBorder: "rgba(255,255,255,0.25)",
      heroBg: "rgba(255,255,255,0.15)",
      heroBorder: "rgba(255,255,255,0.3)",
      heroText: "#ffffff",
      heroLabelText: "rgba(255,255,255,0.8)",
      subCardBg: "rgba(255,255,255,0.1)",
      subCardBorder: "rgba(255,255,255,0.2)",
      subLabelText: "rgba(255,255,255,0.6)",
      subValueText: "#ffffff",
      headerText: "#ffffff",
      badgeBg: "rgba(255,255,255,0.2)",
      badgeText: "#ffffff",
      badgeBorder: "rgba(255,255,255,0.3)",
      footerText: "rgba(255,255,255,0.5)",
      dividerColor: "rgba(255,255,255,0.2)",
      accentColor: "#fbbf24",
      fontFamily: "'Impact', 'Arial Black', 'ui-sans-serif', sans-serif",
    },
  };

  return themes[resolved] ?? themes.cyber;
}

// ─── Period labels ─────────────────────────────────────────────────────────────

export function getPeriodLabel(period) {
  const labels = {
    today: "today",
    "24h": "the last 24 hours",
    "7d": "the last 7 days",
    "30d": "the last 30 days",
    all: "all time",
  };
  return labels[period] ?? period;
}

export function getPeriodBadge(period) {
  const labels = {
    today: "Today",
    "24h": "Last 24H",
    "7d": "Last 7 Days",
    "30d": "Last 30 Days",
    all: "All Time",
  };
  return labels[period] ?? period;
}

// ─── Caption generator ────────────────────────────────────────────────────────

export function generateCaption(flexType, flexData, period) {
  const totals = flexData?.totals ?? {};
  const highlights = flexData?.highlights ?? {};
  const periodLabel = getPeriodLabel(period);
  const fmt = (n) => new Intl.NumberFormat().format(n || 0);
  const fmtCost = (n) => (n || 0).toFixed(2);

  switch (flexType) {
    case "allStats":
      return `📊 My AI stats ${periodLabel}: ${fmt(totals.totalTokens)} tokens · ~$${fmtCost(totals.cost)} spent · ${highlights.uniqueModels ?? 0} models · ${highlights.uniqueProviders ?? 0} providers · ${fmt(totals.requests)} requests total. Powered by n9router ⚡`;
    case "tokenBeast":
      return `🦁 Token Beast Mode — ${fmt(totals.totalTokens)} tokens consumed ${periodLabel}! Top model: ${highlights.topModel ?? "unknown"}. Powered by n9router ⚡`;
    case "costFlex":
      return `💰 AI spend ${periodLabel}: ~$${fmtCost(totals.cost)} across ${fmt(totals.requests)} requests. Powered by n9router ⚡`;
    case "modelHopper":
      return `🔀 ${highlights.uniqueModels ?? 0} different models ${periodLabel}! Favorite: ${highlights.topModel ?? "unknown"} (${highlights.topModelPct?.toFixed(0) ?? 0}%). Powered by n9router ⚡`;
    case "providerCollector":
      return `🌐 Routing through ${highlights.uniqueProviders ?? 0} AI providers ${periodLabel}! ${fmt(totals.requests)} requests, ${fmt(totals.totalTokens)} tokens. Powered by n9router ⚡`;
    case "memeMode":
    default:
      return `🎪 ${fmt(totals.requests)} AI requests fired into the void ${periodLabel}. Am I an AI power user yet? Powered by n9router ⚡`;
  }
}

// ─── Surprise Me ──────────────────────────────────────────────────────────────

const SURPRISE_TYPES = ["allStats", "tokenBeast", "costFlex", "modelHopper", "providerCollector", "memeMode"];
const SURPRISE_STYLES = ["cyber", "minimal", "gold", "meme"];

export function getSurpriseCombo(currentType, currentStyle) {
  const types = SURPRISE_TYPES.filter((t) => t !== currentType);
  const styles = SURPRISE_STYLES.filter((s) => s !== currentStyle);
  return {
    flexType: types[Math.floor(Math.random() * types.length)],
    style: styles[Math.floor(Math.random() * styles.length)],
  };
}
