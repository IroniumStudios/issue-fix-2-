import { WebContentsView, app, ipcMain, BrowserWindow } from 'electron';
import { join } from 'path';
import { roundifyRectangle } from '../services/dialogs-service';

interface IOptions {
  name: string;
  devtools?: boolean;
  bounds?: IRectangle;
  hideTimeout?: number;
  customHide?: boolean;
  webPreferences?: Electron.WebPreferences;
}

interface IRectangle {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export class PersistentDialog {
  public browserWindow: BrowserWindow;
  public webContentsView: WebContentsView;

  public visible = false;

  public bounds: IRectangle = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };

  public name: string;

  private timeout: any;
  private hideTimeout: number;

  private loaded = false;
  private showCallback: any = null;
  browserView: any;

  public constructor({
    bounds,
    name,
    devtools,
    hideTimeout,
    webPreferences,
  }: IOptions) {
    this.webContentsView = new WebContentsView({
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        //worldSafeExecuteJavaScript: false,
        ...webPreferences,
      },
    });

    this.bounds = { ...this.bounds, ...bounds };
    this.hideTimeout = hideTimeout;
    this.name = name;

    const { webContents } = this.webContentsView;

    require('@electron/remote/main').enable(webContents);

    ipcMain.on(`hide-${webContents.id}`, () => {
      this.hide(false, false);
    });

    webContents.once('dom-ready', () => {
      this.loaded = true;

      if (this.showCallback) {
        this.showCallback();
        this.showCallback = null;
      }
    });

    if (process.env.NODE_ENV === 'development') {
      this.webContents.loadURL(`http://localhost:4444/${this.name}.html`);
    } else {
      this.webContents.loadURL(
        join('file://', app.getAppPath(), `build/${this.name}.html`),
      );
    }
  }

  public get webContents() {
    return this.webContentsView.webContents;
  }

  public get id() {
    return this.webContents.id;
  }

  public rearrange(rect: IRectangle = {}) {
    this.bounds = roundifyRectangle({
      height: rect.height || this.bounds.height || 0,
      width: rect.width || this.bounds.width || 0,
      x: rect.x || this.bounds.x || 0,
      y: rect.y || this.bounds.y || 0,
    });

    if (this.visible) {
      this.webContentsView.setBounds(this.bounds as any);
    }
  }

  public show(browserWindow: BrowserWindow, focus = true, waitForLoad = true) {
    return new Promise<void>((resolve) => {
      this.browserWindow = browserWindow;

      clearTimeout(this.timeout);

      browserWindow.webContents.send(
        'dialog-visibility-change',
        this.name,
        true,
      );

      const callback = () => {
        if (this.visible) {
          if (focus) this.webContents.focus();
          return;
        }

        this.visible = true;

        browserWindow.contentView.addChildView(this.webContentsView);
        this.rearrange();

        if (focus) this.webContents.focus();

        resolve();
      };

      if (!this.loaded && waitForLoad) {
        this.showCallback = callback;
        return;
      }

      callback();
    });
  }

  public hideVisually() {
    this.send('visible', false);
  }

  public send(channel: string, ...args: any[]) {
    this.webContents.send(channel, ...args);
  }

  public hide(bringToTop = false, hideVisually = true) {
    if (!this.browserWindow) return;

    if (hideVisually) this.hideVisually();

    if (!this.visible) return;

    this.browserWindow.webContents.send(
      'dialog-visibility-change',
      this.name,
      false,
    );

    if (bringToTop) {
      this.bringToTop();
    }

    clearTimeout(this.timeout);

    if (this.hideTimeout) {
      this.timeout = setTimeout(() => {
        this.browserWindow.contentView.removeChildView(this.webContentsView);
      }, this.hideTimeout);
    } else {
      this.browserWindow.contentView.removeChildView(this.webContentsView);
    }

    this.visible = false;

    // this.appWindow.fixDragging();
  }

  public bringToTop() {
    this.browserWindow.contentView.removeChildView(this.webContentsView);
    this.browserWindow.contentView.addChildView(this.webContentsView);
  }

  // currently undergoing fixes
  public destroy() {
  //  this.webContentsView.destroy();
  //  this.webContentsView = null;
  }
}
