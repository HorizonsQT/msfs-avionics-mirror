import { AtomicSequenceUtils } from '../utils/atomic/AtomicSequence';
import { WeatherPathRequest, WeatherPathResponse } from './WeatherTypes';

/**
 * Error codes that can be reported by {@link WeatherClient}.
 */
export enum WeatherClientErrorCode {
  /** No error */
  None,

  /** An unspecified network error occurred. The request can be retried. */
  NetworkError,

  /** An unspecified internal error occurred. The request should not be retried. */
  InternalError,

  /** An unexpected conflict with another request was encountered. */
  RequestIdConflict = 256
}

/** Class for loading weather forecasts from the simulator */
export class WeatherClient {
  private static listener?: Promise<ViewListener.ViewListener>;

  private static readonly weatherRequestMap = new Map<
    number,
    {
      /** A function to call to resolve the request. */
      resolve: (data: WeatherPathResponse) => void;

      /** A function to call to reject the request. */
      reject: (reason?: any) => void;
    }
  >();

  /**
   * Fetches weather forecasts along a path from the sim.
   * @param request request input data.
   * @returns A weather path data response.
   */
  public static async getWeatherFromPath(request: WeatherPathRequest): Promise<WeatherPathResponse> {
    const listener = await WeatherClient.getListener();

    const requestId = (await AtomicSequenceUtils.getInstance()).getNext();

    const existing = WeatherClient.weatherRequestMap.get(requestId);
    if (existing) {
      // This should never happen since request IDs from AtomicSequence should always be unique (unless they've
      // overflowed Number.MAX_SAFE_INTEGER).
      console.error(`WeatherClient: unexpected request ID conflict encountered using ID ${requestId} from AtomicSequence`);
      throw WeatherClientErrorCode.RequestIdConflict;
    }

    return new Promise<WeatherPathResponse>((resolve, reject) => {
      WeatherClient.weatherRequestMap.set(
        requestId,
        {
          resolve,
          reject,
        }
      );
      listener.call('GET_WEATHER_ALONG_PATH', requestId, request);
    });
  }

  /**
   * Get the view listener for weather requests.
   * @returns a promise for a view listener.
   */
  private static getListener(): Promise<ViewListener.ViewListener> {
    return WeatherClient.listener ??= new Promise(resolve => {
      const listener = RegisterViewListener('JS_LISTENER_WEATHER_DATA', () => {
        listener.on('SendPathWeatherResponse', WeatherClient.onWeatherReceived.bind(WeatherClient));
        listener.on('SendPathWeatherError', WeatherClient.onWeatherError.bind(WeatherClient));
        resolve(listener);
      });
    });
  }

  /**
   * Callback that handles when a weather path response is received from the simulator
   * @param requestID the request ID
   * @param weather the weather object
   */
  private static onWeatherReceived(requestID: number, weather: WeatherPathResponse): void {
    const request = WeatherClient.weatherRequestMap.get(requestID);
    if (request) {
      WeatherClient.weatherRequestMap.delete(requestID);
      request.resolve(weather);
    }
  }

  /**
   * Callback that handles when a weather path response is received from the simulator
   * @param requestID the request ID.
   * @param reason of the failure.
   */
  private static onWeatherError(requestID: number, reason: number): void {
    const request = WeatherClient.weatherRequestMap.get(requestID);
    if (request) {
      WeatherClient.weatherRequestMap.delete(requestID);
      request.reject(reason);
    }
  }
}
