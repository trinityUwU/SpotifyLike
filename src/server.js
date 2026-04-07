const { createApp } = require('./app');
const config = require('./config');

function startServer(onReady) {
  const app = createApp({ config });

  const httpServer = app.listen(config.PORT, () => {
    console.log(`Server running on http://127.0.0.1:${config.PORT}`);
    if (typeof onReady === 'function') onReady(httpServer);
  });

  return httpServer;
}

module.exports = {
  startServer,
};
