const { createApp } = require('./app');
const config = require('./config');

function startServer() {
  const app = createApp({ config });

  app.listen(config.PORT, () => {
    console.log(`Server running on http://127.0.0.1:${config.PORT}`);
  });
}

module.exports = {
  startServer,
};
