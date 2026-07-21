const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    entry: "./src/web/App.tsx",
    output: {
      path: path.resolve(__dirname, "dist/web"),
      filename: isProduction ? "[name].[contenthash].js" : "[name].js",
      publicPath: "/",
      clean: true,
    },
    mode: isProduction ? "production" : "development",
    devtool: isProduction ? "source-map" : "eval-source-map",
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: "esbuild-loader",
          options: { loader: "tsx", target: "es2020" },
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader", "postcss-loader"],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({ template: "./index.html" }),
      // Only favicon.svg is actually referenced anywhere in the app — the rest of
      // media/ (synthetiq-logo-*.png, mockup.png) is unused leftover branding.
      new CopyWebpackPlugin({ patterns: [{ from: "favicon.svg" }] }),
    ],
    devServer: {
      static: { directory: path.resolve(__dirname, "dist/web") },
      historyApiFallback: true,
      port: 3000,
      proxy: [
        {
          context: ["/api/trpc", "/api/v1"],
          target: "http://localhost:4000",
        },
      ],
    },
  };
};
