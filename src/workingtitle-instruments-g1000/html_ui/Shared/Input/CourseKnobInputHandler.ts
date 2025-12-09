import { EventBus, HEvent, LNavObsControlEvents, NavSourceType, SimVarValueType } from '@microsoft/msfs-sdk';

import { G1000NavIndicator } from '../NavReference/G1000NavReference';

/**
 * Handles course knob inputs for a GDU to change the selected course of the GDU's active navigation source.
 */
export class CourseKnobInputHandler {
  private static readonly KEY_PREFIX_NAV1 = 'K:VOR1_OBI';
  private static readonly KEY_PREFIX_NAV1_SET = 'K:VOR1';
  private static readonly KEY_PREFIX_NAV2 = 'K:VOR2_OBI';
  private static readonly KEY_PREFIX_NAV2_SET = 'K:VOR2';

  private readonly hEventPrefix = `AS1000_${this.gduType}_CRS_`;

  private isInit = false;

  /**
   * Creates a new instance of CourseKnobInputHandler.
   * @param gduType The type of this handler's parent GDU.
   * @param bus The event bus.
   * @param activeNavIndicator The active NAV indicator for this handler's parent GDU.
   */
  public constructor(
    private readonly gduType: 'PFD' | 'MFD',
    private readonly bus: EventBus,
    private readonly activeNavIndicator: G1000NavIndicator
  ) {
  }

  /**
   * Initializes this handler. Once this handler is initialized, it will change the selected course of the active
   * NAV source in response to course knob input events.
   */
  public init(): void {
    if (this.isInit) {
      return;
    }

    this.isInit = true;

    this.bus.getSubscriber<HEvent>().on('hEvent').handle(hEvent => {
      if (hEvent.startsWith(this.hEventPrefix)) {
        this.handleCourseKnobInput(hEvent.substring(15));
      }
    });
  }

  /**
   * Handles a course knob input.
   * @param input The key of the input to handle, with the prefix removed.
   */
  private handleCourseKnobInput(input: string): void {
    const source = this.activeNavIndicator.source.get();

    if (source === null) {
      return;
    }

    switch (source.getType()) {
      case NavSourceType.Nav:
        this.sendNavRadioCommand(source.index, input);
        break;
      case NavSourceType.Gps:
        this.sendGpsObsCommand(input);
        break;
    }
  }

  /**
   * Sends a command to change the selected course for a NAV radio in response to a course knob input.
   * @param index The index of the NAV radio to which to send a command.
   * @param input The type of course knob input.
   */
  private sendNavRadioCommand(index: number, input: string): void {
    switch (input) {
      case 'INC':
      case 'DEC': {
        const keyPrefix = index === 1 ? CourseKnobInputHandler.KEY_PREFIX_NAV1 : CourseKnobInputHandler.KEY_PREFIX_NAV2;
        SimVar.SetSimVarValue(`${keyPrefix}_${input}`, SimVarValueType.Number, 1);
        break;
      }

      case 'PUSH': {
        const toSet = this.activeNavIndicator.isLocalizer.get()
          ? this.activeNavIndicator.localizerCourse.get()
          : this.activeNavIndicator.bearing.get();

        if (toSet !== null) {
          const keyPrefix = index === 1 ? CourseKnobInputHandler.KEY_PREFIX_NAV1_SET : CourseKnobInputHandler.KEY_PREFIX_NAV2_SET;
          SimVar.SetSimVarValue(`${keyPrefix}_SET`, SimVarValueType.Number, Math.round(toSet));
        }
        break;
      }
    }
  }

  /**
   * Sends a command to change the selected GPS OBS course in response to a course knob input.
   * @param input The type of course knob input.
   */
  private sendGpsObsCommand(input: string): void {
    switch (input) {
      case 'INC':
        this.bus.getPublisher<LNavObsControlEvents>().pub('lnav_obs_inc_course', undefined, true, false);
        break;
      case 'DEC':
        this.bus.getPublisher<LNavObsControlEvents>().pub('lnav_obs_dec_course', undefined, true, false);
        break;
      case 'PUSH': {
        const toSet = this.activeNavIndicator.bearing.get();
        if (toSet !== null) {
          this.bus.getPublisher<LNavObsControlEvents>().pub('lnav_obs_set_course', Math.round(toSet), true, false);
        }
        break;
      }
    }
  }
}
