/**
 * @morning/connect tests
 *
 * from https://github.com/senchalabs/connect/blob/master/test/server.js
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import { Application, NextFunction, Request, Response, RequestError } from '../lib';
import * as request from 'supertest';
import * as http from 'http';
import * as assert from 'assert';

describe('app', function () {
  let app: Application;

  beforeEach(function () {
    app = new Application();
  });

  it('should inherit from event emitter', function (done) {
    app.on('foo', done);
    app.emit('foo');
  });

  it('should work in http.createServer', function (done) {
    const app = new Application();

    app.use(function (req, res) {
      res.end('hello, world!');
    });

    const server = http.createServer(app.getMiddleware());

    request(server)
      .get('/')
      .expect(200, 'hello, world!', done);
  });

  it('should be a callable function', function (done) {
    const app = new Application();

    app.use(function (req, res) {
      res.end('hello, world!');
    });

    function handler(req: Request, res: Response) {
      res.write('oh, ');
      app.handleRequest(req, res);
    }

    const server = http.createServer(handler);

    request(server)
      .get('/')
      .expect(200, 'oh, hello, world!', done);
  });

  it('should invoke callback if request not handled', function (done) {
    const app = new Application();

    app.use('/foo', function (req, res) {
      res.end('hello, world!');
    });

    function handler(req: Request, res: Response) {
      res.write('oh, ');
      app.handleRequest(req, res, function () {
        res.end('no!');
      });
    }

    const server = http.createServer(handler);

    request(server)
      .get('/')
      .expect(200, 'oh, no!', done);
  });

  it('should invoke callback on error', function (done) {
    const app = new Application();

    app.use(function (req, res) {
      throw new Error('boom!');
    });

    function handler(req: Request, res: Response) {
      res.write('oh, ');
      app.handleRequest(req, res, function (err) {
        res.end(err.message);
      });
    }

    const server = http.createServer(handler);

    request(server)
      .get('/')
      .expect(200, 'oh, boom!', done);
  });

  it('should work as middleware', function (done) {
    // custom server handler array
    const handlers = [new Application().getMiddleware(), function (req: Request, res: Response, next: NextFunction) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Ok');
    }];

    // execute callbacks in sequence
    let n = 0;
    function run(req: Request, res: Response) {
      if (handlers[n]) {
        handlers[n++](req, res, function () {
          run(req, res);
        });
      }
    }

    // create a non-connect server
    const server = http.createServer(run);

    request(server)
      .get('/')
      .expect(200, 'Ok', done);
  });

  it('should escape the 500 response body', function (done) {
    app.use(function (req, res, next) {
      next(new Error('error!'));
    });
    request(app)
      .get('/')
      .expect(/Error: error!<br>/)
      .expect(/<br> &nbsp; &nbsp;at/)
      .expect(500, done);
  });

  describe('404 handler', function () {
    it('should escape the 404 response body', function (done) {
      rawrequest(app)
        .get('/foo/<script>stuff\'n</script>')
        .expect(404, />Cannot GET \/foo\/%3Cscript%3Estuff&#39;n%3C\/script%3E</, done)
    });

    it('shoud not fire after headers sent', function (done) {
      const app = new Application();

      app.use(function (req, res, next) {
        res.write('body');
        res.end();
        process.nextTick(next);
      })

      request(app)
        .get('/')
        .expect(200, done);
    });

    it('shoud have no body for HEAD', function (done) {
      const app = new Application();

      request(app)
        .head('/')
        .expect(404, undefined, done);
    });
  });

  describe('error handler', function () {
    it('should have escaped response body', function (done) {
      const app = new Application();

      app.use(function (req, res, next) {
        throw new Error('<script>alert()</script>');
      })

      request(app)
        .get('/')
        .expect(500, /&lt;script&gt;alert\(\)&lt;\/script&gt;/, done);
    })

    it('should use custom error code', function (done) {
      const app = new Application();

      app.use(function (req, res, next) {
        const err: RequestError = new Error('ack!');
        err.status = 503;
        throw err;
      })

      request(app)
        .get('/')
        .expect(503, done);
    })

    it('should keep error statusCode', function (done) {
      const app = new Application();

      app.use(function (req, res, next) {
        res.statusCode = 503;
        throw new Error('ack!');
      })

      request(app)
        .get('/')
        .expect(503, done);
    })

    it('shoud not fire after headers sent', function (done) {
      const app = new Application();

      app.use(function (req, res, next) {
        res.write('body');
        res.end();
        process.nextTick(function () {
          next(new Error('ack!'));
        });
      })

      request(app)
        .get('/')
        .expect(200, done);
    })

    it('shoud have no body for HEAD', function (done) {
      const app = new Application();

      app.use(function (req, res, next) {
        throw new Error('ack!');
      });

      request(app)
        .head('/')
        .expect(500, undefined, done);
    });
  });
});

function rawrequest(app: Application) {
  let _path: string;
  const server = http.createServer(app.getMiddleware());

  function expect(status: number, body: any, callback: (err?: Error) => void) {
    server.listen(function () {
      const addr = server.address();
      console.log(addr);
      const hostname = addr.family === 'IPv6' ? '::1' : '127.0.0.1';
      const port = addr.port;

      const req = http.get({
        host: hostname,
        path: _path,
        port: port
      });
      req.on('response', function (res) {
        let buf = '';

        res.setEncoding('utf8');
        res.on('data', function (s: string) { buf += s });
        res.on('end', function () {
          let err = null;

          try {
            assert.equal(res.statusCode, status);

            if (body instanceof RegExp) {
              assert.ok(body.test(buf), 'expected body ' + buf + ' to match ' + body)
            } else {
              assert.equal(buf, body, 'expected ' + body + ' response body, got ' + buf)
            }
          } catch (e) {
            err = e;
          }

          server.close();
          callback(err);
        });
      });
    });
  }

  function get(path: string) {
    _path = path;

    return {
      expect: expect
    };
  }

  return {
    get: get
  };
}
