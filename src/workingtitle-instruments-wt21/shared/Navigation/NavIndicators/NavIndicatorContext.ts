import { Context, FSComponent } from '@microsoft/msfs-sdk';

import { WTLineNavIndicators } from '@microsoft/msfs-wtlinesdk';


export let NavIndicatorContext: Context<WTLineNavIndicators>;

/** TODO
 * @param navIndicatorsInstrument TODO
 */
export function initNavIndicatorContext(navIndicatorsInstrument: WTLineNavIndicators): void {
  NavIndicatorContext = FSComponent.createContext<WTLineNavIndicators>(navIndicatorsInstrument);
}
