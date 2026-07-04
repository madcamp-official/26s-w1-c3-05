/** Cosine similarity clamped to [0, 1]. Robust to non-normalized inputs. */
export const cosineSimilarity = (a: number[], b: number[]): number => {
  const length = Math.min(a.length, b.length)
  if (length === 0) return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB))
  return Math.max(0, Math.min(1, similarity))
}
