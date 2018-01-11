const path = require('path');
const slugify = require('slug');
const fs = require('fs');
const glob = require('glob');
const {upperFirst, camelCase} = require('lodash');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const {cssModulesConfig} = require('gatsby-1-config-css-modules');
const {createFilePath} = require('gatsby-source-filesystem');

const cssVariables = require('../src/design-tokens/tokens.css.js');

exports.onCreateNode = ({node, getNode, boundActionCreators}) => {
  const {createNodeField} = boundActionCreators;

  if (node.internal.type === `MarkdownRemark`) {
    const relativePath = createFilePath({
      node,
      getNode,
      basePath: 'pages',
    });

    /** @TODO write a proper REGEX */
    const componentName = relativePath
      .replace(/\//, '')
      .replace(/\/README\//, '');

    const slug = `/components/${slugify(componentName)}/`;
    const category = 'components';

    createNodeField({
      node,
      name: `componentName`,
      value: componentName,
    });

    /** Used to categorise the pages - product, brand, components etc */
    createNodeField({
      node,
      name: 'category',
      value: category,
    });

    /** Used to generate the page slug */
    createNodeField({
      node,
      name: 'slug',
      value: slug,
    });
  }
};

exports.onPreBootstrap = () => {
  console.log('Starting generating Stories import bundle');

  const cwd = path.resolve(process.cwd(), '../');

  const storyPaths = glob
    .sync('src/**/__stories__/*.stories.js', {cwd})
    .map(storyPath => {
      const fullStoryPath = path.resolve(cwd, storyPath);
      const name = upperFirst(
        camelCase(path.parse(path.parse(storyPath).name).name)
      );

      return [name, fullStoryPath];
    });

  const fileContents = `
// This file is generated. Do not edit!
${storyPaths.map(p => `const ${p[0]} = require('${p[1]}');`).join('\n')}

module.exports = {
  ${storyPaths.map(p => p[0]).join(',\n')}
}
`;

  fs.writeFileSync(
    path.resolve(__dirname, './src/data/stories.js'),
    fileContents,
    'utf8'
  );

  console.log('Finished generating stories import bundle');
};

exports.createPages = ({boundActionCreators, graphql}) => {
  const {createPage} = boundActionCreators;

  const componentPageTemplate = path.resolve(`src/templates/component.js`);
  return graphql(`
    {
      allMarkdownRemark(limit: 1000) {
        edges {
          node {
            fields {
              slug
              componentName
            }
          }
        }
      }
    }
  `).then(result => {
    if (result.errors) {
      return Promise.reject(result.errors);
    }

    const posts = result.data.allMarkdownRemark.edges;

    // Create pages for each markdown file.
    posts.forEach(({node}) => {
      const {slug} = node.fields;
      createPage({
        path: slug,
        component: componentPageTemplate,
        context: {
          slug,
        },
      });
    });

    return posts;
  });
};

exports.modifyWebpackConfig = ({config, env, stage}) => {
  config.merge({
    resolve: {
      root: path.resolve(__dirname, './src'),
      extensions: ['', '.js', '.jsx', '.json'],
    },
    postcss: [
      require('postcss-cssnext')({
        browsers: 'last 2 versions',
        features: {
          customProperties: {
            variables: cssVariables,
          },
        },
      }),
    ],
  });

  switch (stage) {
    case 'develop':
      config.loader(`css`, {
        test: /\.css$/,
        exclude: [path.resolve(__dirname, '../src/components/')],
        include: [path.resolve(__dirname)],
        loaders: [`style`, `css`, `postcss`],
      });

      config.loader('customCSSModules', {
        test: /\.css$/,
        include: [path.resolve(__dirname, '../src/components/')],
        exclude: [path.resolve(__dirname)],
        loaders: ['style', cssModulesConfig(stage), 'postcss'],
      });

      return config;

    case 'develop-html':
      config.loader('customCSSModules', {
        test: /\.css$/,
        include: [path.resolve(__dirname, '../src/components/')],
        exclude: [path.resolve(__dirname)],
        loader: ExtractTextPlugin.extract('style', [
          cssModulesConfig(stage),
          'postcss',
        ]),
      });

      config.loader(`css`, {
        test: /\.css$/,
        exclude: [path.resolve(__dirname, '../src/components/')],
        loader: `null`,
      });

      return config;

    case 'build-css':
      config.loader('customCSSModules', {
        test: /\.css$/,
        include: [path.resolve(__dirname, '../src/components/')],
        exclude: [path.resolve(__dirname)],
        loader: ExtractTextPlugin.extract('style', [
          cssModulesConfig(stage),
          'postcss',
        ]),
      });

      config.loader(`css`, {
        test: /\.css$/,
        exclude: [path.resolve(__dirname, '../src/components/')],
        loader: ExtractTextPlugin.extract([`css?minimize`, `postcss`]),
      });
      return config;

    case 'build-javascript':
      config.loader('customCSSModules', {
        test: /\.css$/,
        include: [path.resolve(__dirname, '../src/components/')],
        loader: ExtractTextPlugin.extract('style', [
          cssModulesConfig(stage),
          'postcss',
        ]),
      });

      config.loader(`css`, {
        test: /\.css$/,
        exclude: [path.resolve(__dirname, '../src/components/')],
        // loader: `null`,
        loader: ExtractTextPlugin.extract([`css`]),
      });
      return config;

    default:
      return config;
  }
};
