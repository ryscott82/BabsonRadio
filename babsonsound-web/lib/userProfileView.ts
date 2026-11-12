export const trainingWords = (t: { trained: boolean; expired: boolean; until: number | null }) =>
  t.trained ? (t.until ? `Trained, until ${new Date(t.until).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Trained') : t.expired ? 'Badge ended' : 'Not trained'
