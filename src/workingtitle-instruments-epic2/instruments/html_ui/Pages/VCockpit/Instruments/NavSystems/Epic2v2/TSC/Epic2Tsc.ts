/// <reference types="@microsoft/msfs-types/pages/vcockpit/instruments/shared/baseinstrument" preserve="true" />
/// <reference types="@microsoft/msfs-types/pages/vcockpit/core/vcockpit" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/simvar" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/netbingmap" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/common" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/avionics" preserve="true" />

import { FsBaseInstrument } from '@microsoft/msfs-sdk';

import { AvionicsConfig } from '@microsoft/msfs-epic2-shared';

import { Epic2TscInstrument } from './Epic2TscInstrument';

import './Epic2Tsc.css';

/**
 * The Epic 2 Tsc
 */
class Epic2Tsc extends FsBaseInstrument<Epic2TscInstrument> {
  /** @inheritdoc */
  public get isInteractive(): boolean {
    return true;
  }

  /** @inheritdoc */
  public constructInstrument(): Epic2TscInstrument {
    return new Epic2TscInstrument(this, new AvionicsConfig(this, this.xmlConfig));
  }

  /** @inheritdoc */
  get templateID(): string {
    return 'Epic2Tsc';
  }

  /** @inheritdoc */
  public onPowerOn(): void {
    super.onPowerOn();
    // this.fsInstrument.onPowerOn();
  }

  /** @inheritdoc */
  public onShutDown(): void {
    super.onShutDown();
    // this.fsInstrument.onPowerOff();
  }
}

registerInstrument('epic2-tsc', Epic2Tsc);
