/** @module core/types
 * Foundational brand workflow types that multiple concerns share.
 * Keeping these in core prevents extraction, engine, and asset layers from depending on one another for type-only contracts.
 */

/** Minimal seed input for the deterministic brand engine. */
export interface SeedToken {
  colorPrimary: string;
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  colorInfo: string;
  colorLink: string;
  colorTextBase: string;
  colorBgBase: string;
  fontFamily: string;
  fontFamilyCode: string;
  fontSize: number;
  borderRadius: number;
  sizeUnit: number;
  sizeStep: number;
  controlHeight: number;
  lineWidth: number;
  motionUnit: number;
  motionBase: number;
  wireframe: boolean;
  motion: boolean;
}

/** Color frequency candidate harvested from CSS or computed page styles. */
export type ColorCandidate = {
  hex: string;
  count: number;
  extreme?: boolean;
  sources?: string[];
};

/** Font-family frequency candidate harvested from CSS or computed page styles. */
export type FontCandidate = { family: string; count: number };

/** Logo candidate discovered while harvesting a source page. */
export type LogoCandidate = {
  file: string;
  sourceUrl: string;
  kind: 'favicon' | 'apple-touch-icon' | 'og-image' | 'header-img' | 'inline-svg';
  bytes: number;
  contentType?: string;
  width?: number;
  height?: number;
};

/** Deterministic page harvest material used to synthesize a provisional brand. */
export type PrefetchResult = {
  url: string;
  finalUrl: string;
  siteName: string;
  title: string;
  description: string;
  colors: ColorCandidate[];
  fonts: FontCandidate[];
  fontFaceFamilies: string[];
  googleFontsUrls: string[];
  fontFiles: Array<{
    family: string;
    sourceUrl: string;
    file: string;
    format: string;
    weight?: string;
    style?: string;
  }>;
  logos: LogoCandidate[];
  inlineHeaderSvg?: string;
  headings: string[];
  paragraphs: string[];
  navLabels: string[];
  extraPages: Array<{ url: string; title: string; text: string }>;
  screenshot: string | null;
  blocked?: boolean;
  thin?: boolean;
  materialMd: string;
};

/** Agent identity copied onto synthetic transcript rows. */
export interface TranscriptAgent {
  agentId?: string | null;
  agentName?: string | null;
}
