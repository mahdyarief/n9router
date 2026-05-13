"use client";

import { forwardRef } from "react";
import PropTypes from "prop-types";
import { getHeroConfig, getPeriodBadge } from "./usageFlexPresets";

/**
 * UsageFlexCard — pure visual 1080×1080 social-share card.
 * forwardRef allows parent to capture the DOM node for html-to-image export.
 *
 * Design constraints for html-to-image compatibility:
 * - No backdrop-filter / blur
 * - No external images or fonts
 * - All styles via inline styles (theme) + safe Tailwind classes (layout only)
 */
const UsageFlexCard = forwardRef(function UsageFlexCard(
  { flexData, flexType, themeConfig, period },
  ref
) {
  const hero = getHeroConfig(flexType, flexData);
  const theme = themeConfig ?? {};
  const periodBadge = getPeriodBadge(period);

  const isEmpty = !flexData || (
    (flexData.totals?.requests ?? 0) === 0 &&
    (flexData.totals?.totalTokens ?? 0) === 0
  );

  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        height: 1080,
        background: theme.background ?? "#0f172a",
        fontFamily: theme.fontFamily ?? "sans-serif",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        padding: 64,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Decorative background circles */}
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.accentColor ?? "#6366f1"}22 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -80,
          left: -80,
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.accentColor ?? "#6366f1"}18 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 48,
        }}
      >
        {/* Branding */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Logo mark */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: theme.accentColor ?? "#6366f1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                color: "#ffffff",
                fontSize: 18,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: "-0.5px",
              }}
            >
              n9
            </span>
          </div>
          <span
            style={{
              color: theme.headerText ?? "#c7d2fe",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.5px",
            }}
          >
            n9router
          </span>
        </div>

        {/* Period badge */}
        <div
          style={{
            padding: "8px 20px",
            borderRadius: 100,
            background: theme.badgeBg ?? "rgba(99,102,241,0.2)",
            border: `1.5px solid ${theme.badgeBorder ?? "rgba(99,102,241,0.4)"}`,
            color: theme.badgeText ?? "#a5b4fc",
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          {periodBadge}
        </div>
      </div>

      {isEmpty ? (
        /* ── Empty state ── */
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <span style={{ fontSize: 80 }}>📭</span>
          <span
            style={{
              color: theme.heroLabelText ?? "#818cf8",
              fontSize: 36,
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            No usage data yet
          </span>
          <span
            style={{
              color: theme.footerText ?? "#4f46e5",
              fontSize: 24,
              textAlign: "center",
            }}
          >
            Start using the gateway to see your stats here
          </span>
        </div>
      ) : hero.layout === "allStats" ? (
        /* ── All Stats layout: header stat + 2×2 mega panels ── */
        <>
          {/* Total requests banner */}
          <div
            style={{
              background: theme.heroBg ?? "rgba(99,102,241,0.12)",
              border: `2px solid ${theme.heroBorder ?? "rgba(99,102,241,0.4)"}`,
              borderRadius: 20,
              padding: "28px 48px",
              marginBottom: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <span style={{ fontSize: 52, lineHeight: 1 }}>{hero.emoji}</span>
              <div>
                <div
                  style={{
                    color: theme.heroText ?? "#a5b4fc",
                    fontSize: 64,
                    fontWeight: 800,
                    lineHeight: 1,
                    letterSpacing: "-1px",
                  }}
                >
                  {hero.heroValue}
                </div>
                <div
                  style={{
                    color: theme.heroLabelText ?? "#818cf8",
                    fontSize: 20,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginTop: 4,
                  }}
                >
                  {hero.heroLabel}
                </div>
              </div>
            </div>
            <div
              style={{
                color: theme.heroLabelText ?? "#818cf8",
                fontSize: 20,
                fontWeight: 500,
                textAlign: "right",
                opacity: 0.7,
              }}
            >
              Complete Overview
            </div>
          </div>

          {/* 2×2 mega panels */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
              flex: 1,
            }}
          >
            {(hero.panels ?? []).map((panel, i) => (
              <div
                key={i}
                style={{
                  background: theme.subCardBg ?? "rgba(255,255,255,0.04)",
                  border: `1.5px solid ${theme.subCardBorder ?? "rgba(99,102,241,0.2)"}`,
                  borderRadius: 20,
                  padding: "32px 36px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Subtle accent glow top-right */}
                <div
                  style={{
                    position: "absolute",
                    top: -30,
                    right: -30,
                    width: 100,
                    height: 100,
                    borderRadius: "50%",
                    background: `radial-gradient(circle, ${panel.color}30 0%, transparent 70%)`,
                    pointerEvents: "none",
                  }}
                />
                {/* Panel header: emoji + label */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 28, lineHeight: 1 }}>{panel.emoji}</span>
                  <span
                    style={{
                      color: panel.color,
                      fontSize: 18,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {panel.label}
                  </span>
                </div>
                {/* Main value */}
                <div
                  style={{
                    color: theme.subValueText ?? "#e2e8f0",
                    fontSize: 52,
                    fontWeight: 800,
                    letterSpacing: "-1px",
                    lineHeight: 1.1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={panel.value}
                >
                  {panel.value}
                </div>
                {/* Sub detail */}
                <div
                  style={{
                    color: theme.subLabelText ?? "#6366f1",
                    fontSize: 17,
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    opacity: 0.85,
                  }}
                  title={panel.sub}
                >
                  {panel.sub}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* ── Standard: hero + 2×2 sub-stats ── */
        <>
          {/* ── Hero section ── */}
          <div
            style={{
              background: theme.heroBg ?? "rgba(99,102,241,0.12)",
              border: `2px solid ${theme.heroBorder ?? "rgba(99,102,241,0.4)"}`,
              borderRadius: 24,
              padding: "48px 56px",
              marginBottom: 40,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              position: "relative",
            }}
          >
            {/* Emoji */}
            <div style={{ fontSize: 72, lineHeight: 1, marginBottom: 8 }}>
              {hero.emoji}
            </div>

            {/* Hero value */}
            <div
              style={{
                color: theme.heroText ?? "#a5b4fc",
                fontSize: 96,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: "-2px",
                textAlign: "center",
                wordBreak: "break-all",
              }}
            >
              {hero.heroValue}
            </div>

            {/* Hero label */}
            <div
              style={{
                color: theme.heroLabelText ?? "#818cf8",
                fontSize: 28,
                fontWeight: 500,
                textAlign: "center",
                letterSpacing: "0.02em",
                textTransform: "uppercase",
              }}
            >
              {hero.heroLabel}
            </div>
          </div>

          {/* ── Sub stats grid 2×2 ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              flex: 1,
            }}
          >
            {hero.subStats.map((stat, i) => (
              <div
                key={i}
                style={{
                  background: theme.subCardBg ?? "rgba(255,255,255,0.04)",
                  border: `1.5px solid ${theme.subCardBorder ?? "rgba(99,102,241,0.2)"}`,
                  borderRadius: 16,
                  padding: "24px 28px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    color: theme.subLabelText ?? "#6366f1",
                    fontSize: 18,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    color: theme.subValueText ?? "#e2e8f0",
                    fontSize: 32,
                    fontWeight: 700,
                    letterSpacing: "-0.5px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={stat.value}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Footer ── */}
      <div
        style={{
          marginTop: 36,
          paddingTop: 24,
          borderTop: `1px solid ${theme.dividerColor ?? "rgba(99,102,241,0.2)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            color: theme.footerText ?? "#4f46e5",
            fontSize: 18,
            fontWeight: 500,
          }}
        >
          Self-hosted AI routing gateway
        </span>
        <span
          style={{
            color: theme.footerText ?? "#4f46e5",
            fontSize: 18,
          }}
        >
          github.com/nightwalker89/n9router
        </span>
      </div>
    </div>
  );
});

UsageFlexCard.displayName = "UsageFlexCard";

UsageFlexCard.propTypes = {
  flexData: PropTypes.object,
  flexType: PropTypes.string.isRequired,
  themeConfig: PropTypes.object,
  period: PropTypes.string.isRequired,
};

export default UsageFlexCard;
