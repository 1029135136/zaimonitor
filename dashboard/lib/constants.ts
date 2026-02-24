export const ALL_MODELS = ["glm-5", "glm-4.7", "glm-4.7-flash"] as const;

export type ModelKey = (typeof ALL_MODELS)[number];

export const PRIMARY_MODEL: ModelKey = "glm-5";

export const SIDE_MODELS: readonly ModelKey[] = ["glm-4.7", "glm-4.7-flash"] as const;

export const MODEL_LABELS: Record<ModelKey, string> = {
  "glm-5": "GLM-5",
  "glm-4.7": "GLM-4.7",
  "glm-4.7-flash": "GLM-4.7-Flash",
};

export const MODEL_COLORS: Record<ModelKey, string> = {
  "glm-5": "var(--chart-2)",
  "glm-4.7": "var(--chart-1)",
  "glm-4.7-flash": "var(--chart-3)",
};

// Performance degradation thresholds
export const DEGRADATION_THRESHOLDS = {
  tps: {
    min: 45,
    unit: "tps",
  },
  ttft: {
    max: 10000,
    unit: "ms",
  },
} as const;
