/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      '/api/convert': ['./node_modules/pdfkit/js/data/**/*'],
      '/api/convert-all': ['./node_modules/pdfkit/js/data/**/*'],
    },
  },
};

export default nextConfig;
