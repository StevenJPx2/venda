import type { RichTextDoc } from '@venda/richtext';
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
  /** Rich-text document from the Venda editor. */
  body?: RichTextDoc;
  tags?: string[];
}
