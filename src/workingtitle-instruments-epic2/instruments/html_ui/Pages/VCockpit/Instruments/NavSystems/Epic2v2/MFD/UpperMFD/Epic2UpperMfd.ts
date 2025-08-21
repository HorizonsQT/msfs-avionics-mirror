/// <reference types="@microsoft/msfs-types/pages/vcockpit/instruments/shared/baseinstrument" preserve="true" />
/// <reference types="@microsoft/msfs-types/pages/vcockpit/core/vcockpit" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/simvar" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/netbingmap" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/common" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/avionics" preserve="true" />

import { FsBaseInstrument } from '@microsoft/msfs-sdk';

import { AvionicsConfig } from '@microsoft/msfs-epic2-shared';

import { Epic2UpperMfdInstrument } from './Epic2UpperMfdInstrument';

import './Epic2UpperMfd.css';

/**
 * The Epic 2 Upper MFD
 */
class Epic2UpperMfd extends FsBaseInstrument<Epic2UpperMfdInstrument> {
  /** @inheritdoc */
  public get isInteractive(): boolean {
    return true;
  }

  /** @inheritdoc */
  public constructInstrument(): Epic2UpperMfdInstrument {
    return new Epic2UpperMfdInstrument(this, new AvionicsConfig(this, this.xmlConfig));
  }

  /** @inheritdoc */
  get templateID(): string {
    return 'Epic2UpperMfd';
  }

  /** @inheritdoc */
  public onPowerOn(): void {
    super.onPowerOn();

    this.fsInstrument.onPowerOn();
  }

  /** @inheritdoc */
  public onShutDown(): void {
    super.onShutDown();

    this.fsInstrument.onPowerOff();
  }
}

registerInstrument('epic2-upper-mfd', Epic2UpperMfd);
