const SentryWebpackPlugin = require('@sentry/webpack-plugin');

process.env.VUE_APP_VERSION = process.env.COMMIT_REF;

module.exports = {
  lintOnSave: false,
  configureWebpack: {
    devtool: 'source-map',
    plugins: [
      new SentryWebpackPlugin({
        include: '.',
        ignore: ['node_modules', 'vue.config.js', 'webpack.config.js'],
      }),
    ],
  },
};
