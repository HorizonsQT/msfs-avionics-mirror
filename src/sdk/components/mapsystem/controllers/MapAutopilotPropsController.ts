import { UnitType } from '../../../math/NumberUnit';
import { Subscribable } from '../../../sub/Subscribable';
import { MapAutopilotPropsModule } from '../../map/modules/MapAutopilotPropsModule';
import { MapSystemContext } from '../MapSystemContext';
import { MapSystemKeys } from '../MapSystemKeys';
import { MapModulePropsController, MapModulePropsControllerBinding, MapModulePropsControllerPropKey } from './MapModulePropsController';

/**
 * Modules required for {@link MapAutopilotPropsController}.
 */
export interface MapAutopilotPropsControllerModules {
  /** Autopilot properties. */
  [MapSystemKeys.AutopilotProps]: MapAutopilotPropsModule;
}

/**
 * A key for a property in {@link MapAutopilotPropsModule} that can be bound by {@link MapAutopilotPropsController}.
 */
export type MapAutopilotPropsKey = MapModulePropsControllerPropKey<MapAutopilotPropsModule>;

/**
 * A definition of a binding between a property in {@link MapAutopilotPropsModule} and an event bus topic.
 * @deprecated
 */
export type MapAutopilotPropsBinding = {
  /** The key of the property to bind. */
  key: MapAutopilotPropsKey;

  /** The event bus topic to which to bind the property. */
  topic: string;
};

/**
 * A definition of a binding between a property in {@link MapAutopilotPropsModule} and an external data source.
 */
export type MapAutopilotPropsControllerBinding = MapModulePropsControllerBinding<MapAutopilotPropsModule>;

/**
 * Updates the properties in a {@link MapAutopilotPropsModule}.
 */
export class MapAutopilotPropsController extends MapModulePropsController<typeof MapSystemKeys.AutopilotProps, MapAutopilotPropsModule> {
  /**
   * Creates a new instance of MapAutopilotPropsController.
   * @param context This controller's map context.
   * @param bindings An iterable containing definitions of the bindings to create between module properties and
   * external data sources.
   * @param updateFreq The default frequency, in hertz, at which to update the module props from their bound data
   * sources. This frequency, if defined, is applied to all bindings that do not explicitly define their own update
   * frequencies. If the frequency is `null`, then updates will not be throttled by frequency - each property will be
   * updated as soon as the value of its data source changes. If the frequency is not `null`, then each property will
   * only be updated when the controller's `onBeforeUpdated()` method is called, and the frequency of updates will not
   * exceed `updateFreq`.
   */
  public constructor(
    context: MapSystemContext<MapAutopilotPropsControllerModules>,
    bindings: Iterable<MapAutopilotPropsKey | MapAutopilotPropsControllerBinding>,
    updateFreq?: number | null | Subscribable<number | null>
  ) {
    super(
      context,
      MapSystemKeys.AutopilotProps,
      Array.from(bindings).map(binding => {
        const mappedBinding = typeof binding === 'string'
          ? MapAutopilotPropsController.getDefaultBinding(binding)
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
  private static getDefaultBinding(key: MapAutopilotPropsKey): MapAutopilotPropsControllerBinding {
    switch (key) {
      case 'selectedAltitude':
        return {
          key,
          topic: 'ap_altitude_selected',
          handler: (prop: MapAutopilotPropsModule['selectedAltitude'], alt: number) => { prop.set(alt, UnitType.FOOT); },
        };
      case 'selectedHeading':
        return {
          key,
          topic: 'ap_heading_selected',
        };
      default:
        throw new Error(`MapAutopilotPropsController: invalid property key: ${key}`);
    }
  }
}
