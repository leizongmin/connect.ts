/**
 * @morning/connect
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import * as http from 'http';
import * as events from 'events';
import * as url from 'url';
import * as createDebug from 'debug';
import { IDebugger } from 'debug';
import * as finalhandler from 'finalhandler';

export type NextFunction = (err?: Error) => void;
export type RequestHandler = (req: http.ServerRequest, res: http.ServerResponse) => void;
export type MiddlewareNormalHandler = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;
export type MiddlewareErrorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => void | Promise<void>;
export interface Request extends http.ServerRequest {
  query?: Record<string, any>;
  pathname?: string;
}
export interface Response extends http.ServerResponse {

}

export interface RequestError extends Error {
  status?: number;
}

export enum MiddlewareType {
  Normal = 1,
  Error = 2,
}
export interface MiddlewareNormalStackItem {
  type: MiddlewareType.Normal;
  path: string;
  handler: MiddlewareNormalHandler;
}
export interface MiddlewareErrorStackItem {
  type: MiddlewareType.Error;
  path: string;
  handler: MiddlewareErrorHandler;
}
export type MiddlewareStackItem = MiddlewareNormalStackItem | MiddlewareErrorStackItem;

export class Application extends events.EventEmitter {

  public readonly stack: MiddlewareStackItem[] = [];
  public server: null | http.Server = null;
  private readonly debug: IDebugger = createDebug('@morning:connect');

  constructor() {
    super();
    this.server = http.createServer(this.getMiddleware());
    this.server.on('error', err => this.emit('error', err));
  }

  public use(handler: MiddlewareNormalHandler): void;
  public use(path: string, handler: MiddlewareNormalHandler): void;
  public use(handler: MiddlewareErrorHandler): void;
  public use(path: string, handler: MiddlewareErrorHandler): void;
  public use(): void {
    let type: any = MiddlewareType.Normal;
    let path: any = arguments[0];
    let handler: any = arguments[1];
    if (arguments.length === 1) {
      path = '/';
      handler = arguments[0];
    }
    if (isMiddlewareErrorHandler(handler)) {
      type = MiddlewareType.Error;
    }
    this.debug('register middleware: %s %s', MiddlewareType[type], path);
    this.stack.push({ type, path, handler });
  }

  public getMiddleware(): RequestHandler {
    return this.handleRequest.bind(this);
  }

  public handleRequest(req: Request, res: Response, next?: NextFunction): void {
    next = next || finalhandler(req, res, {
      onerror: (err: Error) => {
        this.debug('handle request: finnal handler: err=%s', err && err.stack || err);
      },
    });
    this.handleRequestAsync(req, res)
      .then(next)
      .catch(next);
  }

  public listen(port: number, callback?: () => void): void;
  public listen(port: number, host: string, callback?: () => void): void;
  public listen(unixSocket: string, callback?: () => void): void;
  public listen(): void {
    this.debug('listen');
    this.server.listen.apply(this.server, arguments);
  }

  public address() {
    return this.server.address();
  }

  private async handleRequestAsync(req: Request, res: Response): Promise<null | Error> {
    const urlInfo = url.parse(req.url, true);
    req.query = urlInfo.query;
    req.pathname = urlInfo.pathname;
    let lastError: null | Error = null;
    for (const item of this.stack) {
      if (isInPath(item.path, req.pathname)) {
        this.debug('middleware stack: handlePAth=%s, requestPath=%s, lastError=%s', item.path, req.pathname, lastError);
        try {
          if (lastError) {
            if (item.type !== MiddlewareType.Error) {
              continue;
            }
            this.debug('call middleware error handler');
            lastError = await this.callMiddlewareErrorHandler(item.handler, lastError, req, res);
          } else {
            if (item.type === MiddlewareType.Normal) {
              this.debug('call middleware normal handler');
              lastError = await this.callMiddlewareNormalHandler(item.handler, req, res);
            } else {
              this.debug('call middleware error handler');
              lastError = await this.callMiddlewareErrorHandler(item.handler, lastError, req, res);
            }
          }
        } catch (err) {
          this.debug('middleware stack: catch error: %s', err);
          lastError = err;
        }
      }
    }
    this.debug('middleware stack end: lastError=%s', lastError);
    return lastError;
  }

  private callMiddlewareErrorHandler(handler: MiddlewareErrorHandler, err: Error, req: Request, res: Response): Promise<null | Error> {
    return new Promise((resolve, reject) => {
      const ret = handler(err, req, res, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
      if (isPromise(ret)) {
        (ret as Promise<any>).then(resolve).catch(reject);
      }
    });
  }

  private callMiddlewareNormalHandler(handler: MiddlewareNormalHandler, req: Request, res: Response): Promise<null | Error> {
    return new Promise((resolve, reject) => {
      const ret = handler(req, res, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
      if (isPromise(ret)) {
        (ret as Promise<any>).then(resolve).catch(reject);
      }
    });
  }

}

export function createApplication(): Application {
  return new Application();
}

function isMiddlewareErrorHandler(handler: Function): boolean {
  return handler.length >= 4;
}

function isInPath(handlePath: string, currentPath: string): boolean {
  if (handlePath === '/') {
    return true;
  }
  if (handlePath === currentPath) {
    return true;
  }
  if (currentPath.indexOf(handlePath + '/') === 0) {
    return true;
  }
  return false;
}

function getErrorDetail(err: Error): string {
  if (err instanceof Error) {
    return err.stack;
  }
  if (typeof err === 'string') {
    return err;
  }
  return JSON.stringify(err);
}

function isPromise(p: any): boolean {
  return typeof p.then === 'function' && typeof p.catch === 'function';
}
