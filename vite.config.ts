import fs from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

interface LowPolyCarManifestEntry {
  id: string;
  folder: string;
  obj: string;
  mtl: string | null;
}

function scanLowPolyCars(modelsDir: string): LowPolyCarManifestEntry[] {
  if (!fs.existsSync(modelsDir)) return [];
  const entries = fs
    .readdirSync(modelsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const cars: LowPolyCarManifestEntry[] = [];
  for (const dir of entries) {
    const dirPath = path.join(modelsDir, dir.name);
    const files = fs.readdirSync(dirPath);
    const preferredObj = `${dir.name}.obj`;
    const objFile = files.includes(preferredObj)
      ? preferredObj
      : files.find((f) => f.toLowerCase().endsWith('.obj'));
    if (!objFile) continue;

    const preferredMtl = `${dir.name}.mtl`;
    const matchingMtl = objFile.replace(/\.obj$/i, '.mtl');
    const mtlFile = files.includes(preferredMtl)
      ? preferredMtl
      : files.includes(matchingMtl)
        ? matchingMtl
        : (files.find((f) => f.toLowerCase().endsWith('.mtl')) ?? null);

    cars.push({
      id: dir.name.toLowerCase().replace(/_/g, '-'),
      folder: dir.name,
      obj: objFile,
      mtl: mtlFile,
    });
  }
  return cars;
}

function serveLowPolyCarsPlugin(): Plugin {
  const modelsDir = path.resolve(__dirname, 'models', 'lowpoly-cars');
  const distModelsDir = path.resolve(__dirname, 'dist', 'models', 'lowpoly-cars');
  const urlPrefix = '/models/lowpoly-cars/';

  const attachMiddleware = (middlewares: { use: (handler: (req: any, res: any, next: () => void) => void) => void }, rootDir: string, dynamicManifest: boolean) => {
    middlewares.use((req, res, next) => {
      const rawUrl = String(req.url || '').split('?')[0];
      if (!rawUrl.startsWith(urlPrefix)) {
        next();
        return;
      }

      const relPath = decodeURIComponent(rawUrl.slice(urlPrefix.length)).replace(/^\/+/, '');
      if (relPath === 'manifest.json' && dynamicManifest) {
        const cars = scanLowPolyCars(rootDir);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(JSON.stringify({ cars }, null, 2));
        return;
      }

      const resolved = path.resolve(rootDir, relPath);
      if (!resolved.startsWith(rootDir + path.sep) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      const ext = path.extname(resolved).toLowerCase();
      res.statusCode = 200;
      res.setHeader(
        'Content-Type',
        ext === '.json'
          ? 'application/json; charset=utf-8'
          : 'text/plain; charset=utf-8',
      );
      fs.createReadStream(resolved).pipe(res);
    });
  };

  return {
    name: 'serve-lowpoly-cars',
    configureServer(server) {
      attachMiddleware(server.middlewares, modelsDir, true);
    },
    configurePreviewServer(server) {
      const rootDir = fs.existsSync(distModelsDir) ? distModelsDir : modelsDir;
      attachMiddleware(server.middlewares, rootDir, true);
    },
    closeBundle() {
      const cars = scanLowPolyCars(modelsDir);
      fs.mkdirSync(distModelsDir, { recursive: true });
      for (const car of cars) {
        const srcFolder = path.join(modelsDir, car.folder);
        const dstFolder = path.join(distModelsDir, car.folder);
        fs.mkdirSync(dstFolder, { recursive: true });
        for (const file of [car.obj, car.mtl].filter((f): f is string => Boolean(f))) {
          const srcFile = path.join(srcFolder, file);
          if (fs.existsSync(srcFile)) {
            fs.copyFileSync(srcFile, path.join(dstFolder, file));
          }
        }
      }
      fs.writeFileSync(path.join(distModelsDir, 'manifest.json'), JSON.stringify({ cars }, null, 2) + '\n', 'utf8');
    },
  };
}

function scanPolicyBinaries(policiesDir: string): {
  files: string[];
  classes: Record<string, string>;
} {
  if (!fs.existsSync(policiesDir)) return { files: [], classes: {} };
  const files = fs
    .readdirSync(policiesDir)
    .filter((f) => f.toLowerCase().endsWith('.bin'))
    .sort();
  const classes: Record<string, string> = {};
  for (const file of files) {
    const m = /^class_([a-z0-9_]+)\.bin$/i.exec(file);
    if (m) {
      classes[m[1].toUpperCase()] = file;
    }
  }
  return { files, classes };
}

function servePolicyBinariesManifestPlugin(): Plugin {
  const policiesDir = path.resolve(__dirname, 'public', 'models', 'policies');
  const distPoliciesDir = path.resolve(__dirname, 'dist', 'models', 'policies');
  const manifestUrl = '/models/policies/manifest.json';

  const attach = (
    middlewares: { use: (handler: (req: any, res: any, next: () => void) => void) => void },
    rootDir: string,
  ) => {
    middlewares.use((req, res, next) => {
      const rawUrl = String(req.url || '').split('?')[0];
      if (rawUrl !== manifestUrl && !rawUrl.endsWith(manifestUrl)) {
        next();
        return;
      }
      const manifest = scanPolicyBinaries(rootDir);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.end(JSON.stringify(manifest, null, 2));
    });
  };

  return {
    name: 'serve-policy-binaries-manifest',
    configureServer(server) {
      attach(server.middlewares, policiesDir);
    },
    configurePreviewServer(server) {
      const rootDir = fs.existsSync(distPoliciesDir) ? distPoliciesDir : policiesDir;
      attach(server.middlewares, rootDir);
    },
    closeBundle() {
      const manifest = scanPolicyBinaries(policiesDir);
      fs.mkdirSync(distPoliciesDir, { recursive: true });
      fs.writeFileSync(
        path.join(distPoliciesDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n',
        'utf8',
      );
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), serveLowPolyCarsPlugin(), servePolicyBinariesManifestPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true as const,
      proxy: {
        '/ws': {
          target: 'ws://localhost:3000',
          ws: true,
        },
        '/Apex-Miniature/ws': {
          target: 'ws://localhost:3000',
          ws: true,
        },
        '/api': {
          target: 'http://localhost:3000',
        },
        '/Apex-Miniature/api': {
          target: 'http://localhost:3000',
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

