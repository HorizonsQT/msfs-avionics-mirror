/// <reference types="@microsoft/msfs-types/pages/vcockpit/instruments/shared/baseinstrument" preserve="true" />
/// <reference types="@microsoft/msfs-types/pages/vcockpit/core/vcockpit" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/simvar" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/netbingmap" preserve="true" />
/// <reference types="@microsoft/msfs-types/coherent/facilities" preserve="true" />

import { FsBaseInstrument } from '@microsoft/msfs-sdk';

import { AvionicsConfig, InstrumentConfig } from '@microsoft/msfs-wt21-shared';

import { WT21_MFD_Instrument } from './WT21_MFD_Instrument';

/**
 * The WT21_MFD Baseinstrument
 */
class WT21_MFD extends FsBaseInstrument<WT21_MFD_Instrument> {
  /** @inheritdoc */
  constructInstrument(): WT21_MFD_Instrument {
    this.electricity.classList.toggle('hidden', true);
    return new WT21_MFD_Instrument(this, new AvionicsConfig(this, this.xmlConfig), new InstrumentConfig(this));
  }

  /** @inheritdoc */
  get templateID(): string {
    return 'WT21_MFD';
  }

  /** @inheritdoc */
  public onPowerOn(): void {
    super.onPowerOn();
    this.electricity.classList.toggle('hidden', false);
  }

  /** @inheritdoc */
  public onShutDown(): void {
    super.onShutDown();
    this.electricity.classList.toggle('hidden', true);
  }
}

registerInstrument('wt21-mfd', WT21_MFD);
