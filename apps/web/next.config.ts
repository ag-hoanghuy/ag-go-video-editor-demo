import type { NextConfig } from 'next';
import { join } from 'node:path';

const nextConfig: NextConfig = {
  agentRules: false,
  output: 'standalone',
  outputFileTracingRoot: join(process.cwd(), '../..'),
  reactStrictMode: true,
};

export default nextConfig;
