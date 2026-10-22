import type { Metric, MetricKey, Metrics } from './nfl-statlines';

/** CFB card-only fields: do not extend NFL extraction or either league's ranking columns. */
export const CFB_CARD_METRICS = {
  rushing_long: ['Longest rush', 'yards'],
  receiving_long: ['Longest reception', 'yards'],
  def_qb_hurries: ['QB hurries', 'count'],
} as const;
export type CfbCardKey = keyof typeof CFB_CARD_METRICS;
export type CardMetricKey = MetricKey | CfbCardKey;
export type CardMetrics = Metrics & Partial<Record<CfbCardKey, Metric>>;
export type CfbMetrics = Metrics & Record<CfbCardKey, Metric>;
