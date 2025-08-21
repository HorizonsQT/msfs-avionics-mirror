import { ApproachIdentifier, RunwayIdentifier } from '../navigation/Facilities';
import { IcaoValue } from '../navigation/Icao';
import { DeepReadonly } from '../utils/types/UtilityTypes';

/**
 * A chart index for an airport.
 */
export interface ChartIndex<T extends string> {
  /** The ICAO of the airport to which this chart index belongs. */
  readonly airportIcao: IcaoValue;

  /** A list of chart categories with an array of charts of that category. */
  readonly charts: readonly ChartIndexCategory<T>[];
}

/**
 * A category in a chart index.
 */
export interface ChartIndexCategory<T extends string> {
  /** The name of the category. */
  readonly name: T;

  /** The charts present in the category. */
  readonly charts: readonly ChartMetadata<T>[];
}

/**
 * Procedure types used by charts.
 */
export enum ChartProcedureType {
  Sid,
  Star,
  Approach,
}

/**
 * A base chart procedure identifier.
 */
export interface BaseChartProcedureIdentifier {
  /** The type of procedure. */
  readonly type: ChartProcedureType;

  /** The enroute transition (or approach transition) identifier, if applicable. */
  readonly enrouteTransition: string | null;

  /** The runways to which the procedure applies. */
  readonly runways: readonly Readonly<RunwayIdentifier>[];
}

/**
 * A SID/STAR chart procedure identifier.
 */
export interface ChartSidStarProcedureIdentifier extends BaseChartProcedureIdentifier {
  /** @inheritDoc */
  readonly type: ChartProcedureType.Sid | ChartProcedureType.Star;

  /** The procedure identifier string. */
  readonly ident: string;

  /** @inheritDoc */
  readonly approachIdentifier: null;
}

/**
 * An approach chart procedure identifier.
 */
export interface ChartApproachProcedureIdentifier extends BaseChartProcedureIdentifier {
  /** @inheritDoc */
  readonly type: ChartProcedureType.Approach;

  /** The empty string. */
  readonly ident: '';

  /** @inheritDoc */
  readonly approachIdentifier: DeepReadonly<ApproachIdentifier>;
}

/**
 * A chart procedure identifier.
 */
export type ChartProcedureIdentifier = ChartSidStarProcedureIdentifier | ChartApproachProcedureIdentifier;

/**
 * Relationship types between two charts.
 */
export enum ChartRelationshipType {
  /** A relationship from a textual chart to a graphical chart associated with a procedure. */
  ProcedureTextualToGraphical = 0,

  /** A relationship from a graphical chart to a textual chart associated with a procedure. */
  ProcedureGraphicalToTextual = 1,
}

/**
 * A relationship from one chart to another.
 */
export interface ChartRelationship {
  /** The type of this relationship, as a number that extends {@link ChartRelationshipType}. */
  readonly type: number;

  /** The GUID of the chart on the FROM side of this relationship (the FROM chart). */
  readonly fromChartGuid: string;

  /** The GUID of the chart on the TO side of this relationship (the TO chart). */
  readonly toChartGuid: string;

  /**
   * The (zero-based) index of the page of the TO chart to which this relationship applies, or `null` if the
   * relationship is not page-specific.
   */
  readonly toChartPage: number | null;

  /** The procedure associated with this relationship, if any. */
  readonly procedure: ChartProcedureIdentifier | null;
}

/**
 * Metadata describing a chart.
 */
export interface ChartMetadata<T extends string = string> {
  /** The chart provider from which these data were obtained. */
  readonly provider: string;

  /** The GUID of the chart. */
  readonly guid: string;

  /** The type of the chart. */
  readonly type: T;

  /** The ICAO of the airport associated with the chart. */
  readonly airportIcao: IcaoValue;

  /** The name of the chart. */
  readonly name: string;

  /** Whether any of the chart's pages are georeferenced. */
  readonly geoReferenced: boolean;

  /** A list of procedures associated with the chart. */
  readonly procedures: readonly ChartProcedureIdentifier[];

