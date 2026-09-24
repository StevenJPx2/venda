export interface HeroData {
  headline?: string;
  title?: string;
  description?: string;
}

export interface FeatureData {
  title?: string;
  description?: string;
  icon?: string;
  order?: number;
}

export interface StepData {
  title?: string;
  description?: string;
  order?: number;
}

export interface PostData {
  title?: string;
  excerpt?: string;
  body?: string;
  tags?: string[];
}
