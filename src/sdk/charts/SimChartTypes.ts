import { ChartIndex, ChartIndexCategory, ChartMetadata, ChartPage, ChartProcedureIdentifier, ChartRelationship } from './ChartTypes';

/**
 * A chart index for an airport provided by the simulator.
 */
export type SimChartIndex<T extends string> = ChartIndex<T> & {
  /** A list of chart categories with an array of charts of that category. */
  readonly charts: readonly SimChartIndexCategory<T>[];
}

/**
 * A category in a chart index provided by the simulator.
 */
export type SimChartIndexCategory<T extends string> = ChartIndexCategory<T> & {
  /** The charts present in the category. */
  readonly charts: readonly SimChartMetadata<T>[];
};

/**
 * A procedure identifier for a chart provided by the simulator.
 */
export type SimChartProcedureIdentifier = ChartProcedureIdentifier & {
  /**
   * The runway transition identifier, if applicable.
   * @deprecated Use `runways` instead.
   */
  readonly runwayTransition: string | null;
};

/**
 * A relationship from one chart provided by the simulator to another.
 */
export type SimChartRelationship = ChartRelationship & {
  /** The procedure associated with this relationship, if any. */
  readonly procedure: SimChartProcedureIdentifier | null;
};

/**
 * Metadata describing a chart provided by the simulator.
 */
export type SimChartMetadata<T extends string = string> = ChartMetadata<T> & {
  /** A list of procedures associated with the chart. */
  readonly procedures: readonly SimChartProcedureIdentifier[];

  /** A list of relationships from the chart to other charts. */
  readonly relationships: readonly SimChartRelationship[];
};

/**
 * A list of pages for a chart provided by the simulator.
 */
export interface SimChartPages {
  /** The chart pages. */
  pages: SimChartPage[];
}

/**
 * A page of a chart provided by the simulator.
 */
export type SimChartPage = ChartPage;

/**
 * Chart providers built into the simulator.
 */
export enum BuiltInChartProvider {
  Lido = 'LIDO',
  Faa = 'FAA',
}
