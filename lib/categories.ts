// The behavior taxonomy for screening. This mirrors the industry-standard
// category set (threats, drugs, weapons, etc.) with two deliberate
// compliance choices:
//
//   1. There are NO categories for protected characteristics (race,
//      religion, health, sexual orientation, pregnancy, age, disability,
//      union activity). The Phase 2 analysis engine additionally runs a
//      suppression filter so content revealing those things never reaches
//      a report at all.
//   2. 'politics' and 'self_harm' exist but default OFF and carry a
//      warning. Political activity is legally protected in several states
//      (CA, NY, CO, and others), and surfacing self-harm/mental-health
//      content to an employer creates ADA risk. Clients must explicitly
//      opt in, and the warning shows at the point of decision.

export interface CategoryDef {
  key: string
  label: string
  description: string
  defaultOn: boolean
  warning?: string
}

export const CATEGORIES: CategoryDef[] = [
  {
    key: 'threats',
    label: 'Threats',
    description: 'Stated intent to inflict harm on another person.',
    defaultOn: true,
  },
  {
    key: 'violence_gory',
    label: 'Violent / gory imagery',
    description: 'Images of violence, injury, or gore.',
    defaultOn: true,
  },
  {
    key: 'prejudice',
    label: 'Prejudice (conduct)',
    description:
      'Derogatory, abusive, or threatening statements aimed at a group of people. Flags the candidate\u2019s conduct, never their own identity or beliefs.',
    defaultOn: true,
  },
  {
    key: 'disparaging',
    label: 'Disparaging remarks',
    description:
      'Name-calling or derogatory statements about individuals or groups.',
    defaultOn: true,
  },
  {
    key: 'drug_alcohol',
    label: 'Drug / alcohol mentions',
    description: 'Statements about drug or alcohol use, including slang.',
    defaultOn: true,
  },
  {
    key: 'drug_image',
    label: 'Drug imagery',
    description: 'Images of drugs or paraphernalia.',
    defaultOn: true,
  },
  {
    key: 'weapons',
    label: 'Weapons imagery',
    description: 'Images of firearms, explosives, or other weapons.',
    defaultOn: true,
  },
  {
    key: 'nudity',
    label: 'Nudity / explicit imagery',
    description: 'Explicit or partially explicit imagery. Always redacted in reports.',
    defaultOn: true,
  },
  {
    key: 'suggestive',
    label: 'Sexually suggestive / harassment',
    description:
      'Expressions of sexual misconduct, sexually demeaning content, or harassment.',
    defaultOn: true,
  },
  {
    key: 'profanity',
    label: 'Profanity',
    description: 'Obscene, crude, or vulgar language.',
    defaultOn: true,
  },
  {
    key: 'rude_gestures',
    label: 'Rude gestures / extremist symbols',
    description:
      'Rude gestures, or symbols and flags of extremist organizations.',
    defaultOn: true,
  },
  {
    key: 'self_harm',
    label: 'Self-harm mentions',
    description: 'Mentions of self-harm or suicide.',
    defaultOn: false,
    warning:
      'Caution: mental-health conditions are protected under the ADA. Surfacing this category to an employer creates legal risk. Most clients should leave this off; confirm with counsel before enabling.',
  },
  {
    key: 'politics',
    label: 'Politics / government',
    description: 'Statements about politicians, policies, or political issues.',
    defaultOn: false,
    warning:
      'Caution: political activity and lawful off-duty conduct are legally protected in several states (including CA, NY, and CO). Enabling this category for candidates in those states invites discrimination claims. Confirm with counsel before enabling.',
  },
]

export function defaultCategories(): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const c of CATEGORIES) out[c.key] = c.defaultOn
  return out
}

// Normalize a stored JSONB blob against the current category list:
// unknown keys dropped, missing keys filled with defaults.
export function normalizeCategories(
  raw: Record<string, boolean> | null | undefined
): Record<string, boolean> {
  const out = defaultCategories()
  if (raw && typeof raw === 'object') {
    for (const c of CATEGORIES) {
      if (typeof raw[c.key] === 'boolean') out[c.key] = raw[c.key]
    }
  }
  return out
}

// Display labels for flag chips, including the special 'keywords' flag the
// analyzer can return when client-specific keywords match.
export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]).concat([['keywords', 'Keyword match']])
)
