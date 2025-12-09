import { UnitType } from '@microsoft/msfs-sdk';

import { WTLineFixInfoOptions } from './WTLineFixInfoManager';

export const WTLineFixInfoConfig: WTLineFixInfoOptions = {
  numberOfFixes: 5,
  numberOfBearingDistances: 1,
  numberOfLatLonCrossings: 1,
  maxDistance: UnitType.METER.convertFrom(500, UnitType.NMILE),
};
