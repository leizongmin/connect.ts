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

/**
 * next 函数
 *
 * @param err 出错信息
 */
export type NextFunction = (err?: Error) => void;

/**
 * request 处理函数
 *
 * @param req ServerRequest 对象
 * @param res ServerResponse 对象
 */
export type RequestHandler = (req: http.ServerRequest, res: http.ServerResponse) => void;

/**
 * 普通中间件处理函数
 *
 * @param req Request 对象
 * @param res Response 对象
 * @param next Next 函数
 * @return {Promise<coid>} 支持返回 Promise 对象
 */
export type MiddlewareNormalHandler = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

/**
 * 异常处理中间件处理函数
 *
 * @param err 出错信息
 * @param req Request 对象
 * @param res Response 对象
 * @param next Next 函数
 * @return {Promise<coid>} 支持返回 Promise 对象
 */
export type MiddlewareErrorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => void | Promise<void>;

/**
 * Request 对象
 */
export interface Request extends http.ServerRequest {
  /** 查询字符串参数 */
  query?: Record<string, any>;
  /** 请求路径（不包含查询字符串部分） */
  pathname?: string;
}

/**
 * Response 对象
 */
export interface Response extends http.ServerResponse {

}

/**
 * 请求异常对象
 */
export interface RequestError extends Error {
  /** HTTP 状态码 */
  status?: number;
}

/**
 * 中间件类型
 */
export enum MiddlewareType {
  /** 普通中间件 */
  Normal = 1,
  /** 异常处理中间件 */
  Error = 2,
}

/**
 * 普通中间件堆栈
 */
export interface MiddlewareNormalStackItem {
  /** 中间件类型 */
  type: MiddlewareType.Normal;
  /** 路径 */
  path: string;
  /** 处理函数 */
  handler: MiddlewareNormalHandler;
}

/**
 * 异常处理中间件堆栈
 */
export interface MiddlewareErrorStackItem {
  /** 中间件类型 */
  type: MiddlewareType.Error;
  /** 路径 */
  path: string;
  /** 处理函数 */
  handler: MiddlewareErrorHandler;
}

/**
 * 中间件堆栈
 */
export type MiddlewareStackItem = MiddlewareNormalStackItem | MiddlewareErrorStackItem;

/**
 * Application 对象
 */
export class Application extends events.EventEmitter {

  /** 中间件堆栈 */
  public readonly stack: MiddlewareStackItem[] = [];

  /** http Server 实例 */
  public server: null | http.Server = null;

  /** debug 函数 */
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
  /**
   * 使用中间件
   */
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

  /**
   * 获取 Application 的中间件函数
   */
  public getMiddleware(): RequestHandler {
    return this.handleRequest.bind(this);
  }

  /**
   * 处理请求
   *
   * @param req Request 对象
   * @param res Response 对象
   * @param next Next 函数
   */
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
  /**
   * 监听端口
   */
  public listen(): void {
    this.debug('listen');
    this.server.listen.apply(this.server, arguments);
  }

  /**
   * 获取 http Server 监听地址
   */
  public address() {
    return this.server.address();
  }

  /**
   * 处理请求
   *
   * @param req Request 对象
   * @param res Response 对象
   */
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

  /**
   * 执行异常处理中间件
   *
   * @param handler 中间件
   * @param err 出错信息
   * @param req Request 对象
   * @param res Response 对象
   */
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

  /**
   * 执行普通中间件
   *
   * @param handler 中间件
   * @param req Request 对象
   * @param res Response 对象
   */
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

/**
 * 创建 Application 对象
 */
export function createApplication(): Application {
  return new Application();
}

/**
 * 判断是否为异常处理中间件
 *
 * @param handler 中间件
 */
function isMiddlewareErrorHandler(handler: Function): boolean {
  return handler.length >= 4;
}

/**
 * 判断是否在指定路径下
 *
 * @param handlePath 中间件注册的路径
 * @param currentPath 当前请求路径
 */
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

/**
 * 判断是否为 Promise 对象
 *
 * @param p Promise 对象
 */
function isPromise(p: any): boolean {
  return typeof p.then === 'function' && typeof p.catch === 'function';
}
