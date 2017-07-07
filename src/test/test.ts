/**
 * @morning/connect tests
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

import { Application } from '../lib';


const app = new Application();

app.use('/a', function (req, res, next) {
  console.log('a');
  next();
});

app.use('/e1', async function (req, res) {
  throw new Error('test1');
});

app.use('/e2', function (req, res) {
  throw new Error('test2');
});

app.use(function (req, res, next) {
  console.log('root');
  res.end('ok');
});

app.listen(3000, () => {
  console.log('listening...');
});
