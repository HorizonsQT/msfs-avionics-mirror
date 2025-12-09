import { LerpLookupTable } from '../datastructures';

/** A parser for FmsConfig elements. */
export abstract class ConfigParser {
  public static configName = 'ConfigParser';

  /**
   * Returns a value computed by an executor, with a fallback value if the executor throws
   *
   * @param executor the executor which returns the value
   * @param defaultValue a fallback value in case the executor throws
   *
   * @returns T
   */
  public static optional<T>(executor: (() => T), defaultValue: T): T {
    let value = defaultValue;
    try {
      value = executor();
    } catch (e) {
      // noop
    }
    return value;
  }

  /**
   * Gets the first occurrence of a given child element.
   * @param parentElement The element to search on.
   * @param tagName The tag name to find.
   * @returns An element.
   * @throws If no element is found.
   */
  public static getChildElement(parentElement: Element, tagName: string): Element {

    const element: Element | null = parentElement.querySelector(`:scope > ${tagName}`);

    if (!element) {
      throw new Error(`${ConfigParser.configName}: Element <${tagName}> must exist as a child of <${parentElement.tagName}>`);
    }

    return element;
  }

  /**
   * Gets all occurrences of a given child element type.
   * @param parentElement The element to search on.
   * @param tagName The tag name to find.
   * @returns All child elements that match.
   */
  public static getChildElements(parentElement: Element, tagName: string): Element[] {
    const elements: NodeListOf<Element> = parentElement.querySelectorAll(`:scope > ${tagName}`);

    return Array.from(elements);
  }

  /**
   * Gets the electricity logic from a given element
   * @param element Element to get the electric circuit from
   * @param baseInstrument the {@link BaseInstrument} the electrical logic is created in the context of
   * @returns The electricity logic element, or undefined if none is present
   */
  public static getChildElectricityConfig(element: Element | undefined, baseInstrument: BaseInstrument): CompositeLogicXMLElement | undefined {
    if (element) {
      const electricLogicElement = element.querySelector(':scope>Electric');

      if (electricLogicElement === null) {
        return undefined;
      } else {
        return new CompositeLogicXMLElement(baseInstrument, electricLogicElement);
      }
    } else {
      return undefined;
    }
  }

  /**
   * Gets a LookupTable child of an element
   * @param parentElement The element to search on.
   * @param tagName The tag name to find.
   * @returns LerpLookupTable
   * @throws If a lookup table cannot be parsed
   */
  public static getChildLerpLookupTable(parentElement: Element, tagName: string): LerpLookupTable {
    const element = parentElement.querySelector(`:scope > ${tagName} > LookupTable`);

    if (!element) {
      throw new Error('Invalid LookupTableConfig definition: cannot find tag');
    }

    if (element.tagName !== 'LookupTable') {
      throw new Error(`Invalid LookupTableConfig definition: expected tag name 'LookupTable' but was '${element.tagName}'`);
    }

    const dimensions = element.getAttribute('dimensions');
    if (dimensions === null) {
      throw new Error('Invalid LookupTableConfig definition: undefined \'dimensions\' attribute');
    }

    const parsedDimensions = Number(dimensions);
    if (isNaN(parsedDimensions) || Math.trunc(parsedDimensions) !== parsedDimensions || parsedDimensions <= 0) {
      throw new Error(`Invalid LookupTableConfig definition: expected 'dimensions' to be a positive integer but was '${dimensions}'`);
    }

    const value = element.textContent;
    if (value === null) {
      throw new Error('Invalid LookupTableConfig definition: undefined value');
    }

    let parsedValue: any = undefined;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      // continue
    }

    if (parsedValue instanceof Array) {
      for (const breakpoint of parsedValue) {
        if (!(breakpoint instanceof Array && breakpoint.length === parsedDimensions + 1 && breakpoint.every(el => typeof el === 'number'))) {
          throw new Error('Invalid LookupTableConfig definition: malformed lookup table array');
        }
      }
    } else {
      throw new Error('Invalid LookupTableConfig definition: value was not an array');
    }

    const table = new LerpLookupTable(parsedDimensions);

    for (const breakpoint of parsedValue as readonly (readonly number[])[]) {
      table.insertBreakpoint(breakpoint);
    }

