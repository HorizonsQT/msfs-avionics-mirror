import { APAltitudeModes } from '@microsoft/msfs-sdk';

/**
 * Data describing autopilot status used by Garmin FMAs.
 */
export type FmaData = {
  /** The active vertical mode. */
  verticalActive: number;

  /** The armed vertical mode. */
  verticalArmed: number;

  /** The armed vertical approach mode. */
  verticalApproachArmed: number;

  /** The armed altitude capture mode. */
  verticalAltitudeArmed: number;

  /** Whether an altitude capture mode is armed. */
  altitudeCaptureArmed: boolean;

  /** The target altitude capture value, in feet. */
  altitudeCaptureValue: number;

  /** The active lateral mode. */
  lateralActive: number;

  /** The armed lateral mode. */
  lateralArmed: number;

  /**
   * Whether the lateral mode is in a failed state.
   * @deprecated Please use `lateralReversionFromMode` instead to access lateral mode reversion state.
   */
  lateralModeFailed: boolean;

  /**
   * The lateral mode that was reverted to activate the current lateral mode, or `null` if the current active lateral
   * mode was not activated due to a mode reversion.
   */
  lateralReversionFromMode: number | null;

  /**
   * The vertical mode that was reverted to activate the current vertical mode, or `null` if the current active
   * vertical mode was not activated due to a mode reversion.
   */
  verticalReversionFromMode: number | null;

  /**
   * The altitude capture mode that was reverted to activate the current vertical mode, or `null` if the current active
   * vertical mode was not activated due to a mode reversion.
   */
  verticalAltitudeReversionFromMode: APAltitudeModes | null;

  /** The state of VNAV to be displayed on the FMA. */
  vnavState: FmaVNavState;
}

/**
 * Events related to the Garmin FMA.
 */
export interface FmaDataEvents {
  /** Data describing autopilot status used by the FMA. */
  fma_data: Readonly<FmaData>;
}

export enum FmaVNavState {
  OFF,
  ARMED,
  ACTIVE
}
