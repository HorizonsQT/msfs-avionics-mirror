import { Subscribable } from '../sub/Subscribable';

/**
 * Error codes that can be reported by a {@link ChartImageSupplier}.
 */
export enum ChartImageErrorCode {
  /** No error. */
  None = 0,

  /** The requested data was not found. */
  NotFound,

  /** The request timed out. */
  Timeout,

  /** An unspecified error occurred. The request can be retried. */
  UnspecifiedRetry,

  /** An unspecified error occurred. The request should not be retried.  */
  UnspecifiedNoRetry,

  /** An unknown error occurred. */
  Unknown,
}

/**
 * A description of a chart image supplied by {@link ChartImageSupplier}.
 */
export type ChartImage = {
  /**
   * The URL of the image that displays the requested chart, or the empty string if a chart image is not available. The
   * URL should be able to be used wherever an image URL is accepted (e.g. as the `src` attribute for an image element
   * or as the argument for the CSS `url()` function).
   */
  readonly imageUrl: string;

  /** The URL of the chart page for which the image was requested, or the empty string if no chart page was requested. */
  readonly chartUrl: string;

  /** The error code associated with this image. The code extends {@link ChartImageErrorCode}. */
  readonly errorCode: number;
};

/**
 * A supplier of chart images via image URLs.
 */
export interface ChartImageSupplier {
  /** The current supplied chart image. */
  readonly image: Subscribable<ChartImage>;

  /**
   * Updates this supplier to show a new chart image.
   * @param chartUrl The URL of the chart page for which to show an image. The URL should be sourced from a valid
   * `ChartPage` record. Specifying the empty string will clear the requested chart image.
   */
  showChartImage(chartUrl: string): void;

  /**
   * Destroys this supplier.
   */
  destroy(): void;
}
