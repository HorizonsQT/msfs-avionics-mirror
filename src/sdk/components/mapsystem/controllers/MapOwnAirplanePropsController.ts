import { UnitType } from '../../../math/NumberUnit';
import { Subscribable } from '../../../sub/Subscribable';
import { MapOwnAirplanePropsModule } from '../../map/modules/MapOwnAirplanePropsModule';
import { MapSystemContext } from '../MapSystemContext';
import { MapSystemKeys } from '../MapSystemKeys';
import { MapModulePropsController, MapModulePropsControllerBinding, MapModulePropsControllerPropKey } from './MapModulePropsController';

/**
 * Modules required for {@link MapOwnAirplanePropsController}.
 */
export interface MapOwnAirplanePropsControllerModules {
  /** Own airplane properties. */
  [MapSystemKeys.OwnAirplaneProps]: MapOwnAirplanePropsModule;
}

/**
 * A key for a property in {@link MapOwnAirplanePropsModule} that can be bound by
 * {@link MapOwnAirplanePropsController}.
 */
export type MapOwnAirplanePropsKey = MapModulePropsControllerPropKey<MapOwnAirplanePropsModule>;

/**
 * A definition of a binding between a property in {@link MapOwnAirplanePropsModule} and an external data source.
 */
export type MapOwnAirplanePropsControllerBinding = MapModulePropsControllerBinding<MapOwnAirplanePropsModule>;

/**
 * Updates the properties in a {@link MapOwnAirplanePropsModule}.
 */
export class MapOwnAirplanePropsController extends MapModulePropsController<typeof MapSystemKeys.OwnAirplaneProps, MapOwnAirplanePropsModule> {
  /**
   * Creates a new instance of MapOwnAirplanePropsController.
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
    context: MapSystemContext<MapOwnAirplanePropsControllerModules>,
    bindings: Iterable<MapOwnAirplanePropsKey | MapOwnAirplanePropsControllerBinding>,
    updateFreq?: number | null | Subscribable<number | null>
  ) {
    super(
      context,
      MapSystemKeys.OwnAirplaneProps,
      Array.from(bindings).map(binding => {
        const mappedBinding = typeof binding === 'string'
          ? MapOwnAirplanePropsController.getDefaultBinding(binding)
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
  private static getDefaultBinding(key: MapOwnAirplanePropsKey): MapOwnAirplanePropsControllerBinding {
    switch (key) {
      case 'position':
        return {
          key,
          topic: 'gps-position',
          handler: (prop: MapOwnAirplanePropsModule['position'], lla: LatLongAlt) => { prop.set(lla.lat, lla.long); },
        };
      case 'altitude':
        return {
          key,
          topic: 'indicated_alt',
          handler: (prop: MapOwnAirplanePropsModule['altitude'], alt: number) => { prop.set(alt, UnitType.FOOT); },
        };
      case 'groundSpeed':
        return {
          key,
          topic: 'ground_speed',
          handler: (prop: MapOwnAirplanePropsModule['groundSpeed'], gs: number) => { prop.set(gs, UnitType.KNOT); },
        };
      case 'hdgTrue':
        return {
          key,
          topic: 'hdg_deg_true',
        };
      case 'trackTrue':
        return {
          key,
          topic: 'track_deg_true',
        };
      case 'verticalSpeed':
        return {
          key,
          topic: 'vertical_speed',
          handler: (prop: MapOwnAirplanePropsModule['verticalSpeed'], vs: number) => { prop.set(vs, UnitType.FPM); },
        };
      case 'turnRate':
        return {
          key,
          topic: 'delta_heading_rate',
        };
      case 'isOnGround':
        return {
          key,
          topic: 'on_ground',
        };
      case 'magVar':
        return {
          key,
          topic: 'magvar',
        };
      default:
        throw new Error(`MapOwnAirplanePropsController: invalid property key: ${key}`);
    }
  }
}
