/**
 * @morning/connect tests
 *
 * 参考自 https://github.com/senchalabs/connect/blob/master/test/app.listen.js
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import { Application } from '../lib';
import * as request from 'supertest';

describe('app.listen()', function() {

  it('should wrap in an http.Server', function(done) {
    const app = new Application();

    app.use(function(req, res) {
      res.end();
    });

    app.listen(0, function() {
      request(app)
        .get('/')
        .expect(200, done);
    });
  });

});
