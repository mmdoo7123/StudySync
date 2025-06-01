import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/background.js',
  output: {
    file: 'dist/background.js',
    format: 'es'
  },
  plugins: [
    nodeResolve(),
    commonjs()
  ]
};