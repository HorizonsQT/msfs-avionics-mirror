export enum PfdAlertCategories {
  CabinAltitude,
  LandingGear,
  Overspeed,
  CabinPressure,
}

/** Events to trigger a PFD alert */
export interface PfdAlertControlEvents {
  /** Adds a PFD alert to the display */
  add_pfd_alert: PfdAlertCategories;
  /** Removes a PFD alert to the display */
  remove_pfd_alert: PfdAlertCategories;
}
