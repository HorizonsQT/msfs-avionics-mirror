/** A collection of handy SVG functions. */
export class SVGUtils {
  /**
   * Creates a circle using an SVG path.
   * @param x Arc center x position.
   * @param y Arc center y position.
   * @param radius Arc radius.
   * @returns The d value for an SVG path element.
   */
  public static describeCircle(x: number, y: number, radius: number): string {
    const startX = x + radius;
    const endX = x - radius;

    return `M ${startX} ${y} A ${radius} ${radius} 0 1 0 ${endX} ${y} A ${radius} ${radius} 0 1 0 ${startX} ${y} Z`;
  }

  /**
   * Creates an arc using an SVG path.
   * From https://stackoverflow.com/questions/5736398/how-to-calculate-the-svg-path-for-an-arc-of-a-circle.
   * @param x Arc center x position.
   * @param y Arc center y position.
   * @param radius Arc radius.
   * @param startAngle Arc start angle, in degrees.
   * @param endAngle Arc end angle, in degrees.
   * @returns The d value for an SVG path element.
   */
  public static describeArc(
    x: number, y: number, radius: number, startAngle: number, endAngle: number,
  ): string {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);

    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return `M ${start[0]} ${start[1]} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end[0]} ${end[1]}`;
  }
}

// eslint-disable-next-line jsdoc/require-jsdoc
function polarToCartesian(
  centerX: number, centerY: number, radius: number, angleInDegrees: number,
): number[] {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;

  return [
    centerX + (radius * Math.cos(angleInRadians)),
    centerY + (radius * Math.sin(angleInRadians))
  ];
}
