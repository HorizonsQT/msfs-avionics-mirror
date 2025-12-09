/**
 * WTLine message service - stub for now
 */
export interface WTLineMessageService<T> {
  post(messageID: T): void;

  clear(messageID: T): void;
}
