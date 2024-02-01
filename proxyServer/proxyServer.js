console.log('proxy server loaded');

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();

app.use(cors()); 
app.options('*', cors()); 

app.use(
  '/api',
  createProxyMiddleware({
    target: 'https://arval-prod-euw-appservice-portalapi.azurewebsites.net',
    changeOrigin: true,
  })
);

app.listen(4000, () => {
  console.log('Proxy server listening on http://localhost:4000');
});
