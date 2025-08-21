import {
  DmsFormatter, DmsFormatter2, Facility, FmcPageLifecyclePolicy, FmcRenderTemplate, FmcRenderTemplateRow,
  IcaoType, LineSelectKeyEvent, Subject, UnitType, VorClass, VorFacility, VorType,
} from '@microsoft/msfs-sdk';

import { PilotWaypointResult, PilotWaypointType } from '@microsoft/msfs-wtlinesdk';

import { WT21FmcPage } from '../WT21FmcPage';

/**
 * SELECT WPT page
 */
export class FmcSelectWptPopup extends WT21FmcPage {

  public static override lifecyclePolicy = FmcPageLifecyclePolicy.Transient;

  // FIXME do the below with props instead

  public readonly items = Subject.create<(Facility | PilotWaypointResult)[]>([]);

  public facilityType = 'WPT';

  public readonly selectedItem = Subject.create<Facility | PilotWaypointResult | null>(null);

  /** @inheritDoc */
  onInit(): void {
    this.addBinding(this.items.sub(() => this.invalidate()));
  }

  /** @inheritDoc */
  render(): FmcRenderTemplate[] {
    const numPages = Math.max(1, Math.ceil(this.items.get().length / 2));

    const pages: FmcRenderTemplate[] = [];

    for (let i = 0; i < numPages; i++) {
      pages.push(this.renderFacilitiesPage(i));
    }

    return pages;
  }

  private dmsFormatter = new DmsFormatter();

  private pilotWaypointLatDmsFormatter = DmsFormatter2.create('{+[N]-[S]}{dd}{mm.m}', UnitType.ARC_SEC, 1);

  private pilotWaypointLonDmsFormatter = DmsFormatter2.create('{+[E]-[W]}{ddd}{mm.m}', UnitType.ARC_SEC, 1);

  /**
   * Renders a facilities page
   *
   * @param pageIndex the current subpage index
   *
   * @returns template
   */
  private renderFacilitiesPage(pageIndex: number): FmcRenderTemplate {
    const template: FmcRenderTemplate = [
      ['', this.PagingIndicator, `SELECT ${this.facilityType}[blue]`],
    ];

    const items = this.items.get();

    if (items.length > 0 && 'icao' in items[0]) {
      // Facilities: 3 empty rows
      template.push([''], [''], ['']);
    } else {
      template.push([''], ['']);
    }

    template.push(...this.renderFacilities(pageIndex));

    return template;
  }

  /**
   * Renders the rows for facilities
   *
   * @param pageIndex the current subpage index
   *
   * @returns template rows
   * **/
  private renderFacilities(pageIndex: number): FmcRenderTemplateRow[] {
    const render = [];

    const startIndex = pageIndex * 2;

    for (const item of this.items.get().slice(startIndex, startIndex + 2)) {
      if ('icao' in item) {
        const latString = this.dmsFormatter.getLatDmsStr(item.lat, false).slice(0, -1);
        const lonString = this.dmsFormatter.getLonDmsStr(item.lon).slice(0, -1);

        const name = item.icaoStruct.ident;

        let identPadLength = 5;
        let facilitySuffix = '';
        let infostring = '';

        // TODO RWY type
        switch (item.icaoStruct.type) {
          case IcaoType.Airport:
            facilitySuffix = 'AIRPORT';
            break;
          case IcaoType.Ndb:
            identPadLength = 4;
            facilitySuffix = 'NDB';
            break;
          case IcaoType.Vor: {
            identPadLength = 4;

            const vorFac = item as VorFacility;
            const vorType = vorFac.type as VorType;
            const vorClass = vorFac.vorClass as VorClass;

            if (vorClass === VorClass.ILS) {
              facilitySuffix = `ILS  ${vorFac.freqMHz.toFixed(2)}`;
              infostring = ' ' + item.icaoStruct.airport;
            } else {
              if (vorType === VorType.VORDME || vorType === VorType.TACAN || vorType === VorType.VORTAC) {
                facilitySuffix = `V/D  ${vorFac.freqMHz.toFixed(2)}`;
              } else if (vorType === VorType.DME) {
                facilitySuffix = 'DME';
              } else {
                facilitySuffix = 'VOR';
              }
            }
            break;
          }
          case IcaoType.Waypoint: {
            const apt = item.icaoStruct.airport;
            facilitySuffix = apt === '' ? 'EN RTE WPT' : apt;
            break;
          }
          case IcaoType.User: {
            facilitySuffix = 'PILOT DEFINED';
            break;
          }
          case IcaoType.Runway: {
            facilitySuffix = item.icaoStruct.airport;
            break;
          }
        }

        if (infostring === '') {
          infostring = ` ${latString}  ${lonString}`;
        }

        render.push([`${name.padEnd(identPadLength, ' ')} ${facilitySuffix}`, item.region + ' ']);
        render.push([` ${infostring}[d-text]`]);
        render.push([''], ['']);
      } else {
        const latString = this.pilotWaypointLatDmsFormatter(item.facility.lat * 3600);
        const lonString = this.pilotWaypointLonDmsFormatter(item.facility.lon * 3600);

        let header: string;
        let desc = '';

        switch (item.type) {
          case PilotWaypointType.LatLong:
            header = 'LAT LONG / NAME';
            desc = `${latString}${lonString}`; // TODO wrong format for pilot wpt def
            break;
          case PilotWaypointType.PlaceBearingDistance:
            header = 'PLACE BRG / DISTANCE';
            desc = `${item.input.placeIdent} ${item.input.bearing.toFixed(1)}/${item.input.distance.toFixed(1)}`;
            break;
          case PilotWaypointType.PlaceBearingPlaceBearing:
            header = 'PLACE BRG / PLACE BRG';
            desc = `${item.input.placeAIdent} ${item.input.bearingA.toFixed(1)} / ${item.input.placeBIdent} ${item.input.bearingB.toFixed(1)}`;
            break;
          case PilotWaypointType.AlongTrackOffset:
            header = 'ALONG TRK OFFSET';
            desc = `${item.input.placeIdent}/${item.input.distance.toFixed(1)}`;
            break;
        }

        if ('newIdent' in item.input && item.input.newIdent !== undefined) {
          desc += `/${item.input.newIdent}`;
        } else if ('ident' in item.input) {
          desc += `/${item.input.ident}`;
        }

        render.push([' ' + header + '[blue]']);
        render.push([desc]);
      }
    }

    return render;
  }


  /** @inheritDoc */
  async onHandleSelectKey(event: LineSelectKeyEvent): Promise<boolean | string> {
    const row = event.row;

    if (row % 4 !== 0 || row > 8) {
      return false;
    }

    const pageStartIndex = (this.screen.currentSubpageIndex.get() - 1) * 2;

    const index = pageStartIndex + row / 4 - 1;

    this.selectedItem.set(this.items.get()[index]);

    return true;
  }

}
