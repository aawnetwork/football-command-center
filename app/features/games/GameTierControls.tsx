type TierDetails = {
  name: string;
  emoji: string;
};

type GameTierControlsProps<TTier extends string> = {
  tier: TTier | undefined;
  suggestedTier: TTier;
  tiers: Record<TTier, TierDetails>;
  onSelect: (tier: TTier) => void;
};

export function GameTierControls<TTier extends string>({
  tier,
  suggestedTier,
  tiers,
  onSelect,
}: GameTierControlsProps<TTier>) {
  return (
    <div className="game-card__tier-controls">
      <div className="game-card__tier-label">
        {tier
          ? `${tiers[tier].emoji} ${tier} · ${tiers[tier].name}`
          : `Suggested: ${suggestedTier} · ${tiers[suggestedTier].name}`}
      </div>
      <div className="game-card__tier-buttons">
        {(Object.keys(tiers) as TTier[]).map((tierOption) => (
          <button
            key={tierOption}
            aria-pressed={tier === tierOption}
            onClick={() => onSelect(tierOption)}
          >
            {tierOption}
          </button>
        ))}
      </div>
    </div>
  );
}
