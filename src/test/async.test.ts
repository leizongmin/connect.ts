/**
 * @morning/connect tests
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import { Application, NextFunction, Request, Response, RequestError } from '../lib';
import * as request from 'supertest';
import * as http from 'http';
import * as assert from 'assert';

describe('async function', function() {

  it('should handle async function error #1', function(done) {
    const app = new Application();

    app.use(async function(req, res) {
      throw new Error('just for test1');
    });

    function handler(req: Request, res: Response) {
      app.handleRequest(req, res);
    }

    const server = http.createServer(handler);

    request(server)
      .get('/')
      .expect(/just for test1/)
      .expect(500, done);
  });

  it('should handle async function error #2', function(done) {
    const app = new Application();

    app.use(async function(req, res, next) {
      await sleep(0);
      await sleep(0);
      next();
    });

    app.use(async function (req, res, next) {
      await sleep(0);
      throw new Error('just for test2');
    });

    function handler(req: Request, res: Response) {
      app.handleRequest(req, res);
    }

    const server = http.createServer(handler);

    request(server)
      .get('/')
      .expect(/just for test2/)
      .expect(500, done);
  });

});

function sleep(ms: number): Promise<number> {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(ms), ms);
  });
}
