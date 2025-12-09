/**
 * A utility class for working with time values.
 */
export class TimeUtils {
  /**
   * Converts a sim absolute time value to a Javascript timestamp.
   * @param absoluteTime The sim absolute time value to convert, in seconds.
   * @returns The Javascript timestamp that is equivalent to the specified sim absolute time value.
   */
  public static simAbsoluteTimeToJSTimestamp(absoluteTime: number): number {
    // Sim absolute time is equivalent to .NET DateTime ticks. Javascript timestamps use the UNIX epoch and are
    // expressed in milliseconds. 62135596800 is the UNIX epoch expressed in .NET DateTime ticks (converted to
    // seconds).
    return (absoluteTime - 62135596800) * 1000;
  }

  /**
   * Converts a Javascript timestamp to a sim absolute time value.
   * @param timestamp The Javascript timestamp to convert.
   * @returns The sim absolute time value, in seconds, that is equivalent to the specified Javascript timestamp.
   */
  public static jsTimestampToSimAbsoluteTime(timestamp: number): number {
    // Sim absolute time is equivalent to .NET DateTime ticks. Javascript timestamps use the UNIX epoch and are
    // expressed in milliseconds. 62135596800 is the UNIX epoch expressed in .NET DateTime ticks (converted to
    // seconds).
    return timestamp * 0.001 + 62135596800;
  }
}
