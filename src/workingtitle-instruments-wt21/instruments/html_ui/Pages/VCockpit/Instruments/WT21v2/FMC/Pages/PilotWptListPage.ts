import { FmcRenderTemplate, LineSelectKeyEvent, PageLinkField } from '@microsoft/msfs-sdk';

import { WT21FmcPage } from '../WT21FmcPage';

/**
 * PILOT WPT LIST page
 */
export class PilotWptListPage extends WT21FmcPage {
  private readonly DataBaseLink = PageLinkField.createLink(this, '<DATA BASE', '/database');
  private readonly ReturnLink = PageLinkField.createLink(this, 'RETURN>', '/database');

  private shownFacilities = this.fms.getPilotDefinedWaypoints();

  /** @inheritDoc */
  public render(): FmcRenderTemplate[] {
    const userFacilities = this.shownFacilities.getArray();

    const numPages = Math.ceil(userFacilities.length / 4);

    const pages = [];

    for (let i = 0; i < numPages; i++) {
      const start = i * 4;

      pages.push(
        [
          ['', this.PagingIndicator, 'PILOT WPT LIST[blue]'],
          [''],
          [userFacilities[start + 0]?.facility.get().icaoStruct.ident ?? ''],
          [''],
          [userFacilities[start + 1]?.facility.get().icaoStruct.ident ?? ''],
          [''],
          [userFacilities[start + 2]?.facility.get().icaoStruct.ident ?? ''],
          [''],
          [userFacilities[start + 3]?.facility.get().icaoStruct.ident ?? ''],
          ['', 'WPT TRANSFER[disabled] '],
          ['', 'FROM XSIDE>[disabled]'],
          ['', '', '------------------------[blue]'],
          [this.DataBaseLink, this.ReturnLink],
        ]
      );
    }

    if (numPages === 0) {
      pages.push(
        [
          ['', this.PagingIndicator, 'PILOT WPT LISt[blue]'],
          [''],
          [''],
          [''],
          [''],
          [''],
          [''],
          [''],
          [''],
          ['', 'WPT TRANSFER[disabled] '],
          ['', 'FROM XSIDE>[disabled]'],
          ['', '', '------------------------[blue]'],
          [this.DataBaseLink, this.ReturnLink],
        ]
      );
    }

    return pages;
  }

  /** @inheritDoc */
  protected async onHandleSelectKey(event: LineSelectKeyEvent): Promise<boolean | string> {
    const start = (this.screen.currentSubpageIndex.get() - 1) * 4;

    if (event.col !== 0) {
      return false;
    }

    let waypointIndex = -1;
    switch (event.row) {
      case (1 * 2):
        waypointIndex = start + 0;
        break;
      case (2 * 2):
        waypointIndex = start + 1;
        break;
      case (3 * 2):
        waypointIndex = start + 2;
        break;
      case (4 * 2): {
        waypointIndex = start + 3;
        break;
      }
    }

    if (waypointIndex !== -1) {
      return this.shownFacilities.get(waypointIndex).facility.get().icaoStruct.ident;
    }

    return false;
  }
}
