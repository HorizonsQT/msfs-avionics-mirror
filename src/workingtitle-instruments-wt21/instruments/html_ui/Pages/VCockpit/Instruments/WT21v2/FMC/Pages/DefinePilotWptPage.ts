import {
  DisplayField, FacilityUtils, FmcRenderTemplate, FmcRenderTemplateColumn, GeoPoint, ICAO, LatLongInterface,
  MappedSubject, PageLinkField,
  Subject,
  TextInputField, UserFacilityUtils
} from '@microsoft/msfs-sdk';

import { WTLineFacilityUtils } from '@microsoft/msfs-wtlinesdk';

import { PlaceBearingDistanceInput, PlaceBearingPlaceBearingInput } from '@microsoft/msfs-wt21-shared';
import { LatLongTextFormat, PlaceBearingDistanceInputFormat, PlaceBearingPlaceBearingInputFormat, StringInputFormat } from '../Framework/FmcFormats';
import { WT21FmcPage } from '../WT21FmcPage';
import { WaypointAlreadyExistsPrompt } from './Common/WaypointAlreadyExistsPrompt';

/**
 * Fix Info page
 */
export class DefinePilotWptPage extends WT21FmcPage {
  private static readonly geoPointCache = [new GeoPoint(0, 0)];

  private readonly wptAlreadyExistsPrompt = new WaypointAlreadyExistsPrompt();

  private readonly identSub = Subject.create<string | null>(null);

  private readonly latLongSub = Subject.create<LatLongInterface | null>(null);

  private readonly pbdSub = Subject.create<PlaceBearingDistanceInput | null>(null);

  private readonly pbpbSub = Subject.create<PlaceBearingPlaceBearingInput | null>(null);

  private readonly IdentField = new TextInputField<string | null, string>(this, {
    formatter: new StringInputFormat({ nullValueString: '□□□□□', maxLength: 5 }),
  }).bind(this.identSub);

  private readonly CoordinatesField = new TextInputField<LatLongInterface | null, LatLongInterface>(this, {
    formatter: new LatLongTextFormat({ spacesBetweenLatLong: 2, acceptShortFormInput: false }),
    onModified: async (value) => {
      this.latLongSub.set(value);
      this.pbdSub.set(null);
      this.pbpbSub.set(null);

      this.screen.clearScratchpad();

      return true;
    },
  }).bind(this.latLongSub);

  private PlaceBearingDistanceField = new TextInputField<PlaceBearingDistanceInput | null, PlaceBearingDistanceInput>(this, {
    formatter: new PlaceBearingDistanceInputFormat(),
    onModified: async (value: PlaceBearingDistanceInput) => {
      const facility = await this.screen.selectWptFromIdent(value.placeIdent, this.fms.ppos);

      if (facility) {
        if (Math.abs(facility.lat) > 80) {
          return Promise.reject('N/A IN POLAR REGION');
        } else {
          const pos = FacilityUtils.getLatLonFromRadialDistance(facility, value.bearing, value.distance, DefinePilotWptPage.geoPointCache[0]);

          this.latLongSub.set({ lat: pos.lat, long: pos.lon });
        }
      } else {
        return Promise.reject('NOT IN DATA BASE');
      }

      this.pbdSub.set(value);
      this.pbpbSub.set(null);

      this.screen.clearScratchpad();

      return true;
    },
  }).bind(this.pbdSub);

