import {
  MapModulePropsController, MapModulePropsControllerBinding, MapModulePropsControllerPropKey, MapSystemContext,
  MapSystemKeys, Subscribable, UnitType
} from '@microsoft/msfs-sdk';

import { MapGarminAutopilotPropsModule } from '../modules/MapGarminAutopilotPropsModule';

/**
 * Modules required for {@link MapGarminAutopilotPropsController}.
 */
export interface MapGarminAutopilotPropsControllerModules {
  /** Autopilot properties. */
  [MapSystemKeys.AutopilotProps]: MapGarminAutopilotPropsModule;
}

/**
 * A key for a property in {@link MapGarminAutopilotPropsModule} that can be bound by
 * {@link MapOwnAirplanePropsController}.
 */
export type MapGarminAutopilotPropsKey = MapModulePropsControllerPropKey<MapGarminAutopilotPropsModule>;

/**
 * A definition of a binding between a property in {@link MapGarminAutopilotPropsModule} and an event bus topic.
 * @deprecated
 */
export type MapGarminAutopilotPropsBinding = {
  /** The key of the property to bind. */
  key: MapGarminAutopilotPropsKey;

  /** The event bus topic to which to bind the property. */
  topic: string;
};

/**
 * A definition of a binding between a property in {@link MapGarminAutopilotPropsModule} and an external data source.
 */
export type MapGarminAutopilotPropsControllerBinding = MapModulePropsControllerBinding<MapGarminAutopilotPropsModule>;

/**
 * Binds the properties in a {@link MapGarminAutopilotPropsModule} to event bus topics.
 */
export class MapGarminAutopilotPropsController extends MapModulePropsController<typeof MapSystemKeys.AutopilotProps, MapGarminAutopilotPropsModule> {
  /**
   * Creates a new instance of MapGarminAutopilotPropsController.
   * @param context This controller's map context.
   * @param bindings An iterable containing definitions of the bindings to create between module properties and
   * external data sources.
   * @param updateFreq The default frequency, in hertz, at which to update the module props from their bound data
   * sources. This frequency, if defined, is applied to all bindings that do not explicitly define their own update
   * frequencies. If the frequency is `null`, then updates will not be throttled by frequency - each property will be
   * updated as soon as the value of its data source changes. If the frequency is not `null`, then each property will
   * only be updated when the controller's `onBeforeUpdated()` method is called, and the frequency of updates will not
   * exceed `updateFreq`. Ignored if `bindings` is undefined.
   */
  public constructor(
    context: MapSystemContext<MapGarminAutopilotPropsControllerModules>,
    bindings: Iterable<MapGarminAutopilotPropsKey | MapGarminAutopilotPropsControllerBinding>,
    updateFreq?: number | null | Subscribable<number | null>
  ) {
    super(
      context,
      MapSystemKeys.AutopilotProps,
      Array.from(bindings).map(binding => {
        const mappedBinding = typeof binding === 'string'
          ? MapGarminAutopilotPropsController.getDefaultBinding(binding)
          : binding;

        if (mappedBinding.updateFreq === undefined && updateFreq !== undefined) {
          return { ...mappedBinding, updateFreq };
        } else {
          return mappedBinding;
        }
      })
    );
  }

  /**
   * Gets the default binding for a property key.
   * @param key The property key for which to get a default binding.
   * @returns The default binding for the specified property key.
   * @throws Error if the specified property key is invalid.
   */
  private static getDefaultBinding(key: MapGarminAutopilotPropsKey): MapGarminAutopilotPropsControllerBinding {
    switch (key) {
      case 'selectedAltitude':
        return {
          key,
          topic: 'ap_altitude_selected',
          handler: (prop: MapGarminAutopilotPropsModule['selectedAltitude'], alt: number) => { prop.set(alt, UnitType.FOOT); },
        };
      case 'selectedHeading':
        return {
          key,
          topic: 'ap_heading_selected',
        };
      case 'isTurnHdgAdjustActive':
        return {
          key,
          topic: 'hdg_sync_turn_adjust_active',
        };
      case 'isHdgSyncModeActive':
        return {
          key,
          topic: 'hdg_sync_mode_active',
        };
      case 'manualHeadingSelect':
        return {
          key,
          topic: 'hdg_sync_manual_select',
          handler: (prop: MapGarminAutopilotPropsModule['manualHeadingSelect']) => { prop.notify(); },
          updateFreq: null,
        };
      default:
        throw new Error(`MapGarminAutopilotPropsController: invalid property key: ${key}`);
    }
  }
}
