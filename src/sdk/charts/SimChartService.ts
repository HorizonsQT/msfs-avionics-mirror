import { IcaoValue } from '../navigation/Icao';
import { ChartsClient, ChartsClientErrorCode } from './ChartsClient';
import { ChartService, ChartServiceErrorCode } from './ChartService';
import { SimChartIndex, SimChartPages } from './SimChartTypes';

/**
 * A chart service that provides chart data from the sim's JS chart listener.
 */
export class SimChartService implements ChartService {
  /** @inheritDoc */
  public async getIndexForAirport<T extends string>(provider: string, airportIcao: IcaoValue): Promise<SimChartIndex<T>> {
    try {
      return await ChartsClient.getIndexForAirport<T>(airportIcao, provider);
    } catch (code) {
      switch (code) {
        case ChartsClientErrorCode.NotFound:
          throw ChartServiceErrorCode.NotFound;
        case ChartsClientErrorCode.UnknownProvider:
          throw ChartServiceErrorCode.UnknownProvider;
        case ChartsClientErrorCode.NetworkError:
        case ChartsClientErrorCode.RequestIdConflict:
          throw ChartServiceErrorCode.UnspecifiedRetry;
        case ChartsClientErrorCode.InternalError:
          throw ChartServiceErrorCode.UnspecifiedNoRetry;
        default:
          throw ChartServiceErrorCode.Unknown;
      }
    }
  }

  /** @inheritDoc */
  public async getChartPages(chartGuid: string): Promise<SimChartPages> {
    try {
      return await ChartsClient.getChartPages(chartGuid);
    } catch (code) {
      switch (code) {
        case ChartsClientErrorCode.NotFound:
          throw ChartServiceErrorCode.NotFound;
        case ChartsClientErrorCode.UnknownProvider:
          throw ChartServiceErrorCode.UnknownProvider;
        case ChartsClientErrorCode.NetworkError:
        case ChartsClientErrorCode.RequestIdConflict:
          throw ChartServiceErrorCode.UnspecifiedRetry;
        case ChartsClientErrorCode.InternalError:
          throw ChartServiceErrorCode.UnspecifiedNoRetry;
        default:
          throw ChartServiceErrorCode.Unknown;
      }
    }
  }
}