  private PlaceBearingPlaceBearingInputField = new TextInputField<PlaceBearingPlaceBearingInput | null, PlaceBearingPlaceBearingInput>(this, {
    formatter: new PlaceBearingPlaceBearingInputFormat(),
    onModified: async (value: PlaceBearingPlaceBearingInput) => {
      const facilityA = await this.screen.selectWptFromIdent(value.placeAIdent, this.fms.ppos);
      const facilityB = await this.screen.selectWptFromIdent(value.placeBIdent, this.fms.ppos);

      if (facilityA && facilityB) {
        if (Math.abs(facilityA.lat) > 80 || Math.abs(facilityB.lat) > 80) {
          return Promise.reject('N/A IN POLAR REGION');
        } else {
          const pos = FacilityUtils.getLatLonFromRadialRadial(facilityA, value.bearingA, facilityB, value.bearingB, DefinePilotWptPage.geoPointCache[0]);

          if (pos) {
            this.latLongSub.set({ lat: pos.lat, long: pos.lon });
          } else {
            return Promise.reject('NO INTERSECTION');
          }
        }
      } else {
        return Promise.reject('NOT IN DATA BASE');
      }

      this.pbdSub.set(null);
      this.pbpbSub.set(value);
      this.screen.clearScratchpad();

      return true;
    },
  }).bind(this.pbpbSub);

  private readonly StoreWptField = new DisplayField(this, {
    formatter: {
      nullValueString: '',

      /** @inheritDoc */
      format(value: readonly [string | null, LatLongInterface | null]): string {

        if (value[0] === null || value[1] === null) {
          return '';
        }

        return '<STORE WPT';
      },
    },
    onSelected: async () => {
      const ident = this.identSub.get();
      const lla = this.latLongSub.get();

      if (ident !== null && lla !== null) {
        const icao = ICAO.value('U', '', WTLineFacilityUtils.USER_FACILITY_SCOPE, ident.substring(0, 5));

        const userFacilities = this.fms.getPilotDefinedWaypointsArray();

        if (userFacilities.length >= 100) {
          return Promise.reject('PILOT WPT LIST FULL');
        }

        // Prompt to replace waypoint if needed
        if (this.fms.pilotDefinedWaypointExistsWithIdent(icao.ident)) {
          try {
            const replace = await this.wptAlreadyExistsPrompt.showPromptAndWaitForResponse();

            if (!replace) {
              return true;
            }
          } catch (e) {
            // Do nothing if the page is navigated away from
            return true;
          }
        }

        this.fms.addUserFacility(UserFacilityUtils.createFromLatLon(icao, lla.lat, lla.long));

        this.identSub.set(null);
        this.latLongSub.set(null);
        this.pbdSub.set(null);
        this.pbpbSub.set(null);

        this.screen.navigateTo('/pilot-wpt-list');

        return true;
      }

      return false;
    },
  }).bind(MappedSubject.create(this.identSub, this.latLongSub));

  private readonly ReturnLink = PageLinkField.createLink(this, 'RETURN>', '/database');

  private readonly WaypointAlreadyExistsReplaceField = this.wptAlreadyExistsPrompt.createReplaceComponent(this);

  private readonly WaypointAlreadyExistsCancelField = this.wptAlreadyExistsPrompt.createCancelComponent(this);

  /** @inheritDoc */
  public init(): void {
    super.init();

    this.addBinding(this.wptAlreadyExistsPrompt.shown.sub(() => this.invalidate()));
  }

  /** @inheritDoc */
  public render(): FmcRenderTemplate[] {
    let L6: FmcRenderTemplateColumn = this.StoreWptField;
    let R6: FmcRenderTemplateColumn = this.ReturnLink;

    let footer = '------------------------[blue]';
    if (this.wptAlreadyExistsPrompt.shown.get()) {
      L6 = this.WaypointAlreadyExistsReplaceField;
      R6 = this.WaypointAlreadyExistsCancelField;
      footer = WaypointAlreadyExistsPrompt.CduFooter;
    }

    return [
      [
        ['', '', 'DEFINE PILOT WPT[blue]'],
        [' IDENT[blue]', ''],
        [this.IdentField, ''],
        [''],
        [''],
        ['LATITUDE[blue]   LONGITUDE[blue]'],
        [this.CoordinatesField],
        ['PLACE BRG  /DIST[blue]'],
        [this.PlaceBearingDistanceField],
        ['PLACE BRG  /PLACE BRG[blue]'],
        [this.PlaceBearingPlaceBearingInputField],
        [footer],
        [L6, R6],
      ],
    ];
  }
}
