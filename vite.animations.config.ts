import { defineConfig, mergeConfig } from 'vite';
import config from './vite.config';
export default mergeConfig(config,defineConfig({build:{outDir:'dist-animation-review',rollupOptions:{input:{main:'index.html',animations:'tests/animation-review.html'}}}}));
