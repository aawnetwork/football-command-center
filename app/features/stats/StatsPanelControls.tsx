import type { ReactNode } from "react";

type Option<TValue extends string> = {
  value: TValue;
  label: string;
};

type StatsPanelControlsProps<TMode extends string, TView extends string, TCategory extends string> = {
  title: string;
  description: string;
  mode: TMode;
  modes: Option<TMode>[];
  onModeChange: (mode: TMode) => void;
  view: TView;
  views: Option<TView>[];
  onViewChange: (view: TView) => void;
  categories?: Option<TCategory>[];
  selectedCategory?: TCategory;
  onCategoryChange?: (category: TCategory) => void;
  weekSelector?: ReactNode;
};

export function StatsPanelControls<
  TMode extends string,
  TView extends string,
  TCategory extends string,
>({
  title,
  description,
  mode,
  modes,
  onModeChange,
  view,
  views,
  onViewChange,
  categories,
  selectedCategory,
  onCategoryChange,
  weekSelector,
}: StatsPanelControlsProps<TMode, TView, TCategory>) {
  return (
    <header className="stats-panel-controls">
      <div className="stats-panel-controls__heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      <div className="stats-panel-controls__groups">
        <div className="stats-panel-controls__primary">
          <div className="stats-panel-controls__group" aria-label="Leaderboard type">
            {views.map((option) => (
              <button
                key={option.value}
                aria-pressed={view === option.value}
                onClick={() => onViewChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <span aria-hidden="true" />

          <div className="stats-panel-controls__group" aria-label="Stat period">
            {modes.map((option) => (
              <button
                key={option.value}
                aria-pressed={mode === option.value}
                onClick={() => onModeChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {weekSelector}

        {categories && selectedCategory && onCategoryChange && (
          <div className="stats-panel-controls__group stats-panel-controls__group--categories" aria-label="Stat category">
            {categories.map((option) => (
              <button
                key={option.value}
                aria-pressed={selectedCategory === option.value}
                onClick={() => onCategoryChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
