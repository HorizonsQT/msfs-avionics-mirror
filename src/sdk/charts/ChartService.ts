import { IcaoValue } from '../navigation/Icao';
import { ChartIndex, ChartPages } from './ChartTypes';

/**
 * Error codes that can be reported by a {@link ChartService}.
 */
export enum ChartServiceErrorCode {
  /** No error. */
  None = 0,

  /** An unknown chart provider was specified. */
  UnknownProvider,

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
 * A service that provides chart data.
 */
export interface ChartService {
  /**
   * Gets a chart index for an airport.
   * @param provider The provider from which to get the chart index.
   * @param airportIcao The ICAO of the airport for which to get the chart index.
   * @returns A Promise which is fulfilled with the requested chart index if one was successfully retrieved, or
   * rejected with a numeric error code if the chart index could not be retrieved. The error code is of type `number`
   * and extends {@link ChartServiceErrorCode}.
   */
  getIndexForAirport(provider: string, airportIcao: IcaoValue): Promise<ChartIndex<string>>;

  /**
   * Gets chart pages for a given chart.
   * @param chartGuid The GUID of the chart for which to get pages.
   * @returns A Promise which is fulfilled with the requested chart pages if they were successfully retrieved, or
   * rejected with a numeric error code if the chart pages could not be retrieved. The error code is of type `number`
   * and extends {@link ChartServiceErrorCode}.
   */
  getChartPages(chartGuid: string): Promise<ChartPages>;
}
