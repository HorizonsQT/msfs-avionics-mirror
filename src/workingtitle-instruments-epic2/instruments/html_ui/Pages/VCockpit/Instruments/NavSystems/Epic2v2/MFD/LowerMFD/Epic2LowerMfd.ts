/// <reference types="@microsoft/msfs-types/pages/vcockpit/instruments/shared/baseinstrument" preserve="true" />
/// <reference types="@microsoft/msfs-types/pages/vcockpit/core/vcockpit" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/simvar" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/netbingmap" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/common" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/avionics" preserve="true" />

import { FsBaseInstrument } from '@microsoft/msfs-sdk';

import { AvionicsConfig } from '@microsoft/msfs-epic2-shared';

import { Epic2LowerMfdInstrument } from './Epic2LowerMfdInstrument';

import './Epic2LowerMfd.css';

/**
 * The Epic 2 Lower MFD
 */
class Epic2LowerMfd extends FsBaseInstrument<Epic2LowerMfdInstrument> {
  /** @inheritdoc */
  public get isInteractive(): boolean {
    return true;
  }

  /** @inheritdoc */
  public constructInstrument(): Epic2LowerMfdInstrument {
    return new Epic2LowerMfdInstrument(this, new AvionicsConfig(this, this.xmlConfig));
  }

  /** @inheritdoc */
  get templateID(): string {
    return 'Epic2LowerMfd';
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

registerInstrument('epic2-lower-mfd', Epic2LowerMfd);
