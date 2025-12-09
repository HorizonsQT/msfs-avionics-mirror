import { DefaultUserSettingManager, EventBus } from '@microsoft/msfs-sdk';

import { WTLineNavSourceNames } from './WTLineNavIndicators';

const navigationSettings = [
  {
    name: 'lastFmsPos',
    defaultValue: '0,0' as string,
  },
  {
    name: 'advisoryVnavEnabled',
    defaultValue: true as boolean
  },
  {
    name: 'bearingPointer1Source',
    defaultValue: false as WTLineNavSourceNames[number] | false,
  },
  {
    name: 'bearingPointer2Source',
    defaultValue: false as WTLineNavSourceNames[number] | false,
  },
] as const;

/** Generates the UserSettingDefinition type based on the settings object */
export type WTLineNavigationSettings = {
  readonly [Item in typeof navigationSettings[number]as Item['name']]: Item['defaultValue'];
};

/** Utility class for retrieving the navigation user setting managers. */
export class WTLineNavigationUserSettings {
  private static INSTANCE: DefaultUserSettingManager<WTLineNavigationSettings> | undefined;
  /**
   * Retrieves a manager for navigation user settings.
   * @param bus The event bus.
   * @returns a manager for navigation user settings.
   */
  public static getManager(bus: EventBus): DefaultUserSettingManager<WTLineNavigationSettings> {
    return WTLineNavigationUserSettings.INSTANCE ??= new DefaultUserSettingManager<WTLineNavigationSettings>(bus, navigationSettings);
  }
}