    return table;
  }

  /**
   * Gets the text content of an element.
   * @param element The element to search on.
   * @returns The element's text content.
   * @throws If no text content is present.
   */
  public static getTextContent(element: Element): string {
    const elementText: string | null = element.textContent;

    if (elementText === null || elementText.length < 1) {
      throw new Error(`${ConfigParser.configName}: Element <'${element.tagName}'> must have a text content with nonzero length`);
    }

    return elementText;
  }

  /**
   * Gets an attribute value of an element.
   * @param element The element to search on.
   * @param attributeName The attribute to find on the element.
   * @returns The attribute's raw (string) value.
   * @throws If the attribute is not present.
   */
  private static getAttribute(element: Element, attributeName: string): string {
    const attribute: string | null = element.getAttribute(attributeName);

    if (attribute === null) {
      throw new Error(`${ConfigParser.configName}: Attribute '${attributeName}' must exist on <${element.tagName}>`);
    }

    return attribute;
  }

  /**
   * Gets a string attribute value of an element.
   * @param element The element to search on.
   * @param attributeName The attribute to find on the element.
   * @param allowEmptyString Whether to allow the empty string as a value.
   * @returns The attribute's value.
   * @throws If the attribute is not present.
   */
  public static getStringAttrValue<T extends string>(element: Element, attributeName: string, allowEmptyString = true): T {
    const string = ConfigParser.getAttribute(element, attributeName) as T;

    if (!allowEmptyString && string.length === 0) {
      throw new Error(`${ConfigParser.configName}: Attribute '${attributeName}' on <${element.tagName}> must not be an empty string`);
    }

    return string;
  }

  /**
   * Gets an enum attribute value of an element.
   * @param element The element to search on.
   * @param attributeName The attribute to find on the element.
   * @param allowedValues The list of allowed values.
   * @returns The attribute's value.
   * @throws If the attribute is not present or invalid.
   */
  public static getEnumAttrValue<T extends string>(element: Element, attributeName: string, allowedValues: T[]): T {
    const stringValue = ConfigParser.getStringAttrValue(element, attributeName).toLowerCase();

    for (const allowedValue of allowedValues) {
      if (allowedValue.toLowerCase() === stringValue) {
        return allowedValue;
      }
    }

    throw new Error(`${ConfigParser.configName}: Attribute '${attributeName}' on <${element.tagName}> must be one of the following values: ${allowedValues.join(', ')}`);
  }

  /**
   * Gets an integer attribute value of an element.
   * @param element The element to search on.
   * @param attributeName The attribute to find on the element.
   * @param allowZero Whether zero should be allowed as a value.
   * @param allowNegative Whether negative numbers should be allowed as a value.
   * @returns The attribute's value.
   * @throws If the attribute is not present or invalid.
   */
  public static getIntegerAttrValue<T extends number>(element: Element, attributeName: string, allowZero = false, allowNegative = false): T {
    const attribute: string = ConfigParser.getAttribute(element, attributeName);

    const num: number = parseInt(attribute);

    if (!Number.isInteger(num)) {
      throw new Error(`${ConfigParser.configName}: Attribute '${attributeName}' on <${element.tagName}> must be an integer`);
    }

    if (num < 0 && !allowNegative) {
      throw new Error(`${ConfigParser.configName}: Attribute '${attributeName}' on <${element.tagName}> must be a positive integer`);
    }

    if (num === 0 && !allowZero) {
      throw new Error(`${ConfigParser.configName}: Attribute '${attributeName}' on <${element.tagName}> must be a nonzero integer`);
    }

    return num as T;
  }

  /**
   * Gets a boolean attribute value of an element.
   * @param element The element to search on.
   * @param attributeName The attribute to find on the element.
   * @returns The attribute's value.
   * @throws If the attribute is not present or invalid.
   */
  public static getBooleanAttrValue(element: Element, attributeName: string): boolean {
    const attribute = ConfigParser.getAttribute(element, attributeName).toLowerCase();

    if (attribute === 'true' || attribute === 'yes' || parseInt(attribute) === 1) {
      return true;
    }

    if (attribute === 'false' || attribute === 'no' || parseInt(attribute) === 0) {
      return false;
    }

    throw new Error(`${ConfigParser.configName}: Attribute '${attributeName}' on <${element.tagName}> must be one of: true, yes, 1, false, no, 0`);
  }
}

/** A base for FMS config builder classes. */
export abstract class ConfigBuilder<T, D extends boolean = true> {
  /**
   * Constructor
   * @param baseConfigElement XML config element to parse
   * @param baseInstrument the base instrument class
   * @param errorsMap Whether there were any errors encountered while parsing the config.
   */
  constructor(
    protected baseConfigElement: Element,
    protected baseInstrument: BaseInstrument,
    protected errorsMap: Map<string, boolean> = new Map(),
  ) {
  }

  protected abstract readonly CONFIG_TAG_NAME: string;

  /**
   * Gets the config element.
   * @returns The config element.
   */
  protected get configElement(): Element {
    return ConfigParser.getChildElement(this.baseConfigElement, this.CONFIG_TAG_NAME);
  }

  /** Attempts to parse the XML into a config object of type T. */
  protected abstract parseConfig(): T;

  /** The default config object to use if {@link this.parseConfig} encounters an error. */
  protected abstract defaultConfig(): D extends false ? (T | undefined) : T;

  /**
   * Returns a config object.
   * @returns A parsed config, or its default value if parsing errors were encountered.
   */
  public getConfig(): D extends false ? (T | undefined) : T {
    ConfigParser.configName = this.CONFIG_TAG_NAME;

    try {
      this.errorsMap.set(this.CONFIG_TAG_NAME, false);
      return this.parseConfig();
    } catch (e) {
      console.error(`ConfigParser: Failed to parse the <${ConfigParser.configName}> config from panel.xml. Using default values instead.`);
      console.error(e);
      this.errorsMap.set(this.CONFIG_TAG_NAME, true);
      return this.defaultConfig();
    }
  }

  /**
   * Returns a map of which configs encountered parsing errors and which did not.
   * @returns A map with config name keys and boolean values indicating whether a parsing error was encountered.
   */
  public getErrors(): ReadonlyMap<string, boolean> {
    return this.errorsMap;
  }
}
