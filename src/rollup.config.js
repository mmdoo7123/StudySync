import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace'; 

export default {
  input: 'src/background.js',
  output: {
    file: 'dist/background.js',
    format: 'es'
  },
  plugins: [
    replace({ 
      'process.env.NODE_ENV': JSON.stringify('production'),
      preventAssignment: true
    }),
    nodeResolve(),
    commonjs()
  ]
};