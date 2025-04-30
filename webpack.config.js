const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const Dotenv = require('dotenv-webpack');

module.exports = {
  entry: {
    index: './src/index.js',
    admin: './src/admin.js',
    achievement_liff: './src/achievement_liff.js',
    in_progress_liff: './src/in_progress_liff.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    clean: true,
    publicPath: '/'
  },
  mode: 'development',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
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
    new MiniCssExtractPlugin({
      filename: 'styles/[name].[contenthash].css'
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/images', to: 'images' }
      ]
    }),
    new Dotenv()
  ],
  resolve: {
    extensions: ['.js']
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 8080,
    hot: true,
    historyApiFallback: true
  }
};