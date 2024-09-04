// webpack.config.js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    index: './src/index.js',
    admin: './src/admin.js',
    achievement_liff: './src/achievement_liff.js',
    in_progress_liff: './src/in_progress_liff.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js'
  },
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      }
    ]
  },
  resolve: {
    fallback: {
      "path": require.resolve("path-browserify"),
      "os": require.resolve("os-browserify/browser"),
      "crypto": require.resolve("crypto-browserify")
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      chunks: ['index'],
      filename: 'index.html'
    }),
    new HtmlWebpackPlugin({
      template: './src/admin.html',
      chunks: ['admin'],
      filename: 'admin.html'
    }),
    new HtmlWebpackPlugin({
      template: './src/achievement_liff.html', 
      chunks: ['achievement_liff'], 
      filename: 'achievement_liff.html' 
    }),
    new HtmlWebpackPlugin({
      template: './src/in_progress_liff.html',
      chunks: ['in_progress_liff'],
      filename: 'in_progress_liff.html'
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/style.css', to: 'style.css' },
        { from: 'src/images', to: 'images' } // 假設您的圖片在 src/images 目錄下
      ]
    }),
    new Dotenv()
  ]
};