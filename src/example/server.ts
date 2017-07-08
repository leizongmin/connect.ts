/**
 * @morning/connect example
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import { Application, Request, Response, NextFunction } from '../lib';
import * as bodyParser from 'body-parser';
import * as serveStatic from 'serve-static';

const Router = require('router');

const app = new Application();

app.use(bodyParser.json());
app.use(serveStatic(__dirname));

const router = new Router();
router.get('/', function(req: Request, res: Response, next: NextFunction) {
  res.end(JSON.stringify({
    url: req.url,
    pathname: req.pathname,
    query: req.query,
  }));
});
app.use(router);

app.listen(3000, () => {
  // tslint:disable-next-line
  console.log('server listening...');
});

