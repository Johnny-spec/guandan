/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@teams-guandan/shared-types',
    '@teams-guandan/socket-protocol',
    '@teams-guandan/teams-sdk-wrapper',
  ],
  typedRoutes: true,
};
export default nextConfig;
