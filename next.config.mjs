/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",

  typescript: {},
  images: {
    unoptimized: true,
  },

  allowedDevOrigins: ['pedometer-citrus-deranged.ngrok-free.dev'],
};

export default nextConfig;
