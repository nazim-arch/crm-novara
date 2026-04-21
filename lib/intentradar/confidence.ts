// lib/intentradar/confidence.ts
// Source confidence reflects how much to trust the ORIGIN of a signal,
// independent of the buyer intent score.
//
// High   — direct, traceable, identity-anchored source
// Medium — real but anonymous or partially inferred
// Low    — indirect, noisy, or AI-generated (synthetic)

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceInfo {
  level: ConfidenceLevel;
  label: string;    // display label
  reason: string;   // one-line rationale shown in tooltip
  color: string;
  bg: string;
}

// Map sourcePlatform values → confidence. Unknown platforms default to 'low'.
const CONFIDENCE_MAP: Record<string, ConfidenceLevel> = {
  // High — real identity, verifiable URL, direct buyer statement
  youtube:         'high',
  youtube_comment: 'high',
  google_maps:     'high',
  linkedin:        'high',
  linkedin_post:   'high',

  // Medium — real person but anonymised or curated content
  reddit:          'medium',
  reddit_post:     'medium',
  instagram:       'medium',
  facebook:        'medium',
  quora:           'medium',
  portal_forums:   'medium',
  financial_forums:'medium',
  forum_post:      'medium',
  '99acres':       'medium',
  magicbricks:     'medium',
  housing:         'medium',
  nobroker:        'medium',

  // Low — anonymous, indirect, or AI-generated
  telegram:           'low',
  news:               'low',
  openai_generate:    'low',
  openai_generated:   'low',
};

const REASONS: Record<ConfidenceLevel, string> = {
  high:   'Direct, traceable, identity-anchored signal',
  medium: 'Real source but anonymous or partially inferred',
  low:    'Indirect, noisy, or AI-generated signal',
};

const VISUALS: Record<ConfidenceLevel, { label: string; color: string; bg: string }> = {
  high:   { label: 'High confidence',   color: '#15803d', bg: '#dcfce7' },
  medium: { label: 'Medium confidence', color: '#b45309', bg: '#fef3c7' },
  low:    { label: 'Low confidence',    color: '#dc2626', bg: '#fee2e2' },
};

export function getSourceConfidence(sourcePlatform: string): ConfidenceInfo {
  const level = CONFIDENCE_MAP[sourcePlatform.toLowerCase()] ?? 'low';
  return {
    level,
    reason: REASONS[level],
    ...VISUALS[level],
  };
}

// Synthetic sources always get low confidence regardless of any other factor
export function isSyntheticPlatform(sourcePlatform: string): boolean {
  return ['openai_generate', 'openai_generated'].includes(sourcePlatform.toLowerCase());
}
