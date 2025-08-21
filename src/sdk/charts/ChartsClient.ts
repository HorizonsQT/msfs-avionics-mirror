import { IcaoValue } from '../navigation/Icao';
import { Subject } from '../sub/Subject';
import { SubscribableMapFunctions } from '../sub/SubscribableMapFunctions';
import { AtomicSequenceUtils } from '../utils/atomic/AtomicSequence';
import { Wait } from '../utils/time/Wait';
import { ChartView } from './ChartView';
import { SimChartIndex, SimChartPages } from './SimChartTypes';

/**
 * Error codes that can be reported by {@link ChartsClient}.
 */
export enum ChartsClientErrorCode {
  /** No error. */
  None = 0,

  /** The requested data was not found. */
  NotFound,

  /** An unknown chart provider was specified. */
  UnknownProvider,

  /** An unspecified network error occurred. The request can be retried. */
  NetworkError,

  /** An unspecified internal error occurred. The request should not be retried. */
  InternalError,

  /** An unexpected conflict with another request was encountered. */
  RequestIdConflict = 256,
}

/**
 * A class used for retrieving chart data from the sim.
 */
export class ChartsClient {
  private static listener: ViewListener.ViewListener | null = null;

  private static ready = Subject.create(false);

  private static readonly indexRequestMap = new Map<
    number,
    {
      /** A function to call to resolve the request. */
      resolve: (data: SimChartIndex<string>) => void;

      /** A function to call to reject the request. */
      reject: (reason?: any) => void;
    }
  >();

  private static readonly pagesRequestMap = new Map<
    number,
    {
      /** A function to call to resolve the request. */
      resolve: (data: SimChartPages) => void;

      /** A function to call to reject the request. */
      reject: (reason?: any) => void;
    }

  >();

  /**
   * Gets an index of charts for an airport from a chart provider.
   * @param airportIcao The ICAO of the airport for which to obtain a chart index.
   * @param provider The provider from which to retrieve the chart index.
   * @returns A Promise which is fulfilled with the requested chart index when it has been retrieved.
   */
  public static async getIndexForAirport<T extends string>(
    airportIcao: IcaoValue,
    provider: string
  ): Promise<SimChartIndex<T>> {
    await ChartsClient.ensureViewListenerReady();

    const requestId = (await AtomicSequenceUtils.getInstance()).getNext();

    const existing = ChartsClient.indexRequestMap.get(requestId);
    if (existing) {
      // This should never happen since request IDs from AtomicSequence should always be unique (unless they've
      // overflowed Number.MAX_SAFE_INTEGER).
      console.error(`ChartsClient: unexpected request ID conflict encountered using ID ${requestId} from AtomicSequence`);
      throw ChartsClientErrorCode.RequestIdConflict;
    }

    return new Promise<SimChartIndex<T>>((resolve, reject) => {
      ChartsClient.indexRequestMap.set(
        requestId,
        {
          resolve: resolve as (data: SimChartIndex<string>) => void,
          reject,
        }
      );

      ChartsClient.listener!.call('GET_CHARTS_INDEX', requestId, airportIcao, provider);
    });
  }

  /**
   * Gets chart page information for a chart with a given GUID.
   * @param chartGuid The GUID of the chart for which to obtain page information.
   * @returns A Promise which is fulfilled with the requested chart page information when it has been retrieved.
   */
  public static async getChartPages(chartGuid: string): Promise<SimChartPages> {
    await ChartsClient.ensureViewListenerReady();

    const requestId = (await AtomicSequenceUtils.getInstance()).getNext();

    const existing = ChartsClient.pagesRequestMap.get(requestId);
    if (existing) {
      // This should never happen since request IDs from AtomicSequence should always be unique (unless they've
      // overflowed Number.MAX_SAFE_INTEGER).
      console.error(`ChartsClient: unexpected request ID conflict encountered using ID ${requestId} from AtomicSequence`);
      throw ChartsClientErrorCode.RequestIdConflict;
    }

    return new Promise<SimChartPages>((resolve, reject) => {
      ChartsClient.pagesRequestMap.set(
        requestId,
        {
          resolve,
          reject,
        }
      );

      ChartsClient.listener!.call('GET_CHART_PAGES', requestId, chartGuid);
    });
  }

  /**
   * Initializes a chart view with the charts view listener
   *
   * @param view the view to initialize
   */
  public static async initializeChartView(view: ChartView): Promise<void> {
    await ChartsClient.ensureViewListenerReady();

    await view.init(ChartsClient.listener!);
  }

  /**
   * Setups up the view listener for charts
   */
  private static async setupViewListener(): Promise<void> {
    ChartsClient.listener = RegisterViewListener('JS_LISTENER_CHARTS', () => ChartsClient.ready.set(true));

    await Wait.awaitSubscribable(ChartsClient.ready, SubscribableMapFunctions.identity(), false, 10_000);

    ChartsClient.listener.on('SendChartIndex', ChartsClient.onChartIndexReceived);
    ChartsClient.listener.on('SendChartIndexError', ChartsClient.onChartIndexErrorReceived);
    ChartsClient.listener.on('SendChartPages', ChartsClient.onChartPagesReceived);
    ChartsClient.listener.on('SendChartPagesError', ChartsClient.onChartPagesErrorReceived);
  }

  /**
   * Ensures that the charts view listener is ready
   */
  private static async ensureViewListenerReady(): Promise<void> {
    if (!ChartsClient.listener) {
      await ChartsClient.setupViewListener();
      return;
    }

    await Wait.awaitSubscribable(ChartsClient.ready, SubscribableMapFunctions.identity(), true, 10_000);
  }

  /**
   * Responds to when a chart index response is received from the simulator.
   * @param requestID The request ID to which the response applies.
   * @param index The chart index for the request.
   */
  private static onChartIndexReceived(requestID: number, index: SimChartIndex<string>): void {
    const request = ChartsClient.indexRequestMap.get(requestID);

    if (request) {
      ChartsClient.indexRequestMap.delete(requestID);
      request.resolve(index);
    }
  }

  /**
   * Responds to when a chart index error is received from the simulator.
   * @param requestID The request ID to which the error applies.
   * @param errorCode An error code describing the error.
   */
  private static onChartIndexErrorReceived(requestID: number, errorCode: number): void {
    const request = ChartsClient.indexRequestMap.get(requestID);

    if (request) {
      ChartsClient.indexRequestMap.delete(requestID);
      request.reject(errorCode);
    }
  }

  /**
   * Responds to when a chart pages response is received from the simulator.
   * @param requestID The request ID to which the response applies.
   * @param pages The chart pages for the request.
   */
  private static onChartPagesReceived(requestID: number, pages: SimChartPages): void {
    const request = ChartsClient.pagesRequestMap.get(requestID);

    if (request) {
      ChartsClient.pagesRequestMap.delete(requestID);
      request.resolve(pages);
    }
  }

  /**
   * Responds to when a chart pages error is received from the simulator.
   * @param requestID The request ID to which the error applies.
   * @param errorCode An error code describing the error.
   */
  private static onChartPagesErrorReceived(requestID: number, errorCode: number): void {
    const request = ChartsClient.pagesRequestMap.get(requestID);

    if (request) {
      ChartsClient.pagesRequestMap.delete(requestID);
      request.reject(errorCode);
    }
  }
}
