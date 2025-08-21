import { Subject } from '../sub/Subject';
import { Subscribable } from '../sub/Subscribable';
import { ChartImage, ChartImageErrorCode, ChartImageSupplier } from './ChartImageSupplier';
import { ChartsClientErrorCode } from './ChartsClient';

/**
 * A description of a LiveView used by {@link ChartView} to display a chart image.
 */
export type ChartViewLiveView = {
  /**
   * The name of the LiveView. The name can be used wherever an image URL is accepted (e.g. as the `src` attribute for
   * an image element or as the argument for the CSS `url()` function).
   */
  readonly name: string;

  /** The URL of the chart page displayed by the LiveView. */
  readonly chartUrl: string;
};

/**
 * A chart view.
 *
 * Chart views represent a single updatable reference that can be updated to show a particular chart image.
 *
 * The sim's engine manages downloading chart images and uploading them as GPU bitmaps. You must use the {@link showChartImage}
 * method to choose which chart image should be shown for this view, after which {@link liveViewName} will be updated to
 * give you access to that image. See documentation of that field for more information.
 */
export class ChartView implements ChartImageSupplier {
  private _isAlive = true;
  // eslint-disable-next-line jsdoc/require-returns
  /** Whether this view is alive. */
  public get isAlive(): boolean {
    return this._isAlive;
  }

  public _id: string | null = null;
  // eslint-disable-next-line jsdoc/require-returns
  /** This view's GUID, or `null` if it has not been initialized yet. */
  public get id(): string | null {
    return this._id;
  }

  private listener: ViewListener.ViewListener | null = null;

  private readonly _image = Subject.create<ChartImage>({ imageUrl: '', chartUrl: '', errorCode: 0 });
  /** @inheritDoc */
  public readonly image = this._image as Subscribable<ChartImage>;

  /**
   * A description of the LiveView currently backing this chart view.
   * @deprecated Please use `image` instead.
   */
  public readonly liveView = this._image.map(image => ({ name: image.imageUrl, chartUrl: image.chartUrl })) as Subscribable<ChartViewLiveView>;

  /**
   * The name of the LiveView currently backing this chart view.
   * @deprecated Please use `image` instead.
   */
  public readonly liveViewName = this._image.map(image => image.imageUrl) as Subscribable<string>;

  private requestedChartUrl: string | undefined = undefined;

  /**
   * Initializes this chart view with a listener. This must be a JS_LISTENER_CHARTS ViewListener.
   * @param listener the listener
   * @throws Error if this view has been destroyed.
   */
  public async init(listener: ViewListener.ViewListener): Promise<void> {
    if (!this._isAlive) {
      throw new Error('[ChartView](init) Cannot call init on a destroyed chart view');
    }

    if (this.listener) {
      return;
    }

    this._id = await listener.call('CREATE_CHART_VIEW');

    if (!this._isAlive) {
      listener.call('DESTROY_CHART_VIEW', this._id);
      return;
    }

    listener.on('SendLiveViewName', this.onSendLiveViewName);
    listener.on('SendLiveViewError', this.onSendLiveViewError);

    this.listener = listener;

    if (this.requestedChartUrl !== undefined) {
      this.listener.call('SET_CHART_VIEW_URL', this._id, this.requestedChartUrl);
    }
  }

  /**
   * Updates this chart view to show a new chart image. Once the image has been retrieved, this view's backing LiveView
   * will be updated to display the new image. If this view has not been initialized, then it will wait until it is
   * initialized before it attempts to show the image.
   *
   * **Note:** When changing the chart image, this view's backing LiveView will change. In order to ensure you have the
   * most up-to-date LiveView information with which to display the chart image, subscribe to {@link image} or
   * {@link liveViewName}.
   * @param pageUrl The URL of the image to show. The URL should be sourced from a valid `ChartPage` record and point
   * to a file in PNG format.
   * @throws Error if this view has been destroyed.
   */
  public showChartImage(pageUrl: string): void {
    if (!this._isAlive) {
      throw new Error('[ChartView](showChartImage) Cannot call showChartImage on a destroyed chart view');
    }

    this.requestedChartUrl = pageUrl;

    if (pageUrl === '') {
      this._image.set({ imageUrl: '', chartUrl: '', errorCode: 0 });
    } else if (this.listener) {
      this.listener.call('SET_CHART_VIEW_URL', this._id, pageUrl);
    }
  }

  /**
   * Destroys this chart view. This will release resources associated with this view. Once the view is destroyed, it
   * can no longer be used to display chart images.
   */
  public destroy(): void {
    if (!this._isAlive) {
      return;
    }

    if (this.listener) {
      this.listener.off('SendLiveViewName', this.onSendLiveViewName);
      this.listener.off('SendLiveViewError', this.onSendLiveViewError);
      this.listener.call('DESTROY_CHART_VIEW', this._id);
      this.listener = null;
    }

    this._isAlive = false;
  }

  private readonly onSendLiveViewName = (guid: string, liveViewName: string, chartUrl: string): void => {
    if (this._id === guid && chartUrl === this.requestedChartUrl) {
      this._image.set({ imageUrl: liveViewName, chartUrl, errorCode: 0 });
    }
  };

  private readonly onSendLiveViewError = (guid: string, errorCode: number, chartUrl: string): void => {
    if (this._id === guid && chartUrl === this.requestedChartUrl) {
      switch (errorCode) {
        case ChartsClientErrorCode.NotFound:
          errorCode = ChartImageErrorCode.NotFound;
          break;
        case ChartsClientErrorCode.RequestIdConflict:
        case ChartsClientErrorCode.NetworkError:
          errorCode = ChartImageErrorCode.UnspecifiedRetry;
          break;
        case ChartsClientErrorCode.InternalError:
          errorCode = ChartImageErrorCode.UnspecifiedNoRetry;
          break;
        default:
          errorCode = ChartImageErrorCode.Unknown;
      }

      this._image.set({ imageUrl: '', chartUrl, errorCode });
    }
  };
}
