import { DisplayField, Subject, Subscribable } from '@microsoft/msfs-sdk';

import { WT21FmcPage } from '../../WT21FmcPage';

/**
 * Wrapper around logic and state for the WPT ALREADY EXISTS prompt
 */
export class WaypointAlreadyExistsPrompt {
  public static readonly CduFooter = '---WPT ALREADY EXISTS---[blue]';

  private readonly _shown = Subject.create(false);

  public readonly shown: Subscribable<boolean> = this._shown;

  private resolveFn: ((v: boolean) => void) | null = null;

  private rejectFn: (() => void) | null = null;

  /**
   * Creates a REPLACE component for the WAYPOINT ALREADY EXISTS prompt
   * @param page the FMC page instance
   * @returns a display field
   */
  public createReplaceComponent(page: WT21FmcPage): DisplayField<string> {
    return new DisplayField<string>(page, {
      formatter: () => '<REPLACE',
      onSelected: () => {
        this.answerPrompt(true);

        return Promise.resolve(true);
      }
    });
  }


  /**
   * Creates a CANCEL component  for the WAYPOINT ALREADY EXISTS prompt
   * @param page the FMC page instance
   * @returns a display field
   */
  public createCancelComponent(page: WT21FmcPage): DisplayField<string> {
    return new DisplayField<string>(page, {
      formatter: () => 'CANCEL>',
      onSelected: () => {
        this.answerPrompt(false);

        return Promise.resolve(true);
      }
    });
  }

  /**
   * Shows the prompt
   * @param resolve a function called when the prompt is answered
   * @param reject a function called when the page is closed without the prompt being answered
   */
  public showPrompt(resolve: (v: boolean) => void, reject: () => void): void {
    this.resolveFn = resolve;
    this.rejectFn = reject;

    this._shown.set(true);
  }

  /**
   * Shows the prompt and wraps the result or cancellation in a promise
   * @returns a promise that is resolved with the user answer, or rejected if the page is navigated away from
   */
  public async showPromptAndWaitForResponse(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.showPrompt(resolve, reject);
    });
  }

  /**
   * Answers the WPT ALREADY EXISTS prompt if ti exists
   * @param replace whether to replace the existing waypoint
   */
  public answerPrompt(replace: boolean): void {
    this.resolveFn?.(replace);

    this._shown.set(false);
    this.resolveFn = null;
    this.rejectFn = null;
  }

  /**
   * Answers the WPT ALREADY EXISTS prompt if ti exists
   */
  public closePrompt(): void {
    this.rejectFn?.();

    this._shown.set(false);
    this.resolveFn = null;
    this.rejectFn = null;
  }
}
