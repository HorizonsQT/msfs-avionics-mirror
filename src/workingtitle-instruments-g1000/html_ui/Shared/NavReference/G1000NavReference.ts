import { CdiEvents, ConsumerSubject, EventBus, NavSourceId, NavSourceType } from '@microsoft/msfs-sdk';

import {
  BasicNavReferenceIndicator, NavReferenceIndicator, NavReferenceIndicators, NavReferenceSource, NavReferenceSources
} from '@microsoft/msfs-garminsdk';

/** A valid {@link NavReferenceSource} name for the G1000 NXi. */
export type G1000NavSourceName = 'NAV1' | 'NAV2' | 'GPS1' | 'GPS2';
/** The names of the available nav sources in the G1000 NXi for the active navigation source. */
export type G1000ActiveNavSourceName = 'GPS1' | 'NAV1' | 'NAV2';
/** A G1000 NXi {@link NavReferenceSource}. */
export type G1000NavSource = NavReferenceSource<G1000NavSourceName>;
/** A collection of G1000 NXi {@link NavReferenceSource | NavReferenceSources}. */
export type G1000NavSources = NavReferenceSources<G1000NavSourceName>;
/** A collection of G1000 NXi {@link NavReferenceSource|NavReferenceSources} that can be used as the active navigation source. */
export type G1000ActiveNavSources = NavReferenceSources<G1000ActiveNavSourceName>;
/** An active navigation source for the G1000 NXi. */
export type G1000ActiveNavSource = NavReferenceSource<G1000ActiveNavSourceName>;

/** A valid {@link NavReferenceIndicator} name for the G1000 NXi. */
export type G1000NavIndicatorName = 'activeSource';
/** A G1000 NXi {@link NavReferenceIndicator}. */
export type G1000NavIndicator = NavReferenceIndicator<G1000NavSourceName>;
/** A collection of G1000 NXi {@link NavReferenceIndicator | NavReferenceIndicators}. */
export type G1000NavIndicators = NavReferenceIndicators<G1000NavSourceName, G1000NavIndicatorName>;

/**
 * A G1000 NXi active navigation source {@link NavReferenceIndicator}.
 */
export class G1000ActiveSourceNavIndicator extends BasicNavReferenceIndicator<G1000NavSourceName> {
  private readonly cdiSource: ConsumerSubject<NavSourceId>;

  /**
   * Creates a new instance of G1000ActiveSourceNavIndicator.
   * @param navSources A collection of {@link NavReferenceSource | NavReferenceSources} from which the indicator can
   * source data.
   * @param bus The event bus.
   */
  public constructor(navSources: G1000NavSources, private readonly bus: EventBus) {
    super(navSources, 'NAV1');

    this.cdiSource = ConsumerSubject.create(this.bus.getSubscriber<CdiEvents>().on('cdi_select'), { type: NavSourceType.Gps, index: 1 });

    this.cdiSource.sub(source => {
      if (source.type === NavSourceType.Nav) {
        if (source.index === 2) {
          this.setSource('NAV2');
        } else {
          this.setSource('NAV1');
        }
      } else {
        // TODO: support multiple GPS sources
        this.setSource('GPS1');
      }
    }, true);
  }
}
