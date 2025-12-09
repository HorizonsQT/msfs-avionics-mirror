import resolve from '@rollup/plugin-node-resolve';
import dts from 'rollup-plugin-dts';

export default [
  {
    input: 'build/index.js',
    output: {
      file: 'dist/wtlinesdk.js',
      format: 'iife',
      name: 'wtlinesdk',
      sourcemap: true,
      globals: {
        '@microsoft/msfs-sdk': 'msfssdk'
      }
    },
    plugins: [resolve()],
    external: ['@microsoft/msfs-sdk'],
  },
  {
    input: "build/index.d.ts",
    output: [{ file: "dist/wtlinesdk.d.ts", format: "es" }],
    plugins: [dts()],
  }
];
