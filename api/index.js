// Vercel Serverless Functions のエントリーポイント。
// server.js のExpressアプリをそのまま関数としてエクスポートする（vercel.jsonのrewritesで/api/*をここに集約）。
import app from '../server.js';

export default app;
