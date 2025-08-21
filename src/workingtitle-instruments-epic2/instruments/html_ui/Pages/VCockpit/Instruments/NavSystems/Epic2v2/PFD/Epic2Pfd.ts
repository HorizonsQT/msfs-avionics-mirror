/// <reference types="@microsoft/msfs-types/pages/vcockpit/instruments/shared/baseinstrument" preserve="true" />
/// <reference types="@microsoft/msfs-types/pages/vcockpit/core/vcockpit" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/simvar" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/netbingmap" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/common" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/avionics" preserve="true" />

import { FsBaseInstrument } from '@microsoft/msfs-sdk';

import { AvionicsConfig } from '@microsoft/msfs-epic2-shared';

import { Epic2PfdInstrument } from './Epic2PfdInstrument';

import './Epic2Pfd.css';

/**
 * The Epic 2 PFD
 */
class Epic2Pfd extends FsBaseInstrument<Epic2PfdInstrument> {
  /** @inheritdoc */
  public get isInteractive(): boolean {
    return true;
  }

  /** @inheritdoc */
  public constructInstrument(): Epic2PfdInstrument {
    return new Epic2PfdInstrument(this, new AvionicsConfig(this, this.xmlConfig));
  }

  /** @inheritdoc */
  get templateID(): string {
    return 'Epic2Pfd';
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

registerInstrument('epic2-pfd', Epic2Pfd);
