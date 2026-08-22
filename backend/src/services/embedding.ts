import { llmService } from "../config/llm";

// Deterministic semantic term hashing to 1536-dim vector
export function generateLocalEmbedding(text: string, dimensions = 1536): number[] {
  const vector = new Array(dimensions).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const words = normalized.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return vector;
  }

  // Feature hashing with n-grams
  for (let i = 0; i < words.length; i++) {
    const unigram = words[i];
    const bigram = i < words.length - 1 ? `${words[i]}_${words[i + 1]}` : null;
    const trigram = i < words.length - 2 ? `${words[i]}_${words[i + 1]}_${words[i + 2]}` : null;

    const tokens = [unigram, bigram, trigram].filter(Boolean) as string[];

    for (const token of tokens) {
      let hash = 5381;
      for (let j = 0; j < token.length; j++) {
        hash = (hash * 33) ^ token.charCodeAt(j);
      }
      const index = Math.abs(hash) % dimensions;
      const sign = (hash & 1) === 0 ? 1 : -1;
      const weight = token.includes("_") ? 1.5 : 1.0;
      vector[index] += sign * weight;
    }
  }

  // L2 Normalize
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] /= norm;
    }
  }

  return vector;
}

/**
 * Fixed-dimension embedding used for the pgvector ANN index. Deterministic and
 * API-key-free, so the stored agent vectors and the query-side post vector
 * always share one space and dimension (unlike getEmbedding, whose remote
 * provider/dim can vary run to run). Used only for candidate pruning; the final
 * relevance score still comes from calculateAgentSimilarity.
 */
export function getIndexEmbedding(text: string, dimensions = 1536): number[] {
  return generateLocalEmbedding(text, dimensions);
}

export function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  const score = dotProduct / denominator;
  return Math.max(0, Math.min(1, score));
}

export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const remote = await llmService.generateEmbedding(text);
    if (remote && remote.length > 0) {
      return remote;
    }
  } catch (err) {
    // fallback to local
  }
  return generateLocalEmbedding(text);
}

/**
 * Calculates domain similarity between a post and an agent's interest profile.
 * Combines dense vector similarity with keyword/entity co-occurrence scoring.
 */
export async function calculateAgentSimilarity(postContent: string, agentInterests: string[]): Promise<number> {
  const interestsText = agentInterests.join(" ");
  
  const postVec = await getEmbedding(postContent);
  const interestVec = await getEmbedding(interestsText);

  const vectorSim = computeCosineSimilarity(postVec, interestVec);

  // Keyword overlap bonus
  const postLower = postContent.toLowerCase();
  let matches = 0;
  for (const interest of agentInterests) {
    const interestLower = interest.toLowerCase();
    if (postLower.includes(interestLower)) {
      matches += 1;
    } else {
      const parts = interestLower.split(" ");
      if (parts.length > 1 && parts.some((p) => p.length > 3 && postLower.includes(p))) {
        matches += 0.5;
      }
    }
  }

  const keywordScore = Math.min(1.0, matches / Math.max(2, agentInterests.length * 0.25));

  // Blended score. The local feature-hash embedding is a weak topical signal, so v1
  // weights the reliable lexical interest-overlap equally with the dense vector.
  // (Production swaps in real embeddings via pgvector, where the dense term dominates.)
  const finalScore = vectorSim * 0.5 + keywordScore * 0.5;

  // Bound to [0.1, 0.99]
  return parseFloat(Math.min(0.99, Math.max(0.1, finalScore)).toFixed(4));
}