  /** A list of runways associated with the chart. */
  readonly runways: readonly Readonly<RunwayIdentifier>[];

  /**
   * The aircraft types to which the chart applies. If the chart has no aircraft type restrictions, then the array is
   * empty.
   */
  readonly aircraftTypes: readonly string[];

  /** A list of relationships from the chart to other charts. */
  readonly relationships: readonly ChartRelationship[];

  /** The date from which the chart is valid, as a Javascript timestamp, or `null` if the date is not available. */
  readonly validFrom: number | null;

  /** The date to which the chart is valid, as a Javascript timestamp, or `null` if the date is not available. */
  readonly validUntil: number | null;
}

/**
 * A list of pages for a chart.
 */
export interface ChartPages {
  /** The chart pages. */
  readonly pages: readonly ChartPage[];
}

/**
 * A page of a chart.
 */
export interface ChartPage {
  /** The width, in arbitrary units, of this page. */
  readonly width: number;

  /** The height, in arbitrary units, of this page. */
  readonly height: number;

  /**
   * Whether this chart page is georeferenced. A page is georeferenced if and only if it contains at least one
   * georeferenced area.
   */
  readonly geoReferenced: boolean;

  /** The areas defined for this chart page. */
  readonly areas: readonly ChartArea[];

  /** The URLs associated with individual image/document files for this chart page. */
  readonly urls: readonly ChartUrl[];
}

/**
 * A URL for a chart page.
 */
export interface ChartUrl {
  /** The name of the URL. This should contain information useful to determine the type of file this refers to. */
  readonly name: string;

  /** The URL string. */
  readonly url: string;
}

/**
 * Base type for a chart area.
 */
export interface BaseChartArea {
  /** The layer name of this area. */
  readonly layer: string;

  /**
   * The rectangle representing this area, projected on the chart. The rectangle coordinates are expressed in the same
   * units used to measure the parent chart's width and height.
   */
  readonly chartRectangle: ChartRectangle;
}

/**
 * A georeferenced chart area.
 */
export interface GeoReferencedChartArea extends BaseChartArea {
  /** Whether this area is georeferenced. */
  readonly geoReferenced: true;

  /**
   * The rectangle representing this area, projected on the world. The rectangle coordinates are expressed in degrees
   * of longitude or latitude.
   */
  readonly worldRectangle: ChartRectangle;

  /**
   * A description of the Lambert conformal conic projection used to project world coordinates to chart coordinates for
   * this area.
   */
  readonly projection: ChartLambertConformalConicProjection;
}

/**
 * A description of a Lambert conformal conic projection used to project world coordinates to chart coordinates for a
 * chart area.
 */
export interface ChartLambertConformalConicProjection {
  /** The first standard parallel, in degrees. */
  readonly standardParallel1: number;

  /** The second standard parallel, in degrees. */
  readonly standardParallel2: number;

  /** The central meridian, in degrees. */
  readonly centralMeridian: number;
}

/**
 * A non-georeferenced chart area.
 */
export interface NonGeoReferencedChartArea extends BaseChartArea {
  /** Whether this area is georeferenced. */
  readonly geoReferenced: false;
}

/**
 * A chart area.
 */
export type ChartArea = GeoReferencedChartArea | NonGeoReferencedChartArea;

/**
 * A rectangle on a chart.
 */
export interface ChartRectangle {
  /**
   * The upper left corner of this rectangle, as `[x, y]` in arbitrary units for image coordinates or `[lon, lat]` in
   * degrees for world coordinates.
   */
  readonly upperLeft: readonly [xOrLon: number, yOrLat: number];

  /**
   * The lower right corner of this rectangle, as `[x, y]` in arbitrary units for image coordinates or `[lon, lat]` in
   * degrees for world coordinates.
   */
  readonly lowerRight: readonly [xOrLon: number, yOrLat: number];

  /**
   * The angle, in degrees, by which this rectangle's internal coordinate system is rotated relative to the containing
   * chart. Positive values indicate counterclockwise rotation.
   */
  readonly orientation: number;
}
